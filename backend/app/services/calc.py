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

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import BudgetSnapshot, Employee, EmployeeProject, Project, SalaryRecord


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


def _month_end(year: int, month: int) -> date:
    if month == 12:
        return date(year, 12, 31)
    return date(year, month + 1, 1).__class__(year, month + 1, 1) - __import__("datetime").timedelta(days=1)


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


def get_salary_for_month(db: Session, employee_id, year: int, month: int) -> SalaryRecord | None:
    """
    Return salary record for the exact month, or fall back to the most recent
    record before that month (within the same year, then previous years).
    """
    # Exact match first
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
        return exact

    # Most recent before this month (same year)
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
        return prev_same_year

    # Most recent in previous years
    prev_year = (
        db.query(SalaryRecord)
        .filter(
            SalaryRecord.employee_id == employee_id,
            SalaryRecord.year < year,
        )
        .order_by(SalaryRecord.year.desc(), SalaryRecord.month.desc())
        .first()
    )
    return prev_year


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


def calc_employee_month_cost(db: Session, emp: Employee, year: int, month: int) -> float:
    """Total compensation for employee in given month (gross)."""
    if not employee_active_in_month(emp, year, month):
        return 0.0

    rec = get_salary_for_month(db, emp.id, year, month)
    if not rec:
        return 0.0

    return float(rec.salary) + float(rec.kpi_bonus) + float(rec.fixed_bonus) + float(rec.one_time_bonus)


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
        emp = db.query(Employee).get(asgn.employee_id)
        if emp is None:
            continue
        emp_cost = calc_employee_month_cost(db, emp, year, month)
        total += emp_cost * float(asgn.rate)

    return round(total, 2)


def recalculate_year(db: Session, year: int) -> dict:
    """
    Recalculate all budget snapshots for a given year.
    Returns summary dict with counts.
    """
    today = date.today()
    projects = db.query(Project).all()
    updated = 0

    for project in projects:
        for month in range(1, 13):
            amount = calc_project_month_cost(db, project.id, year, month)
            is_forecast = date(year, month, 1) > today

            existing = (
                db.query(BudgetSnapshot)
                .filter(
                    BudgetSnapshot.project_id == project.id,
                    BudgetSnapshot.year == year,
                    BudgetSnapshot.month == month,
                )
                .first()
            )

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

            updated += 1

    db.commit()
    return {"year": year, "projects_updated": len(projects), "snapshots_updated": updated}


def get_project_budget_summary(db: Session, project_id, year: int) -> dict:
    """Return spent, forecast, remaining, status for a project."""
    snapshots = (
        db.query(BudgetSnapshot)
        .filter(BudgetSnapshot.project_id == project_id, BudgetSnapshot.year == year)
        .all()
    )

    spent = sum(float(s.amount) for s in snapshots if not s.is_forecast)
    forecast_months = sum(float(s.amount) for s in snapshots if s.is_forecast)
    total_forecast = spent + forecast_months

    # Get budget from budget_project
    project = db.query(Project).get(project_id)
    budget = None
    if project and project.budget_project:
        budget = float(project.budget_project.total_budget) if project.budget_project.total_budget else None

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
    from app.models import BudgetProject
    bp = db.query(BudgetProject).get(budget_project_id)
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
