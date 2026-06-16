from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
import secrets
import os
import httpx

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.services.telegram import send_telegram

router = APIRouter()


class PrefsUpdate(BaseModel):
    notify_live: bool | None = None
    notify_sim: bool | None = None


@router.get("/status")
async def telegram_status(current_user: User = Depends(get_current_active_user)):
    return {
        "connected": bool(current_user.telegram_chat_id),
        "chat_id": current_user.telegram_chat_id,
        "notify_live": current_user.telegram_notify_live,
        "notify_sim": current_user.telegram_notify_sim,
    }


@router.post("/connect")
async def telegram_connect(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    code = secrets.token_hex(3).upper()
    current_user.telegram_link_code = code
    current_user.telegram_link_code_expires = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
    bot_username = os.environ.get("TELEGRAM_BOT_USERNAME", "YourBotHubProBot")
    return {
        "code": code,
        "expires_in_minutes": 10,
        "bot_username": bot_username,
        "instructions": f"Open Telegram, search @{bot_username}, and send the message: /link {code}",
    }


@router.delete("/disconnect")
async def telegram_disconnect(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    current_user.telegram_chat_id = None
    current_user.telegram_link_code = None
    current_user.telegram_link_code_expires = None
    db.commit()
    return {"disconnected": True}


@router.patch("/preferences")
async def telegram_preferences(
    body: PrefsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if body.notify_live is not None:
        current_user.telegram_notify_live = body.notify_live
    if body.notify_sim is not None:
        current_user.telegram_notify_sim = body.notify_sim
    db.commit()
    return {"notify_live": current_user.telegram_notify_live, "notify_sim": current_user.telegram_notify_sim}


@router.post("/test")
async def telegram_test(current_user: User = Depends(get_current_active_user)):
    if not current_user.telegram_chat_id:
        raise HTTPException(status_code=400, detail="No Telegram account connected")
    ok = send_telegram(
        current_user.telegram_chat_id,
        "✅ <b>BotHub Pro Test</b>\n\nYour Telegram notifications are working correctly!\n\nYou'll receive alerts here when your bots place trades."
    )
    if not ok:
        raise HTTPException(status_code=502, detail="Failed to send message. Check TELEGRAM_BOT_TOKEN in .env")
    return {"sent": True}


@router.post("/webhook")
async def telegram_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    message = body.get("message", {})
    text = (message.get("text") or "").strip()
    chat_id = str(message.get("chat", {}).get("id", ""))

    if not text or not chat_id:
        return {"ok": True}

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")

    if text.lower().startswith("/link "):
        code = text.split(" ", 1)[1].strip().upper()
        now = datetime.utcnow()
        user = db.query(User).filter(
            User.telegram_link_code == code,
            User.telegram_link_code_expires > now
        ).first()

        if not user:
            reply = "❌ Invalid or expired code. Go to BotHub Pro Settings → Notifications and click <b>Connect Telegram</b> to get a new code."
        else:
            user.telegram_chat_id = chat_id
            user.telegram_link_code = None
            user.telegram_link_code_expires = None
            db.commit()
            reply = f"✅ <b>Connected!</b>\n\nYour Telegram is now linked to <b>{user.email}</b>.\n\nYou'll receive trade alerts here for all your bots."

        if token:
            try:
                httpx.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": reply, "parse_mode": "HTML"},
                    timeout=10
                )
            except Exception:
                pass

    elif text.lower() == "/start":
        reply = "👋 Welcome to <b>BotHub Pro</b>!\n\nTo connect your account:\n1. Log in to BotHub Pro\n2. Go to <b>Settings → Notifications</b>\n3. Click <b>Connect Telegram</b>\n4. Send the code here with: <code>/link YOUR_CODE</code>"
        if token:
            try:
                httpx.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": reply, "parse_mode": "HTML"},
                    timeout=10
                )
            except Exception:
                pass

    return {"ok": True}
