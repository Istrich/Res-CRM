import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import BudgetProject, User
from app.schemas.project import (
    BudgetProjectCreate,
    BudgetProjectMonthPlanIn,
    BudgetProjectMonthPlanOut,
    BudgetProjectOut,
    BudgetProjectUpdate,
    BudgetProjectWithStats,
)
from app.services.calc import get_budget_project_summary
from app.services.budget_plan import (
    get_budget_project_month_plan,
    set_budget_project_month_plan,
)

router = APIRouter(prefix="/budget-projects", tags=["budget-projects"])


@router.get("", response_model=list[BudgetProjectWithStats])
def list_budget_projects(
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(BudgetProject)
    if year:
        q = q.filter(BudgetProject.year == year)
    bps = q.order_by(BudgetProject.name).all()

    result = []
    for bp in bps:
        stats = get_budget_project_summary(db, bp.id, bp.year) if year else {}
        result.append(
            BudgetProjectWithStats(
                id=bp.id,
                name=bp.name,
                year=bp.year,
                total_budget=float(bp.total_budget) if bp.total_budget else None,
                created_at=bp.created_at,
                updated_at=bp.updated_at,
                projects_count=len(bp.projects),
                spent=stats.get("spent", 0),
                forecast=stats.get("forecast", 0),
                remaining=stats.get("remaining"),
                status=stats.get("status", "ok"),
            )
        )
    return result


@router.post("", response_model=BudgetProjectOut, status_code=status.HTTP_201_CREATED)
def create_budget_project(
    body: BudgetProjectCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    bp = BudgetProject(**body.model_dump())
    db.add(bp)
    db.commit()
    db.refresh(bp)
    if body.total_budget is not None and body.total_budget > 0:
        total = float(body.total_budget)
        per_month = round(total / 12, 2)
        rest = round(total - per_month * 12, 2)
        items_data = [
            {"month": m, "amount": per_month + (rest if m == 1 else 0)}
            for m in range(1, 13)
        ]
        set_budget_project_month_plan(db, bp.id, bp.year, items_data)
    return bp


@router.get("/{bp_id}/month-plan", response_model=BudgetProjectMonthPlanOut)
def get_budget_project_month_plan_route(
    bp_id: uuid.UUID,
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    bp = db.query(BudgetProject).filter(BudgetProject.id == bp_id).first()
    if not bp:
        raise HTTPException(status_code=404, detail="Budget project not found")
    items = get_budget_project_month_plan(db, bp_id, year)
    return BudgetProjectMonthPlanOut(items=items)


@router.put("/{bp_id}/month-plan", response_model=BudgetProjectMonthPlanOut)
def put_budget_project_month_plan(
    bp_id: uuid.UUID,
    year: int = Query(...),
    body: BudgetProjectMonthPlanIn = ...,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    bp = db.query(BudgetProject).filter(BudgetProject.id == bp_id).first()
    if not bp:
        raise HTTPException(status_code=404, detail="Budget project not found")
    items_data = [{"month": x.month, "amount": x.amount} for x in body.items]
    items = set_budget_project_month_plan(db, bp_id, year, items_data)
    return BudgetProjectMonthPlanOut(items=items)


@router.get("/{bp_id}", response_model=BudgetProjectWithStats)
def get_budget_project(
    bp_id: uuid.UUID,
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    bp = db.query(BudgetProject).filter(BudgetProject.id == bp_id).first()
    if not bp:
        raise HTTPException(status_code=404, detail="Budget project not found")

    use_year = year or bp.year
    stats = get_budget_project_summary(db, bp.id, use_year)

    return BudgetProjectWithStats(
        id=bp.id,
        name=bp.name,
        year=bp.year,
        total_budget=float(bp.total_budget) if bp.total_budget else None,
        created_at=bp.created_at,
        updated_at=bp.updated_at,
        projects_count=len(bp.projects),
        **stats,
    )


@router.patch("/{bp_id}", response_model=BudgetProjectOut)
def update_budget_project(
    bp_id: uuid.UUID,
    body: BudgetProjectUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    bp = db.query(BudgetProject).filter(BudgetProject.id == bp_id).first()
    if not bp:
        raise HTTPException(status_code=404, detail="Budget project not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(bp, field, value)

    db.commit()
    db.refresh(bp)
    return bp


@router.delete("/{bp_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget_project(
    bp_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    bp = db.query(BudgetProject).filter(BudgetProject.id == bp_id).first()
    if not bp:
        raise HTTPException(status_code=404, detail="Budget project not found")
    db.delete(bp)
    db.commit()
