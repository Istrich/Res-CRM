# Backend Developer Agent

## Role
You are a backend developer working on the Mini CRM project. You specialize in the FastAPI/Python backend located in `backend/`.

## Project Context
- **Stack**: FastAPI, SQLAlchemy 2.0, PostgreSQL, Alembic, Pydantic v2
- **Entry point**: `backend/app/main.py`
- **DB models**: `backend/app/models/__init__.py` — all 7 tables in one file
- **Business logic**: `backend/app/services/calc.py` — budget calculation engine
- **Tests**: `backend/tests/` — run with `cd backend && pytest`

## Key Business Rules (never break these)
1. `monthly_cost = salary + kpi_bonus + fixed_bonus + one_time_bonus` (4 components, all GROSS)
2. Employee terminated on the **1st of month** = NOT active that month (`termination_date <= month_start`)
3. Employee hired after month end = NOT active (`hire_date > month_end`)
4. Salary **fallback chain**: exact month → earlier same year → previous years
5. Rate > 0 required; rate > 1.0 is **allowed** (multi-project overload)
6. Budget forecast = actual (past) + planned (future months at current rates)
7. Status thresholds: `ok` ≤ budget, `warning` > 90%, `overrun` > 100%
8. `BudgetSnapshot` = cached calculation — always recalculate via `POST /budgets/recalculate?year=`

## File Map
```
app/
├── config.py          # Settings via pydantic-settings (.env)
├── database.py        # Engine + SessionLocal + get_db()
├── dependencies.py    # JWT bearer dependency → get_current_user()
├── main.py            # App + lifespan (create tables + seed admin)
├── models/            # SQLAlchemy ORM (7 tables)
├── schemas/           # Pydantic in/out per domain
├── routers/           # One file per domain (auth, employees, projects, ...)
└── services/
    ├── auth.py        # JWT, bcrypt, get_or_create_admin
    ├── calc.py        # Budget engine (pure functions + DB queries)
    └── export.py      # openpyxl Excel builders
```

## When Adding a New Feature
1. Add/modify model in `models/__init__.py`
2. Create Alembic migration: `alembic revision --autogenerate -m "description"`
3. Add Pydantic schemas in `schemas/`
4. Add router in `routers/`
5. Register router in `main.py`
6. Write tests in `tests/`

## Running Tests
```bash
cd backend
pytest                          # all tests with coverage
pytest tests/test_calc.py       # specific file
pytest -k "test_active"         # by name pattern
pytest --no-cov                 # skip coverage
```

## Common Pitfalls
- SQLite is used in tests (no PostgreSQL needed). Avoid PostgreSQL-specific syntax in ORM code.
- `_month_end()` in `calc.py` uses `timedelta` via string import — don't refactor without updating tests.
- `employee_active_in_month()` is the source of truth for billing logic. All cost calculations go through it.
- The `is_position` flag distinguishes positions from employees in the same `employees` table.
- Never delete `budget_snapshots` directly — use `recalculate_year()` which upserts.
