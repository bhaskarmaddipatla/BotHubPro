from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.models import user, subscription, bot, execution, notification, api_key, audit_log, billing  # noqa: F401
from app.api.v1 import auth, users, bots, executions, subscriptions, analytics, admin, notifications, marketplace, backtests
from app.api.v1 import broker_credentials, bot_runner
from app.api.v1 import telegram as telegram_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting BotHubPro API...")
    yield
    logger.info("Shutting down BotHubPro API...")


app = FastAPI(
    title="BotHubPro API",
    description="Professional Trading Bot SaaS Platform",
    version="1.0.0",
    lifespan=lifespan,
)

_cors_origins = list(set(settings.ALLOWED_ORIGINS + settings.ALLOWED_ORIGINS_EXTRA))
if settings.FRONTEND_URL and settings.FRONTEND_URL not in _cors_origins:
    _cors_origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(bots.router, prefix="/api/v1/bots", tags=["Bots"])
app.include_router(executions.router, prefix="/api/v1/executions", tags=["Executions"])
app.include_router(subscriptions.router, prefix="/api/v1/subscriptions", tags=["Subscriptions"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(marketplace.router, prefix="/api/v1/marketplace", tags=["Marketplace"])
app.include_router(backtests.router, prefix="/api/v1/backtests", tags=["Backtests"])
app.include_router(broker_credentials.router, prefix="/api/v1/broker", tags=["Broker"])
app.include_router(bot_runner.router, prefix="/api/v1/bot-runner", tags=["bot-runner"])
app.include_router(telegram_router.router, prefix="/api/v1/telegram", tags=["Telegram"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
