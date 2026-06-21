from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.bot import Bot
from app.models.bot_schedule import BotSchedule

router = APIRouter(prefix="/bots", tags=["bot-schedule"])

class ScheduleUpdate(BaseModel):
    days_of_week: List[int]  # 0=Mon, 6=Sun
    start_time: str  # "HH:MM"
    stop_time: str   # "HH:MM"
    timezone: str
    enabled: bool

@router.get("/{bot_id}/schedule")
def get_schedule(bot_id: UUID, current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(404, "Bot not found")
    if not bot.schedule:
        return {"days_of_week": [0,1,2,3,4], "start_time": "09:30", "stop_time": "16:00", "timezone": "America/New_York", "enabled": False}
    s = bot.schedule
    return {"days_of_week": s.days_of_week, "start_time": s.start_time, "stop_time": s.stop_time, "timezone": s.timezone, "enabled": s.enabled}

@router.put("/{bot_id}/schedule")
def update_schedule(bot_id: UUID, body: ScheduleUpdate, current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(404, "Bot not found")
    if not bot.schedule:
        sched = BotSchedule(bot_id=bot_id, days_of_week=body.days_of_week, start_time=body.start_time, stop_time=body.stop_time, timezone=body.timezone, enabled=body.enabled)
        db.add(sched)
    else:
        bot.schedule.days_of_week = body.days_of_week
        bot.schedule.start_time = body.start_time
        bot.schedule.stop_time = body.stop_time
        bot.schedule.timezone = body.timezone
        bot.schedule.enabled = body.enabled
    db.commit()
    return {"message": "Schedule saved"}
