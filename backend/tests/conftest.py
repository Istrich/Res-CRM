"""
Shared pytest fixtures.

Uses SQLite in-memory database — no PostgreSQL needed for tests.
All fixtures are function-scoped by default (fresh DB per test).
"""
import os

# Set before any app import so lifespan and engine use SQLite
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.setdefault("SECRET_KEY", "test-secret-key")

import uuid
from datetime import date
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import (
    BudgetProject, BudgetSnapshot, Employee, EmployeeProject, Project,
    SalaryRecord, User,
)
from app.services.auth import hash_password, create_access_token

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SQLITE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def engine():
    eng = create_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture(scope="function")
def db(engine) -> Generator[Session, None, None]:
    Session_ = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session_()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# FastAPI test client with DB override
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def client(db) -> TestClient:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_user(db) -> User:
    user = User(username="admin", password_hash=hash_password("admin123"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(admin_user) -> dict:
    token = create_access_token({"sub": admin_user.username})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def authed_client(client, auth_headers) -> TestClient:
    """TestClient with auth headers pre-set."""
    client.headers.update(auth_headers)
    return client


# ---------------------------------------------------------------------------
# Model factories
# ---------------------------------------------------------------------------

@pytest.fixture
def make_budget_project(db):
    def _make(name="Test BP", year=2024, total_budget=1_000_000.0):
        bp = BudgetProject(name=name, year=year, total_budget=total_budget)
        db.add(bp)
        db.commit()
        db.refresh(bp)
        return bp
    return _make


@pytest.fixture
def make_project(db, make_budget_project):
    def _make(name="Test Project", budget_project=None):
        if budget_project is None:
            budget_project = make_budget_project()
        p = Project(name=name, budget_project_id=budget_project.id)
        db.add(p)
        db.commit()
        db.refresh(p)
        return p
    return _make


@pytest.fixture
def make_employee(db):
    def _make(
        first_name="Иван", last_name="Иванов", title="Разработчик",
        department="ИТ", specialization="Backend",
        hire_date=date(2024, 1, 1), termination_date=None,
        is_position=False,
    ):
        emp = Employee(
            first_name=first_name, last_name=last_name,
            title=title, department=department, specialization=specialization,
            hire_date=hire_date, termination_date=termination_date,
            is_position=is_position,
        )
        db.add(emp)
        db.commit()
        db.refresh(emp)
        return emp
    return _make


@pytest.fixture
def make_assignment(db):
    def _make(employee, project, rate=1.0, valid_from=date(2024, 1, 1), valid_to=None):
        ep = EmployeeProject(
            employee_id=employee.id,
            project_id=project.id,
            rate=rate,
            valid_from=valid_from,
            valid_to=valid_to,
        )
        db.add(ep)
        db.commit()
        db.refresh(ep)
        return ep
    return _make


@pytest.fixture
def make_salary(db):
    def _make(employee, year=2024, month=1, salary=100_000, kpi=10_000, fixed=5_000, one_time=0, is_raise=False):
        rec = SalaryRecord(
            employee_id=employee.id,
            year=year, month=month,
            salary=salary, kpi_bonus=kpi,
            fixed_bonus=fixed, one_time_bonus=one_time,
            is_raise=is_raise,
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        return rec
    return _make


# ---------------------------------------------------------------------------
# Composite fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def full_setup(db, make_budget_project, make_project, make_employee, make_assignment, make_salary):
    """
    Creates a complete scenario:
      - BudgetProject (1M budget)
      - Project linked to it
      - Employee with salary 100k/month
      - Assignment: employee → project, rate=1.0
      - Salary records for all 12 months of 2024
    """
    bp = make_budget_project(name="Бюджет 2024", year=2024, total_budget=1_500_000)
    proj = make_project(name="Основной проект", budget_project=bp)
    emp = make_employee(first_name="Алексей", last_name="Смирнов")
    asgn = make_assignment(emp, proj, rate=1.0)

    salaries = []
    for m in range(1, 13):
        s = make_salary(emp, year=2024, month=m, salary=100_000, kpi=10_000, fixed=5_000)
        salaries.append(s)

    return {
        "budget_project": bp,
        "project": proj,
        "employee": emp,
        "assignment": asgn,
        "salaries": salaries,
    }
