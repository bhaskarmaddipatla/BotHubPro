from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.core.database import get_db
from app.models.execution import Execution, ExecutionStatus
from app.models.bot import Bot
from app.api.deps import get_current_active_user
from app.models.user import User
from typing import List

router = APIRouter()


@router.get("/summary")
async def get_summary(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    total_executions = db.query(Execution).filter(Execution.user_id == current_user.id).count()
    completed = db.query(Execution).filter(
        Execution.user_id == current_user.id,
        Execution.status == ExecutionStatus.completed
    ).count()
    active_bots = db.query(Bot).filter(Bot.user_id == current_user.id).count()

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0)
    today_executions = db.query(Execution).filter(
        Execution.user_id == current_user.id,
        Execution.created_at >= today_start
    ).count()

    pnl_result = db.query(func.sum(Execution.profit_loss)).filter(
        Execution.user_id == current_user.id,
        Execution.profit_loss.isnot(None)
    ).scalar()

    win_rate = (completed / total_executions * 100) if total_executions > 0 else 0

    return {
        "active_bots": active_bots,
        "executions_today": today_executions,
        "total_executions": total_executions,
        "win_rate": round(win_rate, 2),
        "total_pnl": float(pnl_result or 0),
    }


@router.get("/equity-curve")
async def get_equity_curve(
    days: int = 30,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    since = datetime.utcnow() - timedelta(days=days)
    executions = db.query(Execution).filter(
        Execution.user_id == current_user.id,
        Execution.created_at >= since,
        Execution.profit_loss.isnot(None),
        Execution.status == ExecutionStatus.completed
    ).order_by(Execution.created_at).all()

    cumulative = 0
    curve = []
    for ex in executions:
        cumulative += float(ex.profit_loss or 0)
        curve.append({
            "date": ex.created_at.isoformat(),
            "pnl": float(ex.profit_loss or 0),
            "cumulative": round(cumulative, 2)
        })
    return {"equity_curve": curve}


@router.get("/performance")
async def get_performance(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    executions = db.query(Execution).filter(
        Execution.user_id == current_user.id,
        Execution.profit_loss.isnot(None),
        Execution.status == ExecutionStatus.completed
    ).all()

    if not executions:
        return {"win_rate": 0, "profit_factor": 0, "total_trades": 0, "avg_winner": 0, "avg_loser": 0}

    winners = [e for e in executions if float(e.profit_loss or 0) > 0]
    losers = [e for e in executions if float(e.profit_loss or 0) < 0]

    total_wins = sum(float(e.profit_loss) for e in winners)
    total_losses = abs(sum(float(e.profit_loss) for e in losers))

    win_rate = len(winners) / len(executions) * 100 if executions else 0
    profit_factor = total_wins / total_losses if total_losses > 0 else 0
    avg_winner = total_wins / len(winners) if winners else 0
    avg_loser = total_losses / len(losers) if losers else 0

    return {
        "win_rate": round(win_rate, 2),
        "profit_factor": round(profit_factor, 2),
        "total_trades": len(executions),
        "avg_winner": round(avg_winner, 2),
        "avg_loser": round(avg_loser, 2),
        "total_pnl": round(total_wins - total_losses, 2)
    }
