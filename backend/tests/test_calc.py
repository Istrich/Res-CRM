"""
Tests for app/services/calc.py

Covers all business rules from the spec:
- employee_active_in_month edge cases
- salary fallback chain
- monthly cost calculation
- rate distribution
- budget status thresholds
- forecast logic
"""
from datetime import date

import pytest
from freezegun import freeze_time

from app.models import Employee, SalaryRecord
from app.services.calc import (
    _month_end,
    _month_start,
    calc_employee_month_cost,
    calc_project_month_cost,
    employee_active_in_month,
    get_project_budget_summary,
    get_salary_for_month,
    recalculate_year,
)


# ---------------------------------------------------------------------------
# _month_start / _month_end
# ---------------------------------------------------------------------------

class TestMonthBounds:
    def test_start_regular(self):
        assert _month_start(2024, 3) == date(2024, 3, 1)

    def test_end_regular(self):
        assert _month_end(2024, 3) == date(2024, 3, 31)

    def test_end_february_leap(self):
        assert _month_end(2024, 2) == date(2024, 2, 29)

    def test_end_february_non_leap(self):
        assert _month_end(2023, 2) == date(2023, 2, 28)

    def test_end_december(self):
        assert _month_end(2024, 12) == date(2024, 12, 31)

    def test_end_april(self):
        assert _month_end(2024, 4) == date(2024, 4, 30)


# ---------------------------------------------------------------------------
# employee_active_in_month
# ---------------------------------------------------------------------------

class TestEmployeeActiveInMonth:
    """All edge cases from spec section 4.4 and 4.5."""

    def _emp(self, hire=None, term=None):
        e = Employee(title="Dev")
        e.hire_date = hire
        e.termination_date = term
        return e

    def test_active_no_dates(self):
        assert employee_active_in_month(self._emp(), 2024, 6) is True

    def test_active_hired_before_month(self):
        assert employee_active_in_month(self._emp(hire=date(2024, 1, 1)), 2024, 6) is True

    def test_active_hired_first_day_of_month(self):
        assert employee_active_in_month(self._emp(hire=date(2024, 6, 1)), 2024, 6) is True

    def test_active_hired_last_day_of_month(self):
        assert employee_active_in_month(self._emp(hire=date(2024, 6, 30)), 2024, 6) is True

    def test_inactive_hired_next_month(self):
        assert employee_active_in_month(self._emp(hire=date(2024, 7, 1)), 2024, 6) is False

    def test_inactive_hired_after_month_end(self):
        assert employee_active_in_month(self._emp(hire=date(2024, 7, 15)), 2024, 6) is False

    # Termination rules (spec: terminated on 1st = not working that month)
    def test_inactive_terminated_on_first(self):
        """Terminated 1st of month → not active that month."""
        assert employee_active_in_month(self._emp(hire=date(2024, 1, 1), term=date(2024, 6, 1)), 2024, 6) is False

    def test_active_terminated_on_second(self):
        """Terminated 2nd of month → full month cost (active)."""
        assert employee_active_in_month(self._emp(hire=date(2024, 1, 1), term=date(2024, 6, 2)), 2024, 6) is True

    def test_active_terminated_mid_month(self):
        """Terminated 15th → active (full month billed)."""
        assert employee_active_in_month(self._emp(hire=date(2024, 1, 1), term=date(2024, 6, 15)), 2024, 6) is True

    def test_active_terminated_last_day(self):
        assert employee_active_in_month(self._emp(hire=date(2024, 1, 1), term=date(2024, 6, 30)), 2024, 6) is True

    def test_inactive_terminated_previous_month(self):
        assert employee_active_in_month(self._emp(hire=date(2024, 1, 1), term=date(2024, 5, 31)), 2024, 6) is False

    def test_inactive_terminated_prev_month_last_day(self):
        """Last day of May = before June 1st → June not billed."""
        assert employee_active_in_month(self._emp(hire=date(2024, 1, 1), term=date(2024, 5, 31)), 2024, 6) is False

    def test_future_termination_still_active_now(self):
        """Future termination date → still active."""
        assert employee_active_in_month(self._emp(hire=date(2024, 1, 1), term=date(2025, 12, 31)), 2024, 6) is True

    def test_december_boundary(self):
        assert employee_active_in_month(self._emp(hire=date(2024, 12, 31)), 2024, 12) is True
        assert employee_active_in_month(self._emp(hire=date(2025, 1, 1)), 2024, 12) is False


# ---------------------------------------------------------------------------
# get_salary_for_month — fallback chain
# ---------------------------------------------------------------------------

class TestGetSalaryForMonth:
    def test_exact_match(self, db, make_employee, make_salary):
        emp = make_employee()
        rec = make_salary(emp, year=2024, month=6, salary=120_000)
        make_salary(emp, year=2024, month=3, salary=100_000)

        result = get_salary_for_month(db, emp.id, 2024, 6)
        assert result is not None
        assert float(result.salary) == 120_000

    def test_fallback_to_earlier_same_year(self, db, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=1, salary=100_000)
        make_salary(emp, year=2024, month=4, salary=110_000)

        # Month 7 has no record — should get April (most recent before July)
        result = get_salary_for_month(db, emp.id, 2024, 7)
        assert result is not None
        assert float(result.salary) == 110_000

    def test_fallback_picks_most_recent(self, db, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=1, salary=90_000)
        make_salary(emp, year=2024, month=3, salary=100_000)
        make_salary(emp, year=2024, month=6, salary=110_000)

        result = get_salary_for_month(db, emp.id, 2024, 9)
        assert float(result.salary) == 110_000

    def test_fallback_to_previous_year(self, db, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2023, month=12, salary=95_000)

        result = get_salary_for_month(db, emp.id, 2024, 3)
        assert result is not None
        assert float(result.salary) == 95_000

    def test_fallback_previous_year_most_recent(self, db, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2022, month=6, salary=80_000)
        make_salary(emp, year=2023, month=9, salary=90_000)

        result = get_salary_for_month(db, emp.id, 2024, 1)
        assert float(result.salary) == 90_000

    def test_no_records_returns_none(self, db, make_employee):
        emp = make_employee()
        result = get_salary_for_month(db, emp.id, 2024, 6)
        assert result is None

    def test_future_month_fallback(self, db, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=6, salary=120_000)

        result = get_salary_for_month(db, emp.id, 2024, 12)
        assert float(result.salary) == 120_000


# ---------------------------------------------------------------------------
# calc_employee_month_cost
# ---------------------------------------------------------------------------

class TestCalcEmployeeMonthCost:
    def test_all_components_summed(self, db, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=1, salary=100_000, kpi=10_000, fixed=5_000, one_time=3_000)

        cost = calc_employee_month_cost(db, emp, 2024, 1)
        assert cost == 118_000

    def test_inactive_employee_zero_cost(self, db, make_employee, make_salary):
        emp = make_employee(hire_date=date(2024, 3, 1))
        make_salary(emp, year=2024, month=1, salary=100_000)

        cost = calc_employee_month_cost(db, emp, 2024, 1)
        assert cost == 0.0

    def test_no_salary_record_zero_cost(self, db, make_employee):
        emp = make_employee()
        cost = calc_employee_month_cost(db, emp, 2024, 1)
        assert cost == 0.0

    def test_terminated_on_first_zero_cost(self, db, make_employee, make_salary):
        emp = make_employee(termination_date=date(2024, 6, 1))
        make_salary(emp, year=2024, month=1, salary=100_000)

        cost = calc_employee_month_cost(db, emp, 2024, 6)
        assert cost == 0.0

    def test_terminated_mid_month_full_cost(self, db, make_employee, make_salary):
        """Mid-month termination → full month billed."""
        emp = make_employee(termination_date=date(2024, 6, 15))
        make_salary(emp, year=2024, month=6, salary=100_000, kpi=0, fixed=0, one_time=0)

        cost = calc_employee_month_cost(db, emp, 2024, 6)
        assert cost == 100_000

    def test_uses_fallback_salary(self, db, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=1, salary=100_000, kpi=5_000, fixed=0, one_time=0)

        # Month 6 has no record — uses January
        cost = calc_employee_month_cost(db, emp, 2024, 6)
        assert cost == 105_000

    def test_one_time_bonus_included(self, db, make_employee, make_salary):
        emp = make_employee()
        make_salary(emp, year=2024, month=3, salary=100_000, kpi=0, fixed=0, one_time=50_000)

        cost = calc_employee_month_cost(db, emp, 2024, 3)
        assert cost == 150_000


# ---------------------------------------------------------------------------
# calc_project_month_cost — rate distribution
# ---------------------------------------------------------------------------

class TestCalcProjectMonthCost:
    def test_full_rate(self, db, full_setup):
        proj = full_setup["project"]
        cost = calc_project_month_cost(db, proj.id, 2024, 1)
        # 100k salary + 10k kpi + 5k fixed = 115k * 1.0
        assert cost == 115_000.0

    def test_partial_rate(self, db, make_budget_project, make_project, make_employee,
                          make_assignment, make_salary):
        bp = make_budget_project()
        proj_a = make_project(name="A", budget_project=bp)
        proj_b = make_project(name="B", budget_project=bp)
        emp = make_employee()

        make_assignment(emp, proj_a, rate=0.7)
        make_assignment(emp, proj_b, rate=0.3)
        make_salary(emp, year=2024, month=1, salary=200_000, kpi=0, fixed=0, one_time=0)

        cost_a = calc_project_month_cost(db, proj_a.id, 2024, 1)
        cost_b = calc_project_month_cost(db, proj_b.id, 2024, 1)

        assert cost_a == 140_000.0
        assert cost_b == 60_000.0
        assert cost_a + cost_b == 200_000.0

    def test_multiple_employees(self, db, make_budget_project, make_project,
                                make_employee, make_assignment, make_salary):
        bp = make_budget_project()
        proj = make_project(budget_project=bp)

        emp1 = make_employee(first_name="A")
        emp2 = make_employee(first_name="B")

        make_assignment(emp1, proj, rate=1.0)
        make_assignment(emp2, proj, rate=1.0)
        make_salary(emp1, year=2024, month=1, salary=100_000, kpi=0, fixed=0, one_time=0)
        make_salary(emp2, year=2024, month=1, salary=80_000, kpi=0, fixed=0, one_time=0)

        cost = calc_project_month_cost(db, proj.id, 2024, 1)
        assert cost == 180_000.0

    def test_assignment_period_respected(self, db, make_budget_project, make_project,
                                         make_employee, make_assignment, make_salary):
        """Employee only counts in months where assignment is active."""
        bp = make_budget_project()
        proj = make_project(budget_project=bp)
        emp = make_employee()

        # Assignment starts in March
        make_assignment(emp, proj, rate=1.0, valid_from=date(2024, 3, 1))
        make_salary(emp, year=2024, month=1, salary=100_000, kpi=0, fixed=0, one_time=0)

        assert calc_project_month_cost(db, proj.id, 2024, 2) == 0.0
        assert calc_project_month_cost(db, proj.id, 2024, 3) == 100_000.0

    def test_assignment_end_date_respected(self, db, make_budget_project, make_project,
                                            make_employee, make_assignment, make_salary):
        bp = make_budget_project()
        proj = make_project(budget_project=bp)
        emp = make_employee()

        # Assignment ends in March
        make_assignment(emp, proj, rate=1.0, valid_from=date(2024, 1, 1), valid_to=date(2024, 3, 31))
        make_salary(emp, year=2024, month=1, salary=100_000, kpi=0, fixed=0, one_time=0)

        assert calc_project_month_cost(db, proj.id, 2024, 3) == 100_000.0
        assert calc_project_month_cost(db, proj.id, 2024, 4) == 0.0

    def test_rate_above_one(self, db, make_budget_project, make_project,
                            make_employee, make_assignment, make_salary):
        """Rate > 1.0 is allowed per spec."""
        bp = make_budget_project()
        proj = make_project(budget_project=bp)
        emp = make_employee()
        make_assignment(emp, proj, rate=1.5)
        make_salary(emp, year=2024, month=1, salary=100_000, kpi=0, fixed=0, one_time=0)

        cost = calc_project_month_cost(db, proj.id, 2024, 1)
        assert cost == 150_000.0

    def test_empty_project_zero_cost(self, db, make_budget_project, make_project):
        bp = make_budget_project()
        proj = make_project(budget_project=bp)
        assert calc_project_month_cost(db, proj.id, 2024, 1) == 0.0


# ---------------------------------------------------------------------------
# recalculate_year
# ---------------------------------------------------------------------------

class TestRecalculateYear:
    @freeze_time("2024-06-15")
    def test_creates_snapshots(self, db, full_setup):
        from app.models import BudgetSnapshot
        proj = full_setup["project"]

        result = recalculate_year(db, 2024)

        assert result["projects_updated"] == 1
        assert result["snapshots_updated"] == 12

        snapshots = db.query(BudgetSnapshot).filter(
            BudgetSnapshot.project_id == proj.id,
            BudgetSnapshot.year == 2024,
        ).all()
        assert len(snapshots) == 12

    @freeze_time("2024-06-15")
    def test_past_months_not_forecast(self, db, full_setup):
        from app.models import BudgetSnapshot
        proj = full_setup["project"]
        recalculate_year(db, 2024)

        jan = db.query(BudgetSnapshot).filter(
            BudgetSnapshot.project_id == proj.id,
            BudgetSnapshot.year == 2024,
            BudgetSnapshot.month == 1,
        ).first()
        assert jan.is_forecast is False

    @freeze_time("2024-06-15")
    def test_future_months_are_forecast(self, db, full_setup):
        from app.models import BudgetSnapshot
        proj = full_setup["project"]
        recalculate_year(db, 2024)

        dec = db.query(BudgetSnapshot).filter(
            BudgetSnapshot.project_id == proj.id,
            BudgetSnapshot.year == 2024,
            BudgetSnapshot.month == 12,
        ).first()
        assert dec.is_forecast is True

    @freeze_time("2024-06-15")
    def test_amounts_correct(self, db, full_setup):
        from app.models import BudgetSnapshot
        proj = full_setup["project"]
        recalculate_year(db, 2024)

        jan = db.query(BudgetSnapshot).filter(
            BudgetSnapshot.project_id == proj.id,
            BudgetSnapshot.year == 2024,
            BudgetSnapshot.month == 1,
        ).first()
        # 100k + 10k kpi + 5k fixed = 115k
        assert float(jan.amount) == 115_000.0

    @freeze_time("2024-06-15")
    def test_idempotent_recalculation(self, db, full_setup):
        """Running twice should give same result, not double-count."""
        from app.models import BudgetSnapshot
        proj = full_setup["project"]

        recalculate_year(db, 2024)
        recalculate_year(db, 2024)

        snapshots = db.query(BudgetSnapshot).filter(
            BudgetSnapshot.project_id == proj.id,
            BudgetSnapshot.year == 2024,
        ).all()
        assert len(snapshots) == 12  # not 24


# ---------------------------------------------------------------------------
# get_project_budget_summary
# ---------------------------------------------------------------------------

class TestGetProjectBudgetSummary:
    @freeze_time("2024-06-15")
    def test_status_ok(self, db, full_setup):
        """Total forecast (115k × 12 = 1.38M) < budget (1.5M) → ok."""
        proj = full_setup["project"]
        recalculate_year(db, 2024)

        summary = get_project_budget_summary(db, proj.id, 2024)
        assert summary["status"] == "ok"
        assert summary["forecast"] == pytest.approx(1_380_000.0)

    @freeze_time("2024-06-15")
    def test_status_overrun(self, db, make_budget_project, make_project,
                             make_employee, make_assignment, make_salary):
        bp = make_budget_project(total_budget=500_000)  # Small budget
        proj = make_project(budget_project=bp)
        emp = make_employee()
        make_assignment(emp, proj, rate=1.0)
        for m in range(1, 13):
            make_salary(emp, year=2024, month=m, salary=100_000, kpi=0, fixed=0, one_time=0)

        recalculate_year(db, 2024)
        summary = get_project_budget_summary(db, proj.id, 2024)
        assert summary["status"] == "overrun"

    @freeze_time("2024-06-15")
    def test_status_warning(self, db, make_budget_project, make_project,
                             make_employee, make_assignment, make_salary):
        # Budget is just above 90% threshold
        # 115k * 12 = 1.38M → warning if budget is ~1.4M (1.38 > 1.4*0.9=1.26)
        bp = make_budget_project(total_budget=1_400_000)
        proj = make_project(budget_project=bp)
        emp = make_employee()
        make_assignment(emp, proj, rate=1.0)
        for m in range(1, 13):
            make_salary(emp, year=2024, month=m, salary=100_000, kpi=10_000, fixed=5_000, one_time=0)

        recalculate_year(db, 2024)
        summary = get_project_budget_summary(db, proj.id, 2024)
        assert summary["status"] == "warning"

    @freeze_time("2024-06-15")
    def test_remaining_calculated(self, db, full_setup):
        proj = full_setup["project"]
        bp = full_setup["budget_project"]
        recalculate_year(db, 2024)

        summary = get_project_budget_summary(db, proj.id, 2024)
        expected_remaining = float(bp.total_budget) - summary["forecast"]
        assert summary["remaining"] == pytest.approx(expected_remaining)

    def test_no_budget_no_status(self, db, make_project, make_budget_project):
        bp = make_budget_project(total_budget=None)
        proj = make_project(budget_project=bp)
        summary = get_project_budget_summary(db, proj.id, 2024)
        assert summary["status"] == "ok"
        assert summary["remaining"] is None
