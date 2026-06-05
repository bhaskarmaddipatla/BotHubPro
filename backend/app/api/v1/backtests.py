from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
import random
import math

router = APIRouter()


class BacktestRequest(BaseModel):
    bot_id: Optional[str] = None
    strategy: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    parameters: Optional[Dict[str, Any]] = None


@router.post("/run")
async def run_backtest(
    request: BacktestRequest,
    current_user: User = Depends(get_current_active_user)
):
    # Simulated backtest results - in production this would run actual strategy simulation
    trades = []
    capital = request.initial_capital
    equity_curve = [{"date": request.start_date, "value": capital}]

    start = datetime.fromisoformat(request.start_date)
    end = datetime.fromisoformat(request.end_date)
    current = start

    random.seed(42)
    while current < end:
        if random.random() > 0.3:  # ~70% chance of trade day
            pnl = random.gauss(50, 200)
            capital += pnl
            trades.append({
                "date": current.isoformat(),
                "pnl": round(pnl, 2),
                "cumulative": round(capital - request.initial_capital, 2)
            })
            equity_curve.append({"date": current.isoformat(), "value": round(capital, 2)})
        current += timedelta(days=1)

    winners = [t for t in trades if t["pnl"] > 0]
    losers = [t for t in trades if t["pnl"] < 0]
    total_wins = sum(t["pnl"] for t in winners)
    total_losses = abs(sum(t["pnl"] for t in losers))

    peak = request.initial_capital
    max_dd = 0
    running_cap = request.initial_capital
    for t in trades:
        running_cap += t["pnl"]
        if running_cap > peak:
            peak = running_cap
        dd = (peak - running_cap) / peak * 100
        if dd > max_dd:
            max_dd = dd

    return {
        "strategy": request.strategy,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "initial_capital": request.initial_capital,
        "final_capital": round(capital, 2),
        "total_return": round((capital - request.initial_capital) / request.initial_capital * 100, 2),
        "total_trades": len(trades),
        "win_rate": round(len(winners) / len(trades) * 100, 2) if trades else 0,
        "profit_factor": round(total_wins / total_losses, 2) if total_losses > 0 else 0,
        "max_drawdown": round(max_dd, 2),
        "sharpe_ratio": round(random.uniform(0.8, 2.4), 2),
        "avg_winner": round(total_wins / len(winners), 2) if winners else 0,
        "avg_loser": round(total_losses / len(losers), 2) if losers else 0,
        "equity_curve": equity_curve,
        "trades": trades[-20:],  # last 20 trades
    }
