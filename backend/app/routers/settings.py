"""Admin settings (non-sensitive business configuration)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, WorkingHoursYearMonth
from app.schemas.settings import WorkingHoursOut, WorkingHoursUpsert, WorkingHoursMonthItem

router = APIRouter(prefix="/settings", tags=["settings"])


def _build_working_hours_out(db: Session, year: int) -> WorkingHoursOut:
    rows = db.query(WorkingHoursYearMonth).filter(WorkingHoursYearMonth.year == year).all()
    by_month = {r.month: float(r.hours) for r in rows}
    items = [WorkingHoursMonthItem(month=m, hours=by_month.get(m, 0.0)) for m in range(1, 13)]
    return WorkingHoursOut(year=year, items=items)


@router.get("/working-hours", response_model=WorkingHoursOut)
def get_working_hours(
    year: int = Query(..., ge=1900, le=2100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return working hours for each month Jan..Dec."""
    return _build_working_hours_out(db, year)


@router.put("/working-hours", response_model=WorkingHoursOut)
def put_working_hours(
    body: WorkingHoursUpsert,
    year: int = Query(..., ge=1900, le=2100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Upsert working hours for the given year."""
    existing_rows = (
        db.query(WorkingHoursYearMonth)
        .filter(WorkingHoursYearMonth.year == year)
        .all()
    )
    by_month = {r.month: r for r in existing_rows}

    for item in body.items:
        row = by_month.get(item.month)
        if row is None:
            db.add(WorkingHoursYearMonth(year=year, month=item.month, hours=item.hours))
        else:
            row.hours = item.hours

    db.commit()
    return _build_working_hours_out(db, year)

