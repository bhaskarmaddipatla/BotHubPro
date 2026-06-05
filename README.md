# BotHub Pro

Professional trading bot SaaS platform for SPX options automation.

## Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, Recharts
- **Backend**: FastAPI, Python 3.12, PostgreSQL, Redis, Celery
- **Auth**: JWT + Refresh Tokens + TOTP MFA
- **Payments**: Stripe
- **Email**: SendGrid
- **Infrastructure**: Docker, GitHub Actions, AWS-ready

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.12+ (for local backend dev)

### Run with Docker

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys

docker compose up -d
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Celery Flower: http://localhost:5555

### Local Development

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# Start PostgreSQL and Redis (via docker or local install)
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                         NGINX                           │
│              (Reverse Proxy + SSL Termination)          │
└────────────────┬────────────────────┬───────────────────┘
                 │                    │
         ┌───────▼──────┐    ┌────────▼───────┐
         │   Frontend   │    │    Backend     │
         │  Next.js 15  │    │   FastAPI      │
         │  Port 3000   │    │   Port 8000    │
         └──────────────┘    └────────┬───────┘
                                      │
                    ┌─────────────────┼──────────────────┐
                    │                 │                  │
             ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼──────┐
             │ PostgreSQL  │  │    Redis    │  │   Celery     │
             │   Port 5432 │  │  Port 6379  │  │   Workers   │
             └─────────────┘  └─────────────┘  └─────────────┘
```

## Features

- **Authentication**: JWT + refresh tokens, mandatory TOTP MFA
- **Bot Management**: CRUD for trading bots, categories, risk levels, JSON config
- **Execution Engine**: Manual + scheduled execution via Celery workers
- **Analytics**: Equity curves, win rate, profit factor, Sharpe ratio, drawdown
- **Backtesting**: Historical strategy simulation with detailed metrics
- **Marketplace**: 6 pre-built SPX bot strategies with live performance data
- **Admin**: User management, bot approval, platform metrics
- **Billing**: Stripe-integrated subscription plans (Trial/Monthly/$49, Professional/$99, Enterprise)
- **Notifications**: Real-time dashboard alerts

## Bot Categories

| Bot | Strategy | Risk | Win Rate |
|-----|----------|------|----------|
| SPX Credit Spread | 1-3 DTE credit spreads | Medium | 68.5% |
| SPX 0DTE Credit Spread | Same-day expiry spreads | High | 72.1% |
| SPX Iron Fly | ATM iron fly | Medium | 61.3% |
| SPX Butterfly | Long butterfly | Low | 55.8% |
| SPX Gamma Bias | Volatility-adaptive | High | 64.7% |
| SPX Premarket Playbook | Gap analysis + positioning | Medium | 66.2% |

## Environment Variables

See `backend/.env.example` for all required configuration.

## Deployment

See `.github/workflows/ci.yml` for the full CI/CD pipeline.

For production deployment:
```bash
cp docker-compose.prod.yml docker-compose.override.yml
# Set env vars in .env.prod
docker compose -f docker-compose.prod.yml up -d
```

## License

Proprietary - BotHub Pro © 2024
