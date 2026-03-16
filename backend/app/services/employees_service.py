"""
Employee and position business logic.

Used by routers/employees.py and routers/assignments.py.
Single source of truth for: building employee/assignment DTOs,
creating employees from import rows, position assignment/salary creation,
and assignment period vs employment validation.
"""
import uuid
from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import AssignmentMonthRate, Employee, EmployeeProject, Project, SalaryRecord
from app.schemas.employee import AssignmentOut, EmployeeListItem, EmployeeOut, SalaryRecordOut
from app.services.calc import assignment_active_in_month, get_employee_month_total_rate


def check_assignment_period_within_employment(
    emp: Employee,
    valid_from: date,
    valid_to: date | None,
) -> None:
    """
    Raise HTTPException if assignment period goes beyond employee employment period.
    Shared by assignments router (single assignment) and employees router (bulk check).
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


def build_assignment_out(ep: EmployeeProject, monthly_rates: list[float] | None = None) -> AssignmentOut:
    return AssignmentOut(
        id=ep.id,
        project_id=ep.project_id,
        project_name=ep.project.name if ep.project else "",
        rate=float(ep.rate),
        valid_from=ep.valid_from,
        valid_to=ep.valid_to,
        monthly_rates=monthly_rates,
    )


def build_employee_out(
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
            assignments.append(build_assignment_out(ep, monthly_rates=monthly_rates))
        assignments_monthly_total_rates = [
            get_employee_month_total_rate(db, emp.id, year, m) for m in range(1, 13)
        ]
    else:
        assignments = [build_assignment_out(ep) for ep in emp.employee_projects]

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


def build_list_item(
    emp: Employee,
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> EmployeeListItem:
    if year is not None and month is not None and 1 <= month <= 12:
        active = [ep for ep in emp.employee_projects if assignment_active_in_month(ep, year, month)]
        assignments = [build_assignment_out(ep) for ep in active]
        has_projects = len(active) > 0
    else:
        assignments = [build_assignment_out(ep) for ep in emp.employee_projects]
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


def preview_row(row: dict | object) -> str:
    """Build short preview string for a row (for skipped list)."""
    if hasattr(row, "title"):
        parts = [getattr(row, "last_name", "") or "", getattr(row, "first_name", "") or "", getattr(row, "title", "") or ""]
    else:
        parts = [row.get("last_name") or "", row.get("first_name") or "", row.get("title") or ""]
    s = " ".join((p or "").strip() for p in parts).strip()
    return s or "—"


def create_employees_from_rows(rows: list, db: Session) -> tuple[int, int, list[dict]]:
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
                "preview": preview_row(row),
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


def create_position_assignment_and_salary(
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


def seed_yearly_salaries_for_all_employees(
    db: Session,
    year: int,
) -> dict:
    """
    Create missing SalaryRecord records for all non-position employees for the given year.

    Intended for debug/test data only. Existing records are not modified.
    """
    employees = (
        db.query(Employee)
        .filter(Employee.is_position.is_(False))
        .order_by(Employee.created_at, Employee.id)
        .all()
    )
    created_records = 0

    for idx, emp in enumerate(employees):
        # Simple deterministic base salary depending on employee index
        base_salary = 80_000 + (idx % 8) * 10_000

        for month in range(1, 13):
            # Skip if record already exists
            existing = (
                db.query(SalaryRecord)
                .filter(
                    SalaryRecord.employee_id == emp.id,
                    SalaryRecord.year == year,
                    SalaryRecord.month == month,
                )
                .first()
            )
            if existing:
                continue

            # KPI: for roughly every 2nd employee
            kpi_bonus = 0.0
            if idx % 2 == 0:
                kpi_bonus = round(base_salary * 0.1, 2)

            # Fixed monthly bonus: for roughly every 3rd employee
            fixed_bonus = 0.0
            if idx % 3 == 0:
                fixed_bonus = 5_000.0

            # One-time bonuses on some months for roughly every 5th employee
            one_time_bonus = 0.0
            if idx % 5 == 0 and month in (3, 6, 9, 12):
                one_time_bonus = 20_000.0

            rec = SalaryRecord(
                employee_id=emp.id,
                year=year,
                month=month,
                salary=base_salary,
                kpi_bonus=kpi_bonus,
                fixed_bonus=fixed_bonus,
                one_time_bonus=one_time_bonus,
                is_raise=False,
            )
            db.add(rec)
            created_records += 1

    db.commit()
    return {
        "year": year,
        "employees_processed": len(employees),
        "salary_records_created": created_records,
    }
