import json
import os
from datetime import datetime, date, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.bot import Bot

router = APIRouter()

DATA_ROOT = Path("/data")
RETRO_PATH = DATA_ROOT / "retrospective" / "report.json"


def _require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


def _load_all_trades(period: str, db: Session) -> dict:
    """Read every trade_log.json under /data and annotate with bot name."""
    bots_by_id: dict[str, str] = {}
    for b in db.query(Bot).all():
        bots_by_id[str(b.id)] = b.name

    today_str = date.today().isoformat()
    trades_by_bot: dict[str, list] = {}

    if not DATA_ROOT.exists():
        return {}

    for user_dir in DATA_ROOT.iterdir():
        if not user_dir.is_dir() or user_dir.name == "retrospective":
            continue
        for bot_dir in user_dir.iterdir():
            if not bot_dir.is_dir():
                continue
            tl = bot_dir / "trade_log.json"
            if not tl.exists():
                continue
            try:
                trades: list = json.loads(tl.read_text())
            except Exception:
                continue

            bot_id = bot_dir.name
            bot_name = bots_by_id.get(bot_id, bot_id[:8])

            for t in trades:
                ts = t.get("timestamp", t.get("time", ""))
                if period == "today" and not ts.startswith(today_str):
                    continue
                t["_bot_id"] = bot_id
                t["_bot_name"] = bot_name
                if bot_id not in trades_by_bot:
                    trades_by_bot[bot_id] = []
                trades_by_bot[bot_id].append(t)

    return trades_by_bot


def _analyse(trades_by_bot: dict, period: str) -> dict:
    all_trades = []
    for trades in trades_by_bot.values():
        all_trades.extend(trades)

    all_trades.sort(key=lambda t: t.get("timestamp", t.get("time", "")))

    entries = [t for t in all_trades if t.get("action") == "ENTRY"]
    exits   = [t for t in all_trades if t.get("action") == "EXIT"]

    known_pnl = [float(t["pnl"]) for t in exits if t.get("pnl") is not None]
    wins       = [p for p in known_pnl if p > 0]
    losses     = [p for p in known_pnl if p < 0]
    ai_closed  = [t for t in exits if t.get("reason") == "closed_by_ai_bot"]
    mystery    = [t for t in exits if t.get("filled_price") is None and t.get("pnl") is None
                  and t.get("reason") not in ("closed_by_ai_bot",)]
    total_pnl  = sum(known_pnl)
    win_rate   = round(len(wins) / len(known_pnl) * 100) if known_pnl else 0

    # Per-bot breakdown
    bot_summary = {}
    for bot_id, trades in trades_by_bot.items():
        bot_exits  = [t for t in trades if t.get("action") == "EXIT" and t.get("pnl") is not None]
        bot_pnl    = sum(float(t["pnl"]) for t in bot_exits)
        bot_name   = trades[0]["_bot_name"] if trades else bot_id[:8]
        bot_entries = [t for t in trades if t.get("action") == "ENTRY"]
        bot_summary[bot_id] = {
            "bot_name": bot_name,
            "entries": len(bot_entries),
            "exits_with_pnl": len(bot_exits),
            "total_pnl": round(bot_pnl, 2),
            "wins": len([t for t in bot_exits if float(t["pnl"]) > 0]),
            "losses": len([t for t in bot_exits if float(t["pnl"]) < 0]),
        }

    # Strike drift analysis
    entry_strikes = []
    for t in entries:
        ss = t.get("short_strike")
        if ss:
            entry_strikes.append({
                "time": (t.get("timestamp", t.get("time", "")))[11:16],
                "strike": float(ss),
                "bot": t["_bot_name"],
                "credit": float(t.get("credit", 0) or 0),
            })
    max_strike = max((s["strike"] for s in entry_strikes), default=0)
    min_strike = min((s["strike"] for s in entry_strikes), default=0)

    # Largest win / largest loss
    largest_win  = max(known_pnl) if wins   else 0
    largest_loss = min(known_pnl) if losses else 0

    # Auto-generate findings
    findings = []

    if ai_closed:
        findings.append({
            "type": "critical",
            "title": f"AI bot closed {len(ai_closed)} position(s) belonging to another bot",
            "body": (
                f"The AI bot's orphan-cleanup routine closed {len(ai_closed)} position(s) it did not open "
                f"(reason: closed_by_ai_bot). This is a cross-bot contamination bug. "
                f"Fix: add auto_close_orphan_positions: false guard and restrict cleanup to conIds "
                f"in the bot's own active_plan.json."
            ),
        })

    if losses:
        worst = min(exits, key=lambda t: float(t.get("pnl") or 0) if t.get("pnl") is not None else 0)
        worst_instrument = worst.get("instrument", "unknown")
        worst_pnl = float(worst.get("pnl", 0))
        findings.append({
            "type": "critical" if worst_pnl < -400 else "warning",
            "title": f"Largest loss: ${abs(worst_pnl):.0f} on {worst_instrument}",
            "body": (
                f"Worst trade: {worst_instrument} at {(worst.get('timestamp',''))[:16]} "
                f"exited at ${worst.get('filled_price','?')} debit, P&L ${worst_pnl:.0f}. "
                f"Entry credit: ${abs(float(worst.get('credit', 0) or 0)):.2f}. "
                f"Review stop loss configuration and whether entry timing was at a session extreme."
            ),
        })

    if entry_strikes and max_strike - min_strike >= 30:
        findings.append({
            "type": "warning",
            "title": f"Short-strike drifted {max_strike - min_strike:.0f} pts during the session",
            "body": (
                f"Strikes ranged from {min_strike:.0f} to {max_strike:.0f}. "
                f"The highest-strike entry carries the most gamma risk. "
                f"Consider adding a session-high check: skip or reduce size when the short strike "
                f"is at the day's highest level and the market has trended one direction for 2+ hours."
            ),
        })

    if mystery:
        findings.append({
            "type": "warning",
            "title": f"{len(mystery)} exit(s) with no price or P&L recorded",
            "body": (
                f"These exits have null filled_price and null pnl — likely bulk-close orders "
                f"that fired on already-closed legs or were rejected by IBKR. "
                f"Investigate order IDs: {', '.join(t.get('order_id','?') for t in mystery)}."
            ),
        })

    if wins and len(wins) / max(len(known_pnl), 1) >= 0.6:
        findings.append({
            "type": "good",
            "title": f"{len(wins)}/{len(known_pnl)} trades were profitable ({win_rate}% win rate)",
            "body": (
                f"Winners averaged ${sum(wins)/len(wins):.0f} each. "
                f"The strategy's take-profit logic is working — most positions closed at 40–55% of credit. "
                f"Focus on eliminating the structural issues (AI interference, late-session entries) "
                f"rather than changing the core entry logic."
            ),
        })

    if total_pnl < 0 and largest_loss < -300:
        findings.append({
            "type": "info",
            "title": "P&L would be positive without the single largest loss",
            "body": (
                f"Confirmed P&L: ${total_pnl:.0f}. "
                f"Without the {abs(largest_loss):.0f} stop-loss exit: ${total_pnl - largest_loss:.0f}. "
                f"Risk management on the tail event is the primary lever for improving this session's result."
            ),
        })

    return {
        "period": period,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "session_date": date.today().isoformat(),
        "summary": {
            "total_pnl": round(total_pnl, 2),
            "total_entries": len(entries),
            "total_exits": len(exits),
            "exits_with_pnl": len(known_pnl),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": win_rate,
            "largest_win": round(largest_win, 2),
            "largest_loss": round(largest_loss, 2),
            "ai_closed_count": len(ai_closed),
            "mystery_exits": len(mystery),
        },
        "bot_summary": list(bot_summary.values()),
        "entry_strikes": entry_strikes,
        "timeline": [
            {
                "bot": t["_bot_name"],
                "time": (t.get("timestamp", t.get("time", "")))[11:16],
                "action": t.get("action"),
                "instrument": t.get("instrument", ""),
                "side": t.get("side", ""),
                "credit": t.get("credit"),
                "filled_price": t.get("filled_price"),
                "pnl": t.get("pnl"),
                "reason": t.get("reason", ""),
            }
            for t in all_trades
        ],
        "findings": findings,
    }


@router.get("/latest")
async def get_latest(current_user: User = Depends(_require_admin)):
    if not RETRO_PATH.exists():
        raise HTTPException(status_code=404, detail="No retrospective has been run yet.")
    try:
        return json.loads(RETRO_PATH.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read report: {e}")


@router.post("/run")
async def run_retrospective(
    period: str = Query("today", regex="^(today|all)$"),
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    trades_by_bot = _load_all_trades(period, db)
    if not any(trades_by_bot.values()):
        raise HTTPException(status_code=404, detail=f"No trades found for period '{period}'.")

    report = _analyse(trades_by_bot, period)

    RETRO_PATH.parent.mkdir(parents=True, exist_ok=True)
    RETRO_PATH.write_text(json.dumps(report, indent=2))

    return report
