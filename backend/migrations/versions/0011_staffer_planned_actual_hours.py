"""staffer_planned_actual_hours

Revision ID: 0011_staffer_planned_actual_hours
Revises: 0010_staffer_month_rates
Create Date: 2026-03-24

Add planned_hours and actual_hours columns to staffer_month_expenses.
planned_hours pre-filled from working calendar; actual_hours entered manually.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_staffer_hours"
down_revision: Union[str, None] = "0010_staffer_month_rates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "staffer_month_expenses",
        sa.Column("planned_hours", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "staffer_month_expenses",
        sa.Column("actual_hours", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("staffer_month_expenses", "actual_hours")
    op.drop_column("staffer_month_expenses", "planned_hours")
