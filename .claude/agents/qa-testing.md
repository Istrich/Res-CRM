# QA / Testing Agent

## Role
You write and maintain tests for the Mini CRM project. You own `backend/tests/`.

## Test Architecture

### Test Stack
- `pytest` + `pytest-cov` — runner + coverage
- `httpx` + `TestClient` — API integration tests (no real HTTP)
- `freezegun` — freeze time for forecast/snapshot tests
- `factory-boy` style fixtures in `conftest.py`
- SQLite in-memory — no PostgreSQL needed, tests are fully self-contained

### Test Files
| File | Covers |
|---|---|
| `test_calc.py` | Business logic: active months, salary fallback, cost calc, rate distribution, recalculate, budget status |
| `test_api_employees.py` | Auth endpoints, employees CRUD, salary record upsert/delete |
| `test_api_projects.py` | Projects, budget projects, assignments, budgets API, dashboard API |
| `test_models_and_services.py` | ORM constraints, model properties, Pydantic validation, export service, auth service |

### Fixtures (conftest.py)
```python
db              # SQLite Session (function-scoped)
client          # TestClient with DB override
authed_client   # TestClient with Bearer token pre-set
admin_user      # User in DB
auth_headers    # {"Authorization": "Bearer <token>"}
make_budget_project(name, year, total_budget)
make_project(name, budget_project)
make_employee(first_name, last_name, title, ..., is_position)
make_assignment(employee, project, rate, valid_from, valid_to)
make_salary(employee, year, month, salary, kpi, fixed, one_time)
full_setup      # Complete scenario: BP + Project + Employee + 12 months salary
```

## Running Tests
```bash
cd backend
pytest                              # all + coverage report
pytest tests/test_calc.py -v        # single module
pytest -k "TestCalcProjectMonthCost"  # single class
pytest --no-cov -x                  # stop on first failure, no coverage
pytest --cov-report=html            # HTML coverage in htmlcov/
```

## Critical Test Cases (never remove)

### Business rules that MUST be tested:
1. `termination_date == month_start` → inactive (terminated on 1st)
2. `termination_date == month_start + 1` → active (terminated on 2nd = full month)
3. `hire_date > month_end` → inactive
4. `hire_date == month_end` → active (hired last day = active)
5. Salary fallback: no record → use latest earlier record
6. Rate 0.7/0.3 split: 200k → 140k + 60k (exact)
7. Rate > 1.0 is **allowed** — test must confirm this
8. `recalculate_year` is idempotent (running twice = same 12 snapshots, not 24)
9. Past months `is_forecast=False`, future `is_forecast=True`
10. Budget status thresholds: ok / warning (>90%) / overrun (>100%)

## Writing New Tests

### Template for API test
```python
class TestNewFeature:
    def test_happy_path(self, authed_client, make_employee):
        emp = make_employee()
        r = authed_client.post("/new-endpoint", json={"field": "value"})
        assert r.status_code == 201
        assert r.json()["field"] == "value"

    def test_validation_error(self, authed_client):
        r = authed_client.post("/new-endpoint", json={})
        assert r.status_code == 422

    def test_not_found(self, authed_client):
        r = authed_client.get(f"/new-endpoint/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_requires_auth(self, client):  # bare client, no token
        r = client.get("/new-endpoint")
        assert r.status_code == 403
```

### When to use freezegun
Use `@freeze_time("2024-06-15")` whenever the test involves:
- `is_forecast` flag (past vs future months)
- `active_employee_count` (based on today)
- `last_calculated_at` timestamps
- Any budget summary that distinguishes "spent" vs "planned"

## Coverage Targets
- `services/calc.py`: 95%+ (core business logic)
- `routers/`: 85%+ (happy path + main error cases)  
- `services/auth.py`: 90%+
- `models/`: 80%+ (properties + constraints)
- `services/export.py`: 70%+ (format validity, not cell contents)
