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
        assert r.status_code == 403  # HTTPBearer returns 403 when no header

    def test_protected_route_no_token(self, client):
        r = client.get("/employees")
        assert r.status_code == 403

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
