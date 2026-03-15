from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.services.export import (
    export_budget_projects,
    export_employees,
    export_payroll,
    export_projects_budget,
)

router = APIRouter(prefix="/exports", tags=["exports"])

EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _excel_response(buf, filename: str) -> StreamingResponse:
    return StreamingResponse(
        buf,
        media_type=EXCEL_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/employees")
def export_employees_xlsx(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    buf = export_employees(db, year)
    return _excel_response(buf, f"employees_{year}.xlsx")


@router.get("/projects-budget")
def export_projects_budget_xlsx(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    buf = export_projects_budget(db, year)
    return _excel_response(buf, f"projects_budget_{year}.xlsx")


@router.get("/budget-projects")
def export_budget_projects_xlsx(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    buf = export_budget_projects(db, year)
    return _excel_response(buf, f"budget_projects_{year}.xlsx")


@router.get("/payroll")
def export_payroll_xlsx(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    buf = export_payroll(db, year)
    return _excel_response(buf, f"payroll_{year}.xlsx")
