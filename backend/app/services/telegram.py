import httpx
import os
import logging

logger = logging.getLogger(__name__)


def send_telegram(chat_id: str, message: str) -> bool:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token or not chat_id:
        return False
    try:
        r = httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
            timeout=10
        )
        return r.status_code == 200
    except Exception as e:
        logger.warning(f"Telegram send failed: {e}")
        return False


def format_trade_alert(bot_name: str, trade: dict, is_sim: bool) -> str:
    mode = "🟡 SIMULATED" if is_sim else "🟢 LIVE"
    lines = [
        f"<b>BotHub Pro — Trade Alert</b>  {mode}",
        f"🤖 <b>{bot_name}</b>",
        "",
    ]
    for label, key in [
        ("Action", "action"), ("Symbol", "symbol"),
        ("Strike", "strike"), ("Expiry", "expiry"),
        ("Credit", "credit"), ("Debit", "debit"),
        ("Contracts", "contracts"), ("P&L", "pnl"),
        ("Price", "price"), ("Note", "note"),
    ]:
        val = trade.get(key)
        if val is not None and val != "":
            lines.append(f"<b>{label}:</b> {val}")
    if trade.get("spx_price"):
        lines.append(f"<b>SPX:</b> {trade['spx_price']}")
    if trade.get("vix"):
        lines.append(f"<b>VIX:</b> {trade['vix']}")
    return "\n".join(lines)
