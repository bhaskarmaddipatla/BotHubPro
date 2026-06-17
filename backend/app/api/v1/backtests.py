from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime, date, timedelta
from uuid import UUID
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.bot import Bot
import math
import random

router = APIRouter()

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
            "short_strike": round(short_K, 2),
            "long_strike": round(long_K, 2),
            "credit": round(credit, 2),
            "pnl": round(pnl, 2),
            "cumulative": round(capital - initial_capital, 2),
            "exit_reason": exit_reason,
            "contracts": contracts,
        })
        equity_curve.append({"date": d, "value": round(capital, 2)})

    # Metrics
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

    is_synthetic = False
    price_rows = []

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
    except Exception:
        pass

    if not price_rows:
        # Yahoo Finance unavailable — fall back to synthetic GBM data
        price_rows, is_synthetic = _generate_synthetic_spx(request.start_date, request.end_date)

    if not price_rows:
        raise HTTPException(status_code=400, detail="No trading days found in date range")

    strategy = request.strategy.lower().replace(" ", "_")
    if "credit_spread" in strategy or strategy in ("credit_spread", "spx_credit_spread"):
        sim = simulate_credit_spread(
            price_rows,
            contracts=contracts,
            spread_width=spread_width,
            short_strike_delta=short_strike_delta,
            take_profit_pct=take_profit_pct,
            max_loss_per_trade=max_loss_per_trade,
            initial_capital=request.initial_capital,
        )
    else:
        raise HTTPException(status_code=400, detail=f"Strategy '{request.strategy}' not yet supported. Use 'credit_spread'.")

    return {
        "strategy": request.strategy,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "initial_capital": request.initial_capital,
        "is_synthetic": is_synthetic,
        "trade_params_used": {
            "contracts": contracts,
            "spread_width": spread_width,
            "short_strike_delta": short_strike_delta,
            "take_profit_pct": take_profit_pct,
            "max_loss_per_trade": max_loss_per_trade,
        },
        **sim,
    }
