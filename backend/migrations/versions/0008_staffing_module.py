"""staffing_module

Revision ID: 0008_staffing_module
Revises: 0007_add_indexes
Create Date: 2026-03-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0008_staffing_module"
down_revision: Union[str, None] = "0007_add_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contractors",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "contractor_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "contractor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("contractors.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("stored_path", sa.String(1000), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_contractor_docs_contractor_id", "contractor_documents", ["contractor_id"])

    op.create_table(
        "staffers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("first_name", sa.String(100), nullable=True),
        sa.Column("last_name", sa.String(100), nullable=True),
        sa.Column("middle_name", sa.String(100), nullable=True),
        sa.Column(
            "contractor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("contractors.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("specialization", sa.String(255), nullable=True),
        sa.Column("hourly_rate", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("valid_from", sa.Date, nullable=False),
        sa.Column("valid_to", sa.Date, nullable=True),
        sa.Column("pm_name", sa.String(255), nullable=True),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("hourly_rate >= 0", name="chk_staffer_rate_non_negative"),
    )
    op.create_index("idx_staffers_contractor_id", "staffers", ["contractor_id"])
    op.create_index("idx_staffers_project_id", "staffers", ["project_id"])
    op.create_index("idx_staffers_valid_from", "staffers", ["valid_from"])

    op.create_table(
        "staffing_budgets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("total_budget", sa.Numeric(15, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_staffing_budgets_year", "staffing_budgets", ["year"])

    op.create_table(
        "staffing_budget_month_plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "staffing_budget_id",
            UUID(as_uuid=True),
            sa.ForeignKey("staffing_budgets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.UniqueConstraint("staffing_budget_id", "year", "month", name="uq_sfg_budget_month_plan"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_sfg_budget_month_1_12"),
    )
    op.create_index(
        "idx_sfg_budget_month_plan_budget_id",
        "staffing_budget_month_plans",
        ["staffing_budget_id"],
    )

    op.create_table(
        "staffing_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("plan_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("fact_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("plan_hours", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("fact_hours", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "year", "month", name="uq_sfg_expense_proj_month"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_sfg_expense_month_1_12"),
    )
    op.create_index("idx_sfg_expenses_project_id", "staffing_expenses", ["project_id"])
    op.create_index("idx_sfg_expenses_year", "staffing_expenses", ["year"])

    op.create_table(
        "staffing_invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "expense_id",
            UUID(as_uuid=True),
            sa.ForeignKey("staffing_expenses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("stored_path", sa.String(1000), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_sfg_invoices_expense_id", "staffing_invoices", ["expense_id"])


def downgrade() -> None:
    op.drop_index("idx_sfg_invoices_expense_id", table_name="staffing_invoices")
    op.drop_table("staffing_invoices")

    op.drop_index("idx_sfg_expenses_year", table_name="staffing_expenses")
    op.drop_index("idx_sfg_expenses_project_id", table_name="staffing_expenses")
    op.drop_table("staffing_expenses")

    op.drop_index("idx_sfg_budget_month_plan_budget_id", table_name="staffing_budget_month_plans")
    op.drop_table("staffing_budget_month_plans")

    op.drop_index("idx_staffing_budgets_year", table_name="staffing_budgets")
    op.drop_table("staffing_budgets")

    op.drop_index("idx_staffers_valid_from", table_name="staffers")
    op.drop_index("idx_staffers_project_id", table_name="staffers")
    op.drop_index("idx_staffers_contractor_id", table_name="staffers")
    op.drop_table("staffers")

    op.drop_index("idx_contractor_docs_contractor_id", table_name="contractor_documents")
    op.drop_table("contractor_documents")

    op.drop_table("contractors")
