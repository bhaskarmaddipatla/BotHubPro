from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.subscription import Plan, Subscription, PlanType, SubscriptionStatus
from app.api.deps import get_current_active_user
from app.models.user import User
from pydantic import BaseModel
from datetime import datetime, timedelta
import uuid

router = APIRouter()


class PlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    plan_type: PlanType
    price_monthly: float
    max_bots: int
    max_executions_per_day: int
    features: str | None = None

    class Config:
        from_attributes = True


class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    status: SubscriptionStatus
    current_period_end: datetime | None = None
    trial_end: datetime | None = None

    class Config:
        from_attributes = True


@router.get("/plans", response_model=List[PlanResponse])
async def list_plans(db: Session = Depends(get_db)):
    plans = db.query(Plan).filter(Plan.is_active == True).all()
    if not plans:
        seed_plans(db)
        plans = db.query(Plan).filter(Plan.is_active == True).all()
    return plans


def seed_plans(db: Session):
    plans_data = [
        Plan(name="Trial", plan_type=PlanType.trial, price_monthly=0, max_bots=1, max_executions_per_day=5,
             features="1 bot,5 executions/day,Basic analytics"),
        Plan(name="Monthly", plan_type=PlanType.monthly, price_monthly=49, max_bots=3, max_executions_per_day=100,
             features="3 bots,Unlimited executions,Full analytics,Email notifications"),
        Plan(name="Professional", plan_type=PlanType.professional, price_monthly=99, max_bots=10, max_executions_per_day=500,
             features="10 bots,Advanced analytics,API integrations,Priority support"),
        Plan(name="Enterprise", plan_type=PlanType.enterprise, price_monthly=0, max_bots=999, max_executions_per_day=9999,
             features="Unlimited bots,White-label,Dedicated support,Custom integrations"),
    ]
    for p in plans_data:
        db.add(p)
    db.commit()


@router.get("/current", response_model=SubscriptionResponse | None)
async def get_current_subscription(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    sub = db.query(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.status.in_([SubscriptionStatus.active, SubscriptionStatus.trialing])
    ).first()
    return sub


@router.post("/trial")
async def start_trial(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    existing = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already has a subscription")

    trial_plan = db.query(Plan).filter(Plan.plan_type == PlanType.trial).first()
    if not trial_plan:
        seed_plans(db)
        trial_plan = db.query(Plan).filter(Plan.plan_type == PlanType.trial).first()

    sub = Subscription(
        user_id=current_user.id,
        plan_id=trial_plan.id,
        status=SubscriptionStatus.pending_approval,
        trial_end=datetime.utcnow() + timedelta(days=7),
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow() + timedelta(days=7)
    )
    db.add(sub)
    db.commit()
    return {"message": "Subscription requested. Awaiting admin approval.", "status": "pending_approval"}
