import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Employee, EmployeeProject, SalaryRecord, User
from app.schemas.employee import (
    AssignmentOut,
    EmployeeCreate,
    EmployeeListItem,
    EmployeeOut,
    EmployeeUpdate,
    SalaryRecordOut,
    SalaryRecordUpsert,
)

router = APIRouter(prefix="/employees", tags=["employees"])


def _build_assignment_out(ep: EmployeeProject) -> AssignmentOut:
    return AssignmentOut(
        id=ep.id,
        project_id=ep.project_id,
        project_name=ep.project.name if ep.project else "",
        rate=float(ep.rate),
        valid_from=ep.valid_from,
        valid_to=ep.valid_to,
    )


def _build_employee_out(emp: Employee) -> EmployeeOut:
    assignments = [_build_assignment_out(ep) for ep in emp.employee_projects]
    salary_records = [
        SalaryRecordOut.from_orm_with_total(r)
        for r in sorted(emp.salary_records, key=lambda r: (r.year, r.month))
    ]
    return EmployeeOut(
        id=emp.id,
        is_position=emp.is_position,
        first_name=emp.first_name,
        last_name=emp.last_name,
        middle_name=emp.middle_name,
        display_name=emp.display_name,
        title=emp.title,
        department=emp.department,
        specialization=emp.specialization,
        comment=emp.comment,
        hire_date=emp.hire_date,
        termination_date=emp.termination_date,
        assignments=assignments,
        salary_records=salary_records,
        has_projects=len(emp.employee_projects) > 0,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


def _build_list_item(emp: Employee) -> EmployeeListItem:
    assignments = [_build_assignment_out(ep) for ep in emp.employee_projects]
    return EmployeeListItem(
        id=emp.id,
        is_position=emp.is_position,
        display_name=emp.display_name,
        title=emp.title,
        department=emp.department,
        specialization=emp.specialization,
        hire_date=emp.hire_date,
        termination_date=emp.termination_date,
        assignments=assignments,
        has_projects=len(emp.employee_projects) > 0,
    )


@router.get("", response_model=list[EmployeeListItem])
def list_employees(
    title: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    specialization: Optional[str] = Query(None),
    project_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    include_terminated: bool = Query(True),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = (
        db.query(Employee)
        .options(
            joinedload(Employee.employee_projects).joinedload(EmployeeProject.project),
        )
    )

    if title:
        q = q.filter(Employee.title.ilike(f"%{title}%"))
    if department:
        q = q.filter(Employee.department.ilike(f"%{department}%"))
    if specialization:
        q = q.filter(Employee.specialization.ilike(f"%{specialization}%"))
    if search:
        term = f"%{search}%"
        q = q.filter(
            (Employee.first_name.ilike(term))
            | (Employee.last_name.ilike(term))
            | (Employee.middle_name.ilike(term))
        )
    if project_id:
        q = q.join(Employee.employee_projects).filter(EmployeeProject.project_id == project_id)

    employees = q.order_by(Employee.last_name, Employee.first_name).all()
    return [_build_list_item(e) for e in employees]


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    body: EmployeeCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    emp = Employee(**body.model_dump())
    db.add(emp)
    db.commit()
    db.refresh(emp)
    # reload with relationships
    emp = (
        db.query(Employee)
        .options(
            joinedload(Employee.employee_projects).joinedload(EmployeeProject.project),
            joinedload(Employee.salary_records),
        )
        .filter(Employee.id == emp.id)
        .first()
    )
    return _build_employee_out(emp)


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    emp = (
        db.query(Employee)
        .options(
            joinedload(Employee.employee_projects).joinedload(EmployeeProject.project),
            joinedload(Employee.salary_records),
        )
        .filter(Employee.id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _build_employee_out(emp)


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: uuid.UUID,
    body: EmployeeUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(emp, field, value)

    db.commit()
    db.refresh(emp)

    emp = (
        db.query(Employee)
        .options(
            joinedload(Employee.employee_projects).joinedload(EmployeeProject.project),
            joinedload(Employee.salary_records),
        )
        .filter(Employee.id == employee_id)
        .first()
    )
    return _build_employee_out(emp)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(
    employee_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    db.delete(emp)
    db.commit()


# ---------------------------------------------------------------------------
# Salary records
# ---------------------------------------------------------------------------

@router.get("/{employee_id}/salary", response_model=list[SalaryRecordOut])
def get_salary(
    employee_id: uuid.UUID,
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    records = (
        db.query(SalaryRecord)
        .filter(SalaryRecord.employee_id == employee_id, SalaryRecord.year == year)
        .order_by(SalaryRecord.month)
        .all()
    )
    return [SalaryRecordOut.from_orm_with_total(r) for r in records]


@router.put("/{employee_id}/salary/{year}/{month}", response_model=SalaryRecordOut)
def upsert_salary(
    employee_id: uuid.UUID,
    year: int,
    month: int,
    body: SalaryRecordUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not 1 <= month <= 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")

    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    rec = (
        db.query(SalaryRecord)
        .filter(
            SalaryRecord.employee_id == employee_id,
            SalaryRecord.year == year,
            SalaryRecord.month == month,
        )
        .first()
    )

    if rec:
        for field, value in body.model_dump().items():
            setattr(rec, field, value)
    else:
        rec = SalaryRecord(employee_id=employee_id, year=year, month=month, **body.model_dump())
        db.add(rec)

    db.commit()
    db.refresh(rec)
    return SalaryRecordOut.from_orm_with_total(rec)


@router.delete("/{employee_id}/salary/{year}/{month}", status_code=status.HTTP_204_NO_CONTENT)
def delete_salary(
    employee_id: uuid.UUID,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rec = (
        db.query(SalaryRecord)
        .filter(
            SalaryRecord.employee_id == employee_id,
            SalaryRecord.year == year,
            SalaryRecord.month == month,
        )
        .first()
    )
    if rec:
        db.delete(rec)
        db.commit()
