"""
Run once to create the default admin user and seed the SPX trading bots.
Usage: python scripts/seed_admin.py

Default credentials:
  Email:    admin@bothubpro.com
  Password: Admin@1234
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Import ALL models so SQLAlchemy can resolve relationships
from app.models import user, subscription, bot, execution, notification, api_key, audit_log, billing
from app.core.database import SessionLocal, engine, Base
from app.models.user import User, UserRole, UserStatus
from app.models.bot import Bot, BotCategory, BotStatus, RiskLevel
from app.core.security import get_password_hash

Base.metadata.create_all(bind=engine)

GIT_ENGINE = {
    "git_repo": "https://github.com/bhaskarmaddipatla/trading-bots.git",
    "git_branch": "main",
    "git_path": "bots",          # sync the whole bots/ package so imports work
    "entry_file": "bots/engine/runner.py",  # bots/ is copied as subdir; cwd=bot_files_dir
}

SPX_BOTS = [
    {
        "name": "SPX 0DTE Credit Spread",
        "description": "Sells same-day SPX credit spreads using VWAP bias, opening range breakout, and VIX regime filtering. Targets 10–15 delta. Takes profit at 50% of credit received; cuts loss at 200% of credit received. Max 4 trades/day.",
        "category": BotCategory.credit_spread,
        "risk_level": RiskLevel.medium,
        "configuration": {
            "entry_file": "runner.py",
            "strategy": "credit_spread",
            "symbol": "SPX", "dte": 0, "target_delta": 0.12,
            "max_trades_per_day": 4, "profit_target_pct": 50, "stop_loss_pct": 200,
            "trade_window_start": "09:45", "trade_window_end": "15:00",
            **GIT_ENGINE,
        },
        "schedule_cron": "45 9 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "Institutional-grade 0DTE SPX credit spread bot using VWAP bias engine, opening range breakout, GEX regime detection, and put/call wall analysis. Automated entry/exit with hard risk controls.",
    },
    {
        "name": "SPX Iron Fly",
        "description": "Sells ATM iron flies on SPX 0DTE. Profits from low-volatility sideways action. Takes profit at 25% of credit received; cuts loss at 150% of credit received.",
        "category": BotCategory.iron_fly,
        "risk_level": RiskLevel.high,
        "configuration": {
            "entry_file": "runner.py",
            "strategy": "iron_fly",
            "symbol": "SPX", "dte": 0, "wing_width": 50, "profit_target_pct": 25, "stop_loss_pct": 150,
            **GIT_ENGINE,
        },
        "schedule_cron": "0 10 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "ATM iron fly on SPX 0DTE. Best in low-IV regimes (VIX < 18). Symmetric risk with defined max loss.",
    },
    {
        "name": "SPX Iron Condor",
        "description": "Sells OTM iron condors on SPX targeting the 10-delta strikes on both sides. Enters after 10am when the opening range is established. Takes profit at 50% of credit received; cuts loss at 200% of credit received.",
        "category": BotCategory.iron_condor,
        "risk_level": RiskLevel.low,
        "configuration": {
            "entry_file": "runner.py",
            "strategy": "iron_condor",
            "symbol": "SPX", "dte": 0, "target_delta": 0.10, "wing_width": 25, "profit_target_pct": 50, "stop_loss_pct": 200,
            **GIT_ENGINE,
        },
        "schedule_cron": "0 10 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "Low-delta iron condor on SPX 0DTE. High probability of profit with defined risk on both sides.",
    },
    {
        "name": "SPX Butterfly",
        "description": "Buys SPX broken-wing butterflies targeting the expected move. Best on high-IV days when the market is likely to pin. Takes profit at 100% of debit paid; stops at 100% of debit paid.",
        "category": BotCategory.butterfly,
        "risk_level": RiskLevel.medium,
        "configuration": {
            "entry_file": "runner.py",
            "strategy": "butterfly",
            "symbol": "SPX", "dte": 0, "broken_wing": True, "profit_target_pct": 100, "stop_loss_pct": 100,
            **GIT_ENGINE,
        },
        "schedule_cron": "30 9 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "Broken-wing butterfly on SPX 0DTE. Skewed risk profile with near-zero downside on one side.",
    },
    {
        "name": "SPX Gamma Bias",
        "description": "Reads GEX data to determine market dealer hedging bias. Trades directionally with credit spreads aligned to the gamma wall. Takes profit at 60% of credit received; cuts loss at 150% of credit received.",
        "category": BotCategory.credit_spread,
        "risk_level": RiskLevel.high,
        "configuration": {
            "entry_file": "runner.py", "symbol": "SPX", "dte": 0,
            "strategy": "gamma_bias", "use_gex": True,
            "profit_target_pct": 60, "stop_loss_pct": 150,
            **GIT_ENGINE,
        },
        "schedule_cron": "45 9 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "GEX-driven directional credit spread. Uses put/call walls and dealer gamma positioning to pick spread direction.",
    },
    {
        "name": "SPX 0DTE AI",
        "description": "AI-driven 0DTE SPX credit spread bot using machine learning signals for entry timing, direction, and strike selection. Combines momentum, volatility regime, and options flow data to maximize risk-adjusted returns.",
        "category": BotCategory.credit_spread,
        "risk_level": RiskLevel.medium,
        "configuration": {
            "entry_file": "runner.py",
            "strategy": "spx_0dte_ai",
            "symbol": "SPX", "dte": 0,
            "max_trades_per_day": 4, "profit_target_pct": 50, "stop_loss_pct": 200,
            "trade_window_start": "09:45", "trade_window_end": "15:00",
            **GIT_ENGINE,
        },
        "schedule_cron": "45 9 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "AI-powered 0DTE SPX credit spread using ML-based signal generation for entry, direction, and strike selection. Adapts to changing market regimes in real time.",
    },
    {
        "name": "SPX Premarket Gap",
        "description": "Trades the SPX premarket gap fill pattern. Enters a credit spread against the gap direction within the first 30 minutes of market open. Takes profit at 50% of credit received; cuts loss at 200% of credit received.",
        "category": BotCategory.credit_spread,
        "risk_level": RiskLevel.medium,
        "configuration": {
            "entry_file": "runner.py", "symbol": "SPX", "dte": 0,
            "strategy": "premarket_gap", "gap_threshold_pts": 10,
            "profit_target_pct": 50, "stop_loss_pct": 200,
            **GIT_ENGINE,
        },
        "schedule_cron": "30 9 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "Fades the SPX premarket gap using credit spreads. Historically gaps fill 65%+ of the time within the first hour.",
    },
]


def seed_admin():
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == "admin@bothubpro.com").first()
        if existing:
            print("✓ Admin user already exists: admin@bothubpro.com")
            admin = existing
        else:
            admin = User(
                email="admin@bothubpro.com",
                first_name="Admin",
                last_name="BotHubPro",
                hashed_password=get_password_hash("Admin@1234"),
                role=UserRole.admin,
                status=UserStatus.active,
                is_email_verified=True,
                mfa_enabled=False,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
            print("✅ Admin user created successfully!")
            print("   Email:    admin@bothubpro.com")
            print("   Password: Admin@1234")
            print("   ⚠️  Please change this password after first login!")

        # Seed / patch bots by name — always runs so new bots are added and config is kept current
        patched = added = 0
        for b in SPX_BOTS:
            existing_bot = db.query(Bot).filter(Bot.user_id == admin.id, Bot.name == b["name"]).first()
            if existing_bot:
                cfg = dict(existing_bot.configuration or {})
                changed = False
                for key in ("git_repo", "git_branch", "git_path", "entry_file", "strategy"):
                    if key in b["configuration"] and cfg.get(key) != b["configuration"][key]:
                        cfg[key] = b["configuration"][key]
                        changed = True
                if changed:
                    existing_bot.configuration = cfg
                    patched += 1
            else:
                db.add(Bot(
                    user_id=admin.id,
                    name=b["name"],
                    description=b["description"],
                    category=b["category"],
                    risk_level=b["risk_level"],
                    status=BotStatus.active,
                    is_approved=True,
                    configuration=b["configuration"],
                    schedule_cron=b["schedule_cron"],
                    is_marketplace=b["is_marketplace"],
                    marketplace_description=b["marketplace_description"],
                ))
                added += 1
        db.commit()
        total = db.query(Bot).filter(Bot.user_id == admin.id).count()
        print(f"✓ {total} bots seeded ({added} added, {patched} patched with git/strategy config)")

    finally:
        db.close()


if __name__ == "__main__":
    seed_admin()
