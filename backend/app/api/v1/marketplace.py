from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.bot import Bot
from app.schemas.bot import BotResponse
from app.api.deps import get_current_active_user
from app.models.user import User

router = APIRouter()

MARKETPLACE_BOTS = [
    {
        "id": "00000000-0000-0000-0000-000000000001",
        "name": "SPX Credit Spread Bot",
        "description": "Automated SPX credit spread strategy targeting 1-3 DTE options with defined risk management",
        "category": "credit_spread",
        "risk_level": "medium",
        "win_rate": 68.5,
        "profit_factor": 1.82,
        "max_drawdown": -12.3,
        "monthly_return": 4.2,
        "total_trades": 248,
        "is_marketplace": True,
        "is_approved": True,
        "status": "active"
    },
    {
        "id": "00000000-0000-0000-0000-000000000002",
        "name": "SPX 0DTE Credit Spread Bot",
        "description": "High-frequency 0DTE SPX spreads capturing theta decay on same-day expiration options",
        "category": "credit_spread",
        "risk_level": "high",
        "win_rate": 72.1,
        "profit_factor": 1.65,
        "max_drawdown": -18.7,
        "monthly_return": 6.8,
        "total_trades": 512,
        "is_marketplace": True,
        "is_approved": True,
        "status": "active"
    },
    {
        "id": "00000000-0000-0000-0000-000000000003",
        "name": "SPX Iron Fly Bot",
        "description": "Iron fly strategy centered at the money, targeting maximum premium collection on SPX",
        "category": "iron_fly",
        "risk_level": "medium",
        "win_rate": 61.3,
        "profit_factor": 1.94,
        "max_drawdown": -15.2,
        "monthly_return": 3.9,
        "total_trades": 186,
        "is_marketplace": True,
        "is_approved": True,
        "status": "active"
    },
    {
        "id": "00000000-0000-0000-0000-000000000004",
        "name": "SPX Butterfly Bot",
        "description": "Long butterfly spread targeting SPX with precise entry and exit management",
        "category": "butterfly",
        "risk_level": "low",
        "win_rate": 55.8,
        "profit_factor": 2.31,
        "max_drawdown": -8.9,
        "monthly_return": 2.8,
        "total_trades": 143,
        "is_marketplace": True,
        "is_approved": True,
        "status": "active"
    },
    {
        "id": "00000000-0000-0000-0000-000000000005",
        "name": "SPX Gamma Bias Bot",
        "description": "Dynamic gamma-biased positioning adjusting to market volatility regime",
        "category": "custom",
        "risk_level": "high",
        "win_rate": 64.7,
        "profit_factor": 1.73,
        "max_drawdown": -21.4,
        "monthly_return": 5.5,
        "total_trades": 329,
        "is_marketplace": True,
        "is_approved": True,
        "status": "active"
    },
    {
        "id": "00000000-0000-0000-0000-000000000006",
        "name": "SPX Premarket Playbook Bot",
        "description": "Pre-market gap analysis with automated SPX positioning based on overnight futures and VIX",
        "category": "custom",
        "risk_level": "medium",
        "win_rate": 66.2,
        "profit_factor": 1.88,
        "max_drawdown": -11.8,
        "monthly_return": 4.7,
        "total_trades": 201,
        "is_marketplace": True,
        "is_approved": True,
        "status": "active"
    },
]


@router.get("/bots")
async def list_marketplace_bots():
    return {"bots": MARKETPLACE_BOTS}


@router.get("/bots/{bot_id}")
async def get_marketplace_bot(bot_id: str):
    bot = next((b for b in MARKETPLACE_BOTS if b["id"] == bot_id), None)
    if not bot:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot
