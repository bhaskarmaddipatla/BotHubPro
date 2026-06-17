import os
import signal
import json
import socket
import subprocess
import time
import shutil
import secrets
import hmac
from pathlib import Path
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.api.deps import get_current_active_user, require_verified
from app.models.user import User
from app.models.api_key import APIKey
from app.models.bot import Bot
from app.models.execution import Execution, ExecutionStatus, ExecutionTrigger
from app.api.v1.broker_credentials import simple_decrypt

router = APIRouter()

# ── Service token helpers ─────────────────────────────────────────────────────
# Each bot run gets a long-lived service token stored at {data_dir}/service_token.
# The subprocess uses it for callbacks (trade-event, heartbeat) so callbacks
# work regardless of whether the user's JWT has expired or the user has logged out.

def _service_token_path(user_id, bot_id) -> Path:
    return _data_dir(user_id, bot_id) / "service_token"

def _generate_service_token(user_id, bot_id) -> str:
    token = secrets.token_hex(32)
    _service_token_path(user_id, bot_id).write_text(token)
    return token

def _read_service_token(user_id, bot_id) -> str | None:
    try:
        return _service_token_path(user_id, bot_id).read_text().strip()
    except Exception:
        return None

def _verify_service_token(user_id, bot_id, provided: str) -> bool:
    stored = _read_service_token(user_id, bot_id)
    if not stored:
        return False
    return hmac.compare_digest(stored, provided)


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
    current_user: User = Depends(require_verified),
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
        "ibkr_host": creds.get("host", "host.docker.internal"),
        "ibkr_port": creds.get("port", 7497),
        "ibkr_client_id": creds.get("client_id", 1),
        "ibkr_account": creds.get("account", ""),
        "paper_trading": creds.get("paper_trading", True),
        "ibkr_allow_trading": not creds.get("paper_trading", True),
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

    # Generate a long-lived service token for this bot run.
    # The subprocess uses it for all callbacks so they work regardless of
    # whether the user's JWT has expired or the user has logged out.
    service_token = _generate_service_token(current_user.id, bot_id)

    # Write meta so the /trade-event endpoint can resolve user_id from bot_id alone
    (data_path / "meta.json").write_text(json.dumps({
        "user_id": str(current_user.id),
        "bot_id": str(bot_id),
        "started_at": datetime.utcnow().isoformat(),
    }))

    backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
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
        # Service token — used instead of user JWT for all bot → platform callbacks
        "BOT_SERVICE_TOKEN": service_token,
        "NOTIFY_URL": f"{backend_url}/api/v1/bot-runner/{bot_id}/trade-event",
        "HEARTBEAT_URL": f"{backend_url}/api/v1/bot-runner/{bot_id}/heartbeat",
        "CLOSE_URL": f"{backend_url}/api/v1/bot-runner/{bot_id}/position-closed",
        "NOTIFY_IS_SIM": "true" if config.get("paper_trading", True) else "false",
    })
    # Pass STRATEGY and any other string config keys as env vars so shared
    # engine runners (e.g. bots/engine/runner.py) can select the right strategy
    for k, v in cfg.items():
        if isinstance(v, str) and k not in ("git_repo", "git_branch", "git_path", "entry_file"):
            env[k.upper()] = v
        elif isinstance(v, (int, float, bool)):
            env[k.upper()] = str(v).lower() if isinstance(v, bool) else str(v)

    log_path = data_path / "bot.log"
    try:
        log_file = open(log_path, "w", buffering=1)
        proc = subprocess.Popen(
            ["python", str(runner_path), "--config", str(config_path)],
            env=env,
            stdout=log_file,
            stderr=log_file,
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


@router.get("/{bot_id}/logs")
async def bot_logs(
    bot_id: UUID,
    lines: int = 100,
    current_user: User = Depends(get_current_active_user),
):
    data_path = Path(f"/data/{current_user.id}/{bot_id}")
    log_path = data_path / "bot.log"
    if not log_path.exists():
        return {"lines": [], "message": "No log file found — bot may not have started yet"}
    try:
        with open(log_path, "r") as f:
            all_lines = f.readlines()
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"lines": [l.rstrip() for l in tail], "total_lines": len(all_lines)}
    except Exception as e:
        return {"lines": [], "error": str(e)}


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


@router.get("/{bot_id}/diagnose")
async def diagnose_bot(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Returns a full diagnostic report without starting the bot."""
    report: dict = {}

    # 1. Bot record
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        return {"error": "Bot not found"}
    report["bot"] = {"name": bot.name, "category": str(bot.category), "status": str(bot.status)}
    cfg = bot.configuration if isinstance(bot.configuration, dict) else {}
    report["bot_config"] = cfg

    # 2. IBKR credentials
    creds = _get_ibkr_creds(current_user.id, db) or {}
    report["ibkr_creds"] = {
        "host": creds.get("host", "NOT SET"),
        "port": creds.get("port", "NOT SET"),
        "account": creds.get("account", "NOT SET"),
        "paper_trading": creds.get("paper_trading", True),
        "has_creds": bool(creds),
    }

    # 3. GITHUB_TOKEN
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    report["github_token"] = "SET" if token else "MISSING — git clone will fail"

    # 4. Git / bot files
    bot_files_dir = Path(f"/app/bot_files/{current_user.id}/{bot_id}")
    entry_file = cfg.get("entry_file", "runner.py")
    runner_path = bot_files_dir / entry_file
    report["runner_path"] = str(runner_path)
    report["runner_exists"] = runner_path.exists()
    if bot_files_dir.exists():
        report["bot_files"] = [f.name for f in bot_files_dir.iterdir()]
    else:
        report["bot_files"] = []

    # 5. PID / process alive
    data_path = _data_dir(current_user.id, bot_id)
    pid = _read_pid(current_user.id, bot_id)
    report["pid"] = pid
    report["process_alive"] = _is_running(pid) if pid else False

    # 6. Last 30 lines of bot.log
    log_path = data_path / "bot.log"
    if log_path.exists():
        lines = log_path.read_text().splitlines()
        report["bot_log_last_30"] = lines[-30:]
        report["bot_log_total_lines"] = len(lines)
    else:
        report["bot_log_last_30"] = []
        report["bot_log_note"] = "No log file — bot has not been started since log redirection was added"

    # 7. TWS reachability
    import socket
    host = creds.get("host", "127.0.0.1")
    port = int(creds.get("port", 7497))
    try:
        s = socket.create_connection((host, port), timeout=3)
        s.close()
        report["tws_reachable"] = True
        report["tws_address"] = f"{host}:{port}"
    except Exception as e:
        report["tws_reachable"] = False
        report["tws_address"] = f"{host}:{port}"
        report["tws_error"] = str(e)

    # 8. Python packages
    import importlib
    for pkg in ["ib_insync", "ibapi", "pandas", "numpy", "requests"]:
        try:
            importlib.import_module(pkg)
            report.setdefault("packages", {})[pkg] = "OK"
        except ImportError:
            report.setdefault("packages", {})[pkg] = "MISSING"

    return report


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


# ── Bot service auth ──────────────────────────────────────────────────────────
# Endpoints called by the bot subprocess accept EITHER:
#   1. A valid user JWT (Authorization: Bearer <jwt>)   — for UI-initiated calls
#   2. A bot service token (X-Bot-Service-Token: <token>) — for subprocess callbacks
# This means callbacks keep working after the user's JWT expires or user logs out.

async def get_bot_auth(
    bot_id: UUID,
    x_bot_service_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    # Try service token first (bot subprocess path)
    if x_bot_service_token:
        # Find which user owns this bot run by reading meta.json
        data_root = Path("/data")
        meta = None
        for user_dir in data_root.iterdir() if data_root.exists() else []:
            meta_path = user_dir / str(bot_id) / "meta.json"
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text())
                    break
                except Exception:
                    pass
        if not meta:
            raise HTTPException(status_code=401, detail="Bot run not found or not started")
        user_id = meta["user_id"]
        if not _verify_service_token(user_id, str(bot_id), x_bot_service_token):
            raise HTTPException(status_code=401, detail="Invalid bot service token")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    # Fall back to JWT (user session path)
    if authorization and authorization.startswith("Bearer "):
        from app.core.security import decode_token
        token = authorization.split(" ", 1)[1]
        payload = decode_token(token)
        if payload:
            user = db.query(User).filter(User.id == payload.get("sub")).first()
            if user:
                return user
    raise HTTPException(status_code=401, detail="Authentication required (user JWT or bot service token)")


@router.get("/trades/today")
async def trades_today(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Aggregate today's trades across all of the user's active bots."""
    from datetime import date as date_type
    today = date_type.today().isoformat()

    bots = db.query(Bot).filter(
        (Bot.user_id == current_user.id) | (Bot.is_marketplace == True)
    ).all()

    all_trades = []
    for bot in bots:
        trade_log_path = _data_dir(current_user.id, bot.id) / "trade_log.json"
        try:
            trades = json.loads(trade_log_path.read_text())
            if not isinstance(trades, list):
                continue
            for t in trades:
                trade_date = (t.get("date") or t.get("time") or t.get("timestamp") or "")[:10]
                if trade_date == today:
                    all_trades.append({
                        **t,
                        "bot_id": str(bot.id),
                        "bot_name": bot.name,
                    })
        except Exception:
            continue

    # Sort by time field if present, else by date
    all_trades.sort(key=lambda t: t.get("time") or t.get("timestamp") or t.get("date") or "", reverse=True)

    total_pnl = sum(
        float(str(t.get("pnl") or 0).replace("$", "").replace(",", "") or 0)
        for t in all_trades
    )
    winners = sum(1 for t in all_trades if float(str(t.get("pnl") or 0).replace("$", "").replace(",", "") or 0) > 0)

    return {
        "date": today,
        "trades": all_trades,
        "total_trades": len(all_trades),
        "total_pnl": round(total_pnl, 2),
        "winners": winners,
        "losers": len(all_trades) - winners,
    }


class TradeEvent(BaseModel):
    action: str = ""
    symbol: str = "SPX"
    strike: str = ""
    expiry: str = ""
    credit: str = ""
    debit: str = ""
    contracts: str = ""
    pnl: str = ""
    price: str = ""
    spx_price: str = ""
    vix: str = ""
    note: str = ""
    is_simulation: bool = True


@router.post("/{bot_id}/trade-event")
async def trade_event(
    bot_id: UUID,
    event: TradeEvent,
    current_user: User = Depends(get_bot_auth),
    db: Session = Depends(get_db),
):
    """Called by the bot subprocess when a trade is placed.
    Accepts user JWT or bot service token — works even after user logs out."""
    from app.services.telegram import send_telegram, format_trade_alert

    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    bot_name = bot.name if bot else str(bot_id)

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user or not user.telegram_chat_id:
        return {"notified": False, "reason": "no_telegram_linked"}

    if event.is_simulation and not user.telegram_notify_sim:
        return {"notified": False, "reason": "sim_notifications_disabled"}
    if not event.is_simulation and not user.telegram_notify_live:
        return {"notified": False, "reason": "live_notifications_disabled"}

    msg = format_trade_alert(bot_name, event.dict(), event.is_simulation)
    ok = send_telegram(user.telegram_chat_id, msg)
    return {"notified": ok}


class HeartbeatBody(BaseModel):
    status: str = "running"      # "running" | "closing_positions" | "all_closed" | "error"
    open_positions: int = 0
    message: str = ""

@router.post("/{bot_id}/heartbeat")
async def bot_heartbeat(
    bot_id: UUID,
    body: HeartbeatBody,
    current_user: User = Depends(get_bot_auth),
    db: Session = Depends(get_db),
):
    """Bot subprocess calls this periodically so the platform knows it's alive.
    Works with service token — no user session required."""
    data_path = _data_dir(current_user.id, bot_id)
    heartbeat = {
        "ts": datetime.utcnow().isoformat(),
        "status": body.status,
        "open_positions": body.open_positions,
        "message": body.message,
    }
    (data_path / "heartbeat.json").write_text(json.dumps(heartbeat))

    # If bot reports all positions closed, mark execution as completed
    if body.status == "all_closed":
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
            execution.status = ExecutionStatus.completed
            execution.result_data = {**(execution.result_data or {}), "closed_reason": body.message}
            db.commit()
        # Clean up service token so it can't be reused
        try:
            _service_token_path(current_user.id, bot_id).unlink()
        except Exception:
            pass

    return {"ack": True, "server_time": datetime.utcnow().isoformat()}


class PositionClosedBody(BaseModel):
    symbol: str = ""
    action: str = "CLOSED"
    pnl: str = ""
    reason: str = ""     # "take_profit" | "stop_loss" | "eod" | "manual"
    is_simulation: bool = True
    remaining_positions: int = 0

@router.post("/{bot_id}/position-closed")
async def position_closed(
    bot_id: UUID,
    body: PositionClosedBody,
    current_user: User = Depends(get_bot_auth),
    db: Session = Depends(get_db),
):
    """Called by the bot when it closes a position (EOD, stop loss, take profit).
    Sends a Telegram close alert. Works without user session."""
    from app.services.telegram import send_telegram

    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    bot_name = bot.name if bot else str(bot_id)
    user = db.query(User).filter(User.id == current_user.id).first()

    if user and user.telegram_chat_id:
        mode = "🟡 SIM" if body.is_simulation else "🟢 LIVE"
        reason_labels = {
            "take_profit": "✅ Take Profit",
            "stop_loss": "🛑 Stop Loss",
            "eod": "🕐 End of Day Close",
            "manual": "👤 Manual Close",
        }
        reason_label = reason_labels.get(body.reason, body.reason)
        msg = (
            f"<b>BotHub Pro — Position Closed</b>  {mode}\n"
            f"🤖 <b>{bot_name}</b>\n\n"
            f"<b>Symbol:</b> {body.symbol}\n"
            f"<b>Reason:</b> {reason_label}\n"
        )
        if body.pnl:
            msg += f"<b>P&L:</b> {body.pnl}\n"
        if body.remaining_positions > 0:
            msg += f"\n<i>{body.remaining_positions} position(s) still open — bot continuing…</i>"
        else:
            msg += "\n<i>All positions closed. Bot session complete.</i>"

        send = (body.is_simulation and user.telegram_notify_sim) or \
               (not body.is_simulation and user.telegram_notify_live)
        if send:
            from app.services.telegram import send_telegram
            send_telegram(user.telegram_chat_id, msg)

    return {"ack": True}
