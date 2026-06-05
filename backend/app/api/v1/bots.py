from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.core.database import get_db
from app.models.bot import Bot, BotStatus
from app.schemas.bot import BotCreate, BotUpdate, BotResponse
from app.api.deps import get_current_active_user
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[BotResponse])
async def list_bots(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    from app.models.user import UserRole
    if current_user.role == UserRole.admin:
        # Admin sees all bots
        return db.query(Bot).all()
    else:
        # Regular users see only active bots
        return db.query(Bot).filter(Bot.status == BotStatus.active).all()


@router.post("/", response_model=BotResponse, status_code=status.HTTP_201_CREATED)
async def create_bot(
    bot_data: BotCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    bot = Bot(
        user_id=current_user.id,
        name=bot_data.name,
        description=bot_data.description,
        category=bot_data.category,
        risk_level=bot_data.risk_level,
        configuration=bot_data.configuration,
        schedule_cron=bot_data.schedule_cron,
        status=BotStatus.pending_approval
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot


@router.get("/{bot_id}", response_model=BotResponse)
async def get_bot(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot


@router.patch("/{bot_id}", response_model=BotResponse)
async def update_bot(
    bot_id: UUID,
    updates: BotUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(bot, field, value)
    db.commit()
    db.refresh(bot)
    return bot


@router.delete("/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bot(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    db.delete(bot)
    db.commit()
