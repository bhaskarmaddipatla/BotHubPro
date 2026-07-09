"""
Swing Trade Monitor API
Provides real-time monitoring dashboard data for swing trade bots.
Reads state files written by the swing bot subprocess.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.bot import Bot

router = APIRouter()

def _data_dir(user_id, bot_id) -> Path:
    return Path(f"/data/{user_id}/{bot_id}")


def _read_json(path: Path, default=None):
    try:
        if path.exists():
            return json.loads(path.read_text())
    except Exception:
        pass
    return default


def _monitoring_mode(pos: dict, spx_price: float) -> str:
    """Determine monitoring mode based on proximity to key levels."""
    short_strike = float(pos.get("short_strike", 0) or 0)
    entry_credit = float(pos.get("entry_credit", 0) or 0)
    current_value = float(pos.get("current_value", entry_credit) or entry_credit)
    target_value = entry_credit * 0.5        # 50% take profit
    stop_value = entry_credit * 2.0          # 100% stop
    dte = int(pos.get("dte", 999) or 999)

    pnl_pct = ((entry_credit - current_value) / entry_credit * 100) if entry_credit > 0 else 0
    distance_to_short_pct = abs(spx_price - short_strike) / spx_price * 100 if short_strike and spx_price else 999

    # Critical: within 1% of short strike or >80% of stop
    if distance_to_short_pct < 1.0 or (entry_credit > 0 and current_value >= stop_value * 0.8):
        return "critical"
    # Fast: within 10% of target or stop, or within 2% of short strike
    if distance_to_short_pct < 2.0 or abs(pnl_pct - 50) < 10 or pnl_pct > 80:
        return "fast"
    return "normal"


def _poll_interval_seconds(dte: int, mode: str, spread_type: str) -> int:
    """Return poll interval in seconds based on DTE, mode, and spread type."""
    is_credit_spread = "credit" in (spread_type or "").lower() or "spread" in (spread_type or "").lower()
    is_leaps = dte > 90

    if mode == "critical":
        return 5 if dte == 0 else (300 if is_leaps else 30)
    if mode == "fast":
        return 5 if dte == 0 else (300 if is_leaps else 30)

    # Normal mode by DTE
    if dte == 0:
        return 15
    if dte <= 3:
        return 60
    if dte <= 21:
        return 300        # 5 minutes
    return 900            # 15 minutes (LEAPS)


def _recommended_action(pos: dict, spx_price: float, mode: str) -> dict:
    """Generate recommended exit action and reasoning."""
    entry_credit = float(pos.get("entry_credit", 0) or 0)
    current_value = float(pos.get("current_value", entry_credit) or entry_credit)
    short_strike = float(pos.get("short_strike", 0) or 0)
    dte = int(pos.get("dte", 999) or 999)

    pnl_pct = ((entry_credit - current_value) / entry_credit * 100) if entry_credit > 0 else 0
    distance_to_short_pct = abs(spx_price - short_strike) / spx_price * 100 if short_strike and spx_price else 999

    if pnl_pct >= 50:
        return {"action": "take_profit", "reason": f"At {pnl_pct:.0f}% profit — take profit target reached", "urgency": "high"}
    if entry_credit > 0 and current_value >= entry_credit * 2.0:
        return {"action": "stop_loss", "reason": "Stop loss level reached (2× credit)", "urgency": "high"}
    if distance_to_short_pct < 1.0:
        return {"action": "exit_now", "reason": f"Short strike {short_strike:.0f} breached — {distance_to_short_pct:.1f}% away", "urgency": "critical"}
    if dte <= 1 and pnl_pct < 30:
        return {"action": "eod_close", "reason": f"Expiration tomorrow with only {pnl_pct:.0f}% profit — EOD risk reduction", "urgency": "medium"}
    if mode == "critical":
        return {"action": "review", "reason": "Position threatened — AI review recommended", "urgency": "high"}
    if pnl_pct >= 35:
        return {"action": "consider_close", "reason": f"At {pnl_pct:.0f}% profit — approaching target", "urgency": "low"}
    return {"action": "hold", "reason": f"Position healthy — {pnl_pct:.0f}% profit, {distance_to_short_pct:.1f}% from short strike", "urgency": "none"}


def _enrich_position(pos: dict, spx_price: float) -> dict:
    """Add computed monitoring fields to a raw position dict."""
    entry_credit = float(pos.get("entry_credit", pos.get("credit", 0)) or 0)
    current_value = float(pos.get("current_value", entry_credit) or entry_credit)
    short_strike = float(pos.get("short_strike", 0) or 0)
    dte = int(pos.get("dte", 0) or 0)
    spread_type = pos.get("spread_type", pos.get("type", ""))

    pnl = (entry_credit - current_value) * 100 * int(pos.get("contracts", pos.get("qty", 1)) or 1)
    pnl_pct = ((entry_credit - current_value) / entry_credit * 100) if entry_credit > 0 else 0
    target_pnl = entry_credit * 0.5 * 100 * int(pos.get("contracts", pos.get("qty", 1)) or 1)
    stop_loss_value = entry_credit * 2.0
    stop_pnl = -(stop_loss_value - entry_credit) * 100 * int(pos.get("contracts", pos.get("qty", 1)) or 1)
    distance_to_short = abs(spx_price - short_strike) if short_strike and spx_price else None
    distance_to_short_pct = distance_to_short / spx_price * 100 if distance_to_short and spx_price else None

    mode = _monitoring_mode(pos, spx_price)
    poll_secs = _poll_interval_seconds(dte, mode, spread_type)
    action = _recommended_action(pos, spx_price, mode)

    return {
        **pos,
        "entry_credit": entry_credit,
        "current_value": current_value,
        "pnl": round(pnl, 2),
        "pnl_pct": round(pnl_pct, 1),
        "target_pnl": round(target_pnl, 2),
        "stop_loss_value": round(stop_loss_value, 2),
        "stop_pnl": round(stop_pnl, 2),
        "distance_to_short_strike": round(distance_to_short, 1) if distance_to_short is not None else None,
        "distance_to_short_strike_pct": round(distance_to_short_pct, 2) if distance_to_short_pct is not None else None,
        "monitoring_mode": mode,
        "poll_interval_seconds": poll_secs,
        "recommended_action": action,
    }


@router.get("/{bot_id}/dashboard")
async def swing_dashboard(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Returns full swing trade monitoring dashboard data."""
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    data_path = _data_dir(current_user.id, bot_id)
    positions = _read_json(data_path / "positions.json", [])
    status = _read_json(data_path / "status.json", {})
    monitor_state = _read_json(data_path / "monitor_state.json", {})
    exit_log = _read_json(data_path / "exit_log.json", [])
    ai_callouts = _read_json(data_path / "ai_callouts.json", [])

    spx_price = float(status.get("spx_price", monitor_state.get("spx_price", 0)) or 0)

    enriched = [_enrich_position(p, spx_price) for p in (positions or []) if p]

    # Aggregate mode: worst of all positions
    modes = [p["monitoring_mode"] for p in enriched]
    overall_mode = "critical" if "critical" in modes else ("fast" if "fast" in modes else "normal")

    total_pnl = sum(p["pnl"] for p in enriched)
    total_target = sum(p["target_pnl"] for p in enriched)

    return {
        "bot_id": str(bot_id),
        "bot_name": bot.name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "spx_price": spx_price,
        "status": status,
        "summary": {
            "total_positions": len(enriched),
            "total_pnl": round(total_pnl, 2),
            "total_target_pnl": round(total_target, 2),
            "overall_monitoring_mode": overall_mode,
            "bot_running": bool(status.get("running", monitor_state.get("running", False))),
        },
        "positions": enriched,
        "exit_log": (exit_log or [])[-50:],          # last 50 decisions
        "ai_callouts": (ai_callouts or [])[-10:],    # last 10 AI calls
        "monitor_state": monitor_state,
    }


@router.post("/{bot_id}/approve-exit/{position_id}")
async def approve_exit(
    bot_id: UUID,
    position_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Manually approve a pending exit for a position."""
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    data_path = _data_dir(current_user.id, bot_id)
    approvals_path = data_path / "exit_approvals.json"
    approvals = _read_json(approvals_path, {})
    approvals[position_id] = {
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "approved_by": str(current_user.id),
    }
    approvals_path.write_text(json.dumps(approvals, indent=2))
    return {"approved": True, "position_id": position_id}


@router.delete("/{bot_id}/approve-exit/{position_id}")
async def cancel_exit(
    bot_id: UUID,
    position_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Cancel a pending exit approval."""
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    data_path = _data_dir(current_user.id, bot_id)
    approvals_path = data_path / "exit_approvals.json"
    approvals = _read_json(approvals_path, {})
    approvals.pop(position_id, None)
    approvals_path.write_text(json.dumps(approvals, indent=2))
    return {"cancelled": True, "position_id": position_id}


@router.get("/{bot_id}/exit-log")
async def get_exit_log(
    bot_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Returns the full exit decision log."""
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    data_path = _data_dir(current_user.id, bot_id)
    return _read_json(data_path / "exit_log.json", [])
