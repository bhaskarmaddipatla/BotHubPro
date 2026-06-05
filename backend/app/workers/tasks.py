from app.workers.celery_app import celery_app
import logging
import time

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="execute_bot")
def execute_bot_task(self, execution_id: str, bot_id: str, user_id: str):
    from app.core.database import SessionLocal
    from app.models.execution import Execution, ExecutionStatus, ExecutionLog
    from datetime import datetime
    import uuid

    db = SessionLocal()
    try:
        execution = db.query(Execution).filter(Execution.id == uuid.UUID(execution_id)).first()
        if not execution:
            return {"error": "Execution not found"}

        execution.status = ExecutionStatus.running
        execution.started_at = datetime.utcnow()
        db.commit()

        log = ExecutionLog(execution_id=execution.id, level="INFO", message="Bot execution started")
        db.add(log)
        db.commit()

        time.sleep(2)  # Simulate bot work

        import random
        pnl = random.gauss(50, 200)

        execution.status = ExecutionStatus.completed
        execution.completed_at = datetime.utcnow()
        execution.profit_loss = round(pnl, 2)

        log2 = ExecutionLog(
            execution_id=execution.id, level="INFO",
            message=f"Bot execution completed. P&L: ${pnl:.2f}"
        )
        db.add(log2)
        db.commit()

        return {"status": "completed", "pnl": round(pnl, 2)}
    except Exception as e:
        if execution:
            execution.status = ExecutionStatus.failed
            execution.error_message = str(e)
            db.commit()
        logger.error(f"Bot execution failed: {e}")
        raise
    finally:
        db.close()
