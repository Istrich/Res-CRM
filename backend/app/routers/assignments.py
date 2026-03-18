import uuid
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.dependencies import get_current_user
from app.models import AssignmentMonthRate, Employee, EmployeeProject, Project, User
from app.schemas.assignment import AssignmentCreate, AssignmentMonthRateSet, AssignmentOut, AssignmentUpdate
from app.services.calc import get_employee_month_total_rate, maybe_recalculate_year_background
from app.services.employees_service import check_assignment_period_within_employment

router = APIRouter(prefix="/assignments", tags=["assignments"])


def _build_out(asgn: EmployeeProject) -> AssignmentOut:
    return AssignmentOut(
        id=asgn.id,
        employee_id=asgn.employee_id,
        project_id=asgn.project_id,
        project_name=asgn.project.name if asgn.project else "",
        employee_display_name=asgn.employee.display_name if asgn.employee else "",
        rate=float(asgn.rate),
        valid_from=asgn.valid_from,
        valid_to=asgn.valid_to,
    )


@router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
def create_assignment(
    body: AssignmentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    emp = db.query(Employee).filter(Employee.id == body.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    proj = db.query(Project).filter(Project.id == body.project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    check_assignment_period_within_employment(emp, body.valid_from, body.valid_to)

    asgn = EmployeeProject(**body.model_dump())
    db.add(asgn)
    db.commit()
    db.refresh(asgn)

    asgn = (
        db.query(EmployeeProject)
        .filter(EmployeeProject.id == asgn.id)
        .first()
    )
    affected_year = body.valid_from.year
    background_tasks.add_task(maybe_recalculate_year_background, SessionLocal, affected_year)
    return _build_out(asgn)


@router.get("/{assignment_id}", response_model=AssignmentOut)
def get_assignment(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    asgn = db.query(EmployeeProject).filter(EmployeeProject.id == assignment_id).first()
    if not asgn:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return _build_out(asgn)


@router.patch("/{assignment_id}", response_model=AssignmentOut)
def update_assignment(
    assignment_id: uuid.UUID,
    body: AssignmentUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    asgn = db.query(EmployeeProject).filter(EmployeeProject.id == assignment_id).first()
    if not asgn:
        raise HTTPException(status_code=404, detail="Assignment not found")

    updates = body.model_dump(exclude_unset=True)
    valid_from = updates.get("valid_from", asgn.valid_from)
    valid_to = updates.get("valid_to", asgn.valid_to)
    emp = db.query(Employee).filter(Employee.id == asgn.employee_id).first()
    if emp:
        check_assignment_period_within_employment(emp, valid_from, valid_to)

    for field, value in updates.items():
        setattr(asgn, field, value)

    db.commit()
    db.refresh(asgn)
    background_tasks.add_task(maybe_recalculate_year_background, SessionLocal, valid_from.year)
    return _build_out(asgn)


@router.put("/{assignment_id}/rates/{year:int}/{month:int}")
def set_assignment_month_rate(
    assignment_id: uuid.UUID,
    year: int,
    month: int,
    body: AssignmentMonthRateSet,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not 1 <= month <= 12:
        raise HTTPException(status_code=400, detail="month must be 1..12")
    asgn = db.query(EmployeeProject).filter(EmployeeProject.id == assignment_id).first()
    if not asgn:
        raise HTTPException(status_code=404, detail="Assignment not found")

    rec = (
        db.query(AssignmentMonthRate)
        .filter(
            AssignmentMonthRate.assignment_id == assignment_id,
            AssignmentMonthRate.year == year,
            AssignmentMonthRate.month == month,
        )
        .first()
    )
    if rec:
        rec.rate = body.rate
    else:
        rec = AssignmentMonthRate(assignment_id=assignment_id, year=year, month=month, rate=body.rate)
        db.add(rec)
    db.commit()
    db.refresh(rec)
    total_rate = get_employee_month_total_rate(db, asgn.employee_id, year, month)
    background_tasks.add_task(maybe_recalculate_year_background, SessionLocal, year)
    return {
        "assignment_id": str(assignment_id),
        "year": year,
        "month": month,
        "rate": float(rec.rate),
        "total_rate_in_month": total_rate,
    }


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    asgn = db.query(EmployeeProject).filter(EmployeeProject.id == assignment_id).first()
    if not asgn:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(asgn)
    db.commit()
