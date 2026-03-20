"""
Tests for hourly rate calculation.

Covers:
- calc_hourly_rate: pure function edge cases
- get_working_hours_map: DB query
- build_list_item: monthly_hourly_rates present
- build_employee_out: monthly_hourly_rates present
- API GET /employees: monthly_hourly_rates in list
- API GET /projects/{id}/employees: monthly_hourly_rates per member
"""
import pytest
from sqlalchemy.orm import joinedload

from app.models import Employee, WorkingHoursYearMonth
from app.services.calc import calc_hourly_rate, get_working_hours_map


# ---------------------------------------------------------------------------
# Pure function: calc_hourly_rate
# ---------------------------------------------------------------------------

class TestCalcHourlyRate:
    def test_normal_division(self):
        assert calc_hourly_rate(120_000, 160) == pytest.approx(750.0)

    def test_rounded_to_two_decimals(self):
        result = calc_hourly_rate(100_000, 168)
        assert result == pytest.approx(595.24, abs=0.01)

    def test_zero_hours_returns_none(self):
        assert calc_hourly_rate(120_000, 0) is None

    def test_zero_hours_float_returns_none(self):
        assert calc_hourly_rate(120_000, 0.0) is None

    def test_zero_total_with_hours(self):
        assert calc_hourly_rate(0, 160) == 0.0

    def test_both_zero_returns_none(self):
        assert calc_hourly_rate(0, 0) is None


# ---------------------------------------------------------------------------
# DB: get_working_hours_map
# ---------------------------------------------------------------------------

class TestGetWorkingHoursMap:
    def test_empty_returns_empty_dict(self, db):
        result = get_working_hours_map(db, 2024)
        assert result == {}

    def test_returns_correct_map(self, db):
        db.add(WorkingHoursYearMonth(year=2024, month=1, hours=160))
        db.add(WorkingHoursYearMonth(year=2024, month=6, hours=168))
        db.commit()

        result = get_working_hours_map(db, 2024)
        assert result[1] == 160.0
        assert result[6] == 168.0
        assert 2 not in result

    def test_different_year_not_returned(self, db):
        db.add(WorkingHoursYearMonth(year=2023, month=1, hours=160))
        db.commit()

        result = get_working_hours_map(db, 2024)
        assert result == {}


# ---------------------------------------------------------------------------
# Service: build_list_item with hours_map
# ---------------------------------------------------------------------------

class TestBuildListItemHourlyRates:
    def _reload(self, db, emp_id):
        return db.query(Employee).options(joinedload(Employee.salary_records)).filter(Employee.id == emp_id).first()

    def test_hourly_rates_returned_when_hours_map_set(self, db, make_employee, make_salary):
        from app.services.employees_service import build_list_item
        emp = make_employee()
        make_salary(emp, year=2024, month=1, salary=120_000, kpi=0, fixed=0, one_time=0)
        make_salary(emp, year=2024, month=6, salary=160_000, kpi=0, fixed=0, one_time=0)

        emp_loaded = self._reload(db, emp.id)
        hours_map = {1: 160.0, 6: 168.0}
        item = build_list_item(emp_loaded, year=2024, month=1, hours_map=hours_map)

        assert item.monthly_hourly_rates is not None
        assert len(item.monthly_hourly_rates) == 12
        assert item.monthly_hourly_rates[0] == pytest.approx(750.0)
        assert item.monthly_hourly_rates[5] == pytest.approx(160_000 / 168, abs=0.01)
        assert item.monthly_hourly_rates[1] is None  # no record for Feb

    def test_no_hours_map_means_none_field(self, db, make_employee, make_salary):
        from app.services.employees_service import build_list_item
        emp = make_employee()
        make_salary(emp, year=2024, month=1, salary=120_000, kpi=0, fixed=0, one_time=0)

        emp_loaded = self._reload(db, emp.id)
        item = build_list_item(emp_loaded, year=2024, month=1, hours_map=None)
        assert item.monthly_hourly_rates is None

    def test_zero_hours_gives_none_in_month(self, db, make_employee, make_salary):
        from app.services.employees_service import build_list_item
        emp = make_employee()
        make_salary(emp, year=2024, month=1, salary=120_000, kpi=0, fixed=0, one_time=0)

        emp_loaded = self._reload(db, emp.id)
        item = build_list_item(emp_loaded, year=2024, month=1, hours_map={1: 0.0})
        assert item.monthly_hourly_rates[0] is None


# ---------------------------------------------------------------------------
# API: GET /employees includes monthly_hourly_rates
# ---------------------------------------------------------------------------

class TestEmployeesAPIHourlyRates:
    def test_list_with_working_hours_includes_rates(self, authed_client, db, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=3, salary=120_000, kpi=0, fixed=0, one_time=0)

        db.add(WorkingHoursYearMonth(year=2024, month=3, hours=160))
        db.commit()

        r = authed_client.get("/employees?year=2024&month=3")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        hr_list = data[0].get("monthly_hourly_rates")
        assert hr_list is not None
        assert hr_list[2] == pytest.approx(750.0)

    def test_list_without_working_hours_gives_none_rates(self, authed_client, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=3, salary=120_000, kpi=0, fixed=0, one_time=0)

        r = authed_client.get("/employees?year=2024&month=3")
        assert r.status_code == 200
        data = r.json()
        assert data[0].get("monthly_hourly_rates") is None


# ---------------------------------------------------------------------------
# API: GET /projects/{id}/employees includes monthly_hourly_rates
# ---------------------------------------------------------------------------

class TestProjectEmployeesAPIHourlyRates:
    def test_project_employees_include_hourly_rates(
        self, authed_client, db, make_employee, make_project, make_assignment, make_salary
    ):
        emp = make_employee()
        proj = make_project()
        make_assignment(emp, proj, rate=1.0)
        make_salary(emp, year=2024, month=1, salary=120_000, kpi=0, fixed=0, one_time=0)

        db.add(WorkingHoursYearMonth(year=2024, month=1, hours=160))
        db.commit()

        r = authed_client.get(f"/projects/{proj.id}/employees?year=2024")
        assert r.status_code == 200
        members = r.json()
        assert len(members) == 1
        hr = members[0].get("monthly_hourly_rates")
        assert hr is not None
        assert len(hr) == 12
        assert hr[0] == pytest.approx(750.0)

    def test_project_employees_no_hours_all_none(
        self, authed_client, db, make_employee, make_project, make_assignment, make_salary
    ):
        emp = make_employee()
        proj = make_project()
        make_assignment(emp, proj, rate=1.0)
        make_salary(emp, year=2024, month=1, salary=120_000, kpi=0, fixed=0, one_time=0)

        r = authed_client.get(f"/projects/{proj.id}/employees?year=2024")
        assert r.status_code == 200
        hr = r.json()[0].get("monthly_hourly_rates")
        assert hr is not None
        assert all(v is None for v in hr)
