import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.types import GUID


# ---------------------------------------------------------------------------
# User (single admin)
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# BudgetProject — top-level financial entity
# ---------------------------------------------------------------------------

class BudgetProject(Base):
    __tablename__ = "budget_projects"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    total_budget: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    projects: Mapped[list["Project"]] = relationship("Project", back_populates="budget_project")
    month_plans: Mapped[list["BudgetProjectMonthPlan"]] = relationship(
        "BudgetProjectMonthPlan", back_populates="budget_project", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# BudgetProjectMonthPlan — monthly budget plan per budget project / year
# ---------------------------------------------------------------------------

class BudgetProjectMonthPlan(Base):
    __tablename__ = "budget_project_month_plans"
    __table_args__ = (
        UniqueConstraint("budget_project_id", "year", "month", name="uq_bp_month_plan"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_month_plan_1_12"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    budget_project_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("budget_projects.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)

    budget_project: Mapped["BudgetProject"] = relationship("BudgetProject", back_populates="month_plans")


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    budget_project_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("budget_projects.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    budget_project: Mapped["BudgetProject | None"] = relationship("BudgetProject", back_populates="projects")
    employee_projects: Mapped[list["EmployeeProject"]] = relationship(
        "EmployeeProject", back_populates="project", cascade="all, delete-orphan"
    )
    budget_snapshots: Mapped[list["BudgetSnapshot"]] = relationship(
        "BudgetSnapshot", back_populates="project", cascade="all, delete-orphan"
    )

    month_plans: Mapped[list["ProjectMonthPlan"]] = relationship(
        "ProjectMonthPlan", back_populates="project", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# Employee / Position (unified table, is_position flag)
# ---------------------------------------------------------------------------

class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        CheckConstraint(
            "termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date",
            name="chk_term_after_hire",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    is_position: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Personal data (not required for positions)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Required fields
    title: Mapped[str] = mapped_column(String(255), nullable=False)  # должность
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    specialization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    termination_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Position-only: planned exit, status, planned salary (for hiring tab and salary records)
    planned_exit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    position_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    planned_salary: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    employee_projects: Mapped[list["EmployeeProject"]] = relationship(
        "EmployeeProject", back_populates="employee", cascade="all, delete-orphan"
    )
    salary_records: Mapped[list["SalaryRecord"]] = relationship(
        "SalaryRecord", back_populates="employee", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        parts = [self.last_name, self.first_name, self.middle_name]
        return " ".join(p for p in parts if p) or "—"

    @property
    def display_name(self) -> str:
        if self.is_position:
            return self.full_name if any([self.first_name, self.last_name]) else f"[Позиция] {self.title}"
        return self.full_name


# ---------------------------------------------------------------------------
# EmployeeProject — assignment with rate and period
# ---------------------------------------------------------------------------

class EmployeeProject(Base):
    __tablename__ = "employee_projects"
    __table_args__ = (
        CheckConstraint("rate > 0", name="chk_rate_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped["Employee"] = relationship("Employee", back_populates="employee_projects")
    project: Mapped["Project"] = relationship("Project", back_populates="employee_projects")
    month_rates: Mapped[list["AssignmentMonthRate"]] = relationship(
        "AssignmentMonthRate", back_populates="assignment", cascade="all, delete-orphan"
    )


class AssignmentMonthRate(Base):
    """Override rate for an assignment in a specific month (for budget calc)."""
    __tablename__ = "assignment_month_rates"
    __table_args__ = (
        UniqueConstraint("assignment_id", "year", "month", name="uq_assignment_year_month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_month_1_12"),
        CheckConstraint("rate > 0", name="chk_rate_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("employee_projects.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)

    assignment: Mapped["EmployeeProject"] = relationship("EmployeeProject", back_populates="month_rates")


# ---------------------------------------------------------------------------
# SalaryRecord — monthly compensation (4 components)
# ---------------------------------------------------------------------------

class SalaryRecord(Base):
    __tablename__ = "salary_records"
    __table_args__ = (
        UniqueConstraint("employee_id", "year", "month", name="uq_salary_employee_month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_month_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)

    salary: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    kpi_bonus: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    fixed_bonus: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    one_time_bonus: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    is_raise: Mapped[bool] = mapped_column(nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    employee: Mapped["Employee"] = relationship("Employee", back_populates="salary_records")

    @property
    def total(self) -> float:
        s = Decimal(str(self.salary)) + Decimal(str(self.kpi_bonus)) + Decimal(str(self.fixed_bonus)) + Decimal(str(self.one_time_bonus))
        return float(s)


# ---------------------------------------------------------------------------
# ProjectMonthPlan — monthly budget plan per project / year
# ---------------------------------------------------------------------------


class ProjectMonthPlan(Base):
    __tablename__ = "project_month_plans"
    __table_args__ = (
        UniqueConstraint("project_id", "year", "month", name="uq_project_month_plan"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_project_month_plan_1_12"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)

    project: Mapped["Project"] = relationship("Project", back_populates="month_plans")


# ---------------------------------------------------------------------------
# BudgetSnapshot — cached calculation per project/month
# ---------------------------------------------------------------------------

class BudgetSnapshot(Base):
    __tablename__ = "budget_snapshots"
    __table_args__ = (
        UniqueConstraint("project_id", "year", "month", name="uq_snapshot_project_month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_snapshot_month"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    is_forecast: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="budget_snapshots")


# ---------------------------------------------------------------------------
# WorkingHoursYearMonth — working hours per month (for future hourly rate calc)
# ---------------------------------------------------------------------------
class WorkingHoursYearMonth(Base):
    __tablename__ = "working_hours_year_months"
    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_working_hours_year_month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_working_hours_month_1_12"),
        CheckConstraint("hours >= 0", name="chk_working_hours_hours_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    hours: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)


# ===========================================================================
# Staffing Module
# ===========================================================================

# ---------------------------------------------------------------------------
# Contractor — external contractor company
# ---------------------------------------------------------------------------

class Contractor(Base):
    __tablename__ = "contractors"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    documents: Mapped[list["ContractorDocument"]] = relationship(
        "ContractorDocument", back_populates="contractor", cascade="all, delete-orphan"
    )
    staffers: Mapped[list["Staffer"]] = relationship(
        "Staffer", back_populates="contractor"
    )


# ---------------------------------------------------------------------------
# ContractorDocument — contract files attached to a contractor
# ---------------------------------------------------------------------------

class ContractorDocument(Base):
    __tablename__ = "contractor_documents"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    contractor_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("contractors.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    contractor: Mapped["Contractor"] = relationship("Contractor", back_populates="documents")


# ---------------------------------------------------------------------------
# Staffer — external specialist
# ---------------------------------------------------------------------------

class Staffer(Base):
    __tablename__ = "staffers"
    __table_args__ = (
        CheckConstraint("hourly_rate >= 0", name="chk_staffer_rate_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    display_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contractor_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("contractors.id", ondelete="SET NULL"), nullable=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    specialization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hourly_rate: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    pm_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # New fields for the staffing expense matrix
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    task_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_status: Mapped[str | None] = mapped_column(String(50), nullable=True, default="Активен")
    extension_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    extension_comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    staffing_budget_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("staffing_budgets.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    contractor: Mapped["Contractor | None"] = relationship("Contractor", back_populates="staffers")
    project: Mapped["Project | None"] = relationship("Project")
    staffing_budget: Mapped["StaffingBudget | None"] = relationship(
        "StaffingBudget", back_populates="staffers"
    )
    month_expenses: Mapped[list["StafferMonthExpense"]] = relationship(
        "StafferMonthExpense", back_populates="staffer", cascade="all, delete-orphan"
    )
    month_rates: Mapped[list["StafferMonthRate"]] = relationship(
        "StafferMonthRate", back_populates="staffer", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        parts = [self.last_name, self.first_name, self.middle_name]
        return " ".join(p for p in parts if p) or "—"


# ---------------------------------------------------------------------------
# StafferMonthExpense — per-staffer per-month financial record
# ---------------------------------------------------------------------------

class StafferMonthExpense(Base):
    __tablename__ = "staffer_month_expenses"
    __table_args__ = (
        UniqueConstraint("staffer_id", "year", "month", name="uq_staffer_month_expense"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_staffer_month_expense_1_12"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    staffer_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("staffers.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    hourly_rate: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    planned_hours: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    actual_hours: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    planned_amount: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    actual_amount: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    invoice_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    invoice_link: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    invoice_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    carry_over_budget: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    staffer: Mapped["Staffer"] = relationship("Staffer", back_populates="month_expenses")
    invoice_files: Mapped[list["StafferInvoiceFile"]] = relationship(
        "StafferInvoiceFile", back_populates="staffer_expense", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# StafferInvoiceFile — uploaded invoice PDF files per staffer expense
# ---------------------------------------------------------------------------

class StafferInvoiceFile(Base):
    __tablename__ = "staffer_invoice_files"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    staffer_expense_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("staffer_month_expenses.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    staffer_expense: Mapped["StafferMonthExpense"] = relationship(
        "StafferMonthExpense", back_populates="invoice_files"
    )


# ---------------------------------------------------------------------------
# StafferMonthRate — per-staffer per-month hourly rate history
# ---------------------------------------------------------------------------


class StafferMonthRate(Base):
    __tablename__ = "staffer_month_rates"
    __table_args__ = (
        UniqueConstraint("staffer_id", "year", "month", name="uq_staffer_month_rate"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_staffer_month_rate_1_12"),
        CheckConstraint("hourly_rate >= 0", name="chk_staffer_month_rate_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    staffer_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("staffers.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    hourly_rate: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    staffer: Mapped["Staffer"] = relationship("Staffer", back_populates="month_rates")


# ---------------------------------------------------------------------------
# StaffingBudget — staffing budget (annual)
# ---------------------------------------------------------------------------

class StaffingBudget(Base):
    __tablename__ = "staffing_budgets"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    total_budget: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    month_plans: Mapped[list["StaffingBudgetMonthPlan"]] = relationship(
        "StaffingBudgetMonthPlan", back_populates="budget", cascade="all, delete-orphan"
    )
    staffers: Mapped[list["Staffer"]] = relationship("Staffer", back_populates="staffing_budget")


# ---------------------------------------------------------------------------
# StaffingBudgetMonthPlan — monthly plan for a staffing budget
# ---------------------------------------------------------------------------

class StaffingBudgetMonthPlan(Base):
    __tablename__ = "staffing_budget_month_plans"
    __table_args__ = (
        UniqueConstraint("staffing_budget_id", "year", "month", name="uq_sfg_budget_month_plan"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_sfg_budget_month_1_12"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    staffing_budget_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("staffing_budgets.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)

    budget: Mapped["StaffingBudget"] = relationship("StaffingBudget", back_populates="month_plans")


# ---------------------------------------------------------------------------
# StaffingExpense — actual/planned staffing expenses per project/month
# ---------------------------------------------------------------------------

class StaffingExpense(Base):
    __tablename__ = "staffing_expenses"
    __table_args__ = (
        UniqueConstraint("project_id", "year", "month", name="uq_sfg_expense_proj_month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_sfg_expense_month_1_12"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    plan_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    fact_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    plan_hours: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    fact_hours: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped["Project | None"] = relationship("Project")
    invoices: Mapped[list["StaffingInvoice"]] = relationship(
        "StaffingInvoice", back_populates="expense", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# StaffingInvoice — uploaded invoice PDF attached to a staffing expense
# ---------------------------------------------------------------------------

class StaffingInvoice(Base):
    __tablename__ = "staffing_invoices"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    expense_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("staffing_expenses.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    expense: Mapped["StaffingExpense"] = relationship("StaffingExpense", back_populates="invoices")
