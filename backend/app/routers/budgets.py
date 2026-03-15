import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import BudgetProject, BudgetSnapshot, Project, User
from app.services.calc import (
    get_budget_project_summary,
    get_project_budget_summary,
    recalculate_year,
)

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.post("/recalculate")
def recalculate(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Trigger full recalculation of all budget snapshots for a year."""
    result = recalculate_year(db, year)
    return result


@router.get("/last-calculated")
def last_calculated(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    snap = (
        db.query(BudgetSnapshot)
        .filter(BudgetSnapshot.year == year)
        .order_by(BudgetSnapshot.calculated_at.desc())
        .first()
    )
    return {"calculated_at": snap.calculated_at if snap else None}


@router.get("/projects/{project_id}")
def project_budget(
    project_id: uuid.UUID,
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    summary = get_project_budget_summary(db, project_id, year)

    # Monthly breakdown from snapshots
    snapshots = (
        db.query(BudgetSnapshot)
        .filter(BudgetSnapshot.project_id == project_id, BudgetSnapshot.year == year)
        .order_by(BudgetSnapshot.month)
        .all()
    )

    monthly = [
        {
            "month": s.month,
            "amount": float(s.amount),
            "is_forecast": s.is_forecast,
            "calculated_at": s.calculated_at,
        }
        for s in snapshots
    ]

    return {
        "project_id": str(project_id),
        "project_name": proj.name,
        "year": year,
        **summary,
        "monthly": monthly,
    }


@router.get("/budget-projects/{bp_id}")
def budget_project_budget(
    bp_id: uuid.UUID,
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    bp = db.query(BudgetProject).filter(BudgetProject.id == bp_id).first()
    if not bp:
        raise HTTPException(status_code=404, detail="Budget project not found")

    summary = get_budget_project_summary(db, bp_id, year)

    # Per-project breakdown
    projects_detail = []
    for proj in bp.projects:
        psummary = get_project_budget_summary(db, proj.id, year)
        projects_detail.append({
            "project_id": str(proj.id),
            "project_name": proj.name,
            **psummary,
        })

    return {
        "budget_project_id": str(bp_id),
        "budget_project_name": bp.name,
        "year": year,
        "total_budget": float(bp.total_budget) if bp.total_budget else None,
        **summary,
        "projects": projects_detail,
    }


@router.get("/overview")
def budget_overview(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """High-level overview: all projects and budget projects for a year."""
    projects = db.query(Project).all()
    bps = db.query(BudgetProject).filter(BudgetProject.year == year).all()

    projects_out = []
    for proj in projects:
        summary = get_project_budget_summary(db, proj.id, year)
        projects_out.append({
            "project_id": str(proj.id),
            "project_name": proj.name,
            "budget_project_name": proj.budget_project.name if proj.budget_project else None,
            **summary,
        })

    bps_out = []
    for bp in bps:
        summary = get_budget_project_summary(db, bp.id, year)
        bps_out.append({
            "budget_project_id": str(bp.id),
            "budget_project_name": bp.name,
            "total_budget": float(bp.total_budget) if bp.total_budget else None,
            **summary,
        })

    total_spent = sum(p["spent"] for p in projects_out)
    total_forecast = sum(p["forecast"] for p in projects_out)

    return {
        "year": year,
        "total_spent": total_spent,
        "total_forecast": total_forecast,
        "projects": projects_out,
        "budget_projects": bps_out,
    }
