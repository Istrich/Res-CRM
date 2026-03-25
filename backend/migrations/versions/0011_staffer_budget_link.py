"""staffer_budget_link

Revision ID: 0011_staffer_budget_link
Revises: 0010_staffer_month_rates
Create Date: 2026-03-24

Links each staffer to a staffing budget so that budget fact/plan
is calculated only from expenses of staffers assigned to that budget.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0011_staffer_budget_link"
down_revision: Union[str, None] = "0010_staffer_month_rates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "staffers",
        sa.Column(
            "staffing_budget_id",
            UUID(as_uuid=True),
            sa.ForeignKey("staffing_budgets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_staffers_staffing_budget_id", "staffers", ["staffing_budget_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_staffers_staffing_budget_id", table_name="staffers")
    op.drop_column("staffers", "staffing_budget_id")
