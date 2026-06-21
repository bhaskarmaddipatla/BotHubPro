from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "bothubpro",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_soft_time_limit=300,
    task_time_limit=600,
)

celery_app.conf.beat_schedule = {
    "check-bot-schedules": {
        "task": "check_bot_schedules",
        "schedule": 60.0,  # every 60 seconds
    },
}
