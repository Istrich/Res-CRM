"""Staffing module router: contractors, staffers, expenses, budgets."""
import logging
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Contractor,
    ContractorDocument,
    Project,
    Staffer,
    StafferInvoiceFile,
    StafferMonthExpense,
    StafferMonthRate,
    StaffingBudget,
    StaffingBudgetMonthPlan,
    StaffingExpense,
    StaffingInvoice,
    User,
    WorkingHoursYearMonth,
)
from app.schemas.staffing import (
    ContractorCreate,
    ContractorDocumentOut,
    ContractorOut,
    ContractorUpdate,
    StafferCreate,
    StafferInvoiceFileOut,
    StafferMatrixRow,
    StafferMonthExpenseOut,
    StafferMonthExpenseUpsert,
    StafferMonthRateOut,
    StafferMonthRateUpsert,
    StafferOut,
    StafferPrefillPlanResult,
    StafferUpdate,
    StaffingBudgetCreate,
    StaffingBudgetMonthPlanBatch,
    StaffingBudgetMonthPlanOut,
    StaffingBudgetOut,
    StaffingBudgetUpdate,
    StaffingExpenseOut,
    StaffingExpenseSummaryItem,
    StaffingExpenseUpsert,
    StaffingInvoiceOut,
)
from app.services.staffing_service import (
    build_contractor_out,
    build_staffer_out,
    recalculate_expense_plan,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/staffing", tags=["staffing"])

_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


# ---------------------------------------------------------------------------
# Upload helpers
# ---------------------------------------------------------------------------

def _uploads_root() -> Path:
    p = Path(settings.STAFFING_UPLOADS_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


async def _save_upload(file: UploadFile, sub_dir: str) -> tuple[str, str]:
    """Read upload, enforce size limit, persist to disk.

    Returns (stored_path, content_type).
    """
    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum allowed size is 50 MB.",
        )
    dest_dir = _uploads_root() / sub_dir
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4()}_{file.filename}"
    dest_path = dest_dir / stored_name
    dest_path.write_bytes(content)
    return str(dest_path), file.content_type or "application/octet-stream"


def _delete_file(path: str) -> None:
    try:
        os.remove(path)
    except OSError as exc:
        logger.warning("Could not delete file %s: %s", path, exc)


# ===========================================================================
# Contractors
# ===========================================================================

@router.get("/contractors", response_model=list[ContractorOut])
def list_contractors(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    contractors = (
        db.query(Contractor)
        .options(joinedload(Contractor.staffers), joinedload(Contractor.documents))
        .order_by(Contractor.name)
        .all()
    )
    return [build_contractor_out(c) for c in contractors]


@router.post("/contractors", response_model=ContractorOut, status_code=status.HTTP_201_CREATED)
def create_contractor(
    body: ContractorCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    c = Contractor(name=body.name)
    db.add(c)
    db.commit()
    db.refresh(c)
    db.expire(c)
    c = (
        db.query(Contractor)
        .options(joinedload(Contractor.staffers))
        .filter(Contractor.id == c.id)
        .one()
    )
    return build_contractor_out(c)


@router.get("/contractors/{contractor_id}", response_model=ContractorOut)
def get_contractor(
    contractor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    c = (
        db.query(Contractor)
        .options(joinedload(Contractor.staffers), joinedload(Contractor.documents))
        .filter(Contractor.id == contractor_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return build_contractor_out(c)


@router.patch("/contractors/{contractor_id}", response_model=ContractorOut)
def update_contractor(
    contractor_id: uuid.UUID,
    body: ContractorUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    c = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    if body.name is not None:
        c.name = body.name
    db.commit()
    db.expire(c)
    c = (
        db.query(Contractor)
        .options(joinedload(Contractor.staffers))
        .filter(Contractor.id == c.id)
        .one()
    )
    return build_contractor_out(c)


@router.delete("/contractors/{contractor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contractor(
    contractor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    c = (
        db.query(Contractor)
        .options(joinedload(Contractor.documents))
        .filter(Contractor.id == contractor_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    for doc in c.documents:
        _delete_file(doc.stored_path)
    db.delete(c)
    db.commit()


# ---------------------------------------------------------------------------
# Contractor documents
# ---------------------------------------------------------------------------

@router.post(
    "/contractors/{contractor_id}/documents",
    response_model=ContractorDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_contractor_document(
    contractor_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    c = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    stored_path, content_type = await _save_upload(file, f"contracts/{contractor_id}")
    doc = ContractorDocument(
        contractor_id=contractor_id,
        filename=file.filename or "upload",
        stored_path=stored_path,
        content_type=content_type,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get(
    "/contractors/{contractor_id}/documents",
    response_model=list[ContractorDocumentOut],
)
def list_contractor_documents(
    contractor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    c = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    docs = (
        db.query(ContractorDocument)
        .filter(ContractorDocument.contractor_id == contractor_id)
        .order_by(ContractorDocument.uploaded_at)
        .all()
    )
    return docs


@router.get("/contractors/{contractor_id}/documents/{doc_id}/download")
def download_contractor_document(
    contractor_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = (
        db.query(ContractorDocument)
        .filter(
            ContractorDocument.id == doc_id,
            ContractorDocument.contractor_id == contractor_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.stored_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=doc.stored_path,
        media_type=doc.content_type or "application/octet-stream",
        filename=doc.filename,
    )


@router.delete(
    "/contractors/{contractor_id}/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_contractor_document(
    contractor_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = (
        db.query(ContractorDocument)
        .filter(
            ContractorDocument.id == doc_id,
            ContractorDocument.contractor_id == contractor_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _delete_file(doc.stored_path)
    db.delete(doc)
    db.commit()


# ===========================================================================
# Staffers
# ===========================================================================

@router.get("/staffers", response_model=list[StafferOut])
def list_staffers(
    project_id: Optional[uuid.UUID] = Query(None),
    contractor_id: Optional[uuid.UUID] = Query(None),
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = (
        db.query(Staffer)
        .options(joinedload(Staffer.contractor), joinedload(Staffer.project))
    )
    if project_id:
        q = q.filter(Staffer.project_id == project_id)
    if contractor_id:
        q = q.filter(Staffer.contractor_id == contractor_id)
    if year:
        from datetime import date as _date
        import calendar as _cal
        year_start = _date(year, 1, 1)
        year_end = _date(year, 12, 31)
        q = q.filter(
            Staffer.valid_from <= year_end,
            (Staffer.valid_to == None) | (Staffer.valid_to >= year_start),  # noqa: E711
        )
    staffers = q.order_by(Staffer.last_name, Staffer.first_name).all()
    return [build_staffer_out(s) for s in staffers]


@router.post("/staffers", response_model=StafferOut, status_code=status.HTTP_201_CREATED)
def create_staffer(
    body: StafferCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if body.contractor_id:
        if not db.query(Contractor).filter(Contractor.id == body.contractor_id).first():
            raise HTTPException(status_code=404, detail="Contractor not found")
    if body.project_id:
        if not db.query(Project).filter(Project.id == body.project_id).first():
            raise HTTPException(status_code=404, detail="Project not found")

    s = Staffer(**body.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    _trigger_expense_recalc(db, s)
    s = (
        db.query(Staffer)
        .options(joinedload(Staffer.contractor), joinedload(Staffer.project))
        .filter(Staffer.id == s.id)
        .one()
    )
    return build_staffer_out(s)


@router.get("/staffers/{staffer_id}", response_model=StafferOut)
def get_staffer(
    staffer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = (
        db.query(Staffer)
        .options(joinedload(Staffer.contractor), joinedload(Staffer.project))
        .filter(Staffer.id == staffer_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Staffer not found")
    return build_staffer_out(s)


@router.patch("/staffers/{staffer_id}", response_model=StafferOut)
def update_staffer(
    staffer_id: uuid.UUID,
    body: StafferUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = db.query(Staffer).filter(Staffer.id == staffer_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Staffer not found")

    data = body.model_dump(exclude_unset=True)
    if "contractor_id" in data and data["contractor_id"]:
        if not db.query(Contractor).filter(Contractor.id == data["contractor_id"]).first():
            raise HTTPException(status_code=404, detail="Contractor not found")
    if "project_id" in data and data["project_id"]:
        if not db.query(Project).filter(Project.id == data["project_id"]).first():
            raise HTTPException(status_code=404, detail="Project not found")

    for k, v in data.items():
        setattr(s, k, v)
    db.commit()
    _trigger_expense_recalc(db, s)
    s = (
        db.query(Staffer)
        .options(joinedload(Staffer.contractor), joinedload(Staffer.project))
        .filter(Staffer.id == s.id)
        .one()
    )
    return build_staffer_out(s)


@router.delete("/staffers/{staffer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_staffer(
    staffer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = db.query(Staffer).filter(Staffer.id == staffer_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Staffer not found")
    project_id = s.project_id
    db.delete(s)
    db.commit()
    if project_id:
        _recalc_all_expenses_for_project(db, project_id)


def _trigger_expense_recalc(db: Session, staffer: Staffer) -> None:
    """Recalculate plan for all expense rows of the staffer's project."""
    if not staffer.project_id:
        return
    _recalc_all_expenses_for_project(db, staffer.project_id)


def _recalc_all_expenses_for_project(db: Session, project_id) -> None:
    expenses = (
        db.query(StaffingExpense)
        .filter(StaffingExpense.project_id == project_id)
        .all()
    )
    for exp in expenses:
        recalculate_expense_plan(db, exp)
    if expenses:
        db.commit()


# ===========================================================================
# Staffing Expenses
# ===========================================================================

@router.get("/expenses", response_model=list[StaffingExpenseOut])
def list_expenses(
    year: int = Query(...),
    project_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = (
        db.query(StaffingExpense)
        .options(
            joinedload(StaffingExpense.project),
            joinedload(StaffingExpense.invoices),
        )
        .filter(StaffingExpense.year == year)
    )
    if project_id:
        q = q.filter(StaffingExpense.project_id == project_id)
    rows = q.order_by(StaffingExpense.month).all()

    result = []
    for r in rows:
        result.append(
            StaffingExpenseOut(
                id=r.id,
                project_id=r.project_id,
                project_name=r.project.name if r.project else None,
                year=r.year,
                month=r.month,
                plan_amount=float(r.plan_amount),
                fact_amount=float(r.fact_amount),
                plan_hours=float(r.plan_hours),
                fact_hours=float(r.fact_hours),
                invoices=[StaffingInvoiceOut.model_validate(inv) for inv in r.invoices],
            )
        )
    return result


@router.put("/expenses/{project_id}/{year}/{month}", response_model=StaffingExpenseOut)
def upsert_expense(
    project_id: uuid.UUID,
    year: int,
    month: int,
    body: StaffingExpenseUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="Month must be between 1 and 12")

    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    exp = (
        db.query(StaffingExpense)
        .filter(
            StaffingExpense.project_id == project_id,
            StaffingExpense.year == year,
            StaffingExpense.month == month,
        )
        .first()
    )
    if exp is None:
        exp = StaffingExpense(project_id=project_id, year=year, month=month)
        recalculate_expense_plan(db, exp)
        db.add(exp)

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(exp, k, v)
    db.commit()
    db.refresh(exp)

    exp = (
        db.query(StaffingExpense)
        .options(joinedload(StaffingExpense.project), joinedload(StaffingExpense.invoices))
        .filter(StaffingExpense.id == exp.id)
        .one()
    )
    return StaffingExpenseOut(
        id=exp.id,
        project_id=exp.project_id,
        project_name=exp.project.name if exp.project else None,
        year=exp.year,
        month=exp.month,
        plan_amount=float(exp.plan_amount),
        fact_amount=float(exp.fact_amount),
        plan_hours=float(exp.plan_hours),
        fact_hours=float(exp.fact_hours),
        invoices=[StaffingInvoiceOut.model_validate(inv) for inv in exp.invoices],
    )


@router.get("/expenses/summary", response_model=list[StaffingExpenseSummaryItem])
def expenses_summary(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (
        db.query(StaffingExpense)
        .options(joinedload(StaffingExpense.project))
        .filter(StaffingExpense.year == year)
        .all()
    )
    aggregated: dict = {}
    for r in rows:
        key = str(r.project_id)
        if key not in aggregated:
            aggregated[key] = {
                "project_id": r.project_id,
                "project_name": r.project.name if r.project else None,
                "plan_total": 0.0,
                "fact_total": 0.0,
                "plan_hours_total": 0.0,
                "fact_hours_total": 0.0,
            }
        aggregated[key]["plan_total"] += float(r.plan_amount)
        aggregated[key]["fact_total"] += float(r.fact_amount)
        aggregated[key]["plan_hours_total"] += float(r.plan_hours)
        aggregated[key]["fact_hours_total"] += float(r.fact_hours)
    return list(aggregated.values())


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------

@router.post(
    "/expenses/{expense_id}/invoices",
    response_model=StaffingInvoiceOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_invoice(
    expense_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exp = db.query(StaffingExpense).filter(StaffingExpense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    stored_path, content_type = await _save_upload(file, f"invoices/{expense_id}")
    inv = StaffingInvoice(
        expense_id=expense_id,
        filename=file.filename or "invoice",
        stored_path=stored_path,
        content_type=content_type,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


@router.get(
    "/expenses/{expense_id}/invoices",
    response_model=list[StaffingInvoiceOut],
)
def list_invoices(
    expense_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exp = db.query(StaffingExpense).filter(StaffingExpense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    return (
        db.query(StaffingInvoice)
        .filter(StaffingInvoice.expense_id == expense_id)
        .order_by(StaffingInvoice.uploaded_at)
        .all()
    )


@router.get("/invoices/{invoice_id}/download")
def download_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inv = db.query(StaffingInvoice).filter(StaffingInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not os.path.exists(inv.stored_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=inv.stored_path,
        media_type=inv.content_type or "application/octet-stream",
        filename=inv.filename,
    )


@router.delete("/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inv = db.query(StaffingInvoice).filter(StaffingInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _delete_file(inv.stored_path)
    db.delete(inv)
    db.commit()


# ===========================================================================
# Staffing Budgets
# ===========================================================================

def _build_budget_out(budget: StaffingBudget, db: Session) -> StaffingBudgetOut:
    plan_total = sum(float(mp.amount) for mp in budget.month_plans)
    fact_rows = (
        db.query(StaffingExpense)
        .filter(StaffingExpense.year == budget.year)
        .all()
    )
    fact_total = sum(float(r.fact_amount) for r in fact_rows)
    delta = plan_total - fact_total
    return StaffingBudgetOut(
        id=budget.id,
        name=budget.name,
        year=budget.year,
        total_budget=float(budget.total_budget) if budget.total_budget is not None else None,
        plan_total=plan_total,
        fact_total=fact_total,
        delta=delta,
        created_at=budget.created_at,
        updated_at=budget.updated_at,
    )


@router.get("/budgets", response_model=list[StaffingBudgetOut])
def list_budgets(
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(StaffingBudget).options(joinedload(StaffingBudget.month_plans))
    if year:
        q = q.filter(StaffingBudget.year == year)
    budgets = q.order_by(StaffingBudget.year.desc(), StaffingBudget.name).all()
    return [_build_budget_out(b, db) for b in budgets]


@router.post("/budgets", response_model=StaffingBudgetOut, status_code=status.HTTP_201_CREATED)
def create_budget(
    body: StaffingBudgetCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    b = StaffingBudget(name=body.name, year=body.year, total_budget=body.total_budget)
    db.add(b)
    db.commit()
    db.refresh(b)
    b = (
        db.query(StaffingBudget)
        .options(joinedload(StaffingBudget.month_plans))
        .filter(StaffingBudget.id == b.id)
        .one()
    )
    return _build_budget_out(b, db)


@router.get("/budgets/{budget_id}", response_model=StaffingBudgetOut)
def get_budget(
    budget_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    b = (
        db.query(StaffingBudget)
        .options(joinedload(StaffingBudget.month_plans))
        .filter(StaffingBudget.id == budget_id)
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    return _build_budget_out(b, db)


@router.patch("/budgets/{budget_id}", response_model=StaffingBudgetOut)
def update_budget(
    budget_id: uuid.UUID,
    body: StaffingBudgetUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    b = db.query(StaffingBudget).filter(StaffingBudget.id == budget_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    db.commit()
    b = (
        db.query(StaffingBudget)
        .options(joinedload(StaffingBudget.month_plans))
        .filter(StaffingBudget.id == b.id)
        .one()
    )
    return _build_budget_out(b, db)


@router.delete("/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    b = db.query(StaffingBudget).filter(StaffingBudget.id == budget_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(b)
    db.commit()


@router.get("/budgets/{budget_id}/month-plan", response_model=list[StaffingBudgetMonthPlanOut])
def get_budget_month_plan(
    budget_id: uuid.UUID,
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    b = db.query(StaffingBudget).filter(StaffingBudget.id == budget_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    plans = (
        db.query(StaffingBudgetMonthPlan)
        .filter(
            StaffingBudgetMonthPlan.staffing_budget_id == budget_id,
            StaffingBudgetMonthPlan.year == year,
        )
        .order_by(StaffingBudgetMonthPlan.month)
        .all()
    )
    return plans


@router.put(
    "/budgets/{budget_id}/month-plan",
    response_model=list[StaffingBudgetMonthPlanOut],
)
def upsert_budget_month_plan(
    budget_id: uuid.UUID,
    body: StaffingBudgetMonthPlanBatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    b = db.query(StaffingBudget).filter(StaffingBudget.id == budget_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")

    for item in body.items:
        existing = (
            db.query(StaffingBudgetMonthPlan)
            .filter(
                StaffingBudgetMonthPlan.staffing_budget_id == budget_id,
                StaffingBudgetMonthPlan.year == body.year,
                StaffingBudgetMonthPlan.month == item.month,
            )
            .first()
        )
        if existing:
            existing.amount = item.amount
        else:
            db.add(
                StaffingBudgetMonthPlan(
                    staffing_budget_id=budget_id,
                    year=body.year,
                    month=item.month,
                    amount=item.amount,
                )
            )
    db.commit()

    plans = (
        db.query(StaffingBudgetMonthPlan)
        .filter(
            StaffingBudgetMonthPlan.staffing_budget_id == budget_id,
            StaffingBudgetMonthPlan.year == body.year,
        )
        .order_by(StaffingBudgetMonthPlan.month)
        .all()
    )
    return plans


# ===========================================================================
# Staffer Expense Matrix (per-staffer per-month)
# ===========================================================================

def _build_staffer_expense_out(exp: StafferMonthExpense) -> StafferMonthExpenseOut:
    return StafferMonthExpenseOut(
        id=exp.id,
        staffer_id=exp.staffer_id,
        year=exp.year,
        month=exp.month,
        hourly_rate=float(exp.hourly_rate) if exp.hourly_rate is not None else None,
        planned_hours=float(exp.planned_hours) if exp.planned_hours is not None else None,
        actual_hours=float(exp.actual_hours) if exp.actual_hours is not None else None,
        planned_amount=float(exp.planned_amount) if exp.planned_amount is not None else None,
        actual_amount=float(exp.actual_amount) if exp.actual_amount is not None else None,
        invoice_text=exp.invoice_text,
        invoice_link=exp.invoice_link,
        invoice_status=exp.invoice_status,
        carry_over_budget=float(exp.carry_over_budget) if exp.carry_over_budget is not None else None,
        comment=exp.comment,
        invoice_files=[StafferInvoiceFileOut.model_validate(f) for f in exp.invoice_files],
    )


@router.get("/staffer-matrix", response_model=list[StafferMatrixRow])
def get_staffer_matrix(
    year: int = Query(...),
    project_id: Optional[uuid.UUID] = Query(None),
    contractor_id: Optional[uuid.UUID] = Query(None),
    work_status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return all staffers with their per-month expense data for the given year."""
    from sqlalchemy import nullslast

    q = (
        db.query(Staffer)
        .options(
            joinedload(Staffer.contractor),
            joinedload(Staffer.project),
            joinedload(Staffer.month_expenses).joinedload(StafferMonthExpense.invoice_files),
            joinedload(Staffer.month_rates),
        )
    )
    if project_id:
        q = q.filter(Staffer.project_id == project_id)
    if contractor_id:
        q = q.filter(Staffer.contractor_id == contractor_id)
    if work_status:
        q = q.filter(Staffer.work_status == work_status)

    staffers = q.order_by(
        nullslast(Staffer.display_order.asc()),
        Staffer.last_name,
        Staffer.first_name,
    ).all()

    result = []
    for s in staffers:
        year_expenses = [e for e in s.month_expenses if e.year == year]
        year_rates = [r for r in s.month_rates if r.year == year]
        result.append(
            StafferMatrixRow(
                id=s.id,
                display_order=s.display_order,
                full_name=s.full_name,
                first_name=s.first_name,
                last_name=s.last_name,
                middle_name=s.middle_name,
                contractor_id=s.contractor_id,
                contractor_name=s.contractor.name if s.contractor else None,
                rating=s.rating,
                specialization=s.specialization,
                project_id=s.project_id,
                project_name=s.project.name if s.project else None,
                task_description=s.task_description,
                hourly_rate=float(s.hourly_rate),
                valid_from=s.valid_from,
                valid_to=s.valid_to,
                pm_name=s.pm_name,
                comment=s.comment,
                work_status=s.work_status,
                extension_status=s.extension_status,
                extension_comment=s.extension_comment,
                month_expenses=[_build_staffer_expense_out(e) for e in year_expenses],
                month_rates=[StafferMonthRateOut.model_validate(r) for r in year_rates],
            )
        )
    return result


@router.put(
    "/staffer-expenses/{staffer_id}/{year}/{month}",
    response_model=StafferMonthExpenseOut,
)
def upsert_staffer_expense(
    staffer_id: uuid.UUID,
    year: int,
    month: int,
    body: StafferMonthExpenseUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="Month must be between 1 and 12")

    s = db.query(Staffer).filter(Staffer.id == staffer_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Staffer not found")

    exp = (
        db.query(StafferMonthExpense)
        .filter(
            StafferMonthExpense.staffer_id == staffer_id,
            StafferMonthExpense.year == year,
            StafferMonthExpense.month == month,
        )
        .first()
    )
    if exp is None:
        exp = StafferMonthExpense(staffer_id=staffer_id, year=year, month=month)
        db.add(exp)

    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(exp, k, v)
    db.commit()
    db.refresh(exp)

    exp = (
        db.query(StafferMonthExpense)
        .options(joinedload(StafferMonthExpense.invoice_files))
        .filter(StafferMonthExpense.id == exp.id)
        .one()
    )
    return _build_staffer_expense_out(exp)


@router.post(
    "/staffer-expenses/{expense_id}/invoice-files",
    response_model=StafferInvoiceFileOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_staffer_invoice_file(
    expense_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exp = db.query(StafferMonthExpense).filter(StafferMonthExpense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Staffer expense not found")
    stored_path, content_type = await _save_upload(file, f"staffer-invoices/{expense_id}")
    inv = StafferInvoiceFile(
        staffer_expense_id=expense_id,
        filename=file.filename or "invoice",
        stored_path=stored_path,
        content_type=content_type,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


@router.get("/staffer-invoice-files/{file_id}/download")
def download_staffer_invoice_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inv = db.query(StafferInvoiceFile).filter(StafferInvoiceFile.id == file_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice file not found")
    if not os.path.exists(inv.stored_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=inv.stored_path,
        media_type=inv.content_type or "application/octet-stream",
        filename=inv.filename,
    )


@router.delete("/staffer-invoice-files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_staffer_invoice_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inv = db.query(StafferInvoiceFile).filter(StafferInvoiceFile.id == file_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice file not found")
    _delete_file(inv.stored_path)
    db.delete(inv)
    db.commit()


# ---------------------------------------------------------------------------
# Staffer month rates
# ---------------------------------------------------------------------------


@router.get(
    "/staffers/{staffer_id}/month-rates",
    response_model=list[StafferMonthRateOut],
)
def get_staffer_month_rates(
    staffer_id: uuid.UUID,
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return all per-month rate records for a staffer in the given year."""
    s = db.query(Staffer).filter(Staffer.id == staffer_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Staffer not found")
    rates = (
        db.query(StafferMonthRate)
        .filter(StafferMonthRate.staffer_id == staffer_id, StafferMonthRate.year == year)
        .order_by(StafferMonthRate.month)
        .all()
    )
    return rates


@router.put(
    "/staffers/{staffer_id}/month-rates/{year}/{month}",
    response_model=StafferMonthRateOut,
)
def upsert_staffer_month_rate(
    staffer_id: uuid.UUID,
    year: int,
    month: int,
    body: StafferMonthRateUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Upsert the hourly rate for a specific staffer / year / month."""
    if not 1 <= month <= 12:
        raise HTTPException(status_code=422, detail="Month must be between 1 and 12")
    s = db.query(Staffer).filter(Staffer.id == staffer_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Staffer not found")

    rate = (
        db.query(StafferMonthRate)
        .filter(
            StafferMonthRate.staffer_id == staffer_id,
            StafferMonthRate.year == year,
            StafferMonthRate.month == month,
        )
        .first()
    )
    if rate is None:
        rate = StafferMonthRate(
            staffer_id=staffer_id, year=year, month=month, hourly_rate=body.hourly_rate
        )
        db.add(rate)
    else:
        rate.hourly_rate = body.hourly_rate
    db.commit()
    db.refresh(rate)
    return rate


@router.delete(
    "/staffers/{staffer_id}/month-rates/{year}/{month}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_staffer_month_rate(
    staffer_id: uuid.UUID,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Delete an explicit monthly rate, reverting the month to the staffer's base rate."""
    rate = (
        db.query(StafferMonthRate)
        .filter(
            StafferMonthRate.staffer_id == staffer_id,
            StafferMonthRate.year == year,
            StafferMonthRate.month == month,
        )
        .first()
    )
    if rate:
        db.delete(rate)
        db.commit()


# ---------------------------------------------------------------------------
# Batch pre-fill planned hours + planned amounts from working calendar
# ---------------------------------------------------------------------------


@router.post("/staffer-matrix/prefill-plan", response_model=StafferPrefillPlanResult)
def prefill_staffer_plan(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    For every staffer and every month within the staffer's valid period:
    - Set planned_hours from the working calendar if it is not already set.
    - Set planned_amount = effective_rate * planned_hours if it is not already set.
    Existing explicit values are never overwritten.
    """
    from calendar import monthrange
    from datetime import date as _date

    # Load working hours for the year; build month -> hours dict
    wh_rows = (
        db.query(WorkingHoursYearMonth)
        .filter(WorkingHoursYearMonth.year == year)
        .all()
    )
    wh = {r.month: float(r.hours) for r in wh_rows}
    if not wh:
        return StafferPrefillPlanResult(created=0, updated=0)

    # Load all staffers with their month rates and expenses
    staffers = (
        db.query(Staffer)
        .options(
            joinedload(Staffer.month_expenses),
            joinedload(Staffer.month_rates),
        )
        .all()
    )

    created = 0
    updated = 0

    for s in staffers:
        vf: _date = s.valid_from
        vt: _date | None = s.valid_to

        for month in range(1, 13):
            # Check whether (year, month) falls within the staffer's valid period.
            # "Up to valid_to inclusively" means we include the month containing valid_to.
            if vf and (year < vf.year or (year == vf.year and month < vf.month)):
                continue
            if vt and (year > vt.year or (year == vt.year and month > vt.month)):
                continue

            hours_for_month = wh.get(month)
            if not hours_for_month:
                continue

            # Effective hourly rate for this month
            rate_row = next(
                (r for r in s.month_rates if r.year == year and r.month == month), None
            )
            effective_rate = float(rate_row.hourly_rate if rate_row else s.hourly_rate)

            # Find or create expense record
            exp = next(
                (e for e in s.month_expenses if e.year == year and e.month == month), None
            )
            is_new = exp is None
            if is_new:
                exp = StafferMonthExpense(staffer_id=s.id, year=year, month=month)
                db.add(exp)
                s.month_expenses.append(exp)

            changed = False
            if exp.planned_hours is None:
                exp.planned_hours = hours_for_month
                changed = True
            if exp.planned_amount is None:
                exp.planned_amount = round(effective_rate * float(exp.planned_hours), 2)
                changed = True

            if changed:
                if is_new:
                    created += 1
                else:
                    updated += 1

    db.commit()
    return StafferPrefillPlanResult(created=created, updated=updated)
