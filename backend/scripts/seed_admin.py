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

SPX_BOTS = [
    {
        "name": "SPX 0DTE Credit Spread",
        "description": "Sells same-day SPX credit spreads using VWAP bias, opening range breakout, and VIX regime filtering. Targets 10–15 delta, manages at 50% profit or 200% loss. Max 4 trades/day.",
        "category": BotCategory.credit_spread,
        "risk_level": RiskLevel.medium,
        "configuration": {
            "entry_file": "runner.py",
            "symbol": "SPX", "dte": 0, "target_delta": 0.12,
            "max_trades_per_day": 4, "profit_target_pct": 50, "stop_loss_pct": 200,
            "trade_window_start": "09:45", "trade_window_end": "15:00",
            "git_repo": "https://github.com/bhaskarmaddipatla/trading-bots.git",
            "git_branch": "claude/elegant-brown-n7xf4v",
            "git_path": "bots/strategy/credit_spread",
        },
        "schedule_cron": "45 9 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "Institutional-grade 0DTE SPX credit spread bot using VWAP bias engine, opening range breakout, GEX regime detection, and put/call wall analysis. Automated entry/exit with hard risk controls.",
    },
    {
        "name": "SPX Iron Fly",
        "description": "Sells ATM iron flies on SPX 0DTE. Profits from low-volatility sideways action. Manages at 25% profit, stops at 150% loss.",
        "category": BotCategory.iron_fly,
        "risk_level": RiskLevel.high,
        "configuration": {"entry_file": "runner.py", "symbol": "SPX", "dte": 0, "strategy": "iron_fly", "wing_width": 50, "profit_target_pct": 25, "stop_loss_pct": 150},
        "schedule_cron": "0 10 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "ATM iron fly on SPX 0DTE. Best in low-IV regimes (VIX < 18). Symmetric risk with defined max loss.",
    },
    {
        "name": "SPX Iron Condor",
        "description": "Sells OTM iron condors on SPX targeting the 10-delta strikes on both sides. Enters after 10am when the opening range is established.",
        "category": BotCategory.iron_condor,
        "risk_level": RiskLevel.low,
        "configuration": {"entry_file": "runner.py", "symbol": "SPX", "dte": 0, "strategy": "iron_condor", "target_delta": 0.10, "wing_width": 25, "profit_target_pct": 50, "stop_loss_pct": 200},
        "schedule_cron": "0 10 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "Low-delta iron condor on SPX 0DTE. High probability of profit with defined risk on both sides.",
    },
    {
        "name": "SPX Butterfly",
        "description": "Buys SPX broken-wing butterflies targeting the expected move. Best on high-IV days when the market is likely to pin.",
        "category": BotCategory.butterfly,
        "risk_level": RiskLevel.medium,
        "configuration": {"entry_file": "runner.py", "symbol": "SPX", "dte": 0, "strategy": "butterfly", "broken_wing": True, "profit_target_pct": 100, "stop_loss_pct": 100},
        "schedule_cron": "30 9 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "Broken-wing butterfly on SPX 0DTE. Skewed risk profile with near-zero downside on one side.",
    },
    {
        "name": "SPX Gamma Bias",
        "description": "Reads GEX data to determine market dealer hedging bias. Trades directionally with credit spreads aligned to the gamma wall.",
        "category": BotCategory.credit_spread,
        "risk_level": RiskLevel.high,
        "configuration": {"entry_file": "runner.py", "symbol": "SPX", "dte": 0, "strategy": "gamma_bias", "use_gex": True, "profit_target_pct": 60, "stop_loss_pct": 150},
        "schedule_cron": "45 9 * * 1-5",
        "is_marketplace": True,
        "marketplace_description": "GEX-driven directional credit spread. Uses put/call walls and dealer gamma positioning to pick spread direction.",
    },
    {
        "name": "SPX Premarket Gap",
        "description": "Trades the SPX premarket gap fill pattern. Enters a credit spread against the gap direction within the first 30 minutes of market open.",
        "category": BotCategory.credit_spread,
        "risk_level": RiskLevel.medium,
        "configuration": {"entry_file": "runner.py", "symbol": "SPX", "dte": 0, "strategy": "premarket_gap", "gap_threshold_pts": 10, "profit_target_pct": 50, "stop_loss_pct": 200},
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

        # Seed SPX bots if not already present
        existing_count = db.query(Bot).filter(Bot.user_id == admin.id).count()
        if existing_count > 0:
            # Patch git coordinates on existing bots that are missing them
            for b in SPX_BOTS:
                existing_bot = db.query(Bot).filter(Bot.user_id == admin.id, Bot.name == b["name"]).first()
                if existing_bot and b["configuration"].get("git_repo"):
                    cfg = dict(existing_bot.configuration or {})
                    if not cfg.get("git_repo"):
                        cfg.update({
                            "git_repo":   b["configuration"]["git_repo"],
                            "git_branch": b["configuration"]["git_branch"],
                            "git_path":   b["configuration"]["git_path"],
                        })
                        existing_bot.configuration = cfg
            db.commit()
            print(f"✓ {existing_count} bots already seeded (git config patched if missing)")
            return

        for b in SPX_BOTS:
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

        db.commit()
        print(f"✅ Seeded {len(SPX_BOTS)} SPX trading bots")

    finally:
        db.close()


if __name__ == "__main__":
    seed_admin()
