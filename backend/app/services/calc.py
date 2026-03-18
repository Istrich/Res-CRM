"""
Budget calculation engine.

Rules:
- monthly_cost = salary + kpi_bonus + fixed_bonus + one_time_bonus
- employee is active in month if:
    hire_date <= last day of month  (or hire_date is null)
    termination_date > first day of month  (or termination_date is null)
    → termination on the 1st means NOT working that month
- project cost = monthly_cost * rate  (for active assignment in that month)
- forecast = actual (past months) + planned (future months based on latest salary)
"""

import logging
import time
import threading
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

logger = logging.getLogger(__name__)

# Debounce: don't recalculate the same year more often than once per 5 seconds
_RECALC_DEBOUNCE_SECONDS = 5
_last_recalc_time: dict[int, float] = {}
_debounce_lock = threading.Lock()

from sqlalchemy.orm import Session

from app.models import (
    AssignmentMonthRate,
    BudgetProject,
    BudgetSnapshot,
    Employee,
    EmployeeProject,
    Project,
    ProjectMonthPlan,
    SalaryRecord,
)


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


def _month_end(year: int, month: int) -> date:
    if month == 12:
        return date(year, 12, 31)
    return date(year, month + 1, 1) - timedelta(days=1)


def employee_active_in_month(emp: Employee, year: int, month: int) -> bool:
    """Return True if employee should be counted in given month."""
    ms = _month_start(year, month)
    me = _month_end(year, month)

    # Not hired yet
    if emp.hire_date and emp.hire_date > me:
        return False

    # Terminated on or before first day of month → not active
    if emp.termination_date and emp.termination_date <= ms:
        return False

    return True


def get_salary_for_month(db: Session, employee_id, year: int, month: int) -> tuple[SalaryRecord | None, bool]:
    """
    Return (salary record, is_exact).
    Exact month first; else fallback to most recent before that month (same year, then previous years).
    is_exact is True only when there is a record for the requested (year, month).
    Business rule: one_time_bonus does NOT carry forward on fallback — use is_exact in cost calc.
    """
    exact = (
        db.query(SalaryRecord)
        .filter(
            SalaryRecord.employee_id == employee_id,
            SalaryRecord.year == year,
            SalaryRecord.month == month,
        )
        .first()
    )
    if exact:
        return exact, True

    prev_same_year = (
        db.query(SalaryRecord)
        .filter(
            SalaryRecord.employee_id == employee_id,
            SalaryRecord.year == year,
            SalaryRecord.month < month,
        )
        .order_by(SalaryRecord.month.desc())
        .first()
    )
    if prev_same_year:
        return prev_same_year, False

    prev_year = (
        db.query(SalaryRecord)
        .filter(
            SalaryRecord.employee_id == employee_id,
            SalaryRecord.year < year,
        )
        .order_by(SalaryRecord.year.desc(), SalaryRecord.month.desc())
        .first()
    )
    return (prev_year, False) if prev_year else (None, False)


def assignment_active_in_month(asgn: EmployeeProject, year: int, month: int) -> bool:
    """Return True if assignment is active in the given month (valid_from/valid_to)."""
    ms = _month_start(year, month)
    me = _month_end(year, month)
    if asgn.valid_from > me:
        return False
    if asgn.valid_to is not None and asgn.valid_to < ms:
        return False
    return True


def get_assignments_for_month(db: Session, employee_id, year: int, month: int) -> list[EmployeeProject]:
    """Return all project assignments active during the given month."""
    ms = _month_start(year, month)
    me = _month_end(year, month)

    return (
        db.query(EmployeeProject)
        .filter(
            EmployeeProject.employee_id == employee_id,
            EmployeeProject.valid_from <= me,
            (EmployeeProject.valid_to == None) | (EmployeeProject.valid_to >= ms),  # noqa: E711
        )
        .all()
    )


def get_employee_month_total_rate(db: Session, employee_id, year: int, month: int) -> float:
    """
    Sum of rates across all project assignments of this employee in the given month.
    Uses AssignmentMonthRate override when present, else assignment.rate.
    """
    assignments = get_assignments_for_month(db, employee_id, year, month)
    total = 0.0
    for asgn in assignments:
        override = (
            db.query(AssignmentMonthRate)
            .filter(
                AssignmentMonthRate.assignment_id == asgn.id,
                AssignmentMonthRate.year == year,
                AssignmentMonthRate.month == month,
            )
            .first()
        )
        total += float(override.rate) if override else float(asgn.rate)
    return round(total, 2)


def calc_employee_month_cost(db: Session, emp: Employee, year: int, month: int) -> float:
    """Total compensation for employee in given month (gross). one_time_bonus does not carry forward on fallback."""
    if not employee_active_in_month(emp, year, month):
        return 0.0

    rec, is_exact = get_salary_for_month(db, emp.id, year, month)
    if not rec:
        return 0.0

    one_time = float(rec.one_time_bonus) if is_exact else 0.0
    return float(rec.salary) + float(rec.kpi_bonus) + float(rec.fixed_bonus) + one_time


def batch_employee_month_costs(
    db: Session, employee_ids: list, year: int
) -> dict[tuple, float]:
    """Load all SalaryRecords for a list of employees in one year in one query.

    Returns dict[(employee_id, month)] -> cost.
    Uses the same fallback chain as calc_employee_month_cost but in-memory,
    eliminating N+1 queries for dashboard group-by endpoints.
    """
    if not employee_ids:
        return {}

    # Fetch all salary records for the given employees + year + the latest prior year
    all_records = (
        db.query(SalaryRecord)
        .filter(
            SalaryRecord.employee_id.in_(employee_ids),
            SalaryRecord.year <= year,
        )
        .order_by(SalaryRecord.employee_id, SalaryRecord.year, SalaryRecord.month)
        .all()
    )

    # Build per-employee index: year -> month -> record
    from collections import defaultdict
    emp_records: dict = defaultdict(lambda: defaultdict(dict))
    for rec in all_records:
        emp_records[rec.employee_id][rec.year][rec.month] = rec

    # Fetch employees for active-in-month checks
    employees = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(employee_ids)).all()}

    result: dict[tuple, float] = {}
    for emp_id in employee_ids:
        emp = employees.get(emp_id)
        if emp is None:
            continue
        for month in range(1, 13):
            if not employee_active_in_month(emp, year, month):
                result[(emp_id, month)] = 0.0
                continue

            year_map = emp_records.get(emp_id, {})
            # Exact month
            rec = year_map.get(year, {}).get(month)
            is_exact = rec is not None

            if not is_exact:
                # Fallback: same year, earlier month
                same_year = year_map.get(year, {})
                prev_months = [m for m in same_year if m < month]
                if prev_months:
                    rec = same_year[max(prev_months)]
                else:
                    # Fallback: most recent prior year
                    prior_years = sorted([y for y in year_map if y < year], reverse=True)
                    for py in prior_years:
                        py_months = year_map.get(py, {})
                        if py_months:
                            rec = py_months[max(py_months.keys())]
                            break

            if rec is None:
                result[(emp_id, month)] = 0.0
                continue

            one_time = float(rec.one_time_bonus) if is_exact else 0.0
            cost = float(rec.salary) + float(rec.kpi_bonus) + float(rec.fixed_bonus) + one_time
            result[(emp_id, month)] = cost

    return result


def calc_project_month_cost(db: Session, project_id, year: int, month: int) -> float:
    """Sum of all employee costs attributed to a project in given month."""
    ms = _month_start(year, month)
    me = _month_end(year, month)

    assignments = (
        db.query(EmployeeProject)
        .filter(
            EmployeeProject.project_id == project_id,
            EmployeeProject.valid_from <= me,
            (EmployeeProject.valid_to == None) | (EmployeeProject.valid_to >= ms),  # noqa: E711
        )
        .all()
    )

    total = 0.0
    for asgn in assignments:
        emp = db.get(Employee, asgn.employee_id)
        if emp is None:
            continue
        emp_cost = calc_employee_month_cost(db, emp, year, month)
        rate_override = (
            db.query(AssignmentMonthRate)
            .filter(
                AssignmentMonthRate.assignment_id == asgn.id,
                AssignmentMonthRate.year == year,
                AssignmentMonthRate.month == month,
            )
            .first()
        )
        rate = float(rate_override.rate) if rate_override else float(asgn.rate)
        total += emp_cost * rate

    return round(total, 2)


def recalculate_year(db: Session, year: int) -> dict:
    """
    Recalculate all budget snapshots for a given year.
    Returns summary dict with counts.
    Loads existing snapshots in one query, then updates or creates in loop.
    """
    today = date.today()
    projects = db.query(Project).all()
    updated = 0

    # Load all snapshots for year in one query
    existing_snapshots = (
        db.query(BudgetSnapshot)
        .filter(BudgetSnapshot.year == year)
        .all()
    )
    snapshot_by_key: dict[tuple, BudgetSnapshot] = {
        (s.project_id, s.month): s for s in existing_snapshots
    }

    with db.no_autoflush:
        for project in projects:
            for month in range(1, 13):
                amount = calc_project_month_cost(db, project.id, year, month)
                is_forecast = (year > today.year) or (year == today.year and month >= today.month)

                key = (project.id, month)
                existing = snapshot_by_key.get(key)

                if existing:
                    existing.amount = amount
                    existing.is_forecast = is_forecast
                    existing.calculated_at = datetime.now(timezone.utc)
                else:
                    snapshot = BudgetSnapshot(
                        project_id=project.id,
                        year=year,
                        month=month,
                        amount=amount,
                        is_forecast=is_forecast,
                    )
                    db.add(snapshot)
                    snapshot_by_key[key] = snapshot

                updated += 1

    db.flush()
    db.commit()
    return {"year": year, "projects_updated": len(projects), "snapshots_updated": updated}


def maybe_recalculate_year_background(db_factory, year: int) -> None:
    """Trigger recalculate_year if the debounce window has passed.

    Intended for use with FastAPI BackgroundTasks. Acquires a per-year lock so
    concurrent HTTP requests don't produce duplicate work. db_factory should be
    a callable that returns a new Session (e.g. SessionLocal).
    """
    now = time.monotonic()
    with _debounce_lock:
        last = _last_recalc_time.get(year, 0)
        if now - last < _RECALC_DEBOUNCE_SECONDS:
            return
        _last_recalc_time[year] = now

    db = db_factory()
    try:
        recalculate_year(db, year)
        logger.info("Background recalculate completed for year %s", year)
    except Exception as exc:
        logger.warning("Background recalculate failed for year %s: %s", year, exc)
    finally:
        db.close()


def get_project_budget_summary(
    db: Session,
    project_id,
    year: int,
    project: Project | None = None,
) -> dict:
    """Return spent, forecast, remaining, status for a project.
    If project is passed, avoids extra SELECT for budget_project.
    """
    snapshots = (
        db.query(BudgetSnapshot)
        .filter(BudgetSnapshot.project_id == project_id, BudgetSnapshot.year == year)
        .all()
    )

    spent = sum(float(s.amount) for s in snapshots if not s.is_forecast)
    forecast_months = sum(float(s.amount) for s in snapshots if s.is_forecast)
    total_forecast = spent + forecast_months

    if project is None:
        project = db.get(Project, project_id)
    budget = None
    if project:
        # If project has its own month plan for this year, use sum of that plan
        own_rows = (
            db.query(ProjectMonthPlan)
            .filter(
                ProjectMonthPlan.project_id == project.id,
                ProjectMonthPlan.year == year,
            )
            .all()
        )
        if own_rows:
            budget = sum(float(r.amount) for r in own_rows)
        elif project.budget_project and project.budget_project.total_budget:
            # Fallback to envelope of budget project if there is no project-level plan
            budget = float(project.budget_project.total_budget)

    remaining = (budget - total_forecast) if budget is not None else None

    status = "ok"
    if budget is not None:
        if total_forecast > budget:
            status = "overrun"
        elif total_forecast > budget * 0.9:
            status = "warning"

    last_calc = max((s.calculated_at for s in snapshots), default=None)

    return {
        "spent": round(spent, 2),
        "forecast": round(total_forecast, 2),
        "remaining": round(remaining, 2) if remaining is not None else None,
        "status": status,
        "last_calculated_at": last_calc,
    }


def get_budget_project_summary(db: Session, budget_project_id, year: int) -> dict:
    """Aggregate budget summary across all projects in a budget project."""
    bp = db.get(BudgetProject, budget_project_id)
    if not bp:
        return {}

    total_spent = 0.0
    total_forecast = 0.0

    for project in bp.projects:
        summary = get_project_budget_summary(db, project.id, year)
        total_spent += summary["spent"]
        total_forecast += summary["forecast"]

    budget = float(bp.total_budget) if bp.total_budget else None
    remaining = (budget - total_forecast) if budget is not None else None

    status = "ok"
    if budget is not None:
        if total_forecast > budget:
            status = "overrun"
        elif total_forecast > budget * 0.9:
            status = "warning"

    return {
        "spent": round(total_spent, 2),
        "forecast": round(total_forecast, 2),
        "remaining": round(remaining, 2) if remaining is not None else None,
        "status": status,
    }
