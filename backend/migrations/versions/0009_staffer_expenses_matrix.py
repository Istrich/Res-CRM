"""staffer_expenses_matrix

Revision ID: 0009_staffer_expenses_matrix
Revises: 0008_staffing_module
Create Date: 2026-03-24

Adds per-staffer per-month expense matrix:
- New columns on staffers table (display_order, rating, task_description,
  work_status, extension_status, extension_comment)
- New table staffer_month_expenses (per-staffer per-month financial data)
- New table staffer_invoice_files (PDF/file attachments for staffer expenses)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0009_staffer_expenses_matrix"
down_revision: Union[str, None] = "0008_staffing_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Extend staffers table ---
    op.add_column("staffers", sa.Column("display_order", sa.Integer, nullable=True))
    op.add_column("staffers", sa.Column("rating", sa.Integer, nullable=True))
    op.add_column("staffers", sa.Column("task_description", sa.Text, nullable=True))
    op.add_column(
        "staffers",
        sa.Column("work_status", sa.String(50), nullable=True, server_default="Активен"),
    )
    op.add_column("staffers", sa.Column("extension_status", sa.String(50), nullable=True))
    op.add_column("staffers", sa.Column("extension_comment", sa.String(500), nullable=True))

    # --- New table: per-staffer per-month expense record ---
    op.create_table(
        "staffer_month_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "staffer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("staffers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("hourly_rate", sa.Numeric(15, 2), nullable=True),
        sa.Column("planned_amount", sa.Numeric(15, 2), nullable=True),
        sa.Column("actual_amount", sa.Numeric(15, 2), nullable=True),
        sa.Column("invoice_text", sa.String(500), nullable=True),
        sa.Column("invoice_link", sa.String(1000), nullable=True),
        sa.Column("invoice_status", sa.String(50), nullable=True),
        sa.Column("carry_over_budget", sa.Numeric(15, 2), nullable=True),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("staffer_id", "year", "month", name="uq_staffer_month_expense"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_staffer_month_expense_1_12"),
    )
    op.create_index(
        "idx_staffer_month_expenses_staffer_id", "staffer_month_expenses", ["staffer_id"]
    )
    op.create_index("idx_staffer_month_expenses_year", "staffer_month_expenses", ["year"])

    # --- New table: invoice PDF files attached to staffer expenses ---
    op.create_table(
        "staffer_invoice_files",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "staffer_expense_id",
            UUID(as_uuid=True),
            sa.ForeignKey("staffer_month_expenses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("stored_path", sa.String(1000), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_staffer_invoice_files_expense_id",
        "staffer_invoice_files",
        ["staffer_expense_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_staffer_invoice_files_expense_id", table_name="staffer_invoice_files")
    op.drop_table("staffer_invoice_files")

    op.drop_index("idx_staffer_month_expenses_year", table_name="staffer_month_expenses")
    op.drop_index(
        "idx_staffer_month_expenses_staffer_id", table_name="staffer_month_expenses"
    )
    op.drop_table("staffer_month_expenses")

    op.drop_column("staffers", "extension_comment")
    op.drop_column("staffers", "extension_status")
    op.drop_column("staffers", "work_status")
    op.drop_column("staffers", "task_description")
    op.drop_column("staffers", "rating")
    op.drop_column("staffers", "display_order")
