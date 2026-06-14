from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from uuid import UUID
import uuid
from datetime import datetime, timedelta
from app.core.database import get_db
from app.models.user import User, UserStatus
from app.models.bot import Bot, BotStatus
from app.models.execution import Execution
from app.models.subscription import Subscription, SubscriptionStatus, Plan
from app.schemas.user import UserResponse
from app.api.deps import require_admin
from pydantic import BaseModel


class SubscriptionApprovalResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_name: str
    plan_name: str
    status: SubscriptionStatus
    created_at: datetime | None = None

    class Config:
        from_attributes = True

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


@router.get("/subscriptions/pending")
async def list_pending_subscriptions(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    subs = db.query(Subscription).filter(
        Subscription.status == SubscriptionStatus.pending_approval
    ).all()
    result = []
    for sub in subs:
        user = db.query(User).filter(User.id == sub.user_id).first()
        plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()
        result.append({
            "id": str(sub.id),
            "user_id": str(sub.user_id),
            "user_email": user.email if user else "",
            "user_name": f"{user.first_name} {user.last_name}" if user else "",
            "plan_name": plan.name if plan else "",
            "status": sub.status,
            "created_at": sub.created_at,
        })
    return result


@router.post("/subscriptions/{sub_id}/approve")
async def approve_subscription(sub_id: UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.status = SubscriptionStatus.trialing
    db.commit()
    return {"message": "Subscription approved"}


@router.post("/subscriptions/{sub_id}/reject")
async def reject_subscription(sub_id: UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.status = SubscriptionStatus.canceled
    db.commit()
    return {"message": "Subscription rejected"}
