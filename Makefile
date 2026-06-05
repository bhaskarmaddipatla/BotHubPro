.PHONY: up down logs build migrate shell-backend shell-db

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

migrate:
	docker compose exec backend alembic upgrade head

shell-backend:
	docker compose exec backend bash

shell-db:
	docker compose exec db psql -U bothubpro bothubpro

restart-backend:
	docker compose restart backend

restart-worker:
	docker compose restart worker

test-backend:
	docker compose exec backend pytest tests/ -v

ps:
	docker compose ps
