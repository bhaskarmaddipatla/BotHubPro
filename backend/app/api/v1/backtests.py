from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime, date, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.bot import Bot
from app.models.api_key import APIKey
from app.api.v1.broker_credentials import simple_decrypt
import asyncio
import json
import math
import os
import random
import time

import httpx

router = APIRouter()

SESSION_MINUTES = 390  # 09:30-16:00 ET
INTRADAY_BAR_MINUTES = 1  # bar size used for both real fetches and the synthetic bridge
BARS_PER_DAY = SESSION_MINUTES // INTRADAY_BAR_MINUTES

# ── Black-Scholes helpers ──────────────────────────────────────────────────────

def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2)))


def bs_price(S: float, K: float, T: float, r: float, sigma: float, opt: str = "call") -> float:
    if T <= 0 or sigma <= 0:
        intrinsic = max(S - K, 0) if opt == "call" else max(K - S, 0)
        return intrinsic
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    if opt == "call":
        return S * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)
    return K * math.exp(-r * T) * _norm_cdf(-d2) - S * _norm_cdf(-d1)


def bs_delta(S: float, K: float, T: float, r: float, sigma: float, opt: str = "call") -> float:
    if T <= 0 or sigma <= 0:
        return 1.0 if (opt == "call" and S > K) else 0.0
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    return _norm_cdf(d1) if opt == "call" else _norm_cdf(d1) - 1


def find_strike_for_delta(S: float, T: float, r: float, sigma: float, target_delta: float, opt: str = "put") -> float:
    lo, hi = S * 0.5, S * 1.5
    for _ in range(60):
        mid = (lo + hi) / 2
        d = abs(bs_delta(S, mid, T, r, sigma, opt))
        if d > target_delta:
            hi = mid
        else:
            lo = mid
    return round((lo + hi) / 2, 2)


# ── Credit Spread simulator ───────────────────────────────────────────────────

def simulate_credit_spread(
    price_rows: list,          # [{date, open, high, low, close, vix}, ...]
    contracts: int = 1,
    spread_width: float = 5,
    short_strike_delta: float = 0.20,
    take_profit_pct: float = 50,
    max_loss_per_trade: float = 500,
    max_trades_per_day: int = 1,
    initial_capital: float = 10_000,
    direction: str = "put",    # "put" credit spread (bullish)
) -> dict:
    r = 0.05
    T_days = 1  # 0DTE
    T = T_days / 252

    capital = initial_capital
    trades: list = []
    equity_curve = [{"date": price_rows[0]["date"], "value": round(capital, 2)}]
    monthly: Dict[str, dict] = {}

    for row in price_rows:
        S = row["open"]
        sigma = row["vix"] / 100 if row["vix"] else 0.18

        # Find short and long strikes
        short_K = find_strike_for_delta(S, T, r, sigma, short_strike_delta, direction)
        long_K = short_K - spread_width if direction == "put" else short_K + spread_width

        credit = (
            bs_price(S, short_K, T, r, sigma, direction) -
            bs_price(S, long_K, T, r, sigma, direction)
        ) * 100 * contracts  # per contract = 100 shares

        max_loss = (spread_width * 100 * contracts) - credit
        if max_loss <= 0 or credit <= 0:
            continue

        take_profit_trigger = credit * (take_profit_pct / 100)

        # Simulate intraday exit using high/low
        day_low = row["low"]
        day_high = row["high"]

        # For put spread: loss if SPX drops sharply (breaches short strike)
        if direction == "put":
            if day_low <= long_K:
                # Full max loss
                pnl = -max_loss
                exit_reason = "max_loss"
            elif day_low <= short_K:
                # Partial loss proportional to how far through the spread
                breach = short_K - day_low
                loss_ratio = min(breach / spread_width, 1.0)
                pnl = credit - (max_loss + credit) * loss_ratio
                exit_reason = "partial_loss"
            else:
                # Take profit or expire worthless
                pnl = credit
                exit_reason = "expire_worthless"
        else:
            # Call spread: loss if SPX rips higher
            if day_high >= long_K:
                pnl = -max_loss
                exit_reason = "max_loss"
            elif day_high >= short_K:
                breach = day_high - short_K
                loss_ratio = min(breach / spread_width, 1.0)
                pnl = credit - (max_loss + credit) * loss_ratio
                exit_reason = "partial_loss"
            else:
                pnl = credit
                exit_reason = "expire_worthless"

        if abs(pnl) > max_loss_per_trade:
            pnl = -max_loss_per_trade if pnl < 0 else pnl

        capital += pnl
        d = row["date"]
        month_key = d[:7]
        if month_key not in monthly:
            monthly[month_key] = {"start": capital - pnl, "end": capital, "trades": 0, "wins": 0}
        monthly[month_key]["end"] = capital
        monthly[month_key]["trades"] += 1
        if pnl > 0:
            monthly[month_key]["wins"] += 1

        trades.append({
            "date": d,
            "spx_open": round(S, 2),
            "spx_close": round(row["close"], 2),
            "vix": row["vix"],
            "short_strike": round(short_K, 2),
            "long_strike": round(long_K, 2),
            "credit": round(credit, 2),
            "pnl": round(pnl, 2),
            "cumulative": round(capital - initial_capital, 2),
            "exit_reason": exit_reason,
            "contracts": contracts,
        })
        equity_curve.append({"date": d, "value": round(capital, 2)})

    return _summarize(trades, equity_curve, monthly, capital, initial_capital)


def _summarize(trades: list, equity_curve: list, monthly: Dict[str, dict],
               capital: float, initial_capital: float) -> dict:
    winners = [t for t in trades if t["pnl"] > 0]
    losers = [t for t in trades if t["pnl"] <= 0]
    total_wins = sum(t["pnl"] for t in winners)
    total_losses = abs(sum(t["pnl"] for t in losers))

    peak = initial_capital
    max_dd = 0.0
    running = initial_capital
    for t in trades:
        running += t["pnl"]
        if running > peak:
            peak = running
        dd = (peak - running) / peak * 100
        if dd > max_dd:
            max_dd = dd

    # Sharpe from daily PnL
    daily_pnls = [t["pnl"] for t in trades]
    if len(daily_pnls) > 1:
        mean_pnl = sum(daily_pnls) / len(daily_pnls)
        variance = sum((p - mean_pnl) ** 2 for p in daily_pnls) / len(daily_pnls)
        std_pnl = math.sqrt(variance) if variance > 0 else 1
        sharpe = (mean_pnl / std_pnl) * math.sqrt(252)
    else:
        sharpe = 0.0

    monthly_returns = [
        {
            "month": k,
            "return_pct": round((v["end"] - v["start"]) / v["start"] * 100, 2),
            "pnl": round(v["end"] - v["start"], 2),
            "trades": v["trades"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
        }
        for k, v in sorted(monthly.items())
    ]

    return {
        "equity_curve": equity_curve,
        "trades": trades,
        "monthly_returns": monthly_returns,
        "total_trades": len(trades),
        "win_rate": round(len(winners) / len(trades) * 100, 2) if trades else 0,
        "profit_factor": round(total_wins / total_losses, 2) if total_losses > 0 else 0,
        "max_drawdown": round(max_dd, 2),
        "sharpe_ratio": round(sharpe, 2),
        "avg_winner": round(total_wins / len(winners), 2) if winners else 0,
        "avg_loser": round(total_losses / len(losers), 2) if losers else 0,
        "final_capital": round(capital, 2),
        "total_return": round((capital - initial_capital) / initial_capital * 100, 2),
    }


# ── Intraday data (1-minute SPX bars) ─────────────────────────────────────────

def _minute_of_session(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return (int(h) - 9) * 60 + int(m) - 30


def _valid_entry_time(hhmm: str) -> bool:
    return isinstance(hhmm, str) and len(hhmm) == 5 and "09:30" <= hhmm < "16:00"


def _providers() -> list:
    out = []
    if os.getenv("MASSIVE_API_KEY"):
        out.append(("massive", "https://api.massive.com", os.getenv("MASSIVE_API_KEY")))
    if os.getenv("POLYGON_API_KEY"):
        out.append(("polygon", "https://api.polygon.io", os.getenv("POLYGON_API_KEY")))
    return out


def _fetch_agg_rows(client: httpx.Client, base: str, key: str, ticker: str,
                    mult: int, span: str, start_date: str, end_date: str) -> list:
    """Paginated Massive/Polygon-style aggregates fetch. Retries on 429."""
    results: list = []
    url = f"{base}/v2/aggs/ticker/{ticker}/range/{mult}/{span}/{start_date}/{end_date}"
    params: Optional[dict] = {"limit": 50000, "sort": "asc", "apiKey": key}
    for _ in range(10):  # pagination guard
        resp = None
        for _attempt in range(5):
            resp = client.get(url, params=params)
            if resp.status_code != 429:
                break
            # Rate limited — wait for the window to reset and try again
            wait = 15
            try:
                wait = max(int(resp.headers.get("Retry-After", "0")), 15)
            except ValueError:
                pass
            time.sleep(min(wait, 60))
        if resp is None or resp.status_code != 200:
            raise RuntimeError(f"HTTP {resp.status_code if resp else '???'} for {ticker}")
        payload = resp.json()
        results.extend(payload.get("results") or [])
        next_url = payload.get("next_url")
        if not next_url:
            break
        url, params = next_url, {"apiKey": key}
    return results


# Successful fetches are cached on disk so repeated backtests over the same
# range don't re-hit provider rate limits. Bounded to completed date ranges
# only (a range ending today would cache a partial day).
CACHE_DIR = os.getenv("BACKTEST_CACHE_DIR", "/tmp/backtest_cache")


def _cached_agg_rows(client: httpx.Client, base: str, key: str, name: str, ticker: str,
                     mult: int, span: str, start_date: str, end_date: str) -> list:
    cacheable = end_date < date.today().isoformat()
    path = os.path.join(
        CACHE_DIR, f"{name}_{ticker.replace(':', '_')}_{mult}{span}_{start_date}_{end_date}.json")
    if cacheable and os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    rows = _fetch_agg_rows(client, base, key, ticker, mult, span, start_date, end_date)
    if cacheable and rows:
        try:
            os.makedirs(CACHE_DIR, exist_ok=True)
            with open(path, "w") as f:
                json.dump(rows, f)
        except Exception:
            pass
    return rows


def _fetch_daily_index(start_date: str, end_date: str) -> tuple:
    """Fetch daily SPX + VIX rows from Massive or Polygon.

    Returns (price_rows, source_name, errors). Empty rows + None source means
    no provider succeeded; errors lists why each one failed.
    """
    et = ZoneInfo("America/New_York")
    errors: list = []
    for name, base, key in _providers():
        try:
            with httpx.Client(timeout=30) as client:
                spx = _cached_agg_rows(client, base, key, name, "I:SPX", 1, "day", start_date, end_date)
                if not spx:
                    raise RuntimeError("no SPX daily results")
                try:
                    vix = _cached_agg_rows(client, base, key, name, "I:VIX", 1, "day", start_date, end_date)
                except Exception as e:
                    errors.append(f"{name} VIX: {e}")
                    vix = []
            vix_by_date = {
                datetime.fromtimestamp(b["t"] / 1000, tz=et).strftime("%Y-%m-%d"): float(b["c"])
                for b in vix
            }
            rows, last_vix = [], 18.0
            for b in spx:
                d = datetime.fromtimestamp(b["t"] / 1000, tz=et).strftime("%Y-%m-%d")
                last_vix = vix_by_date.get(d, last_vix)
                rows.append({
                    "date": d,
                    "open": float(b["o"]), "high": float(b["h"]),
                    "low": float(b["l"]), "close": float(b["c"]),
                    "vix": last_vix,
                })
            return rows, name, errors
        except Exception as e:
            errors.append(f"{name}: {e}")
    return [], None, errors


def _group_session_bars(results: list) -> Dict[str, list]:
    et = ZoneInfo("America/New_York")
    bars_by_date: Dict[str, list] = {}
    for b in results:
        dt = datetime.fromtimestamp(b["t"] / 1000, tz=et)
        if dt.weekday() >= 5:
            continue
        hhmm = dt.strftime("%H:%M")
        if not ("09:30" <= hhmm < "16:00"):
            continue
        bars_by_date.setdefault(dt.strftime("%Y-%m-%d"), []).append({
            "time": hhmm,
            "open": float(b["o"]), "high": float(b["h"]),
            "low": float(b["l"]), "close": float(b["c"]),
        })
    return bars_by_date


# Trading-day cap for the IBKR historical path. Two independent limits force
# this: (1) IBKR's historical-data pacing rules are built for occasional,
# recent-history pulls off a live account, not bulk multi-year backtesting --
# hammering it risks a pacing violation against the same connection your live
# bots use; (2) 1-min bars can only be requested one trading day per call, and
# the frontend's request has a hard timeout, so each additional day directly
# eats into that budget. Wider ranges silently skip IBKR and fall through to
# the next provider instead of risking a slow, half-finished pull.
IBKR_BACKTEST_MAX_TRADING_DAYS = 15
IBKR_BACKTEST_CLIENT_IDS = [905, 917, 931, 947]  # kept out of the 1-899 range live bots hash into


async def _fetch_ibkr_intraday_bars(
    user_id, db: Session, start_date: str, end_date: str,
    daily_range_by_date: Optional[Dict[str, tuple]] = None,
) -> tuple:
    """Fetch real 1-min SPX bars from the user's own connected IBKR gateway.

    Tried before Massive/Polygon: if the user already trades live through
    IBKR (same credentials as bot_runner.py's _get_ibkr_creds), that
    connection typically already includes real index data with no separate
    market-data subscription needed. Returns ({date: [bars]}, "ibkr", errors)
    on success, or ({}, None, errors) if IBKR isn't configured, unreachable,
    or the range exceeds IBKR_BACKTEST_MAX_TRADING_DAYS.

    whatToShow='MIDPOINT': SPX is a calculated index, not a directly-traded
    security, so 'TRADES' bars can come back artificially narrow/sparse
    depending on the account's feed -- MIDPOINT tracks the continuously
    recalculated index value instead, which is the standard choice for cash
    indices. This has NOT been verified against a live gateway from this
    environment though, so daily_range_by_date (each date's real
    high/low from the separately-fetched daily bar) is used as a live sanity
    check: if a day's IBKR-derived intraday range comes back suspiciously
    narrow next to the real daily range, that's flagged directly in the
    returned errors instead of silently producing an under-volatile result.
    """
    errors: list = []
    key = db.query(APIKey).filter(
        APIKey.user_id == user_id, APIKey.provider == "ibkr", APIKey.is_active == True,
    ).first()
    if not key:
        return {}, None, errors  # not configured -- quietly let the next provider try

    try:
        creds = json.loads(simple_decrypt(key.encrypted_key))
    except Exception as e:
        errors.append(f"ibkr: could not read saved credentials: {e}")
        return {}, None, errors

    et = ZoneInfo("America/New_York")
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    trading_days = []
    d = start
    while d <= end:
        if d.weekday() < 5:
            trading_days.append(d)
        d += timedelta(days=1)

    if not trading_days:
        return {}, None, errors
    if len(trading_days) > IBKR_BACKTEST_MAX_TRADING_DAYS:
        errors.append(
            f"ibkr: range spans {len(trading_days)} trading days, over the "
            f"{IBKR_BACKTEST_MAX_TRADING_DAYS}-day pacing-safe cap for this path -- skipped"
        )
        return {}, None, errors

    try:
        from ib_insync import IB, Index
    except ImportError as e:
        errors.append(f"ibkr: ib_insync not installed: {e}")
        return {}, None, errors

    host = creds.get("host", "127.0.0.1")
    port = int(creds.get("port", 7497))

    ib = IB()
    connected = False
    for client_id in IBKR_BACKTEST_CLIENT_IDS:
        try:
            # Pass timeout natively rather than wrapping in asyncio.wait_for --
            # ib_insync's own timeout handling cleans up its internal
            # connection/request state on expiry; an external wait_for
            # cancellation can leave that state half-finished instead.
            await ib.connectAsync(host, port, clientId=client_id, timeout=10)
            connected = True
            break
        except Exception as e:
            errors.append(f"ibkr connect (clientId={client_id}): {e}")
    if not connected:
        return {}, None, errors

    bars_by_date: Dict[str, list] = {}
    try:
        contract = Index("SPX", "CBOE", "USD")
        for i, day in enumerate(trading_days):
            end_dt = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=et)
            try:
                raw_bars = await ib.reqHistoricalDataAsync(
                    contract,
                    endDateTime=end_dt,
                    durationStr="1 D",
                    barSizeSetting="1 min",
                    whatToShow="MIDPOINT",
                    useRTH=True,
                    formatDate=2,
                    timeout=15,
                )
            except Exception as e:
                errors.append(f"ibkr {day.isoformat()}: {e}")
                # A failure on the first day is almost always a permission or
                # contract-spec problem that will repeat for every other day
                # -- bail out immediately instead of burning the request
                # budget (and the frontend's timeout) retrying it N times.
                if i == 0:
                    break
                continue

            day_bars = []
            for b in raw_bars:
                bt = b.date if hasattr(b.date, "hour") else datetime.combine(b.date, datetime.min.time(), tzinfo=et)
                if bt.tzinfo is None:
                    bt = bt.replace(tzinfo=et)
                else:
                    bt = bt.astimezone(et)
                if bt.weekday() >= 5:
                    continue
                hhmm = bt.strftime("%H:%M")
                if not ("09:30" <= hhmm < "16:00"):
                    continue
                day_bars.append({
                    "time": hhmm,
                    "open": float(b.open), "high": float(b.high),
                    "low": float(b.low), "close": float(b.close),
                })
            if day_bars:
                d_str = day.strftime("%Y-%m-%d")
                bars_by_date[d_str] = sorted(day_bars, key=lambda x: x["time"])

                # Sanity check against the (separately, reliably fetched)
                # real daily high/low: if IBKR's intraday bars for this day
                # span far less than the day actually moved, that's a live
                # signal the feed isn't capturing real intrabar swings --
                # surface it instead of silently trusting an under-volatile
                # result.
                real_range = (daily_range_by_date or {}).get(d_str)
                if real_range:
                    day_high, day_low = real_range
                    real_span = day_high - day_low
                    ibkr_span = max(b["high"] for b in day_bars) - min(b["low"] for b in day_bars)
                    if real_span > 0 and ibkr_span < real_span * 0.5:
                        errors.append(
                            f"ibkr {d_str}: intraday range {ibkr_span:.1f}pts looks narrow vs "
                            f"real daily range {real_span:.1f}pts -- data may understate intrabar moves"
                        )

            if i < len(trading_days) - 1:
                await asyncio.sleep(1.1)  # stay well under IBKR's pacing limits
    finally:
        ib.disconnect()

    if bars_by_date:
        return bars_by_date, "ibkr", errors
    return {}, None, errors


def _fetch_intraday_bars(start_date: str, end_date: str, spx_open_by_date: Optional[dict] = None) -> tuple:
    """Fetch 1-min index bars from Massive or Polygon.

    Tries I:SPX first; if the plan doesn't cover indices (HTTP 403), falls
    back to SPY 1-min bars rescaled to SPX levels (anchored to each day's
    SPX open). Returns ({date: [bars]}, source_name, errors).

    1-minute (not 5-minute) so intraday exits — stop-loss in particular —
    are checked against the finest real granularity a provider will give us,
    since a 5-min bar's own high/low can still smear over when a stop was
    actually breached relative to the entry/decay clock.
    """
    errors: list = []
    for name, base, key in _providers():
        # 1) Real SPX index bars
        try:
            with httpx.Client(timeout=30) as client:
                results = _cached_agg_rows(client, base, key, name, "I:SPX", INTRADAY_BAR_MINUTES, "minute", start_date, end_date)
            bars_by_date = _group_session_bars(results)
            if bars_by_date:
                return bars_by_date, name, errors
            raise RuntimeError("no intraday results")
        except Exception as e:
            hint = " (plan may not include indices)" if "403" in str(e) else ""
            errors.append(f"{name} {INTRADAY_BAR_MINUTES}m I:SPX: {e}{hint}")

        # 2) SPY bars rescaled to SPX (SPY tracks SPX at ~1/10 scale; anchor
        #    each day to the real SPX open so strikes land at true levels)
        if spx_open_by_date:
            try:
                with httpx.Client(timeout=30) as client:
                    results = _cached_agg_rows(client, base, key, name, "SPY", INTRADAY_BAR_MINUTES, "minute", start_date, end_date)
                spy_bars = _group_session_bars(results)
                bars_by_date = {}
                for d, bars in spy_bars.items():
                    spx_open = spx_open_by_date.get(d)
                    if not spx_open or not bars:
                        continue
                    scale = spx_open / bars[0]["open"]
                    bars_by_date[d] = [
                        {
                            "time": b["time"],
                            "open": round(b["open"] * scale, 2),
                            "high": round(b["high"] * scale, 2),
                            "low": round(b["low"] * scale, 2),
                            "close": round(b["close"] * scale, 2),
                        }
                        for b in bars
                    ]
                if bars_by_date:
                    return bars_by_date, f"{name} (SPY→SPX scaled)", errors
                raise RuntimeError("no SPY intraday results")
            except Exception as e:
                errors.append(f"{name} {INTRADAY_BAR_MINUTES}m SPY: {e}")
    return {}, None, errors


def _bridge_intraday_from_daily(price_rows: list) -> dict:
    """Synthesize 1-min bars from daily OHLC via a Brownian bridge.

    The path starts at the day's open, ends at its close, and its deviations
    are rescaled so the extremes touch the day's actual high and low. Seeded
    by date so results are repeatable.
    """
    bars_by_date: Dict[str, list] = {}
    for row in price_rows:
        o, h, l, c = row["open"], row["high"], row["low"], row["close"]
        rng = random.Random(int(row["date"].replace("-", "")))
        n = BARS_PER_DAY
        drifts, devs = [], []
        for i in range(n + 1):
            frac = i / n
            drifts.append(o + (c - o) * frac)
            # bridge-shaped noise: pinned to 0 at both ends
            devs.append(rng.gauss(0, 1) * math.sin(math.pi * frac))
        max_dev = max(devs) or 1e-9
        min_dev = min(devs) or -1e-9
        hi_room = max(h - max(p for p in drifts), 0.0)
        lo_room = max(min(p for p in drifts) - l, 0.0)
        pts = []
        for drift, dev in zip(drifts, devs):
            scale = (hi_room / max_dev) if dev > 0 else (lo_room / -min_dev)
            pts.append(drift + dev * scale)
        bars = []
        for i in range(n):
            t = 9 * 60 + 30 + i * 5
            bars.append({
                "time": f"{t // 60:02d}:{t % 60:02d}",
                "open": round(pts[i], 2),
                "high": round(max(pts[i], pts[i + 1]), 2),
                "low": round(min(pts[i], pts[i + 1]), 2),
                "close": round(pts[i + 1], 2),
            })
        bars_by_date[row["date"]] = bars
    return bars_by_date


# ── Iron Fly simulators ───────────────────────────────────────────────────────

def _fly_value(S: float, center_K: float, wing: float, T: float, r: float, sigma: float) -> float:
    """Current cost to close a short iron fly (per share)."""
    return (
        bs_price(S, center_K, T, r, sigma, "call") + bs_price(S, center_K, T, r, sigma, "put")
        - bs_price(S, center_K + wing, T, r, sigma, "call")
        - bs_price(S, center_K - wing, T, r, sigma, "put")
    )


def _entry_time_for_vix(vix: float, vix_entry_rules: Optional[List[dict]], default_entry_time: str) -> str:
    """Pick the entry time for a day's VIX print.

    vix_entry_rules is a list of {"vix_below": float, "entry_time": "HH:MM"},
    sorted ascending by vix_below. The first rule whose threshold the day's
    VIX falls under wins; a VIX at or above every threshold falls back to
    default_entry_time (the "and above" case).
    """
    if not vix_entry_rules:
        return default_entry_time
    for rule in vix_entry_rules:
        if vix < rule["vix_below"]:
            return rule["entry_time"]
    return default_entry_time


def simulate_iron_fly_intraday(
    price_rows: list,
    intraday_by_date: dict,
    contracts: int = 1,
    wing_width: float = 50,
    profit_target_pct: float = 25,
    stop_loss_pct: float = 150,
    entry_time: str = "10:45",
    max_hold_minutes: int = 60,
    initial_capital: float = 10_000,
    vix_entry_rules: Optional[List[dict]] = None,
) -> dict:
    """Intraday ATM iron fly: enter at entry_time, walk 1-min bars repricing
    the fly with decaying time; exit on profit target, stop, or max hold.

    entry_time is fixed unless vix_entry_rules is given, in which case each
    day's entry time is chosen from the rule matching that day's VIX print
    (falling back to entry_time when VIX is at/above every rule threshold).
    """
    r = 0.05
    year_minutes = 252 * SESSION_MINUTES

    capital = initial_capital
    trades: list = []
    equity_curve = [{"date": price_rows[0]["date"], "value": round(capital, 2)}]
    monthly: Dict[str, dict] = {}

    for row in price_rows:
        bars = intraday_by_date.get(row["date"])
        if not bars:
            continue
        sigma = row["vix"] / 100 if row["vix"] else 0.18
        day_entry_time = _entry_time_for_vix(row["vix"] or 0.0, vix_entry_rules, entry_time)
        entry_min = _minute_of_session(day_entry_time)

        entry_idx = next((i for i, b in enumerate(bars) if _minute_of_session(b["time"]) >= entry_min), None)
        if entry_idx is None:
            continue
        entry_bar = bars[entry_idx]
        S0 = entry_bar["open"]
        center_K = round(S0 / 5) * 5

        T_entry = (SESSION_MINUTES - _minute_of_session(entry_bar["time"])) / year_minutes
        credit = _fly_value(S0, center_K, wing_width, T_entry, r, sigma) * 100 * contracts
        max_loss = (wing_width * 100 * contracts) - credit
        if credit <= 0 or max_loss <= 0:
            continue

        stop_loss_dollars = min(credit * stop_loss_pct / 100, max_loss)
        target_dollars = credit * profit_target_pct / 100
        deadline_min = _minute_of_session(entry_bar["time"]) + max_hold_minutes

        pnl = None
        exit_reason = "max_hold"
        exit_time = bars[-1]["time"]
        for b in bars[entry_idx + 1:]:
            now_min = _minute_of_session(b["time"])
            T_now = max((SESSION_MINUTES - now_min) / year_minutes, 0.0)
            # Worst price within the bar (farther extreme from the center)
            S_worst = b["high"] if (b["high"] - center_K) > (center_K - b["low"]) else b["low"]
            pnl_worst = credit - _fly_value(S_worst, center_K, wing_width, T_now, r, sigma) * 100 * contracts
            pnl_close = credit - _fly_value(b["close"], center_K, wing_width, T_now, r, sigma) * 100 * contracts

            if pnl_worst <= -stop_loss_dollars:
                pnl = -stop_loss_dollars
                exit_reason = "stop_loss"
                exit_time = b["time"]
                break
            if pnl_close >= target_dollars:
                pnl = target_dollars
                exit_reason = "take_profit"
                exit_time = b["time"]
                break
            if now_min >= deadline_min:
                pnl = max(min(pnl_close, credit), -max_loss)
                exit_reason = "max_hold"
                exit_time = b["time"]
                break
        if pnl is None:
            # Ran out of bars before the deadline — exit at the last bar's close
            last = bars[-1]
            T_last = max((SESSION_MINUTES - _minute_of_session(last["time"])) / year_minutes, 0.0)
            pnl = max(min(credit - _fly_value(last["close"], center_K, wing_width, T_last, r, sigma) * 100 * contracts, credit), -max_loss)
            exit_reason = "eod"
            exit_time = last["time"]

        capital += pnl
        d = row["date"]
        month_key = d[:7]
        if month_key not in monthly:
            monthly[month_key] = {"start": capital - pnl, "end": capital, "trades": 0, "wins": 0}
        monthly[month_key]["end"] = capital
        monthly[month_key]["trades"] += 1
        if pnl > 0:
            monthly[month_key]["wins"] += 1

        trades.append({
            "date": d,
            "entry_time": day_entry_time,
            "spx_open": round(S0, 2),
            "spx_close": round(row["close"], 2),
            "vix": row["vix"],
            "short_strike": round(center_K, 2),
            "long_strike": f"{round(center_K - wing_width)}/{round(center_K + wing_width)}",
            "credit": round(credit, 2),
            "pnl": round(pnl, 2),
            "cumulative": round(capital - initial_capital, 2),
            "exit_reason": f"{exit_reason} @ {exit_time}",
            "contracts": contracts,
        })
        equity_curve.append({"date": d, "value": round(capital, 2)})

    return _summarize(trades, equity_curve, monthly, capital, initial_capital)

def simulate_iron_fly(
    price_rows: list,
    contracts: int = 1,
    wing_width: float = 50,
    profit_target_pct: float = 25,
    stop_loss_pct: float = 150,
    initial_capital: float = 10_000,
) -> dict:
    """ATM iron fly: sell the ATM straddle, buy wings wing_width points away.

    Exit model per day (intrinsic-value approximation, same style as the
    credit-spread simulator): stop out if the intraday excursion from the
    center strike implies a loss >= stop_loss_pct of credit; otherwise take
    profit_target_pct of credit if the settle would have reached it; otherwise
    settle at close.
    """
    r = 0.05
    T = 1 / 252  # 0DTE

    capital = initial_capital
    trades: list = []
    equity_curve = [{"date": price_rows[0]["date"], "value": round(capital, 2)}]
    monthly: Dict[str, dict] = {}

    for row in price_rows:
        S = row["open"]
        sigma = row["vix"] / 100 if row["vix"] else 0.18
        center_K = round(S / 5) * 5  # SPX strikes in 5-pt increments

        credit = (
            (bs_price(S, center_K, T, r, sigma, "call") - bs_price(S, center_K + wing_width, T, r, sigma, "call"))
            + (bs_price(S, center_K, T, r, sigma, "put") - bs_price(S, center_K - wing_width, T, r, sigma, "put"))
        ) * 100 * contracts

        max_loss = (wing_width * 100 * contracts) - credit
        if credit <= 0 or max_loss <= 0:
            continue

        stop_loss_dollars = min(credit * stop_loss_pct / 100, max_loss)
        target_dollars = credit * profit_target_pct / 100

        # Points from center where intrinsic loss reaches the stop
        stop_move = (credit + stop_loss_dollars) / (100 * contracts)
        max_excursion = max(row["high"] - center_K, center_K - row["low"])

        settle_move = min(abs(row["close"] - center_K), wing_width)
        pnl_at_expiry = credit - settle_move * 100 * contracts

        if max_excursion >= stop_move:
            pnl = -stop_loss_dollars
            exit_reason = "stop_loss"
        elif pnl_at_expiry >= target_dollars:
            pnl = target_dollars
            exit_reason = "take_profit"
        else:
            pnl = max(pnl_at_expiry, -max_loss)
            exit_reason = "expired"

        capital += pnl
        d = row["date"]
        month_key = d[:7]
        if month_key not in monthly:
            monthly[month_key] = {"start": capital - pnl, "end": capital, "trades": 0, "wins": 0}
        monthly[month_key]["end"] = capital
        monthly[month_key]["trades"] += 1
        if pnl > 0:
            monthly[month_key]["wins"] += 1

        trades.append({
            "date": d,
            "spx_open": round(S, 2),
            "spx_close": round(row["close"], 2),
            "vix": row["vix"],
            "short_strike": round(center_K, 2),
            "long_strike": f"{round(center_K - wing_width)}/{round(center_K + wing_width)}",
            "credit": round(credit, 2),
            "pnl": round(pnl, 2),
            "cumulative": round(capital - initial_capital, 2),
            "exit_reason": exit_reason,
            "contracts": contracts,
        })
        equity_curve.append({"date": d, "value": round(capital, 2)})

    return _summarize(trades, equity_curve, monthly, capital, initial_capital)


# ── Synthetic SPX data generator (used when Yahoo Finance is unreachable) ─────

def _generate_synthetic_spx(start_date: str, end_date: str) -> tuple:
    """
    Generates statistically realistic SPX + VIX daily OHLCV rows using a
    geometric Brownian motion model calibrated to historical SPX parameters.
    Returns (price_rows, is_synthetic=True).
    """
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()

    # SPX historical parameters (annualised)
    mu = 0.10       # ~10% annual drift
    sigma = 0.16    # ~16% annual vol
    dt = 1 / 252

    # Seed from date so results are repeatable for same date range
    rng = random.Random(int(start.strftime("%Y%m%d")))

    # Starting price: roughly calibrate to year
    year = start.year
    base_prices = {2020: 3230, 2021: 3756, 2022: 4796, 2023: 3839, 2024: 4770, 2025: 5900}
    S = float(base_prices.get(year, 4500))

    # VIX parameters
    vix_mean = 18.0
    vix_vol = 5.0

    price_rows = []
    current = start
    vix = vix_mean

    while current <= end:
        # Skip weekends
        if current.weekday() >= 5:
            current += timedelta(days=1)
            continue

        # GBM step
        z = rng.gauss(0, 1)
        S = S * math.exp((mu - 0.5 * sigma ** 2) * dt + sigma * math.sqrt(dt) * z)

        # Daily range: ~68% of annual vol scaled to 1 day
        daily_range_pct = abs(rng.gauss(0, sigma * math.sqrt(dt)))
        open_price = S * (1 + rng.gauss(0, sigma * math.sqrt(dt) * 0.3))
        high_price = open_price * (1 + daily_range_pct * rng.uniform(0.3, 1.0))
        low_price = open_price * (1 - daily_range_pct * rng.uniform(0.3, 1.0))
        close_price = S

        # Mean-reverting VIX
        vix += rng.gauss(0, vix_vol * math.sqrt(dt)) + (vix_mean - vix) * 0.05
        vix = max(10.0, min(80.0, vix))

        price_rows.append({
            "date": current.strftime("%Y-%m-%d"),
            "open": round(open_price, 2),
            "high": round(max(open_price, high_price, close_price), 2),
            "low": round(min(open_price, low_price, close_price), 2),
            "close": round(close_price, 2),
            "vix": round(vix, 2),
        })
        current += timedelta(days=1)

    return price_rows, True


# ── Request model ─────────────────────────────────────────────────────────────

class BacktestRequest(BaseModel):
    bot_id: Optional[str] = None
    strategy: str = "credit_spread"
    start_date: str = "2023-01-01"
    end_date: str = "2023-12-31"
    initial_capital: float = 10000
    trade_params: Optional[Dict[str, Any]] = None


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_backtest(
    request: BacktestRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    try:
        import yfinance as yf
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=500, detail="yfinance not installed. Run: pip install yfinance")

    # Merge bot config + user trade_params
    trade_params: dict = {}
    if request.bot_id:
        try:
            bot_uuid = UUID(request.bot_id)
            bot = db.query(Bot).filter(Bot.id == bot_uuid).first()
            if bot and isinstance(bot.configuration, dict):
                trade_params.update(bot.configuration)
        except Exception:
            pass
    if request.trade_params:
        trade_params.update(request.trade_params)

    contracts = int(trade_params.get("contracts", 1))
    spread_width = float(trade_params.get("spread_width", 5))
    short_strike_delta = float(trade_params.get("short_strike_delta", 0.20))
    take_profit_pct = float(trade_params.get("take_profit_pct", 50))
    max_loss_per_trade = float(trade_params.get("max_loss_per_trade", 500))

    data_errors: list = []

    # 1) Massive/Polygon daily index aggregates (primary)
    price_rows, daily_source, errs = _fetch_daily_index(request.start_date, request.end_date)
    data_errors.extend(errs)

    # 2) Yahoo Finance fallback
    if not price_rows:
        try:
            spx = yf.download("^GSPC", start=request.start_date, end=request.end_date, progress=False, auto_adjust=True)
            vix = yf.download("^VIX", start=request.start_date, end=request.end_date, progress=False, auto_adjust=True)

            if not spx.empty:
                # Flatten MultiIndex columns if present
                if isinstance(spx.columns, pd.MultiIndex):
                    spx.columns = [c[0] for c in spx.columns]
                if isinstance(vix.columns, pd.MultiIndex):
                    vix.columns = [c[0] for c in vix.columns]

                vix_close = vix["Close"] if "Close" in vix.columns else None

                for idx, row in spx.iterrows():
                    d = idx.strftime("%Y-%m-%d")
                    vix_val = float(vix_close.get(idx, 18.0)) if vix_close is not None else 18.0
                    price_rows.append({
                        "date": d,
                        "open": float(row["Open"]),
                        "high": float(row["High"]),
                        "low": float(row["Low"]),
                        "close": float(row["Close"]),
                        "vix": vix_val,
                    })
            if price_rows:
                daily_source = "yahoo"
            else:
                data_errors.append("yahoo: empty response")
        except Exception as e:
            data_errors.append(f"yahoo: {type(e).__name__}: {e}")

    # 3) Synthetic GBM last resort — results are illustrative only
    is_synthetic = False
    if not price_rows:
        price_rows, is_synthetic = _generate_synthetic_spx(request.start_date, request.end_date)
        daily_source = "synthetic"

    if not price_rows:
        raise HTTPException(status_code=400, detail="No trading days found in date range")

    strategy = request.strategy.lower().replace(" ", "_")
    intraday_source = None
    if "iron_fly" in strategy:
        wing_width = float(trade_params.get("wing_width", 50))
        profit_target_pct = float(trade_params.get("profit_target_pct", 25))
        stop_loss_pct = float(trade_params.get("stop_loss_pct", 150))
        entry_time = str(trade_params.get("entry_time", "10:45"))
        max_hold_minutes = int(trade_params.get("max_hold_minutes", 60))
        if not _valid_entry_time(entry_time):
            raise HTTPException(status_code=400, detail="entry_time must be HH:MM between 09:30 and 15:55 ET")

        # Optional VIX-regime entry timing: a list of {vix_below, entry_time}
        # rules letting the backtest pick a different entry time depending on
        # the day's VIX print (e.g. enter earlier when VIX is low and calmer
        # entries can afford tighter timing, later when VIX is elevated).
        # entry_time above still applies as the "VIX at/above every
        # threshold" fallback.
        raw_vix_rules = trade_params.get("vix_entry_rules") or []
        vix_entry_rules: list = []
        if raw_vix_rules:
            if not isinstance(raw_vix_rules, list):
                raise HTTPException(status_code=400, detail="vix_entry_rules must be a list")
            for rule in raw_vix_rules:
                try:
                    vix_below = float(rule.get("vix_below"))
                    rule_entry_time = str(rule.get("entry_time", ""))
                except (AttributeError, TypeError, ValueError):
                    raise HTTPException(
                        status_code=400,
                        detail="Each vix_entry_rules item needs a numeric vix_below and an entry_time",
                    )
                if vix_below <= 0:
                    raise HTTPException(status_code=400, detail="vix_entry_rules vix_below must be > 0")
                if not _valid_entry_time(rule_entry_time):
                    raise HTTPException(
                        status_code=400,
                        detail=f"vix_entry_rules entry_time '{rule_entry_time}' must be HH:MM between 09:30 and 15:55 ET",
                    )
                vix_entry_rules.append({"vix_below": vix_below, "entry_time": rule_entry_time})
            vix_entry_rules.sort(key=lambda r: r["vix_below"])

        # Iron fly runs on the intraday engine: real 1-min bars if a data
        # provider is configured, otherwise a Brownian bridge through each
        # day's actual OHLC. Preference order: the user's own connected IBKR
        # gateway (real index data, usually no extra market-data subscription
        # needed since it's the same account they trade live through) ->
        # Massive/Polygon I:SPX -> SPY rescaled to SPX -> synthetic bridge.
        spx_open_by_date = {r["date"]: r["open"] for r in price_rows}
        daily_range_by_date = {r["date"]: (r["high"], r["low"]) for r in price_rows}
        intraday_by_date, intraday_source, intraday_errs = await _fetch_ibkr_intraday_bars(
            current_user.id, db, request.start_date, request.end_date, daily_range_by_date)
        data_errors.extend(intraday_errs)
        if not intraday_by_date:
            intraday_by_date, intraday_source, intraday_errs = _fetch_intraday_bars(
                request.start_date, request.end_date, spx_open_by_date)
            data_errors.extend(intraday_errs)
        if not intraday_by_date:
            intraday_by_date = _bridge_intraday_from_daily(price_rows)
            intraday_source = "synthetic_bridge"

        sim = simulate_iron_fly_intraday(
            price_rows,
            intraday_by_date,
            contracts=contracts,
            wing_width=wing_width,
            profit_target_pct=profit_target_pct,
            stop_loss_pct=stop_loss_pct,
            entry_time=entry_time,
            max_hold_minutes=max_hold_minutes,
            initial_capital=request.initial_capital,
            vix_entry_rules=vix_entry_rules or None,
        )
        params_used = {
            "contracts": contracts,
            "wing_width": wing_width,
            "profit_target_pct": profit_target_pct,
            "stop_loss_pct": stop_loss_pct,
            "entry_time": entry_time,
            "max_hold_minutes": max_hold_minutes,
        }
        if vix_entry_rules:
            params_used["vix_entry_rules"] = vix_entry_rules
    elif "credit_spread" in strategy or strategy in ("credit_spread", "spx_credit_spread"):
        sim = simulate_credit_spread(
            price_rows,
            contracts=contracts,
            spread_width=spread_width,
            short_strike_delta=short_strike_delta,
            take_profit_pct=take_profit_pct,
            max_loss_per_trade=max_loss_per_trade,
            initial_capital=request.initial_capital,
        )
        params_used = {
            "contracts": contracts,
            "spread_width": spread_width,
            "short_strike_delta": short_strike_delta,
            "take_profit_pct": take_profit_pct,
            "max_loss_per_trade": max_loss_per_trade,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Strategy '{request.strategy}' not yet supported. Supported: credit_spread, iron_fly.",
        )

    return {
        "strategy": request.strategy,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "initial_capital": request.initial_capital,
        "is_synthetic": is_synthetic,
        "daily_source": daily_source,
        "intraday_source": intraday_source,
        "data_errors": data_errors,
        "trade_params_used": params_used,
        **sim,
    }
