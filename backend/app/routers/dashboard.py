from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import BudgetProject, BudgetProjectMonthPlan, BudgetSnapshot, Employee, EmployeeProject, Project, SalaryRecord, User
from app.services.calc import calc_employee_month_cost, employee_active_in_month
from app.services.budget_plan import get_budget_project_month_plan, get_budget_project_month_fact

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
        proj = db.get(Project, row.project_id)
        if proj:
            result.append({
                "project_id": str(proj.id),
                "project_name": proj.name,
                "budget_project_name": proj.budget_project.name if proj.budget_project else None,
                "total": float(row.total),
            })

    return sorted(result, key=lambda x: x["total"], reverse=True)


@router.get("/by-project-monthly")
def by_project_monthly(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Monthly plan vs fact for each project.
    Returns list of projects with monthly_plan[12] and monthly_fact[12].
    Uses BudgetSnapshot for fact, ProjectMonthPlan/BudgetProjectMonthPlan for plan.
    """
    from app.models import ProjectMonthPlan
    from app.services.budget_plan import get_project_month_plan

    projects = db.query(Project).all()

    # Load all snapshots for year at once
    all_snapshots = (
        db.query(BudgetSnapshot)
        .filter(BudgetSnapshot.year == year)
        .all()
    )
    snap_by_proj_month: dict[tuple, float] = {}
    for s in all_snapshots:
        snap_by_proj_month[(str(s.project_id), s.month)] = float(s.amount)

    result = []
    for proj in projects:
        monthly_fact = [snap_by_proj_month.get((str(proj.id), m), 0.0) for m in range(1, 13)]
        total_fact = sum(monthly_fact)

        # Plan: project-own plan or inherited from budget project
        plan_items = get_project_month_plan(db, proj.id, year)
        if plan_items:
            monthly_plan = [p["amount"] for p in plan_items]
        else:
            monthly_plan = None

        result.append({
            "project_id": str(proj.id),
            "project_name": proj.name,
            "budget_project_id": str(proj.budget_project_id) if proj.budget_project_id else None,
            "budget_project_name": proj.budget_project.name if proj.budget_project else None,
            "monthly_fact": monthly_fact,
            "monthly_plan": monthly_plan,
            "total_fact": round(total_fact, 2),
            "total_plan": round(sum(monthly_plan), 2) if monthly_plan else None,
        })

    # Sort by total fact descending
    result.sort(key=lambda x: x["total_fact"], reverse=True)
    return result


@router.get("/by-budget-project-monthly")
def by_budget_project_monthly(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Monthly plan vs fact for each budget project.
    Returns list with monthly_plan[12], monthly_fact[12], monthly_diff[12].
    """
    bps = db.query(BudgetProject).filter(BudgetProject.year == year).all()

    # Load all snapshots at once
    all_snapshots = (
        db.query(BudgetSnapshot)
        .filter(BudgetSnapshot.year == year)
        .all()
    )
    snap_by_proj_month: dict[tuple, float] = {}
    for s in all_snapshots:
        snap_by_proj_month[(str(s.project_id), s.month)] = float(s.amount)

    result = []
    for bp in bps:
        project_ids = [str(p.id) for p in bp.projects]

        # Fact: sum of snapshots across all projects in this bp
        monthly_fact = [
            sum(snap_by_proj_month.get((pid, m), 0.0) for pid in project_ids)
            for m in range(1, 13)
        ]

        # Plan: from BudgetProjectMonthPlan
        plan_items = get_budget_project_month_plan(db, bp.id, year)
        monthly_plan = [p["amount"] for p in plan_items]

        monthly_diff = [
            round(monthly_fact[i] - monthly_plan[i], 2)
            for i in range(12)
        ]

        total_fact = sum(monthly_fact)
        total_plan = sum(monthly_plan)

        result.append({
            "budget_project_id": str(bp.id),
            "budget_project_name": bp.name,
            "total_budget": float(bp.total_budget) if bp.total_budget else None,
            "monthly_plan": monthly_plan,
            "monthly_fact": monthly_fact,
            "monthly_diff": monthly_diff,
            "total_fact": round(total_fact, 2),
            "total_plan": round(total_plan, 2),
            "total_diff": round(total_fact - total_plan, 2),
            "projects_count": len(bp.projects),
        })

    result.sort(key=lambda x: x["total_fact"], reverse=True)
    return result


@router.get("/by-department")
def by_department(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Spend grouped by employee department.
    Note: Uses calc_employee_month_cost in loop (not BudgetSnapshot); snapshot is project-scoped.
    Future: EmployeeMonthSnapshot would allow reading from cache here. See docs/plans.
    """
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


@router.get("/by-department-monthly")
def by_department_monthly(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Monthly spend breakdown by department.
    Returns list of depts with monthly[12] costs and total.
    Note: O(employees x 12) calc_employee_month_cost calls — acceptable for typical CRM sizes.
    For large orgs consider EmployeeMonthSnapshot cache table (see docs/plans).
    """
    employees = db.query(Employee).all()

    # dept -> month -> cost
    dept_monthly: dict[str, list[float]] = {}

    for emp in employees:
        dept = emp.department or "Без подразделения"
        if dept not in dept_monthly:
            dept_monthly[dept] = [0.0] * 12
        for m in range(1, 13):
            cost = calc_employee_month_cost(db, emp, year, m)
            if cost > 0:
                dept_monthly[dept][m - 1] += cost

    result = []
    for dept, monthly in dept_monthly.items():
        total = sum(monthly)
        if total > 0:
            result.append({
                "department": dept,
                "monthly": [round(v, 2) for v in monthly],
                "total": round(total, 2),
            })

    result.sort(key=lambda x: x["total"], reverse=True)
    return result


@router.get("/by-specialization")
def by_specialization(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Spend grouped by specialization.
    Note: Uses calc_employee_month_cost in loop (not BudgetSnapshot). See docs/plans for cache option.
    """
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


@router.get("/by-specialization-monthly")
def by_specialization_monthly(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Monthly spend breakdown by specialization.
    Returns list of specs with monthly[12] costs and total.
    Note: O(employees x 12) calc_employee_month_cost calls.
    """
    employees = db.query(Employee).all()

    spec_monthly: dict[str, list[float]] = {}

    for emp in employees:
        spec = emp.specialization or "Без специализации"
        if spec not in spec_monthly:
            spec_monthly[spec] = [0.0] * 12
        for m in range(1, 13):
            cost = calc_employee_month_cost(db, emp, year, m)
            if cost > 0:
                spec_monthly[spec][m - 1] += cost

    result = []
    for spec, monthly in spec_monthly.items():
        total = sum(monthly)
        if total > 0:
            result.append({
                "specialization": spec,
                "monthly": [round(v, 2) for v in monthly],
                "total": round(total, 2),
            })

    result.sort(key=lambda x: x["total"], reverse=True)
    return result


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
    salary_years = [r[0] for r in db.query(distinct(SalaryRecord.year)).all()]
    bp_years = [r[0] for r in db.query(distinct(BudgetProject.year)).all()]
    snapshot_years = [r[0] for r in db.query(distinct(BudgetSnapshot.year)).all()]

    all_years = sorted(set(salary_years + bp_years + snapshot_years), reverse=True)
    current = date.today().year
    if current not in all_years:
        all_years.insert(0, current)

    return {"years": all_years, "current": current}
