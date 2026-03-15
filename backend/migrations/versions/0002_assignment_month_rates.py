"""assignment_month_rates

Revision ID: 0002_assignment_month_rates
Revises: 0001_initial
Create Date: 2025-03-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0002_assignment_month_rates"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assignment_month_rates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("assignment_id", UUID(as_uuid=True), sa.ForeignKey("employee_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("rate", sa.Numeric(5, 2), nullable=False),
        sa.UniqueConstraint("assignment_id", "year", "month", name="uq_assignment_year_month"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_month_1_12"),
        sa.CheckConstraint("rate > 0", name="chk_rate_positive"),
    )
    op.create_index("idx_assign_month_rates_assignment", "assignment_month_rates", ["assignment_id", "year"])


def downgrade() -> None:
    op.drop_table("assignment_month_rates")
