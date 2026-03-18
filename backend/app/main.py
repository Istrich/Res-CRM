import logging
import logging.config
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.config import settings
from app.database import SessionLocal, engine, get_db
from app.middleware import AccessLogMiddleware
from app.models import Base  # noqa: F401 — imports all models
from app.routers import (
    assignments,
    auth,
    backup,
    budget_projects,
    budgets,
    dashboard,
    employees,
    exports,
    projects,
)
from app.services.auth import get_or_create_admin

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

# ---------------------------------------------------------------------------
# Rate limiter (shared instance imported by routers)
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address, default_limits=[])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (Alembic handles migrations in prod, this is a fallback)
    try:
        Base.metadata.create_all(bind=engine)
    except OperationalError:
        pass  # already exists or DB not ready

    # Ensure admin user exists
    db = SessionLocal()
    try:
        get_or_create_admin(db)
    finally:
        db.close()

    yield


app = FastAPI(
    title="Mini CRM API",
    description="Employee, project and budget management",
    version="1.0.0",
    lifespan=lifespan,
)

# Attach rate limiter to app state so slowapi can find it
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

_raw_origins = settings.CORS_ORIGINS.strip()
if _raw_origins == "*":
    # Wildcard — works for non-credentialed requests. Credentialed requests
    # (cookies) need explicit origins; a proxy (Vite/nginx) avoids CORS entirely.
    _origins = ["*"]
    _allow_credentials = False
else:
    _origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    _allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AccessLogMiddleware)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(projects.router)
app.include_router(budget_projects.router)
app.include_router(assignments.router)
app.include_router(budgets.router)
app.include_router(dashboard.router)
app.include_router(exports.router)
app.include_router(backup.router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["health"])
def health(db=None):
    from app.database import get_db as _get_db
    import contextlib
    db_status = "unavailable"
    with contextlib.suppress(Exception):
        db_session = next(_get_db())
        db_session.execute(text("SELECT 1"))
        db_status = "connected"
    if db_status == "unavailable":
        return JSONResponse({"status": "degraded", "db": "unavailable"}, status_code=503)
    return {"status": "ok", "db": db_status}
