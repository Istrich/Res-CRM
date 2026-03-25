"""
Integration tests for projects, budget-projects, assignments, budgets API.
"""
import uuid
from datetime import date

import pytest
from freezegun import freeze_time


# ---------------------------------------------------------------------------
# Budget Projects
# ---------------------------------------------------------------------------

class TestBudgetProjectsCRUD:
    def test_create(self, authed_client):
        r = authed_client.post("/budget-projects", json={
            "name": "Проект Альфа", "year": 2024, "total_budget": 2_000_000,
        })
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Проект Альфа"
        assert data["total_budget"] == 2_000_000

    def test_create_without_budget(self, authed_client):
        r = authed_client.post("/budget-projects", json={"name": "X", "year": 2024})
        assert r.status_code == 201
        assert r.json()["total_budget"] is None

    def test_list(self, authed_client, make_budget_project):
        make_budget_project(name="BP1", year=2024)
        make_budget_project(name="BP2", year=2024)
        make_budget_project(name="BP3", year=2023)

        r = authed_client.get("/budget-projects?year=2024")
        data = r.json()
        assert len(data) == 2

    def test_get(self, authed_client, make_budget_project):
        bp = make_budget_project()
        r = authed_client.get(f"/budget-projects/{bp.id}")
        assert r.status_code == 200
        assert r.json()["id"] == str(bp.id)

    def test_get_not_found(self, authed_client):
        r = authed_client.get(f"/budget-projects/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_update(self, authed_client, make_budget_project):
        bp = make_budget_project(total_budget=1_000_000)
        r = authed_client.patch(f"/budget-projects/{bp.id}", json={"total_budget": 2_000_000})
        assert r.status_code == 200
        assert r.json()["total_budget"] == 2_000_000

    def test_delete(self, authed_client, make_budget_project):
        bp = make_budget_project()
        r = authed_client.delete(f"/budget-projects/{bp.id}")
        assert r.status_code == 204

    def test_delete_not_found(self, authed_client):
        r = authed_client.delete(f"/budget-projects/{uuid.uuid4()}")
        assert r.status_code == 404


class TestBudgetProjectMonthPlan:
    """GET/PUT /budget-projects/{id}/month-plan?year=..."""

    def test_get_month_plan_empty(self, authed_client, make_budget_project):
        bp = make_budget_project(year=2024, total_budget=None)
        r = authed_client.get(f"/budget-projects/{bp.id}/month-plan?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert len(data["items"]) == 12
        assert all(it["amount"] == 0 for it in data["items"])

    def test_get_month_plan_after_create_with_budget(self, authed_client):
        r = authed_client.post("/budget-projects", json={
            "name": "BP", "year": 2024, "total_budget": 1_200_000,
        })
        assert r.status_code == 201
        bp_id = r.json()["id"]
        r2 = authed_client.get(f"/budget-projects/{bp_id}/month-plan?year=2024")
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert len(items) == 12
        total = sum(it["amount"] for it in items)
        assert total == 1_200_000

    def test_put_month_plan(self, authed_client, make_budget_project):
        bp = make_budget_project(year=2024)
        items = [{"month": m, "amount": 100_000 * m} for m in range(1, 13)]
        r = authed_client.put(
            f"/budget-projects/{bp.id}/month-plan?year=2024",
            json={"items": items},
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) == 12
        total = sum(it["amount"] for it in data["items"])
        assert total == 100_000 * (1 + 12) * 12 // 2  # 7_800_000

        r2 = authed_client.get(f"/budget-projects/{bp.id}")
        assert r2.status_code == 200
        assert r2.json()["total_budget"] == total

    def test_put_month_plan_404(self, authed_client):
        r = authed_client.put(
            f"/budget-projects/{uuid.uuid4()}/month-plan?year=2024",
            json={"items": [{"month": m, "amount": 0} for m in range(1, 13)]},
        )
        assert r.status_code == 404

    def test_get_month_plan_404(self, authed_client):
        r = authed_client.get(f"/budget-projects/{uuid.uuid4()}/month-plan?year=2024")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

class TestProjectsCRUD:
    def test_create_with_budget_project(self, authed_client, make_budget_project):
        bp = make_budget_project()
        r = authed_client.post("/projects", json={
            "name": "Sprint 1", "budget_project_id": str(bp.id),
        })
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Sprint 1"
        assert data["budget_project_id"] == str(bp.id)

    def test_create_without_budget_project(self, authed_client):
        r = authed_client.post("/projects", json={"name": "Standalone"})
        assert r.status_code == 201
        assert r.json()["budget_project_id"] is None

    def test_list(self, authed_client, make_project):
        make_project(name="P1")
        make_project(name="P2")
        r = authed_client.get("/projects")
        assert len(r.json()) == 2

    def test_list_filter_by_budget_project(self, authed_client, make_budget_project, make_project):
        bp1 = make_budget_project(name="BP1")
        bp2 = make_budget_project(name="BP2")
        make_project(name="P1", budget_project=bp1)
        make_project(name="P2", budget_project=bp2)

        r = authed_client.get(f"/projects?budget_project_id={bp1.id}")
        assert len(r.json()) == 1
        assert r.json()[0]["name"] == "P1"

    def test_list_search(self, authed_client, make_project):
        make_project(name="Alpha Sprint")
        make_project(name="Beta Release")
        r = authed_client.get("/projects?search=Alpha")
        assert len(r.json()) == 1

    def test_update(self, authed_client, make_project):
        proj = make_project(name="Old")
        r = authed_client.patch(f"/projects/{proj.id}", json={"name": "New"})
        assert r.status_code == 200
        assert r.json()["name"] == "New"

    def test_delete(self, authed_client, make_project):
        proj = make_project()
        r = authed_client.delete(f"/projects/{proj.id}")
        assert r.status_code == 204

    def test_get_project_employees_empty(self, authed_client, make_project):
        proj = make_project()
        r = authed_client.get(f"/projects/{proj.id}/employees")
        assert r.status_code == 200
        assert r.json() == []

    def test_get_project_employees(self, authed_client, make_project, make_employee, make_assignment):
        proj = make_project()
        emp = make_employee()
        make_assignment(emp, proj)

        r = authed_client.get(f"/projects/{proj.id}/employees")
        data = r.json()
        assert len(data) == 1
        assert data[0]["employee_id"] == str(emp.id)

    def test_remove_employee_from_project(self, authed_client, make_project,
                                           make_employee, make_assignment):
        proj = make_project()
        emp = make_employee()
        asgn = make_assignment(emp, proj)

        r = authed_client.delete(f"/projects/{proj.id}/employees/{asgn.id}")
        assert r.status_code == 204

        r = authed_client.get(f"/projects/{proj.id}/employees")
        assert r.json() == []


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------

class TestAssignments:
    def test_create_assignment(self, authed_client, make_project, make_employee):
        proj = make_project()
        emp = make_employee()

        r = authed_client.post("/assignments", json={
            "employee_id": str(emp.id),
            "project_id": str(proj.id),
            "rate": 1.0,
            "valid_from": "2024-01-01",
        })
        assert r.status_code == 201
        data = r.json()
        assert data["rate"] == 1.0
        assert data["employee_id"] == str(emp.id)

    def test_create_assignment_rate_above_one(self, authed_client, make_project, make_employee):
        """Rate > 1.0 is allowed per spec."""
        proj = make_project()
        emp = make_employee()

        r = authed_client.post("/assignments", json={
            "employee_id": str(emp.id),
            "project_id": str(proj.id),
            "rate": 1.5,
            "valid_from": "2024-01-01",
        })
        assert r.status_code == 201
        assert r.json()["rate"] == 1.5

    def test_create_assignment_zero_rate_rejected(self, authed_client, make_project, make_employee):
        proj = make_project()
        emp = make_employee()

        r = authed_client.post("/assignments", json={
            "employee_id": str(emp.id),
            "project_id": str(proj.id),
            "rate": 0,
            "valid_from": "2024-01-01",
        })
        assert r.status_code == 422

    def test_create_assignment_negative_rate_rejected(self, authed_client, make_project, make_employee):
        proj = make_project()
        emp = make_employee()

        r = authed_client.post("/assignments", json={
            "employee_id": str(emp.id),
            "project_id": str(proj.id),
            "rate": -0.5,
            "valid_from": "2024-01-01",
        })
        assert r.status_code == 422

    def test_update_assignment_rate(self, authed_client, make_project, make_employee, make_assignment):
        proj = make_project()
        emp = make_employee()
        asgn = make_assignment(emp, proj, rate=0.5)

        r = authed_client.patch(f"/assignments/{asgn.id}", json={"rate": 0.8})
        assert r.status_code == 200
        assert r.json()["rate"] == 0.8

    def test_delete_assignment(self, authed_client, make_project, make_employee, make_assignment):
        proj = make_project()
        emp = make_employee()
        asgn = make_assignment(emp, proj)

        r = authed_client.delete(f"/assignments/{asgn.id}")
        assert r.status_code == 204

    def test_assignment_employee_not_found(self, authed_client, make_project):
        proj = make_project()
        r = authed_client.post("/assignments", json={
            "employee_id": str(uuid.uuid4()),
            "project_id": str(proj.id),
            "rate": 1.0,
            "valid_from": "2024-01-01",
        })
        assert r.status_code == 404

    def test_assignment_project_not_found(self, authed_client, make_employee):
        emp = make_employee()
        r = authed_client.post("/assignments", json={
            "employee_id": str(emp.id),
            "project_id": str(uuid.uuid4()),
            "rate": 1.0,
            "valid_from": "2024-01-01",
        })
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Budgets API
# ---------------------------------------------------------------------------

class TestBudgetsAPI:
    @freeze_time("2024-06-15")
    def test_recalculate(self, authed_client, full_setup):
        r = authed_client.post("/budgets/recalculate?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert data["projects_updated"] == 1
        assert data["snapshots_updated"] == 12

    @freeze_time("2024-06-15")
    def test_last_calculated(self, authed_client, full_setup):
        authed_client.post("/budgets/recalculate?year=2024")
        r = authed_client.get("/budgets/last-calculated?year=2024")
        assert r.status_code == 200
        assert r.json()["calculated_at"] is not None

    @freeze_time("2024-06-15")
    def test_project_budget(self, authed_client, full_setup):
        proj = full_setup["project"]
        authed_client.post("/budgets/recalculate?year=2024")

        r = authed_client.get(f"/budgets/projects/{proj.id}?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert "spent" in data
        assert "forecast" in data
        assert "monthly" in data
        assert len(data["monthly"]) == 12

    @freeze_time("2024-06-15")
    def test_budget_project_budget(self, authed_client, full_setup):
        bp = full_setup["budget_project"]
        authed_client.post("/budgets/recalculate?year=2024")

        r = authed_client.get(f"/budgets/budget-projects/{bp.id}?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert data["budget_project_id"] == str(bp.id)
        assert "projects" in data
        assert "monthly_plan" in data
        assert "monthly_fact" in data
        assert "monthly_diff" in data
        assert len(data["monthly_plan"]) == 12
        assert len(data["monthly_fact"]) == 12
        assert len(data["monthly_diff"]) == 12

    @freeze_time("2024-06-15")
    def test_budget_overview(self, authed_client, full_setup):
        authed_client.post("/budgets/recalculate?year=2024")

        r = authed_client.get("/budgets/overview?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert "total_spent" in data
        assert "total_forecast" in data
        assert len(data["projects"]) >= 1
        assert len(data["budget_projects"]) >= 1

    def test_recalculate_requires_year(self, authed_client):
        r = authed_client.post("/budgets/recalculate")
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# Dashboard API
# ---------------------------------------------------------------------------

class TestDashboardAPI:
    @freeze_time("2024-06-15")
    def test_summary(self, authed_client, full_setup):
        r = authed_client.get("/dashboard/summary?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert data["employee_count"] == 1
        assert data["position_count"] == 0
        assert "monthly_spend" in data
        assert len(data["monthly_spend"]) == 12

    @freeze_time("2024-06-15")
    def test_summary_counts_positions_separately(self, authed_client, make_employee):
        make_employee(is_position=False)
        make_employee(is_position=True, first_name=None, last_name=None)

        r = authed_client.get("/dashboard/summary?year=2024")
        data = r.json()
        assert data["employee_count"] == 1
        assert data["position_count"] == 1

    @freeze_time("2024-06-15")
    def test_by_project(self, authed_client, full_setup):
        authed_client.post("/budgets/recalculate?year=2024")
        r = authed_client.get("/dashboard/by-project?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert "project_name" in data[0]
        assert "total" in data[0]

    @freeze_time("2024-06-15")
    def test_by_department(self, authed_client, full_setup):
        r = authed_client.get("/dashboard/by-department?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert any(d["department"] == "ИТ" for d in data)

    @freeze_time("2024-06-15")
    def test_movements(self, authed_client, full_setup):
        r = authed_client.get("/dashboard/movements?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 12

        # Employee hired Jan 1 → hired in January
        jan = data[0]
        assert jan["month"] == 1
        assert jan["hired_count"] == 1

    def test_available_years(self, authed_client, make_salary, make_employee):
        emp = make_employee()
        make_salary(emp, year=2023, month=1)
        make_salary(emp, year=2024, month=6)

        r = authed_client.get("/dashboard/available-years")
        assert r.status_code == 200
        years = r.json()["years"]
        assert 2023 in years
        assert 2024 in years
