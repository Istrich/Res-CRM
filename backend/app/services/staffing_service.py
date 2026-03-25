"""Business logic for the Staffing module."""
import calendar
import logging
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from app.models import (
    Contractor,
    Staffer,
    StaffingExpense,
    WorkingHoursYearMonth,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Staffer activity helper (mirrors employee_active_in_month logic)
# ---------------------------------------------------------------------------

def staffer_active_in_month(staffer: Staffer, year: int, month: int) -> bool:
    """Return True if the staffer is active at any point during the given month."""
    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])

    if staffer.valid_from > last_day:
        return False
    if staffer.valid_to is not None and staffer.valid_to < first_day:
        return False
    return True


# ---------------------------------------------------------------------------
# Plan calculation
# ---------------------------------------------------------------------------

def calculate_plan_for_month(
    db: Session,
    project_id,
    year: int,
    month: int,
) -> tuple[float, float]:
    """Calculate planned staffing (money, hours) for a project/month.

    plan_hours = working_hours[month] × count_of_active_staffers
    plan_amount = plan_hours × sum(hourly_rate for active staffers)
                  (per-staffer: hours × rate; then summed)

    Returns (plan_amount, plan_hours).
    """
    wh_row = (
        db.query(WorkingHoursYearMonth)
        .filter(WorkingHoursYearMonth.year == year, WorkingHoursYearMonth.month == month)
        .first()
    )
    working_hours = float(wh_row.hours) if wh_row else 0.0

    staffers = (
        db.query(Staffer)
        .filter(Staffer.project_id == project_id)
        .all()
    )
    active = [s for s in staffers if staffer_active_in_month(s, year, month)]

    plan_hours = working_hours * len(active)
    plan_amount = sum(
        float(Decimal(str(working_hours)) * Decimal(str(s.hourly_rate)))
        for s in active
    )
    return plan_amount, plan_hours


def recalculate_expense_plan(db: Session, expense: StaffingExpense) -> None:
    """Recalculate plan fields for a StaffingExpense row and flush (no commit)."""
    if expense.project_id is None:
        return
    plan_amount, plan_hours = calculate_plan_for_month(
        db, expense.project_id, expense.year, expense.month
    )
    expense.plan_amount = plan_amount
    expense.plan_hours = plan_hours


# ---------------------------------------------------------------------------
# Contractor helpers
# ---------------------------------------------------------------------------

def build_contractor_out(contractor: Contractor) -> dict:
    """Build serializable dict for a Contractor with staffer preview."""
    staffers_preview = [
        {
            "id": str(s.id),
            "full_name": s.full_name,
            "valid_from": s.valid_from.isoformat(),
            "valid_to": s.valid_to.isoformat() if s.valid_to else None,
        }
        for s in contractor.staffers
    ]
    return {
        "id": str(contractor.id),
        "name": contractor.name,
        "created_at": contractor.created_at,
        "updated_at": contractor.updated_at,
        "staffer_count": len(contractor.staffers),
        "staffers_preview": staffers_preview,
    }


# ---------------------------------------------------------------------------
# Staffer helpers
# ---------------------------------------------------------------------------

def build_staffer_out(staffer: Staffer) -> dict:
    """Build serializable dict for a Staffer."""
    return {
        "id": str(staffer.id),
        "display_order": staffer.display_order,
        "first_name": staffer.first_name,
        "last_name": staffer.last_name,
        "middle_name": staffer.middle_name,
        "full_name": staffer.full_name,
        "contractor_id": str(staffer.contractor_id) if staffer.contractor_id else None,
        "contractor_name": staffer.contractor.name if staffer.contractor else None,
        "project_id": str(staffer.project_id) if staffer.project_id else None,
        "project_name": staffer.project.name if staffer.project else None,
        "staffing_budget_id": str(staffer.staffing_budget_id) if staffer.staffing_budget_id else None,
        "staffing_budget_name": staffer.staffing_budget.name if staffer.staffing_budget else None,
        "specialization": staffer.specialization,
        "hourly_rate": float(staffer.hourly_rate),
        "valid_from": staffer.valid_from,
        "valid_to": staffer.valid_to,
        "pm_name": staffer.pm_name,
        "comment": staffer.comment,
        "rating": staffer.rating,
        "task_description": staffer.task_description,
        "work_status": staffer.work_status,
        "extension_status": staffer.extension_status,
        "extension_comment": staffer.extension_comment,
        "created_at": staffer.created_at,
        "updated_at": staffer.updated_at,
    }
