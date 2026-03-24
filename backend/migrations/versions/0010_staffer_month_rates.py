"""staffer_month_rates

Revision ID: 0010_staffer_month_rates
Revises: 0009_staffer_expenses_matrix
Create Date: 2026-03-24

Per-staffer per-month hourly rate history table.
Decouples rate tracking from expense rows so a rate can be set
even when no plan/fact data exists for that month.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0010_staffer_month_rates"
down_revision: Union[str, None] = "0009_staffer_expenses_matrix"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "staffer_month_rates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "staffer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("staffers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("hourly_rate", sa.Numeric(15, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("staffer_id", "year", "month", name="uq_staffer_month_rate"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_staffer_month_rate_1_12"),
        sa.CheckConstraint("hourly_rate >= 0", name="chk_staffer_month_rate_non_negative"),
    )
    op.create_index(
        "idx_staffer_month_rates_staffer_id", "staffer_month_rates", ["staffer_id"]
    )
    op.create_index("idx_staffer_month_rates_year", "staffer_month_rates", ["year"])


def downgrade() -> None:
    op.drop_index("idx_staffer_month_rates_year", table_name="staffer_month_rates")
    op.drop_index("idx_staffer_month_rates_staffer_id", table_name="staffer_month_rates")
    op.drop_table("staffer_month_rates")
