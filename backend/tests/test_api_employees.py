"""
Integration tests for auth and employees API endpoints.
Uses TestClient with SQLite in-memory DB.
"""
from datetime import date

import pytest


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TestAuth:
    def test_login_success(self, client, admin_user):
        r = client.post("/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, admin_user):
        r = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    def test_login_unknown_user(self, client):
        r = client.post("/auth/login", json={"username": "nobody", "password": "x"})
        assert r.status_code == 401

    def test_me_authenticated(self, authed_client, admin_user):
        r = authed_client.get("/auth/me")
        assert r.status_code == 200
        assert r.json()["username"] == "admin"

    def test_me_unauthenticated(self, client):
        r = client.get("/auth/me")
        assert r.status_code == 401  # Cookie-first auth returns 401 when no credentials

    def test_protected_route_no_token(self, client):  # noqa
        r = client.get("/employees")
        assert r.status_code == 401  # no credentials → 401 Unauthorized

    def test_protected_route_bad_token(self, client):
        r = client.get("/employees", headers={"Authorization": "Bearer bad.token.here"})
        assert r.status_code == 401

    def test_health_no_auth(self, client):
        r = client.get("/health")
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Employees CRUD
# ---------------------------------------------------------------------------

class TestEmployeesCRUD:
    def test_list_empty(self, authed_client):
        r = authed_client.get("/employees")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_employee(self, authed_client):
        r = authed_client.post("/employees", json={
            "first_name": "Иван", "last_name": "Иванов",
            "title": "Разработчик", "department": "ИТ",
            "hire_date": "2024-01-01",
        })
        assert r.status_code == 201
        data = r.json()
        assert data["title"] == "Разработчик"
        assert data["display_name"] == "Иванов Иван"
        assert data["is_position"] is False
        assert data["has_projects"] is False

    def test_create_position(self, authed_client):
        r = authed_client.post("/employees", json={
            "is_position": True,
            "title": "Senior Developer",
            "department": "ИТ",
        })
        assert r.status_code == 201
        data = r.json()
        assert data["is_position"] is True
        assert "Позиция" in data["display_name"] or data["first_name"] is None
        assert data.get("position_status") == "awaiting_assignment"

    def test_create_position_with_project_and_salary(self, authed_client, make_project):
        """Creating a position with planned_exit_date, project_id, rate, planned_salary creates assignment and salary records."""
        proj = make_project(name="Backend Team")
        r = authed_client.post("/employees", json={
            "is_position": True,
            "title": "Backend Dev",
            "planned_exit_date": "2024-06-15",
            "project_id": str(proj.id),
            "rate": 1.0,
            "planned_salary": 120_000.0,
        })
        assert r.status_code == 201
        data = r.json()
        assert data["is_position"] is True
        assert data["planned_exit_date"] == "2024-06-15"
        assert data["planned_salary"] == 120_000.0
        assert len(data["assignments"]) == 1
        assert data["assignments"][0]["project_id"] == str(proj.id)
        assert data["assignments"][0]["rate"] == 1.0
        assert data["assignments"][0]["valid_from"] == "2024-06-01"
        assert data["assignments"][0]["valid_to"] == "2024-12-31"
        assert len(data["salary_records"]) == 7  # Jun..Dec
        for rec in data["salary_records"]:
            assert rec["year"] == 2024
            assert rec["salary"] == 120_000.0

    def test_hire_from_position(self, authed_client, make_employee):
        """POST /employees/{id}/hire converts position to employee; position disappears from hiring list."""
        pos = make_employee(is_position=True, first_name=None, last_name=None)
        r = authed_client.post(f"/employees/{pos.id}/hire", json={
            "first_name": "Мария",
            "last_name": "Сидорова",
            "hire_date": "2024-07-01",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["is_position"] is False
        assert data["first_name"] == "Мария"
        assert data["last_name"] == "Сидорова"
        assert data["hire_date"] == "2024-07-01"
        assert data.get("planned_exit_date") is None
        assert data.get("position_status") is None
        assert data.get("planned_salary") is None

        r2 = authed_client.get("/employees?is_position=true")
        assert r2.status_code == 200
        ids = [e["id"] for e in r2.json()]
        assert str(pos.id) not in ids

    def test_hire_from_employee_rejected(self, authed_client, make_employee):
        """Hire endpoint only works for positions."""
        emp = make_employee()
        r = authed_client.post(f"/employees/{emp.id}/hire", json={"first_name": "X", "last_name": "Y"})
        assert r.status_code == 400

    def test_create_employee_title_required(self, authed_client):
        r = authed_client.post("/employees", json={"first_name": "Иван"})
        assert r.status_code == 422

    def test_get_employee(self, authed_client, make_employee, db):
        emp = make_employee()
        r = authed_client.get(f"/employees/{emp.id}")
        assert r.status_code == 200
        assert r.json()["id"] == str(emp.id)

    def test_get_employee_not_found(self, authed_client):
        import uuid
        r = authed_client.get(f"/employees/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_update_employee(self, authed_client, make_employee):
        emp = make_employee()
        r = authed_client.patch(f"/employees/{emp.id}", json={"department": "Новый отдел"})
        assert r.status_code == 200
        assert r.json()["department"] == "Новый отдел"

    def test_update_preserves_other_fields(self, authed_client, make_employee):
        emp = make_employee(first_name="Иван", title="Dev")
        r = authed_client.patch(f"/employees/{emp.id}", json={"department": "ИТ"})
        assert r.status_code == 200
        data = r.json()
        assert data["first_name"] == "Иван"
        assert data["title"] == "Dev"

    def test_delete_employee(self, authed_client, make_employee):
        emp = make_employee()
        r = authed_client.delete(f"/employees/{emp.id}")
        assert r.status_code == 204

        r = authed_client.get(f"/employees/{emp.id}")
        assert r.status_code == 404

    def test_termination_date_before_hire_rejected(self, authed_client):
        r = authed_client.post("/employees", json={
            "title": "Dev",
            "hire_date": "2024-06-01",
            "termination_date": "2024-01-01",
        })
        assert r.status_code == 422

    def test_termination_date_equals_hire_allowed(self, authed_client):
        r = authed_client.post("/employees", json={
            "title": "Dev",
            "hire_date": "2024-01-01",
            "termination_date": "2024-01-01",
        })
        assert r.status_code == 201

    def test_list_search(self, authed_client, make_employee):
        make_employee(first_name="Иван", last_name="Иванов")
        make_employee(first_name="Пётр", last_name="Петров")

        r = authed_client.get("/employees?search=Ива")
        assert r.status_code == 200
        results = r.json()
        assert len(results) == 1
        assert "Иван" in results[0]["display_name"]

    def test_list_filter_department(self, authed_client, make_employee):
        make_employee(first_name="А", department="ИТ")
        make_employee(first_name="Б", department="HR")

        r = authed_client.get("/employees?department=ИТ")
        data = r.json()
        assert len(data) == 1
        assert data[0]["department"] == "ИТ"

    def test_list_includes_positions(self, authed_client, make_employee):
        make_employee()
        make_employee(is_position=True, first_name=None, last_name=None)

        r = authed_client.get("/employees")
        assert len(r.json()) == 2

    def test_list_assignments_filtered_by_month(self, authed_client, make_employee, make_project, make_assignment):
        """Assignments in list response are limited to those active in the given year/month."""
        emp = make_employee()
        proj_a = make_project(name="Project A")
        proj_b = make_project(name="Project B")
        proj_c = make_project(name="Project C")
        make_assignment(emp, proj_a, rate=1.0, valid_from=date(2025, 1, 1), valid_to=date(2025, 3, 31))
        make_assignment(emp, proj_b, rate=0.5, valid_from=date(2025, 4, 1), valid_to=None)
        make_assignment(emp, proj_c, rate=0.5, valid_from=date(2025, 4, 1), valid_to=None)

        r_mar = authed_client.get("/employees", params={"year": 2025, "month": 3})
        assert r_mar.status_code == 200
        data_mar = r_mar.json()
        assert len(data_mar) == 1
        assert len(data_mar[0]["assignments"]) == 1
        assert data_mar[0]["assignments"][0]["project_name"] == "Project A"
        assert data_mar[0]["assignments"][0]["rate"] == 1.0

        r_apr = authed_client.get("/employees", params={"year": 2025, "month": 4})
        assert r_apr.status_code == 200
        data_apr = r_apr.json()
        assert len(data_apr) == 1
        assert len(data_apr[0]["assignments"]) == 2
        names = {a["project_name"] for a in data_apr[0]["assignments"]}
        assert names == {"Project B", "Project C"}
        for a in data_apr[0]["assignments"]:
            assert a["rate"] == 0.5


# ---------------------------------------------------------------------------
# Salary records
# ---------------------------------------------------------------------------

class TestSalaryRecords:
    def test_upsert_create(self, authed_client, make_employee):
        emp = make_employee()
        r = authed_client.put(
            f"/employees/{emp.id}/salary/2024/1",
            json={"salary": 100000, "kpi_bonus": 10000, "fixed_bonus": 5000, "one_time_bonus": 0},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["salary"] == 100_000
        assert data["total"] == 115_000

    def test_upsert_update(self, authed_client, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=1, salary=100_000)

        r = authed_client.put(
            f"/employees/{emp.id}/salary/2024/1",
            json={"salary": 120000, "kpi_bonus": 0, "fixed_bonus": 0, "one_time_bonus": 0},
        )
        assert r.status_code == 200
        assert r.json()["salary"] == 120_000

    def test_invalid_month(self, authed_client, make_employee):
        emp = make_employee()
        r = authed_client.put(
            f"/employees/{emp.id}/salary/2024/13",
            json={"salary": 100000, "kpi_bonus": 0, "fixed_bonus": 0, "one_time_bonus": 0},
        )
        assert r.status_code == 400

    def test_get_salary_list(self, authed_client, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=1)
        make_salary(emp, year=2024, month=2)

        r = authed_client.get(f"/employees/{emp.id}/salary?year=2024")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_get_salary_filters_by_year(self, authed_client, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=1)
        make_salary(emp, year=2023, month=12)

        r = authed_client.get(f"/employees/{emp.id}/salary?year=2024")
        assert len(r.json()) == 1

    def test_delete_salary(self, authed_client, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=3)

        r = authed_client.delete(f"/employees/{emp.id}/salary/2024/3")
        assert r.status_code == 204

        r = authed_client.get(f"/employees/{emp.id}/salary?year=2024")
        assert r.json() == []
