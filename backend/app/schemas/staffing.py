"""Pydantic schemas for the Staffing module."""
import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Contractors
# ---------------------------------------------------------------------------

class ContractorDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    contractor_id: uuid.UUID
    filename: str
    content_type: Optional[str] = None
    uploaded_at: datetime


class ContractorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ContractorUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class ContractorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime
    staffer_count: int = 0
    staffers_preview: list[dict] = []


class ContractorListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    staffer_count: int = 0
    staffers_preview: list[dict] = []


# ---------------------------------------------------------------------------
# Staffers
# ---------------------------------------------------------------------------

class StafferCreate(BaseModel):
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    contractor_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    specialization: Optional[str] = Field(None, max_length=255)
    hourly_rate: float = Field(0, ge=0)
    valid_from: date
    valid_to: Optional[date] = None
    pm_name: Optional[str] = Field(None, max_length=255)
    comment: Optional[str] = None
    display_order: Optional[int] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    task_description: Optional[str] = None
    work_status: Optional[str] = Field(None, max_length=50)
    extension_status: Optional[str] = Field(None, max_length=50)
    extension_comment: Optional[str] = Field(None, max_length=500)


class StafferUpdate(BaseModel):
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    contractor_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    specialization: Optional[str] = Field(None, max_length=255)
    hourly_rate: Optional[float] = Field(None, ge=0)
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    pm_name: Optional[str] = Field(None, max_length=255)
    comment: Optional[str] = None
    display_order: Optional[int] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    task_description: Optional[str] = None
    work_status: Optional[str] = Field(None, max_length=50)
    extension_status: Optional[str] = Field(None, max_length=50)
    extension_comment: Optional[str] = Field(None, max_length=500)


class StafferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_order: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    full_name: str
    contractor_id: Optional[uuid.UUID] = None
    contractor_name: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    specialization: Optional[str] = None
    hourly_rate: float
    valid_from: date
    valid_to: Optional[date] = None
    pm_name: Optional[str] = None
    comment: Optional[str] = None
    rating: Optional[int] = None
    task_description: Optional[str] = None
    work_status: Optional[str] = None
    extension_status: Optional[str] = None
    extension_comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Staffer Expense Matrix (per-staffer per-month)
# ---------------------------------------------------------------------------

class StafferInvoiceFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    staffer_expense_id: uuid.UUID
    filename: str
    content_type: Optional[str] = None
    uploaded_at: datetime


class StafferMonthExpenseUpsert(BaseModel):
    hourly_rate: Optional[float] = Field(None, ge=0)
    planned_hours: Optional[float] = Field(None, ge=0)
    actual_hours: Optional[float] = Field(None, ge=0)
    planned_amount: Optional[float] = Field(None, ge=0)
    actual_amount: Optional[float] = Field(None, ge=0)
    invoice_text: Optional[str] = Field(None, max_length=500)
    invoice_link: Optional[str] = Field(None, max_length=1000)
    invoice_status: Optional[str] = Field(None, max_length=50)
    carry_over_budget: Optional[float] = Field(None, ge=0)
    comment: Optional[str] = None


class StafferMonthExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    staffer_id: uuid.UUID
    year: int
    month: int
    hourly_rate: Optional[float] = None
    planned_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    planned_amount: Optional[float] = None
    actual_amount: Optional[float] = None
    invoice_text: Optional[str] = None
    invoice_link: Optional[str] = None
    invoice_status: Optional[str] = None
    carry_over_budget: Optional[float] = None
    comment: Optional[str] = None
    invoice_files: list[StafferInvoiceFileOut] = []


class StafferMatrixRow(BaseModel):
    id: uuid.UUID
    display_order: Optional[int] = None
    full_name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    contractor_id: Optional[uuid.UUID] = None
    contractor_name: Optional[str] = None
    rating: Optional[int] = None
    specialization: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    task_description: Optional[str] = None
    hourly_rate: float
    valid_from: date
    valid_to: Optional[date] = None
    pm_name: Optional[str] = None
    comment: Optional[str] = None
    work_status: Optional[str] = None
    extension_status: Optional[str] = None
    extension_comment: Optional[str] = None
    month_expenses: list[StafferMonthExpenseOut] = []
    month_rates: list[Any] = []  # list[StafferMonthRateOut] — resolved after class definition


# ---------------------------------------------------------------------------
# Staffing Expenses
# ---------------------------------------------------------------------------

class StaffingExpenseUpsert(BaseModel):
    plan_amount: Optional[float] = Field(None, ge=0)
    fact_amount: Optional[float] = Field(None, ge=0)
    plan_hours: Optional[float] = Field(None, ge=0)
    fact_hours: Optional[float] = Field(None, ge=0)


class StaffingInvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    expense_id: uuid.UUID
    filename: str
    content_type: Optional[str] = None
    uploaded_at: datetime


class StaffingExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    year: int
    month: int
    plan_amount: float
    fact_amount: float
    plan_hours: float
    fact_hours: float
    invoices: list[StaffingInvoiceOut] = []


class StaffingExpenseSummaryItem(BaseModel):
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    plan_total: float
    fact_total: float
    plan_hours_total: float
    fact_hours_total: float


# ---------------------------------------------------------------------------
# Staffing Budgets
# ---------------------------------------------------------------------------

class StaffingBudgetMonthPlanItem(BaseModel):
    month: int = Field(..., ge=1, le=12)
    amount: float = Field(..., ge=0)


class StaffingBudgetMonthPlanBatch(BaseModel):
    year: int
    items: list[StaffingBudgetMonthPlanItem]


class StaffingBudgetMonthPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    staffing_budget_id: uuid.UUID
    year: int
    month: int
    amount: float


class StaffingBudgetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    year: int
    total_budget: Optional[float] = Field(None, ge=0)


class StaffingBudgetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    year: Optional[int] = None
    total_budget: Optional[float] = Field(None, ge=0)


class StaffingBudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    year: int
    total_budget: Optional[float] = None
    plan_total: float = 0.0
    fact_total: float = 0.0
    delta: float = 0.0
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# StafferMonthRate — per-staffer per-month hourly rate history
# ---------------------------------------------------------------------------


class StafferPrefillPlanResult(BaseModel):
    created: int = 0
    updated: int = 0


class StafferMonthRateUpsert(BaseModel):
    hourly_rate: float = Field(..., ge=0)


class StafferMonthRateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    staffer_id: uuid.UUID
    year: int
    month: int
    hourly_rate: float
    updated_at: datetime
