import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ---------------------------------------------------------------------------
# User (single admin)
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# BudgetProject — top-level financial entity
# ---------------------------------------------------------------------------

class BudgetProject(Base):
    __tablename__ = "budget_projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    total_budget: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    projects: Mapped[list["Project"]] = relationship("Project", back_populates="budget_project")


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    budget_project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("budget_projects.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    budget_project: Mapped["BudgetProject | None"] = relationship("BudgetProject", back_populates="projects")
    employee_projects: Mapped[list["EmployeeProject"]] = relationship("EmployeeProject", back_populates="project")
    budget_snapshots: Mapped[list["BudgetSnapshot"]] = relationship("BudgetSnapshot", back_populates="project")


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

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
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

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped["Employee"] = relationship("Employee", back_populates="employee_projects")
    project: Mapped["Project"] = relationship("Project", back_populates="employee_projects")


# ---------------------------------------------------------------------------
# SalaryRecord — monthly compensation (4 components)
# ---------------------------------------------------------------------------

class SalaryRecord(Base):
    __tablename__ = "salary_records"
    __table_args__ = (
        UniqueConstraint("employee_id", "year", "month", name="uq_salary_employee_month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_month_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)

    salary: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    kpi_bonus: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    fixed_bonus: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    one_time_bonus: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    employee: Mapped["Employee"] = relationship("Employee", back_populates="salary_records")

    @property
    def total(self) -> float:
        return float(self.salary) + float(self.kpi_bonus) + float(self.fixed_bonus) + float(self.one_time_bonus)


# ---------------------------------------------------------------------------
# BudgetSnapshot — cached calculation per project/month
# ---------------------------------------------------------------------------

class BudgetSnapshot(Base):
    __tablename__ = "budget_snapshots"
    __table_args__ = (
        UniqueConstraint("project_id", "year", "month", name="uq_snapshot_project_month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="chk_snapshot_month"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    is_forecast: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="budget_snapshots")
