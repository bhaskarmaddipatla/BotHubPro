from sqlalchemy import Column, String, Boolean, DateTime, Enum, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.core.database import Base


class BotCategory(str, enum.Enum):
    credit_spread = "credit_spread"
    iron_condor = "iron_condor"
    iron_fly = "iron_fly"
    butterfly = "butterfly"
    pmcc = "pmcc"
    calendar = "calendar"
    double_calendar = "double_calendar"
    custom = "custom"


class BotStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    pending_approval = "pending_approval"
    suspended = "suspended"


class RiskLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Bot(Base):
    __tablename__ = "bots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(Enum(BotCategory), nullable=False)
    risk_level = Column(Enum(RiskLevel), default=RiskLevel.medium)
    status = Column(Enum(BotStatus), default=BotStatus.pending_approval)
    configuration = Column(JSON, nullable=True)
    schedule_cron = Column(String(100), nullable=True)
    is_marketplace = Column(Boolean, default=False)
    marketplace_description = Column(Text, nullable=True)
    is_approved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="bots")
    executions = relationship("Execution", back_populates="bot")
    schedule = relationship("BotSchedule", back_populates="bot", uselist=False)
