from sqlalchemy import Column, Boolean, String, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.core.database import Base

class BotSchedule(Base):
    __tablename__ = "bot_schedules"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bot_id = Column(UUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, unique=True)
    days_of_week = Column(JSON, nullable=False, default=list)  # [0,1,2,3,4] = Mon-Fri
    start_time = Column(String(5), nullable=False, default="09:30")  # HH:MM
    stop_time = Column(String(5), nullable=False, default="16:00")   # HH:MM
    timezone = Column(String(50), nullable=False, default="America/New_York")
    enabled = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    bot = relationship("Bot", back_populates="schedule")
