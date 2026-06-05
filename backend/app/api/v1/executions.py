from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from datetime import datetime
from app.core.database import get_db
from app.models.execution import Execution, ExecutionStatus, ExecutionTrigger, ExecutionLog
from app.models.bot import Bot
from app.schemas.execution import ExecutionCreate, ExecutionResponse, ExecutionLogResponse
from app.api.deps import get_current_active_user
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[ExecutionResponse])
async def list_executions(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    return db.query(Execution).filter(
        Execution.user_id == current_user.id
    ).order_by(Execution.created_at.desc()).offset(offset).limit(limit).all()


@router.post("/", response_model=ExecutionResponse, status_code=status.HTTP_201_CREATED)
async def create_execution(
    exec_data: ExecutionCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    bot = db.query(Bot).filter(Bot.id == exec_data.bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    execution = Execution(
        user_id=current_user.id,
        bot_id=exec_data.bot_id,
        trigger=exec_data.trigger,
        status=ExecutionStatus.pending,
        started_at=datetime.utcnow()
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)
    return execution


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    execution = db.query(Execution).filter(
        Execution.id == execution_id, Execution.user_id == current_user.id
    ).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


@router.get("/{execution_id}/logs", response_model=List[ExecutionLogResponse])
async def get_execution_logs(
    execution_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    execution = db.query(Execution).filter(
        Execution.id == execution_id, Execution.user_id == current_user.id
    ).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return db.query(ExecutionLog).filter(ExecutionLog.execution_id == execution_id).all()
