import os
import signal
import json
import socket
import subprocess
import time
import shutil
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.api_key import APIKey
from app.models.bot import Bot
from app.models.execution import Execution, ExecutionStatus, ExecutionTrigger
from app.api.v1.broker_credentials import simple_decrypt

router = APIRouter()


def _get_ibkr_creds(user_id, db: Session) -> dict:
    key = db.query(APIKey).filter(
        APIKey.user_id == user_id,
        APIKey.provider == "ibkr",
        APIKey.is_active == True,
    ).first()
    if not key:
        raise HTTPException(status_code=404, detail="No IBKR credentials found. Save them in Settings first.")
    return json.loads(simple_decrypt(key.encrypted_key))


def _data_dir(user_id, bot_id) -> Path:
    return Path(f"/data/{user_id}/{bot_id}")


def _pid_file(user_id, bot_id) -> Path:
    return _data_dir(user_id, bot_id) / "bot.pid"


def _read_pid(user_id, bot_id) -> int | None:
    pid_path = _pid_file(user_id, bot_id)
    try:
        return int(pid_path.read_text().strip())
    except Exception:
        return None


def _sync_bot_from_git(bot_files_dir: Path, git_repo: str, git_branch: str, git_path: str) -> tuple[bool, str]:
    """Clone or pull the bot code from GitHub. Returns (success, message)."""
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        return False, "GITHUB_TOKEN is not set. Add it to your .env file and rebuild."

    # Use token as credential via git config — works for private repos
    # Format: https://x-access-token:<token>@github.com/...
    repo_url = git_repo.replace("https://github.com/", f"https://x-access-token:{token}@github.com/")

    git_env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    clone_dir = Path(f"/tmp/git_bots/{git_repo.rstrip('/').split('/')[-1].replace('.git', '')}")
    try:
        if clone_dir.exists():
            subprocess.run(
                ["git", "fetch", "--depth=1", "origin", git_branch],
                cwd=str(clone_dir), capture_output=True, text=True, timeout=30, env=git_env
            )
            subprocess.run(
                ["git", "reset", "--hard", f"origin/{git_branch}"],
                cwd=str(clone_dir), capture_output=True, text=True, timeout=15, env=git_env
            )
        else:
            clone_dir.parent.mkdir(parents=True, exist_ok=True)
            result = subprocess.run(
                ["git", "clone", "--depth=1", "--branch", git_branch, repo_url, str(clone_dir)],
                capture_output=True, text=True, timeout=60, env=git_env
            )
            if result.returncode != 0:
                return False, f"Git clone failed: {result.stderr[:400]}"

        src = clone_dir / git_path
        if not src.exists():
            return False, f"Path '{git_path}' not found in repo after clone"

        bot_files_dir.mkdir(parents=True, exist_ok=True)
        for item in src.iterdir():
            dest = bot_files_dir / item.name
            if item.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)

        return True, f"Synced from {git_repo} branch={git_branch} path={git_path}"
    except Exception as e:
        return False, f"Sync error: {e}"


def _is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


class StartBotRequest(BaseModel):
    trade_params: dict = {}

@router.post("/{bot_id}/start")
async def start_bot(
    bot_id: UUID,
    body: StartBotRequest = StartBotRequest(),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    creds = _get_ibkr_creds(current_user.id, db)

    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        # Also allow running marketplace bots the user has access to
        bot = db.query(Bot).filter(Bot.id == bot_id, Bot.is_marketplace == True).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    data_path = _data_dir(current_user.id, bot_id)
    data_path.mkdir(parents=True, exist_ok=True)

    config = {
        "broker": "ibkr",
        "ibkr_host": creds.get("host", "127.0.0.1"),
        "ibkr_port": creds.get("port", 7497),
        "ibkr_client_id": creds.get("client_id", 1),
        "ibkr_account": creds.get("account", ""),
        "paper_trading": creds.get("paper_trading", True),
        "ibkr_allow_trading": False,
        "data_dir": str(data_path),
        # Merge bot base config then user-supplied trade params on top
        **(bot.configuration or {}),
        **(body.trade_params or {}),
    }

    config_path = data_path / "config.json"
    config_path.write_text(json.dumps(config, indent=2))

    # Determine runner script
    bot_files_dir = Path(f"/app/bot_files/{current_user.id}/{bot_id}")
    entry_file = "runner.py"
    cfg = bot.configuration if isinstance(bot.configuration, dict) else {}
    entry_file = cfg.get("entry_file", "runner.py")

    # Pull latest code from git if configured
    git_repo   = cfg.get("git_repo", "")
    git_branch = cfg.get("git_branch", "main")
    git_path   = cfg.get("git_path", "")
    if git_repo and git_path:
        ok, msg = _sync_bot_from_git(bot_files_dir, git_repo, git_branch, git_path)
        if not ok:
            raise HTTPException(status_code=500, detail=f"Failed to sync bot from GitHub: {msg}")

    runner_path = bot_files_dir / entry_file

    # If no bot file uploaded yet, write a simulation stub so the process starts
    if not runner_path.exists():
        bot_files_dir.mkdir(parents=True, exist_ok=True)
        runner_path.write_text(
            "import time, json, os, sys\n"
            "config_path = sys.argv[2] if len(sys.argv) > 2 else None\n"
            "data_dir = os.environ.get('DATA_DIR', '/tmp')\n"
            "print(f'[SIM] Bot started in simulation mode (no real bot file uploaded)')\n"
            "print(f'[SIM] IBKR Host: {os.environ.get(\"IBKR_HOST\")} Port: {os.environ.get(\"IBKR_PORT\")}')\n"
            "print(f'[SIM] Paper trading: {os.environ.get(\"IBKR_PAPER\")}')\n"
            "# Write empty positions so the live page shows something\n"
            "with open(os.path.join(data_dir, 'positions.json'), 'w') as f:\n"
            "    json.dump([], f)\n"
            "with open(os.path.join(data_dir, 'trade_log.json'), 'w') as f:\n"
            "    json.dump([], f)\n"
            "print('[SIM] Simulation running — upload a real runner.py to execute live trades')\n"
            "while True:\n"
            "    time.sleep(30)\n"
        )

    env = os.environ.copy()
    env.update({
        "DATA_DIR": str(data_path),
        "IBKR_HOST": str(config["ibkr_host"]),
        "IBKR_PORT": str(config["ibkr_port"]),
        "IBKR_CLIENT_ID": str(config["ibkr_client_id"]),
        "IBKR_ACCOUNT": str(config["ibkr_account"]),
        "IBKR_PAPER": str(config["paper_trading"]).lower(),
        "BOT_ID": str(bot_id),
        "USER_ID": str(current_user.id),
    })
    # Pass STRATEGY and any other string config keys as env vars so shared
    # engine runners (e.g. bots/engine/runner.py) can select the right strategy
    for k, v in cfg.items():
        if isinstance(v, str) and k not in ("git_repo", "git_branch", "git_path", "entry_file"):
            env[k.upper()] = v
        elif isinstance(v, (int, float, bool)):
            env[k.upper()] = str(v).lower() if isinstance(v, bool) else str(v)

    try:
        proc = subprocess.Popen(
            ["python", str(runner_path), "--config", str(config_path)],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(bot_files_dir),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to spawn bot process: {e}")

    (data_path / "bot.pid").write_text(str(proc.pid))

    execution = Execution(
        user_id=current_user.id,
        bot_id=bot_id,
        status=ExecutionStatus.running,
        trigger=ExecutionTrigger.manual,
        result_data={"pid": proc.pid},
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    return {"status": "started", "pid": proc.pid, "execution_id": str(execution.id)}


@router.post("/{bot_id}/stop")
async def stop_bot(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    pid = _read_pid(current_user.id, bot_id)
    if pid is None:
        raise HTTPException(status_code=404, detail="No running bot found (no PID file)")

    try:
        os.kill(pid, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        pass  # Already dead

    pid_path = _pid_file(current_user.id, bot_id)
    try:
        pid_path.unlink()
    except Exception:
        pass

    # Update most recent running execution
    execution = (
        db.query(Execution)
        .filter(
            Execution.user_id == current_user.id,
            Execution.bot_id == bot_id,
            Execution.status == ExecutionStatus.running,
        )
        .order_by(Execution.created_at.desc())
        .first()
    )
    if execution:
        execution.status = ExecutionStatus.canceled
        db.commit()

    return {"status": "stopped"}


@router.get("/{bot_id}/status")
async def bot_status(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
):
    pid = _read_pid(current_user.id, bot_id)
    if pid is None:
        return {"running": False, "pid": None}
    running = _is_running(pid)
    return {"running": running, "pid": pid if running else None}


@router.get("/{bot_id}/positions")
async def bot_positions(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
):
    positions_path = _data_dir(current_user.id, bot_id) / "positions.json"
    try:
        return json.loads(positions_path.read_text())
    except Exception:
        return []


@router.get("/{bot_id}/trade-log")
async def bot_trade_log(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
):
    trade_log_path = _data_dir(current_user.id, bot_id) / "trade_log.json"
    try:
        return json.loads(trade_log_path.read_text())
    except Exception:
        return []


@router.post("/{bot_id}/sync")
async def sync_bot_code(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Pull latest bot code from GitHub without starting the bot."""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    cfg = bot.configuration if isinstance(bot.configuration, dict) else {}
    git_repo   = cfg.get("git_repo", "")
    git_branch = cfg.get("git_branch", "main")
    git_path   = cfg.get("git_path", "")
    if not git_repo or not git_path:
        raise HTTPException(status_code=400, detail="Bot has no git_repo/git_path configured")
    bot_files_dir = Path(f"/app/bot_files/{current_user.id}/{bot_id}")
    ok, msg = _sync_bot_from_git(bot_files_dir, git_repo, git_branch, git_path)
    if not ok:
        raise HTTPException(status_code=500, detail=msg)
    return {"synced": True, "message": msg}


@router.post("/{bot_id}/test-connection")
async def test_connection(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    creds = _get_ibkr_creds(current_user.id, db)
    host = creds.get("host", "127.0.0.1")
    port = int(creds.get("port", 7497))

    try:
        start = time.monotonic()
        sock = socket.create_connection((host, port), timeout=5)
        latency_ms = (time.monotonic() - start) * 1000
        sock.close()
        return {
            "reachable": True,
            "host": host,
            "port": port,
            "latency_ms": round(latency_ms, 2),
            "message": f"Successfully connected to {host}:{port}",
        }
    except Exception as e:
        return {
            "reachable": False,
            "host": host,
            "port": port,
            "latency_ms": None,
            "message": str(e),
        }
