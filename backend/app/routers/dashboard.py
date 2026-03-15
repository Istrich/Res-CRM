from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import BudgetSnapshot, Employee, EmployeeProject, Project, User
from app.services.calc import calc_employee_month_cost, employee_active_in_month

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Top-level KPIs: headcount, total spend, monthly totals."""
    today = date.today()

    employees = db.query(Employee).filter(Employee.is_position == False).all()  # noqa: E712
    positions = db.query(Employee).filter(Employee.is_position == True).all()   # noqa: E712

    # Active headcount = active on today
    active_count = sum(
        1 for e in employees
        if employee_active_in_month(e, today.year, today.month)
    )

    # Monthly spend from snapshots (fast path)
    from sqlalchemy import func
    monthly_rows = (
        db.query(BudgetSnapshot.month, func.sum(BudgetSnapshot.amount))
        .filter(BudgetSnapshot.year == year)
        .group_by(BudgetSnapshot.month)
        .order_by(BudgetSnapshot.month)
        .all()
    )
    monthly_spend = {row[0]: float(row[1]) for row in monthly_rows}

    return {
        "year": year,
        "employee_count": len(employees),
        "position_count": len(positions),
        "active_employee_count": active_count,
        "total_spend": sum(monthly_spend.values()),
        "monthly_spend": [
            {"month": m, "amount": monthly_spend.get(m, 0)}
            for m in range(1, 13)
        ],
    }


@router.get("/by-project")
def by_project(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from sqlalchemy import func
    rows = (
        db.query(
            BudgetSnapshot.project_id,
            func.sum(BudgetSnapshot.amount).label("total"),
        )
        .filter(BudgetSnapshot.year == year)
        .group_by(BudgetSnapshot.project_id)
        .all()
    )

    result = []
    for row in rows:
        proj = db.query(Project).get(row.project_id)
        if proj:
            result.append({
                "project_id": str(proj.id),
                "project_name": proj.name,
                "budget_project_name": proj.budget_project.name if proj.budget_project else None,
                "total": float(row.total),
            })

    return sorted(result, key=lambda x: x["total"], reverse=True)


@router.get("/by-department")
def by_department(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Spend grouped by employee department."""
    employees = db.query(Employee).all()
    dept_totals: dict[str, float] = {}

    for emp in employees:
        dept = emp.department or "Без подразделения"
        for month in range(1, 13):
            cost = calc_employee_month_cost(db, emp, year, month)
            if cost > 0:
                dept_totals[dept] = dept_totals.get(dept, 0) + cost

    return [
        {"department": dept, "total": round(total, 2)}
        for dept, total in sorted(dept_totals.items(), key=lambda x: x[1], reverse=True)
    ]


@router.get("/by-specialization")
def by_specialization(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    employees = db.query(Employee).all()
    spec_totals: dict[str, float] = {}

    for emp in employees:
        spec = emp.specialization or "Без специализации"
        for month in range(1, 13):
            cost = calc_employee_month_cost(db, emp, year, month)
            if cost > 0:
                spec_totals[spec] = spec_totals.get(spec, 0) + cost

    return [
        {"specialization": spec, "total": round(total, 2)}
        for spec, total in sorted(spec_totals.items(), key=lambda x: x[1], reverse=True)
    ]


@router.get("/movements")
def movements(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Monthly headcount movements:
    - hired (hire_date in this year/month)
    - terminated (termination_date in this year/month)
    - active (working during month)
    """
    employees = db.query(Employee).filter(Employee.is_position == False).all()  # noqa: E712

    result = []
    for month in range(1, 13):
        hired = []
        terminated = []
        active = []

        for emp in employees:
            ms = date(year, month, 1)
            if month == 12:
                me = date(year, 12, 31)
            else:
                me = date(year, month + 1, 1).__class__(year, month + 1, 1)
                import datetime
                me = me - datetime.timedelta(days=1)

            # Hired this month
            if emp.hire_date and emp.hire_date.year == year and emp.hire_date.month == month:
                hired.append({"id": str(emp.id), "name": emp.display_name})

            # Terminated this month
            if (
                emp.termination_date
                and emp.termination_date.year == year
                and emp.termination_date.month == month
            ):
                terminated.append({"id": str(emp.id), "name": emp.display_name})

            # Active
            if employee_active_in_month(emp, year, month):
                active.append({"id": str(emp.id), "name": emp.display_name})

        result.append({
            "month": month,
            "hired_count": len(hired),
            "hired": hired,
            "terminated_count": len(terminated),
            "terminated": terminated,
            "active_count": len(active),
        })

    return result


@router.get("/available-years")
def available_years(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return all years that have data."""
    from sqlalchemy import distinct
    from app.models import BudgetProject, SalaryRecord

    salary_years = [r[0] for r in db.query(distinct(SalaryRecord.year)).all()]
    bp_years = [r[0] for r in db.query(distinct(BudgetProject.year)).all()]
    snapshot_years = [r[0] for r in db.query(distinct(BudgetSnapshot.year)).all()]

    all_years = sorted(set(salary_years + bp_years + snapshot_years), reverse=True)
    current = date.today().year
    if current not in all_years:
        all_years.insert(0, current)

    return {"years": all_years, "current": current}
