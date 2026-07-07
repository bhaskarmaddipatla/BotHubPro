import json
from collections import defaultdict
from datetime import datetime, timedelta, date, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.bot import Bot
from app.models.execution import Execution, ExecutionStatus
from app.models.user import User
from app.api.deps import get_current_active_user

router = APIRouter()

DATA_ROOT = Path("/data")


# ── Trade log helpers ─────────────────────────────────────────────────────────

def _period_cutoff(period: str) -> datetime | None:
    now = datetime.now(timezone.utc)
    if period == "today":  return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":   return now - timedelta(days=7)
    if period == "month":  return now - timedelta(days=30)
    if period == "year":   return now - timedelta(days=365)
    return None  # "all"


def _load_trades(user_id: str, db: Session, period: str = "all") -> list[dict]:
    """Read every trade_log.json under /data/{user_id}/* and annotate with bot name."""
    bots = {str(b.id): b.name for b in db.query(Bot).filter(Bot.user_id == user_id).all()}
    cutoff = _period_cutoff(period)
    user_dir = DATA_ROOT / user_id
    if not user_dir.exists():
        return []

    trades = []
    for bot_dir in user_dir.iterdir():
        if not bot_dir.is_dir():
            continue
        tl = bot_dir / "trade_log.json"
        if not tl.exists():
            continue
        try:
            rows = json.loads(tl.read_text())
        except Exception:
            continue
        bot_id   = bot_dir.name
        bot_name = bots.get(bot_id, bot_id[:8])
        for t in rows:
            ts_str = t.get("timestamp", t.get("time", ""))
            if cutoff and ts_str:
                try:
                    ts = datetime.fromisoformat(ts_str)
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    if ts < cutoff:
                        continue
                except Exception:
                    pass
            trades.append({**t, "_bot_id": bot_id, "_bot_name": bot_name})

    trades.sort(key=lambda t: t.get("timestamp", t.get("time", "")))
    return trades


def _compute_stats(exits: list[dict]) -> dict:
    known_pnl = [float(t["pnl"]) for t in exits if t.get("pnl") is not None]
    wins   = [p for p in known_pnl if p > 0]
    losses = [p for p in known_pnl if p < 0]
    total  = sum(known_pnl)
    gross_win  = sum(wins)
    gross_loss = abs(sum(losses))
    return {
        "total_trades":    len(known_pnl),
        "wins":            len(wins),
        "losses":          len(losses),
        "win_rate":        round(len(wins) / len(known_pnl) * 100, 1) if known_pnl else 0,
        "total_pnl":       round(total, 2),
        "avg_winner":      round(gross_win  / len(wins),   2) if wins   else 0,
        "avg_loser":       round(gross_loss / len(losses),  2) if losses else 0,
        "profit_factor":   round(gross_win  / gross_loss,  2) if gross_loss else 0,
        "largest_win":     round(max(known_pnl), 2) if wins   else 0,
        "largest_loss":    round(min(known_pnl), 2) if losses else 0,
        "expectancy":      round(total / len(known_pnl), 2) if known_pnl else 0,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/performance")
async def get_performance(
    period: str = Query("all", regex="^(today|week|month|year|all)$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    trades  = _load_trades(str(current_user.id), db, period)
    entries = [t for t in trades if t.get("action") == "ENTRY"]
    exits   = [t for t in trades if t.get("action") == "EXIT"]

    overall = _compute_stats(exits)

    # ── Per-bot breakdown ──────────────────────────────────────────────────────
    by_bot: dict[str, list] = defaultdict(list)
    for t in exits:
        by_bot[t["_bot_name"]].append(t)

    bots_breakdown = []
    for bot_name, bot_exits in by_bot.items():
        s = _compute_stats(bot_exits)
        bots_breakdown.append({"bot": bot_name, **s})
    bots_breakdown.sort(key=lambda b: b["total_pnl"], reverse=True)

    # ── Daily P&L (last 60 calendar days in range) ─────────────────────────────
    daily: dict[str, float] = defaultdict(float)
    for t in exits:
        if t.get("pnl") is None:
            continue
        ts = t.get("timestamp", t.get("time", ""))
        if not ts:
            continue
        day = ts[:10]  # YYYY-MM-DD
        daily[day] += float(t["pnl"])

    # Fill gaps with zero for the range covered by data
    daily_series = []
    if daily:
        days_sorted = sorted(daily.keys())
        start = date.fromisoformat(days_sorted[0])
        end   = date.today()
        cur   = start
        while cur <= end:
            ds = cur.isoformat()
            daily_series.append({"date": ds, "label": cur.strftime("%b %d"), "pnl": round(daily.get(ds, 0), 2)})
            cur += timedelta(days=1)

    # ── Monthly P&L ────────────────────────────────────────────────────────────
    monthly: dict[str, float] = defaultdict(float)
    for t in exits:
        if t.get("pnl") is None:
            continue
        ts = t.get("timestamp", t.get("time", ""))
        if not ts:
            continue
        mo = ts[:7]  # YYYY-MM
        monthly[mo] += float(t["pnl"])

    monthly_series = [
        {"month": k, "label": datetime.strptime(k, "%Y-%m").strftime("%b '%y"), "pnl": round(v, 2)}
        for k, v in sorted(monthly.items())
    ]

    # ── Equity curve ──────────────────────────────────────────────────────────
    cumulative = 0.0
    equity: list[dict] = []
    for t in exits:
        if t.get("pnl") is None:
            continue
        cumulative += float(t["pnl"])
        ts = t.get("timestamp", t.get("time", ""))
        equity.append({
            "ts": ts[:16].replace("T", " "),
            "pnl": float(t["pnl"]),
            "cumulative": round(cumulative, 2),
            "bot": t["_bot_name"],
        })

    # ── Recent trades (last 20 exits) ─────────────────────────────────────────
    recent = []
    for t in reversed(exits[-20:]):
        ts = t.get("timestamp", t.get("time", ""))
        recent.append({
            "bot":        t["_bot_name"],
            "instrument": t.get("instrument", ""),
            "side":       t.get("side", ""),
            "credit":     t.get("credit"),
            "debit":      t.get("filled_price"),
            "pnl":        t.get("pnl"),
            "reason":     t.get("reason", ""),
            "time":       ts[11:16] if len(ts) > 10 else ts,
            "date":       ts[:10],
        })

    return {
        "period":         period,
        "overall":        overall,
        "bots":           bots_breakdown,
        "daily_series":   daily_series,
        "monthly_series": monthly_series,
        "equity_curve":   equity,
        "recent_trades":  recent,
    }


# ── Legacy endpoints (dashboard still calls these) ────────────────────────────

@router.get("/summary")
async def get_summary(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    trades  = _load_trades(str(current_user.id), db, "all")
    exits   = [t for t in trades if t.get("action") == "EXIT"]
    known   = [float(t["pnl"]) for t in exits if t.get("pnl") is not None]
    total_pnl = round(sum(known), 2) if known else 0.0

    total_ex   = db.query(Execution).filter(Execution.user_id == current_user.id).count()
    active_bots = db.query(Bot).filter(Bot.user_id == current_user.id).count()
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0)
    today_ex   = db.query(Execution).filter(
        Execution.user_id == current_user.id,
        Execution.created_at >= today_start
    ).count()

    wins = [p for p in known if p > 0]
    win_rate = round(len(wins) / len(known) * 100, 1) if known else 0

    return {
        "active_bots":        active_bots,
        "executions_today":   today_ex,
        "total_executions":   total_ex,
        "win_rate":           win_rate,
        "total_pnl":          total_pnl,
    }


@router.get("/equity-curve")
async def get_equity_curve(
    days: int = 30,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    trades = _load_trades(str(current_user.id), db, "month" if days <= 30 else "year")
    exits  = [t for t in trades if t.get("action") == "EXIT"]
    cumulative = 0.0
    curve = []
    for t in exits:
        if t.get("pnl") is None:
            continue
        cumulative += float(t["pnl"])
        ts = t.get("timestamp", t.get("time", ""))
        curve.append({"date": ts, "pnl": float(t["pnl"]), "cumulative": round(cumulative, 2)})
    return {"equity_curve": curve}
