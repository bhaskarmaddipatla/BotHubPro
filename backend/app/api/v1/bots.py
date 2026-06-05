from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
import os, shutil, zipfile, json
from app.core.database import get_db
from app.models.bot import Bot, BotStatus
from app.schemas.bot import BotCreate, BotUpdate, BotResponse
from app.api.deps import get_current_active_user
from app.models.user import User
from app.core.config import settings

router = APIRouter()

BOTS_DIR = os.environ.get("BOTS_DIR", "/app/bot_files")


def get_bot_dir(user_id: str, bot_id: str) -> str:
    return os.path.join(BOTS_DIR, str(user_id), str(bot_id))


@router.get("/", response_model=List[BotResponse])
async def list_bots(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    return db.query(Bot).filter(Bot.user_id == current_user.id).all()


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
        status=BotStatus.inactive
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot


@router.post("/upload", response_model=BotResponse, status_code=status.HTTP_201_CREATED)
async def upload_bot(
    name: str = Form(...),
    description: str = Form(""),
    category: str = Form("custom"),
    risk_level: str = Form("medium"),
    entry_file: str = Form("main.py"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload a bot as a zip file containing the bot folder."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a .zip file of your bot folder")

    from app.models.bot import BotCategory, RiskLevel
    bot = Bot(
        user_id=current_user.id,
        name=name,
        description=description,
        category=category,
        risk_level=risk_level,
        configuration={"entry_file": entry_file},
        status=BotStatus.inactive
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)

    bot_dir = get_bot_dir(str(current_user.id), str(bot.id))
    os.makedirs(bot_dir, exist_ok=True)

    zip_path = os.path.join(bot_dir, "upload.zip")
    with open(zip_path, "wb") as f:
        content = await file.read()
        f.write(content)

    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(bot_dir)
    os.remove(zip_path)

    bot.status = BotStatus.active
    db.commit()
    db.refresh(bot)
    return bot


@router.get("/{bot_id}", response_model=BotResponse)
async def get_bot(bot_id: UUID, current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
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
async def delete_bot(bot_id: UUID, current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    bot_dir = get_bot_dir(str(current_user.id), str(bot_id))
    if os.path.exists(bot_dir):
        shutil.rmtree(bot_dir)
    db.delete(bot)
    db.commit()


@router.get("/{bot_id}/files")
async def list_bot_files(bot_id: UUID, current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    bot_dir = get_bot_dir(str(current_user.id), str(bot_id))
    if not os.path.exists(bot_dir):
        return {"files": []}
    files = []
    for root, dirs, filenames in os.walk(bot_dir):
        for fname in filenames:
            fpath = os.path.join(root, fname)
            rel = os.path.relpath(fpath, bot_dir)
            files.append({"name": rel, "size": os.path.getsize(fpath)})
    return {"files": files}


@router.post("/{bot_id}/schedule")
async def set_schedule(
    bot_id: UUID,
    schedule_data: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Set bot schedule. schedule_data: {type: 'cron'|'market_open'|'market_close'|'daily_time', value: '09:45'}"""
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    schedule_type = schedule_data.get("type")
    schedule_value = schedule_data.get("value", "")

    cron_map = {
        "market_open": "30 9 * * 1-5",
        "market_close": "0 16 * * 1-5",
    }

    if schedule_type in cron_map:
        bot.schedule_cron = cron_map[schedule_type]
    elif schedule_type == "daily_time" and schedule_value:
        hour, minute = schedule_value.split(":")
        bot.schedule_cron = f"{minute} {hour} * * 1-5"
    elif schedule_type == "cron" and schedule_value:
        bot.schedule_cron = schedule_value
    elif schedule_type == "manual":
        bot.schedule_cron = None

    config = bot.configuration or {}
    config["schedule_type"] = schedule_type
    config["schedule_value"] = schedule_value
    bot.configuration = config

    db.commit()
    return {"message": "Schedule updated", "cron": bot.schedule_cron, "schedule_type": schedule_type}
