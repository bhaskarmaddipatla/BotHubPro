from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID
from app.models.bot import BotCategory, BotStatus, RiskLevel


class BotCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: BotCategory
    risk_level: RiskLevel = RiskLevel.medium
    configuration: Optional[Dict[str, Any]] = None
    schedule_cron: Optional[str] = None


class BotUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    risk_level: Optional[RiskLevel] = None
    configuration: Optional[Dict[str, Any]] = None
    schedule_cron: Optional[str] = None


class BotResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    category: BotCategory
    risk_level: RiskLevel
    status: BotStatus
    configuration: Optional[Dict[str, Any]] = None
    schedule_cron: Optional[str] = None
    is_marketplace: bool
    is_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True
