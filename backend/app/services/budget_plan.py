"""
Monthly budget plan: get/set plan per budget project, aggregate fact from BudgetSnapshot.
"""

from sqlalchemy.orm import Session

from app.models import (
    BudgetProject,
    BudgetProjectMonthPlan,
    BudgetSnapshot,
    Project,
    ProjectMonthPlan,
)


def get_budget_project_month_plan(db: Session, budget_project_id, year: int) -> list[dict]:
    """
    Return 12 items {month, amount} for the given budget project and year.
    Missing months default to 0.
    """
    plans = (
        db.query(BudgetProjectMonthPlan)
        .filter(
            BudgetProjectMonthPlan.budget_project_id == budget_project_id,
            BudgetProjectMonthPlan.year == year,
        )
        .order_by(BudgetProjectMonthPlan.month)
        .all()
    )
    by_month = {p.month: float(p.amount) for p in plans}
    return [{"month": m, "amount": by_month.get(m, 0.0)} for m in range(1, 13)]


def set_budget_project_month_plan(
    db: Session, budget_project_id, year: int, items: list[dict]
) -> list[dict]:
    """
    Replace month plan for (budget_project_id, year). items: list of {month, amount}, 1-12.
    Updates BudgetProject.total_budget to sum of amounts.
    Returns the saved plan as list of 12 items.
    """
    bp = db.get(BudgetProject, budget_project_id)
    if not bp:
        return []

    # Normalize: 12 months, month 1..12
    by_month = {i + 1: 0.0 for i in range(12)}
    for it in items:
        m = it.get("month")
        if isinstance(m, int) and 1 <= m <= 12:
            by_month[m] = float(it.get("amount", 0) or 0)

    # Delete existing plans for this bp/year
    db.query(BudgetProjectMonthPlan).filter(
        BudgetProjectMonthPlan.budget_project_id == budget_project_id,
        BudgetProjectMonthPlan.year == year,
    ).delete()

    total = 0.0
    for month in range(1, 13):
        amount = by_month[month]
        total += amount
        db.add(
            BudgetProjectMonthPlan(
                budget_project_id=budget_project_id,
                year=year,
                month=month,
                amount=amount,
            )
        )

    bp.total_budget = total
    db.commit()
    return get_budget_project_month_plan(db, budget_project_id, year)


def get_budget_project_month_fact(db: Session, budget_project_id, year: int) -> list[dict]:
    """
    Aggregate monthly amounts from BudgetSnapshot for all projects in this budget project.
    Returns 12 items {month, amount} (fact: sum of amount where is_forecast=False per month).
    """
    bp = db.get(BudgetProject, budget_project_id)
    if not bp:
        return [{"month": m, "amount": 0.0} for m in range(1, 13)]

    project_ids = [p.id for p in bp.projects]
    if not project_ids:
        return [{"month": m, "amount": 0.0} for m in range(1, 13)]

    # Sum amount per month (all snapshots: fact + forecast) for comparison with plan
    from sqlalchemy import func

    rows = (
        db.query(BudgetSnapshot.month, func.sum(BudgetSnapshot.amount).label("total"))
        .filter(
            BudgetSnapshot.project_id.in_(project_ids),
            BudgetSnapshot.year == year,
        )
        .group_by(BudgetSnapshot.month)
        .all()
    )
    by_month = {r.month: float(r.total) for r in rows}
    return [{"month": m, "amount": by_month.get(m, 0.0)} for m in range(1, 13)]


def get_project_own_month_plan(db: Session, project_id, year: int) -> list[dict] | None:
    """
    Return 12 items {month, amount} for project's own plan, if exists.
    """
    plans = (
        db.query(ProjectMonthPlan)
        .filter(
            ProjectMonthPlan.project_id == project_id,
            ProjectMonthPlan.year == year,
        )
        .order_by(ProjectMonthPlan.month)
        .all()
    )
    if not plans:
        return None
    by_month = {p.month: float(p.amount) for p in plans}
    return [{"month": m, "amount": by_month.get(m, 0.0)} for m in range(1, 13)]


def set_project_own_month_plan(
    db: Session,
    project_id,
    year: int,
    items: list[dict],
) -> list[dict]:
    """
    Replace month plan for (project_id, year). items: list of {month, amount}, 1-12.
    Returns the saved plan as list of 12 items.
    """
    project = db.get(Project, project_id)
    if not project:
        return []

    by_month = {i + 1: 0.0 for i in range(12)}
    for it in items:
        m = it.get("month")
        if isinstance(m, int) and 1 <= m <= 12:
            by_month[m] = float(it.get("amount", 0) or 0)

    db.query(ProjectMonthPlan).filter(
        ProjectMonthPlan.project_id == project_id,
        ProjectMonthPlan.year == year,
    ).delete()

    for month in range(1, 13):
        amount = by_month[month]
        db.add(
            ProjectMonthPlan(
                project_id=project_id,
                year=year,
                month=month,
                amount=amount,
            )
        )

    db.commit()
    return get_project_own_month_plan(db, project_id, year)


def get_project_month_plan(db: Session, project_id, year: int) -> list[dict] | None:
    """
    Return 12 items {month, amount} for the project's effective plan.
    Priority:
    1) own project plan in ProjectMonthPlan;
    2) budget project plan if project belongs to a BudgetProject;
    3) None if nothing configured.
    """
    own = get_project_own_month_plan(db, project_id, year)
    if own:
        return own

    project = db.get(Project, project_id)
    if not project or not project.budget_project_id:
        return None

    return get_budget_project_month_plan(db, project.budget_project_id, year)
