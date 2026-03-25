"""Dashboard business logic — extracted from routers/dashboard.py."""
from datetime import date

from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from app.models import (
    BudgetProject,
    BudgetSnapshot,
    Employee,
    EmployeeProject,
    Project,
    SalaryRecord,
)
from app.services.budget_plan import get_budget_project_month_plan
from app.services.calc import (
    batch_employee_month_costs,
    calc_hourly_rate,
    employee_active_in_month,
    get_working_hours_map,
)


def get_summary(db: Session, year: int) -> dict:
    """Top-level KPIs: headcount and monthly fact totals."""
    today = date.today()

    employees = db.query(Employee).filter(Employee.is_position == False).all()  # noqa: E712
    positions = db.query(Employee).filter(Employee.is_position == True).all()   # noqa: E712

    active_count = sum(
        1 for e in employees
        if employee_active_in_month(e, today.year, today.month)
    )

    monthly_rows = (
        db.query(BudgetSnapshot.month, func.sum(BudgetSnapshot.amount))
        .filter(BudgetSnapshot.year == year)
        .group_by(BudgetSnapshot.month)
        .order_by(BudgetSnapshot.month)
        .all()
    )
    monthly_spend = {row[0]: float(row[1]) for row in monthly_rows}

    return {
        "year": year,
        "employee_count": len(employees),
        "position_count": len(positions),
        "active_employee_count": active_count,
        "total_spend": sum(monthly_spend.values()),
        "monthly_spend": [
            {"month": m, "amount": monthly_spend.get(m, 0)}
            for m in range(1, 13)
        ],
    }


def get_by_project(db: Session, year: int) -> list:
    rows = (
        db.query(
            BudgetSnapshot.project_id,
            func.sum(BudgetSnapshot.amount).label("total"),
        )
        .filter(BudgetSnapshot.year == year)
        .group_by(BudgetSnapshot.project_id)
        .all()
    )

    result = []
    for row in rows:
        proj = db.get(Project, row.project_id)
        if proj:
            result.append({
                "project_id": str(proj.id),
                "project_name": proj.name,
                "budget_project_name": proj.budget_project.name if proj.budget_project else None,
                "total": float(row.total),
            })
    return sorted(result, key=lambda x: x["total"], reverse=True)


def get_by_project_monthly(db: Session, year: int) -> list:
    """Monthly fact totals for each project."""
    projects = db.query(Project).all()

    all_snapshots = (
        db.query(BudgetSnapshot)
        .filter(BudgetSnapshot.year == year)
        .all()
    )
    snap_by_proj_month: dict[tuple, float] = {}
    for s in all_snapshots:
        snap_by_proj_month[(str(s.project_id), s.month)] = float(s.amount)

    result = []
    for proj in projects:
        monthly_fact = [snap_by_proj_month.get((str(proj.id), m), 0.0) for m in range(1, 13)]
        total_fact = sum(monthly_fact)

        result.append({
            "project_id": str(proj.id),
            "project_name": proj.name,
            "budget_project_id": str(proj.budget_project_id) if proj.budget_project_id else None,
            "budget_project_name": proj.budget_project.name if proj.budget_project else None,
            "monthly_fact": monthly_fact,
            "total_fact": round(total_fact, 2),
        })

    result.sort(key=lambda x: x["total_fact"], reverse=True)
    return result


def get_by_budget_project_monthly(db: Session, year: int) -> list:
    """Monthly plan vs fact for each budget project."""
    bps = db.query(BudgetProject).filter(BudgetProject.year == year).all()

    all_snapshots = (
        db.query(BudgetSnapshot)
        .filter(BudgetSnapshot.year == year)
        .all()
    )
    snap_by_proj_month: dict[tuple, float] = {}
    for s in all_snapshots:
        snap_by_proj_month[(str(s.project_id), s.month)] = float(s.amount)

    result = []
    for bp in bps:
        project_ids = [str(p.id) for p in bp.projects]

        monthly_fact = [
            sum(snap_by_proj_month.get((pid, m), 0.0) for pid in project_ids)
            for m in range(1, 13)
        ]
        plan_items = get_budget_project_month_plan(db, bp.id, year)
        monthly_plan = [p["amount"] for p in plan_items]
        monthly_diff = [
            round(monthly_fact[i] - monthly_plan[i], 2)
            for i in range(12)
        ]

        total_fact = sum(monthly_fact)
        total_plan = sum(monthly_plan)

        result.append({
            "budget_project_id": str(bp.id),
            "budget_project_name": bp.name,
            "total_budget": float(bp.total_budget) if bp.total_budget else None,
            "monthly_plan": monthly_plan,
            "monthly_fact": monthly_fact,
            "monthly_diff": monthly_diff,
            "total_fact": round(total_fact, 2),
            "total_plan": round(total_plan, 2),
            "total_diff": round(total_fact - total_plan, 2),
            "projects_count": len(bp.projects),
        })

    result.sort(key=lambda x: x["total_fact"], reverse=True)
    return result


def _group_by_field(db: Session, year: int, field_name: str, default_label: str) -> dict[str, list[float]]:
    """Common logic for grouping employees by a string field with batch cost loading."""
    employees = db.query(Employee).all()
    employee_ids = [e.id for e in employees]

    costs = batch_employee_month_costs(db, employee_ids, year)

    emp_field: dict = {}
    for emp in employees:
        val = getattr(emp, field_name, None) or default_label
        emp_field[emp.id] = val

    group_monthly: dict[str, list[float]] = {}
    for emp_id, month_costs in {eid: [(m, costs.get((eid, m), 0.0)) for m in range(1, 13)] for eid in employee_ids}.items():
        group = emp_field.get(emp_id, default_label)
        if group not in group_monthly:
            group_monthly[group] = [0.0] * 12
        for month, cost in month_costs:
            if cost > 0:
                group_monthly[group][month - 1] += cost

    return group_monthly


def get_by_department(db: Session, year: int) -> list:
    group_monthly = _group_by_field(db, year, "department", "Без подразделения")
    return [
        {"department": dept, "total": round(sum(monthly), 2)}
        for dept, monthly in sorted(group_monthly.items(), key=lambda x: sum(x[1]), reverse=True)
        if sum(monthly) > 0
    ]


def get_by_department_monthly(db: Session, year: int) -> list:
    group_monthly = _group_by_field(db, year, "department", "Без подразделения")
    result = [
        {
            "department": dept,
            "monthly": [round(v, 2) for v in monthly],
            "total": round(sum(monthly), 2),
        }
        for dept, monthly in group_monthly.items()
        if sum(monthly) > 0
    ]
    result.sort(key=lambda x: x["total"], reverse=True)
    return result


def get_by_specialization(db: Session, year: int) -> list:
    group_monthly = _group_by_field(db, year, "specialization", "Без специализации")
    return [
        {"specialization": spec, "total": round(sum(monthly), 2)}
        for spec, monthly in sorted(group_monthly.items(), key=lambda x: sum(x[1]), reverse=True)
        if sum(monthly) > 0
    ]


def get_by_specialization_monthly(db: Session, year: int) -> list:
    group_monthly = _group_by_field(db, year, "specialization", "Без специализации")
    result = [
        {
            "specialization": spec,
            "monthly": [round(v, 2) for v in monthly],
            "total": round(sum(monthly), 2),
        }
        for spec, monthly in group_monthly.items()
        if sum(monthly) > 0
    ]
    result.sort(key=lambda x: x["total"], reverse=True)
    return result


def get_movements(db: Session, year: int) -> list:
    employees = db.query(Employee).filter(Employee.is_position == False).all()  # noqa: E712

    result = []
    for month in range(1, 13):
        hired = []
        terminated = []
        active = []

        for emp in employees:
            if emp.hire_date and emp.hire_date.year == year and emp.hire_date.month == month:
                hired.append({"id": str(emp.id), "name": emp.display_name})

            if (
                emp.termination_date
                and emp.termination_date.year == year
                and emp.termination_date.month == month
            ):
                terminated.append({"id": str(emp.id), "name": emp.display_name})

            if employee_active_in_month(emp, year, month):
                active.append({"id": str(emp.id), "name": emp.display_name})

        result.append({
            "month": month,
            "hired_count": len(hired),
            "hired": hired,
            "terminated_count": len(terminated),
            "terminated": terminated,
            "active_count": len(active),
        })

    return result


def get_hourly_rates(db: Session, year: int) -> dict:
    """Hourly rate analytics: overall monthly avg + per-specialization avg/min/max.

    Uses only exact SalaryRecord rows for the requested year (no fallback),
    consistent with the employee detail page hourly rate display.
    Returns null for months where working hours are not configured or no salary data exists.
    """
    hours_map = get_working_hours_map(db, year)

    employees = (
        db.query(Employee)
        .filter(Employee.is_position == False)  # noqa: E712
        .all()
    )
    employee_ids = [e.id for e in employees]

    if not employee_ids:
        return {
            "year": year,
            "hours_configured": bool(hours_map),
            "overall_monthly_avg": [None] * 12,
            "by_specialization": [],
        }

    salary_records = (
        db.query(SalaryRecord)
        .filter(
            SalaryRecord.employee_id.in_(employee_ids),
            SalaryRecord.year == year,
        )
        .all()
    )

    # emp_id -> month -> total compensation
    emp_month_total: dict = {}
    for rec in salary_records:
        emp_month_total.setdefault(rec.employee_id, {})[rec.month] = float(
            rec.salary) + float(rec.kpi_bonus) + float(rec.fixed_bonus) + float(rec.one_time_bonus)

    # Collect hourly rates per specialization and overall
    DEFAULT_SPEC = "Без специализации"
    spec_monthly_rates: dict[str, dict[int, list[float]]] = {}
    overall_monthly_rates: dict[int, list[float]] = {m: [] for m in range(1, 13)}

    for emp in employees:
        spec = emp.specialization or DEFAULT_SPEC
        if spec not in spec_monthly_rates:
            spec_monthly_rates[spec] = {m: [] for m in range(1, 13)}

        month_totals = emp_month_total.get(emp.id, {})
        for month in range(1, 13):
            if month not in month_totals:
                continue
            if not employee_active_in_month(emp, year, month):
                continue
            rate = calc_hourly_rate(month_totals[month], hours_map.get(month, 0.0))
            if rate is None:
                continue
            spec_monthly_rates[spec][month].append(rate)
            overall_monthly_rates[month].append(rate)

    def _avg(rates: list[float]) -> float | None:
        return round(sum(rates) / len(rates), 2) if rates else None

    overall_monthly_avg = [
        _avg(overall_monthly_rates[m]) for m in range(1, 13)
    ]

    by_specialization = []
    for spec, month_rates in spec_monthly_rates.items():
        if not any(month_rates[m] for m in range(1, 13)):
            continue
        employees_with_data = sum(
            1 for emp in employees
            if (emp.specialization or DEFAULT_SPEC) == spec
            and emp_month_total.get(emp.id)
        )
        by_specialization.append({
            "specialization": spec,
            "monthly_avg": [_avg(month_rates[m]) for m in range(1, 13)],
            "monthly_min": [round(min(month_rates[m]), 2) if month_rates[m] else None for m in range(1, 13)],
            "monthly_max": [round(max(month_rates[m]), 2) if month_rates[m] else None for m in range(1, 13)],
            "employees_count": employees_with_data,
        })

    by_specialization.sort(
        key=lambda x: sum(1 for v in x["monthly_avg"] if v is not None),
        reverse=True,
    )

    return {
        "year": year,
        "hours_configured": bool(hours_map),
        "overall_monthly_avg": overall_monthly_avg,
        "by_specialization": by_specialization,
    }


def get_available_years(db: Session) -> dict:
    salary_years = [r[0] for r in db.query(distinct(SalaryRecord.year)).all()]
    bp_years = [r[0] for r in db.query(distinct(BudgetProject.year)).all()]
    snapshot_years = [r[0] for r in db.query(distinct(BudgetSnapshot.year)).all()]

    all_years = sorted(set(salary_years + bp_years + snapshot_years), reverse=True)
    current = date.today().year
    if current not in all_years:
        all_years.insert(0, current)

    return {"years": all_years, "current": current}
