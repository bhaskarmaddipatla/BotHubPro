from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID
from app.models.execution import ExecutionStatus, ExecutionTrigger


class ExecutionCreate(BaseModel):
    bot_id: UUID
    trigger: ExecutionTrigger = ExecutionTrigger.manual


class ExecutionResponse(BaseModel):
    id: UUID
    user_id: UUID
    bot_id: UUID
    status: ExecutionStatus
    trigger: ExecutionTrigger
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    profit_loss: Optional[float] = None
    result_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ExecutionLogResponse(BaseModel):
    id: UUID
    execution_id: UUID
    level: str
    message: str
    data: Optional[Dict[str, Any]] = None
    timestamp: datetime

    class Config:
        from_attributes = True
