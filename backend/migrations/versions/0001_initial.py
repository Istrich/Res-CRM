"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "budget_projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("total_budget", sa.Numeric(15, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("budget_project_id", UUID(as_uuid=True),
                  sa.ForeignKey("budget_projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "employees",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("is_position", sa.Boolean, nullable=False, default=False),
        sa.Column("first_name", sa.String(100), nullable=True),
        sa.Column("last_name", sa.String(100), nullable=True),
        sa.Column("middle_name", sa.String(100), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("department", sa.String(255), nullable=True),
        sa.Column("specialization", sa.String(255), nullable=True),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("hire_date", sa.Date, nullable=True),
        sa.Column("termination_date", sa.Date, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date",
            name="chk_term_after_hire",
        ),
    )

    op.create_table(
        "employee_projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("employee_id", UUID(as_uuid=True),
                  sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("valid_from", sa.Date, nullable=False),
        sa.Column("valid_to", sa.Date, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("rate > 0", name="chk_rate_positive"),
    )

    op.create_index("idx_emp_proj_employee", "employee_projects", ["employee_id"])
    op.create_index("idx_emp_proj_project", "employee_projects", ["project_id"])

    op.create_table(
        "salary_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("employee_id", UUID(as_uuid=True),
                  sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("salary", sa.Numeric(15, 2), nullable=False, default=0),
        sa.Column("kpi_bonus", sa.Numeric(15, 2), nullable=False, default=0),
        sa.Column("fixed_bonus", sa.Numeric(15, 2), nullable=False, default=0),
        sa.Column("one_time_bonus", sa.Numeric(15, 2), nullable=False, default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("employee_id", "year", "month", name="uq_salary_employee_month"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_month_range"),
    )

    op.create_index("idx_salary_emp_year", "salary_records", ["employee_id", "year"])

    op.create_table(
        "budget_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False, default=0),
        sa.Column("is_forecast", sa.Boolean, nullable=False, default=False),
        sa.Column("calculated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "year", "month", name="uq_snapshot_project_month"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_snapshot_month"),
    )

    op.create_index("idx_snapshot_proj_year", "budget_snapshots", ["project_id", "year"])


def downgrade() -> None:
    op.drop_table("budget_snapshots")
    op.drop_table("salary_records")
    op.drop_table("employee_projects")
    op.drop_table("employees")
    op.drop_table("projects")
    op.drop_table("budget_projects")
    op.drop_table("users")
