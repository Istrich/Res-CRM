from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_summary(db, year)


@router.get("/by-project")
def by_project(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_by_project(db, year)


@router.get("/by-project-monthly")
def by_project_monthly(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_by_project_monthly(db, year)


@router.get("/by-budget-project-monthly")
def by_budget_project_monthly(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_by_budget_project_monthly(db, year)


@router.get("/by-department")
def by_department(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_by_department(db, year)


@router.get("/by-department-monthly")
def by_department_monthly(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_by_department_monthly(db, year)


@router.get("/by-specialization")
def by_specialization(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_by_specialization(db, year)


@router.get("/by-specialization-monthly")
def by_specialization_monthly(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_by_specialization_monthly(db, year)


@router.get("/movements")
def movements(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_movements(db, year)


@router.get("/hourly-rates")
def hourly_rates(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_hourly_rates(db, year)


@router.get("/available-years")
def available_years(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.get_available_years(db)
