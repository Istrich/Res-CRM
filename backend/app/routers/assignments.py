import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AssignmentMonthRate, Employee, EmployeeProject, Project, User
from app.schemas.assignment import AssignmentCreate, AssignmentMonthRateSet, AssignmentOut, AssignmentUpdate
from app.services.calc import get_employee_month_total_rate

router = APIRouter(prefix="/assignments", tags=["assignments"])


def _assignment_period_within_employment(emp: Employee, valid_from: date, valid_to: date | None) -> None:
    """
    Raise HTTPException if assignment period goes beyond employee employment period.
    Employment period: hire_date (optional) .. termination_date (optional).
    """
    if emp.hire_date is not None and valid_from < emp.hire_date:
        raise HTTPException(
            status_code=400,
            detail=f"Период работы на проекте не может начинаться раньше даты найма ({emp.hire_date.isoformat()})",
        )
    if emp.termination_date is not None:
        if valid_to is None:
            raise HTTPException(
                status_code=400,
                detail="При наличии даты увольнения укажите дату окончания работы на проекте (не позже даты увольнения)",
            )
        if valid_to > emp.termination_date:
            raise HTTPException(
                status_code=400,
                detail=f"Период работы на проекте не может заканчиваться позже даты увольнения ({emp.termination_date.isoformat()})",
            )


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
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # Validate employee and project exist
    emp = db.query(Employee).filter(Employee.id == body.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    proj = db.query(Project).filter(Project.id == body.project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    _assignment_period_within_employment(emp, body.valid_from, body.valid_to)

    asgn = EmployeeProject(**body.model_dump())
    db.add(asgn)
    db.commit()
    db.refresh(asgn)

    # reload with relationships
    asgn = (
        db.query(EmployeeProject)
        .filter(EmployeeProject.id == asgn.id)
        .first()
    )
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
        _assignment_period_within_employment(emp, valid_from, valid_to)

    for field, value in updates.items():
        setattr(asgn, field, value)

    db.commit()
    db.refresh(asgn)
    return _build_out(asgn)


@router.put("/{assignment_id}/rates/{year:int}/{month:int}")
def set_assignment_month_rate(
    assignment_id: uuid.UUID,
    year: int,
    month: int,
    body: AssignmentMonthRateSet,
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
