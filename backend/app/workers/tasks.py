from app.workers.celery_app import celery_app
import logging
import subprocess
import os
import json

logger = logging.getLogger(__name__)

BOTS_DIR = os.environ.get("BOTS_DIR", "/app/bot_files")


@celery_app.task(bind=True, name="execute_bot")
def execute_bot_task(self, execution_id: str, bot_id: str, user_id: str):
    from app.core.database import SessionLocal
    from app.models.execution import Execution, ExecutionStatus, ExecutionLog
    from app.models.bot import Bot
    from app.models.api_key import APIKey
    from datetime import datetime
    import uuid, base64

    db = SessionLocal()
    try:
        execution = db.query(Execution).filter(Execution.id == uuid.UUID(execution_id)).first()
        if not execution:
            return {"error": "Execution not found"}

        execution.status = ExecutionStatus.running
        execution.started_at = datetime.utcnow()
        execution.celery_task_id = self.request.id
        db.commit()

        def add_log(message: str, level: str = "INFO", data: dict = None):
            log = ExecutionLog(execution_id=execution.id, level=level, message=message, data=data)
            db.add(log)
            db.commit()

        add_log("Bot execution started")

        bot = db.query(Bot).filter(Bot.id == uuid.UUID(bot_id)).first()
        if not bot:
            raise Exception("Bot not found")

        bot_dir = os.path.join(BOTS_DIR, user_id, bot_id)
        config = bot.configuration or {}
        entry_file = config.get("entry_file", "main.py")
        entry_path = os.path.join(bot_dir, entry_file)

        # Build environment for the bot subprocess
        env = os.environ.copy()

        # Inject IBKR credentials if available
        ibkr_key = db.query(APIKey).filter(
            APIKey.user_id == uuid.UUID(user_id),
            APIKey.provider == "ibkr",
            APIKey.is_active == True
        ).first()

        if ibkr_key:
            try:
                creds = json.loads(base64.b64decode(ibkr_key.encrypted_key.encode()).decode())
                env["IBKR_HOST"] = str(creds.get("host", "127.0.0.1"))
                env["IBKR_PORT"] = str(creds.get("port", 7497))
                env["IBKR_CLIENT_ID"] = str(creds.get("client_id", 1))
                env["IBKR_ACCOUNT"] = str(creds.get("account", ""))
                env["IBKR_PAPER"] = str(creds.get("paper_trading", True)).lower()
                add_log(f"IBKR credentials injected (account: {creds.get('account', 'N/A')})")
            except Exception as e:
                add_log(f"Warning: Could not load IBKR credentials: {e}", "WARN")

        env["BOT_ID"] = bot_id
        env["EXECUTION_ID"] = execution_id
        env["USER_ID"] = user_id

        if not os.path.exists(entry_path):
            # No file uploaded yet - run simulation
            add_log("No bot file found at entry path - running simulation mode", "WARN")
            import time, random
            time.sleep(2)
            pnl = round(random.gauss(50, 200), 2)
            execution.status = ExecutionStatus.completed
            execution.completed_at = datetime.utcnow()
            execution.profit_loss = pnl
            execution.result_data = {"mode": "simulation", "pnl": pnl}
            add_log(f"Simulation completed. P&L: ${pnl}", "INFO")
            db.commit()
            return {"status": "completed", "pnl": pnl, "mode": "simulation"}

        add_log(f"Executing {entry_file} in {bot_dir}")

        result = subprocess.run(
            ["python", entry_path],
            capture_output=True,
            text=True,
            timeout=300,
            cwd=bot_dir,
            env=env
        )

        if result.stdout:
            for line in result.stdout.strip().split("\n"):
                if line:
                    add_log(line, "INFO")

        if result.returncode != 0:
            if result.stderr:
                add_log(result.stderr[:2000], "ERROR")
            raise Exception(f"Bot exited with code {result.returncode}")

        # Parse P&L from stdout if bot outputs JSON like: {"pnl": 125.50}
        pnl = None
        try:
            last_line = result.stdout.strip().split("\n")[-1]
            output_data = json.loads(last_line)
            pnl = output_data.get("pnl")
        except Exception:
            pass

        execution.status = ExecutionStatus.completed
        execution.completed_at = datetime.utcnow()
        execution.profit_loss = pnl
        execution.result_data = {"returncode": result.returncode}
        add_log(f"Bot completed successfully. P&L: {f'${pnl}' if pnl is not None else 'N/A'}")
        db.commit()
        return {"status": "completed", "pnl": pnl}

    except subprocess.TimeoutExpired:
        execution.status = ExecutionStatus.failed
        execution.error_message = "Execution timed out after 300 seconds"
        db.commit()
        logger.error("Bot execution timed out")
        raise
    except Exception as e:
        if execution:
            execution.status = ExecutionStatus.failed
            execution.completed_at = datetime.utcnow()
            execution.error_message = str(e)
            db.commit()
        logger.error(f"Bot execution failed: {e}")
        raise
    finally:
        db.close()
