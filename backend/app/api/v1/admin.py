from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from uuid import UUID
from app.core.database import get_db
from app.models.user import User, UserStatus
from app.models.bot import Bot, BotStatus
from app.models.execution import Execution
from app.models.subscription import Subscription, SubscriptionStatus
from app.schemas.user import UserResponse
from app.api.deps import require_admin

router = APIRouter()


@router.get("/metrics")
async def get_admin_metrics(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    active_subscribers = db.query(Subscription).filter(
        Subscription.status.in_([SubscriptionStatus.active, SubscriptionStatus.trialing])
    ).count()
    total_executions = db.query(Execution).count()
    total_bots = db.query(Bot).count()

    return {
        "total_users": total_users,
        "active_subscribers": active_subscribers,
        "total_executions": total_executions,
        "total_bots": total_bots,
    }


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    limit: int = 50,
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return db.query(User).offset(offset).limit(limit).all()


@router.post("/users/{user_id}/suspend")
async def suspend_user(user_id: UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = UserStatus.suspended
    db.commit()
    return {"message": "User suspended"}


@router.post("/users/{user_id}/activate")
async def activate_user(user_id: UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = UserStatus.active
    db.commit()
    return {"message": "User activated"}


@router.post("/bots/{bot_id}/approve")
async def approve_bot(bot_id: UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    bot.status = BotStatus.active
    bot.is_approved = True
    db.commit()
    return {"message": "Bot approved"}
