import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.services.import_employees import parse_employee_excel

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import AssignmentMonthRate, Employee, EmployeeProject, Project, SalaryRecord, User
from app.services.calc import assignment_active_in_month, get_employee_month_total_rate
from app.schemas.employee import (
    AssignmentOut,
    EmployeeCreate,
    EmployeeHire,
    EmployeeImportRow,
    EmployeeListItem,
    EmployeeOut,
    EmployeeUpdate,
    SalaryRecordOut,
    SalaryRecordUpsert,
)

router = APIRouter(prefix="/employees", tags=["employees"])


def _build_assignment_out(ep: EmployeeProject, monthly_rates: list[float] | None = None) -> AssignmentOut:
    return AssignmentOut(
        id=ep.id,
        project_id=ep.project_id,
        project_name=ep.project.name if ep.project else "",
        rate=float(ep.rate),
        valid_from=ep.valid_from,
        valid_to=ep.valid_to,
        monthly_rates=monthly_rates,
    )


def _build_employee_out(
    emp: Employee,
    year: Optional[int] = None,
    db: Optional[Session] = None,
) -> EmployeeOut:
    salary_records = [
        SalaryRecordOut.from_orm_with_total(r)
        for r in sorted(emp.salary_records or [], key=lambda r: (r.year, r.month))
    ]

    assignments: list[AssignmentOut] = []
    assignments_monthly_total_rates: Optional[list[float]] = None

    if year is not None and db is not None and emp.employee_projects:
        assignment_ids = [ep.id for ep in emp.employee_projects]
        overrides_q = (
            db.query(AssignmentMonthRate)
            .filter(
                AssignmentMonthRate.assignment_id.in_(assignment_ids),
                AssignmentMonthRate.year == year,
            )
        )
        year_overrides: dict[uuid.UUID, dict[int, float]] = {}
        for o in overrides_q:
            year_overrides.setdefault(o.assignment_id, {})[o.month] = float(o.rate)
        default_rate_by_ep = {ep.id: float(ep.rate) for ep in emp.employee_projects}
        for ep in emp.employee_projects:
            monthly_rates = [
                (year_overrides.get(ep.id, {}).get(m, default_rate_by_ep[ep.id])
                 if assignment_active_in_month(ep, year, m) else 0)
                for m in range(1, 13)
            ]
            assignments.append(_build_assignment_out(ep, monthly_rates=monthly_rates))
        assignments_monthly_total_rates = [
            get_employee_month_total_rate(db, emp.id, year, m) for m in range(1, 13)
        ]
    else:
        assignments = [_build_assignment_out(ep) for ep in emp.employee_projects]

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
        planned_exit_date=getattr(emp, "planned_exit_date", None),
        position_status=getattr(emp, "position_status", None),
        planned_salary=float(emp.planned_salary) if getattr(emp, "planned_salary", None) is not None else None,
        assignments=assignments,
        salary_records=salary_records,
        has_projects=len(emp.employee_projects) > 0,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
        assignments_monthly_total_rates=assignments_monthly_total_rates,
    )


def _assignments_active_in_month(employee_projects, year: int, month: int):
    """Return assignments that are active in the given (year, month)."""
    first_day = date(year, month, 1)
    if month == 12:
        last_day = date(year, 12, 31)
    else:
        last_day = date(year, month + 1, 1) - timedelta(days=1)
    for ep in employee_projects:
        if ep.valid_from > last_day:
            continue
        if ep.valid_to is not None and ep.valid_to < first_day:
            continue
        yield ep


def _build_list_item(
    emp: Employee,
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> EmployeeListItem:
    if year is not None and month is not None and 1 <= month <= 12:
        active = list(_assignments_active_in_month(emp.employee_projects, year, month))
        assignments = [_build_assignment_out(ep) for ep in active]
        has_projects = len(active) > 0
    else:
        assignments = [_build_assignment_out(ep) for ep in emp.employee_projects]
        has_projects = len(emp.employee_projects) > 0

    monthly_totals = None
    monthly_is_raise = None
    if year is not None and hasattr(emp, "salary_records") and emp.salary_records is not None:
        by_month = {r.month: float(r.total) for r in emp.salary_records if r.year == year}
        monthly_totals = [by_month.get(m, 0.0) for m in range(1, 13)]
        by_raise = {
            r.month: getattr(r, "is_raise", False)
            for r in emp.salary_records
            if r.year == year
        }
        monthly_is_raise = [by_raise.get(m, False) for m in range(1, 13)]
    return EmployeeListItem(
        id=emp.id,
        is_position=emp.is_position,
        display_name=emp.display_name,
        title=emp.title,
        department=emp.department,
        specialization=emp.specialization,
        hire_date=emp.hire_date,
        termination_date=emp.termination_date,
        planned_exit_date=getattr(emp, "planned_exit_date", None),
        position_status=getattr(emp, "position_status", None),
        planned_salary=float(emp.planned_salary) if getattr(emp, "planned_salary", None) is not None else None,
        assignments=assignments,
        has_projects=has_projects,
        monthly_totals=monthly_totals,
        monthly_is_raise=monthly_is_raise,
    )


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
            | (Employee.title.ilike(term))
        )
    if project_id:
        q = q.join(Employee.employee_projects).filter(EmployeeProject.project_id == project_id)

    employees = q.order_by(Employee.last_name, Employee.first_name).all()
    return [_build_list_item(e, year, month) for e in employees]


def _preview_row(row: dict | object) -> str:
    """Build short preview string for a row (for skipped list)."""
    if hasattr(row, "title"):
        parts = [getattr(row, "last_name", "") or "", getattr(row, "first_name", "") or "", getattr(row, "title", "") or ""]
    else:
        parts = [row.get("last_name") or "", row.get("first_name") or "", row.get("title") or ""]
    s = " ".join((p or "").strip() for p in parts).strip()
    return s or "—"


def _create_employees_from_rows(rows: list, db: Session) -> tuple[int, int, list[dict]]:
    """Create employees from list of dicts or EmployeeImportRow. Returns (created, skipped, skipped_rows)."""
    created = 0
    skipped = 0
    skipped_rows: list[dict] = []
    for idx, row in enumerate(rows):
        if hasattr(row, "title"):
            title = (row.title or "").strip()
            first_name = (row.first_name or "").strip() or None
            last_name = (row.last_name or "").strip() or None
            middle_name = (row.middle_name or "").strip() or None
            department = (row.department or "").strip() or None
            specialization = (row.specialization or "").strip() or None
            comment = (row.comment or "").strip() or None
            hire_date = getattr(row, "hire_date", None)
            termination_date = getattr(row, "termination_date", None)
        else:
            title = (row.get("title") or "").strip()
            first_name = (row.get("first_name") or "").strip() or None
            last_name = (row.get("last_name") or "").strip() or None
            middle_name = (row.get("middle_name") or "").strip() or None
            department = (row.get("department") or "").strip() or None
            specialization = (row.get("specialization") or "").strip() or None
            comment = (row.get("comment") or "").strip() or None
            hire_date = row.get("hire_date")
            termination_date = row.get("termination_date")
        if not title:
            skipped += 1
            skipped_rows.append({
                "row": idx + 1,
                "reason": "нет должности",
                "preview": _preview_row(row),
            })
            continue
        emp = Employee(
            is_position=False,
            first_name=first_name,
            last_name=last_name,
            middle_name=middle_name,
            title=title,
            department=department,
            specialization=specialization,
            comment=comment,
            hire_date=hire_date,
            termination_date=termination_date,
        )
        db.add(emp)
        created += 1
    return created, skipped, skipped_rows


@router.post("/import")
def import_employees(
    body: list[EmployeeImportRow],
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Bulk create employees from import rows. Rows with empty title are skipped."""
    created, skipped, skipped_rows = _create_employees_from_rows(body, db)
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
    created, skipped, skipped_rows = _create_employees_from_rows(rows, db)
    db.commit()
    return {"created": created, "skipped": skipped, "skipped_rows": skipped_rows}


def _create_position_assignment_and_salary(
    db: Session,
    emp: Employee,
    planned_exit_date: date,
    project_id: uuid.UUID,
    rate: float,
    planned_salary: float,
) -> None:
    """Create one assignment (exit month -> 31 Dec) and salary records for that period."""
    if db.query(Project).filter(Project.id == project_id).first() is None:
        raise HTTPException(status_code=400, detail="Project not found")
    exit_year = planned_exit_date.year
    exit_month = planned_exit_date.month
    valid_from = date(exit_year, exit_month, 1)
    valid_to = date(exit_year, 12, 31)
    ep = EmployeeProject(
        employee_id=emp.id,
        project_id=project_id,
        rate=rate,
        valid_from=valid_from,
        valid_to=valid_to,
    )
    db.add(ep)
    db.flush()
    for month in range(exit_month, 13):
        rec = SalaryRecord(
            employee_id=emp.id,
            year=exit_year,
            month=month,
            salary=planned_salary,
            kpi_bonus=0,
            fixed_bonus=0,
            one_time_bonus=0,
            is_raise=False,
        )
        db.add(rec)


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
        _create_position_assignment_and_salary(
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
    return _build_employee_out(emp)


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
    return _build_employee_out(emp, year=year, db=db)


def _ensure_assignments_within_employment(emp: Employee, db: Session) -> None:
    """Raise HTTPException if any assignment period goes beyond employee employment period."""
    assignments = db.query(EmployeeProject).filter(EmployeeProject.employee_id == emp.id).all()
    for asgn in assignments:
        if emp.hire_date is not None and asgn.valid_from < emp.hire_date:
            raise HTTPException(
                status_code=400,
                detail="Есть назначения на проекты, начинающиеся раньше даты найма. Сначала измените периоды в проектах.",
            )
        if emp.termination_date is not None:
            if asgn.valid_to is None:
                raise HTTPException(
                    status_code=400,
                    detail="Есть назначения на проекты без даты окончания. При дате увольнения укажите окончание работы на каждом проекте.",
                )
            if asgn.valid_to > emp.termination_date:
                raise HTTPException(
                    status_code=400,
                    detail="Есть назначения на проекты, заканчивающиеся позже даты увольнения. Сначала измените периоды в проектах.",
                )


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
        _ensure_assignments_within_employment(emp, db)

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
    return _build_employee_out(emp)


@router.delete("/all")
def delete_all_employees(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Отладочный endpoint: удаляет всех сотрудников. Доступен только при DEBUG_MODE=true."""
    if not settings.DEBUG_MODE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    count = db.query(Employee).count()
    db.query(Employee).delete()
    db.commit()
    return {"deleted": count}


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
