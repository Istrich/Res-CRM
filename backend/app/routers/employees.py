import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.services.import_employees import parse_employee_excel

from app.config import settings
from app.database import SessionLocal, get_db
from app.dependencies import get_current_user
from app.models import Employee, EmployeeProject, Project, SalaryRecord, User
from app.utils import escape_like
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeHire,
    EmployeeImportRow,
    EmployeeListItem,
    EmployeeOut,
    EmployeeUpdate,
    SalaryBatchUpsert,
    SalaryRecordOut,
    SalaryRecordUpsert,
)
from app.services.calc import get_working_hours_map, maybe_recalculate_year_background
from app.services.employees_service import (
    build_employee_out,
    build_list_item,
    check_assignment_period_within_employment,
    create_employees_from_rows,
    create_position_assignment_and_salary,
    preview_row,
    seed_yearly_salaries_for_all_employees,
)

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeListItem])
def list_employees(
    title: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    specialization: Optional[str] = Query(None),
    project_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    include_terminated: bool = Query(True),
    is_position: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if month is not None and year is None:
        year = date.today().year
    load_opts = [
        joinedload(Employee.employee_projects).joinedload(EmployeeProject.project),
    ]
    if year is not None:
        load_opts.append(joinedload(Employee.salary_records))
    q = db.query(Employee).options(*load_opts)

    if is_position is not None:
        q = q.filter(Employee.is_position == is_position)
    if title:
        q = q.filter(Employee.title.ilike(f"%{escape_like(title)}%", escape="\\"))
    if department:
        q = q.filter(Employee.department.ilike(f"%{escape_like(department)}%", escape="\\"))
    if specialization:
        q = q.filter(Employee.specialization.ilike(f"%{escape_like(specialization)}%", escape="\\"))
    if search:
        safe = escape_like(search)
        term = f"%{safe}%"
        q = q.filter(
            (Employee.first_name.ilike(term, escape="\\"))
            | (Employee.last_name.ilike(term, escape="\\"))
            | (Employee.middle_name.ilike(term, escape="\\"))
            | (Employee.title.ilike(term, escape="\\"))
        )
    if project_id:
        q = q.join(Employee.employee_projects).filter(EmployeeProject.project_id == project_id)

    employees = q.order_by(Employee.last_name, Employee.first_name).all()
    hours_map = get_working_hours_map(db, year) if year else {}
    return [build_list_item(e, year, month, hours_map=hours_map) for e in employees]


@router.post("/import")
def import_employees(
    body: list[EmployeeImportRow],
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Bulk create employees from import rows. Rows with empty title are skipped."""
    created, skipped, skipped_rows = create_employees_from_rows(body, db)
    db.commit()
    return {"created": created, "skipped": skipped, "skipped_rows": skipped_rows}


@router.post("/import/excel")
async def import_employees_excel(
    file: UploadFile = File(..., description="Excel file (.xlsx) with header row"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Bulk create employees from uploaded Excel. First row = headers."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Expected .xlsx file")
    content = await file.read()
    try:
        rows = parse_employee_excel(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка чтения Excel: {e!s}") from e
    if not rows:
        return {"created": 0, "skipped": 0, "skipped_rows": []}
    created, skipped, skipped_rows = create_employees_from_rows(rows, db)
    db.commit()
    return {"created": created, "skipped": skipped, "skipped_rows": skipped_rows}


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    body: EmployeeCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    data = body.model_dump(exclude={"project_id", "rate"})
    if data.get("is_position") and data.get("position_status") is None:
        data["position_status"] = "awaiting_assignment"
    emp = Employee(**data)
    db.add(emp)
    db.flush()
    if (
        emp.is_position
        and body.planned_exit_date
        and body.project_id is not None
        and body.rate is not None
        and body.planned_salary is not None
    ):
        create_position_assignment_and_salary(
            db, emp, body.planned_exit_date, body.project_id, body.rate, body.planned_salary
        )
    db.commit()
    db.refresh(emp)
    emp = (
        db.query(Employee)
        .options(
            joinedload(Employee.employee_projects).joinedload(EmployeeProject.project),
            joinedload(Employee.salary_records),
        )
        .filter(Employee.id == emp.id)
        .first()
    )
    return build_employee_out(emp)


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: uuid.UUID,
    year: Optional[int] = Query(None),
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
    return build_employee_out(emp, year=year, db=db)


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

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(emp, field, value)

    if "hire_date" in updates or "termination_date" in updates:
        for asgn in db.query(EmployeeProject).filter(EmployeeProject.employee_id == emp.id).all():
            check_assignment_period_within_employment(emp, asgn.valid_from, asgn.valid_to)

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
    return build_employee_out(emp)


@router.post("/{employee_id}/hire", response_model=EmployeeOut)
def hire_from_position(
    employee_id: uuid.UUID,
    body: EmployeeHire,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Convert position to employee: set FIO, hire_date, etc. Position disappears from hiring list."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not emp.is_position:
        raise HTTPException(status_code=400, detail="Not a position; only positions can be hired")
    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(emp, key, value)
    emp.is_position = False
    emp.planned_exit_date = None
    emp.position_status = None
    emp.planned_salary = None
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
    return build_employee_out(emp)


@router.delete("/all")
def delete_all_employees(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Отладочный endpoint: удаляет всех сотрудников. Доступен только при DEBUG_MODE=true."""
    if not settings.DEBUG_MODE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: debug only")
    count = db.query(Employee).count()
    db.query(Employee).delete()
    db.commit()
    return {"deleted": count}


@router.post("/debug/seed-salaries")
def debug_seed_salaries_for_all_employees(
    year: int = Query(default=None, description="Year to seed salaries for; defaults to current year"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Отладочный endpoint: создаёт недостающие SalaryRecord всем текущим сотрудникам на указанный год.

    Доступен только при DEBUG_MODE=true.
    """
    if not settings.DEBUG_MODE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: debug only")

    if year is None:
        year = date.today().year

    result = seed_yearly_salaries_for_all_employees(db, year=year)
    return result


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
    background_tasks: BackgroundTasks,
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
    background_tasks.add_task(maybe_recalculate_year_background, SessionLocal, year)
    return SalaryRecordOut.from_orm_with_total(rec)


@router.put("/{employee_id}/salary/batch", response_model=list[SalaryRecordOut])
def batch_upsert_salary(
    employee_id: uuid.UUID,
    body: SalaryBatchUpsert,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Upsert multiple salary records for an employee in a single transaction."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    result = []
    for item in body.records:
        if not 1 <= item.month <= 12:
            raise HTTPException(status_code=400, detail=f"Month {item.month} must be 1-12")

        rec = (
            db.query(SalaryRecord)
            .filter(
                SalaryRecord.employee_id == employee_id,
                SalaryRecord.year == body.year,
                SalaryRecord.month == item.month,
            )
            .first()
        )
        data = item.model_dump(exclude={"month"})
        if rec:
            for field, value in data.items():
                setattr(rec, field, value)
        else:
            rec = SalaryRecord(
                employee_id=employee_id,
                year=body.year,
                month=item.month,
                **data,
            )
            db.add(rec)
        result.append(rec)

    db.commit()
    for rec in result:
        db.refresh(rec)
    background_tasks.add_task(maybe_recalculate_year_background, SessionLocal, body.year)
    return [SalaryRecordOut.from_orm_with_total(r) for r in result]


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
