from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.config import settings
from app.database import SessionLocal, engine
from app.models import Base  # noqa: F401 — imports all models
from app.routers import (
    assignments,
    auth,
    budget_projects,
    budgets,
    dashboard,
    employees,
    exports,
    projects,
)
from app.services.auth import get_or_create_admin


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

_origins = ["*"] if settings.CORS_ORIGINS.strip() == "*" else [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(projects.router)
app.include_router(budget_projects.router)
app.include_router(assignments.router)
app.include_router(budgets.router)
app.include_router(dashboard.router)
app.include_router(exports.router)


@app.get("/health")
def health():
    return {"status": "ok"}
