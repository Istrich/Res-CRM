# DevOps Agent

## Role
You handle deployment, Docker, CI/CD, and infrastructure for Mini CRM.

## Local Development

### Start everything
```bash
cd mini-crm
docker compose up -d          # PostgreSQL on :5432, backend on :8000
docker compose exec backend alembic upgrade head
cd frontend && npm install && npm run dev   # Frontend on :3000
```

### Backend only (no Docker)
```bash
cd backend
pip install -r requirements.txt
# Edit .env → DATABASE_URL=postgresql://... (point to local PG)
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Environment (.env)
```
DATABASE_URL=postgresql://minicrm:minicrm_secret@db:5432/minicrm
SECRET_KEY=<generate with: openssl rand -hex 32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123       # Change in production!
```

## Docker Compose Services
| Service | Image | Port | Notes |
|---|---|---|---|
| `db` | postgres:16-alpine | 5432 | Health check enabled |
| `backend` | ./backend | 8000 | Hot reload in dev |

## Alembic Migrations
```bash
# Apply latest
docker compose exec backend alembic upgrade head

# Create new migration (after model change)
docker compose exec backend alembic revision --autogenerate -m "add feature x"

# Rollback one step
docker compose exec backend alembic downgrade -1

# Check current version
docker compose exec backend alembic current
```

## Production Checklist
- [ ] Change `SECRET_KEY` to a secure random value
- [ ] Change `ADMIN_PASSWORD`
- [ ] Set `CORS allow_origins` to specific domain in `main.py`
- [ ] Run behind nginx/caddy with TLS
- [ ] Set `--workers 2` in uvicorn command
- [ ] Add PostgreSQL backup (pg_dump cron)

## CI/CD (GitHub Actions)
Pipeline runs on every push to `main` and every PR:
1. Backend linting (flake8) + syntax check
2. Backend tests with SQLite (no PG needed)
3. Frontend import validation
4. Build check (vite build)

See `.github/workflows/ci.yml`.

## Running Tests in CI
```bash
cd backend
pip install -r requirements-test.txt
pytest --no-cov  # faster in CI, coverage reported separately
```

## Logs
```bash
docker compose logs backend -f    # backend logs
docker compose logs db -f         # postgres logs
```

## Reset Everything
```bash
docker compose down -v            # remove containers + volumes (wipes DB)
docker compose up -d
docker compose exec backend alembic upgrade head
```
