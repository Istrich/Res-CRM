"""budget_project_month_fact_forecast_overrides

Revision ID: 0013_budget_project_month_fact_forecast_overrides
Revises: 0012_merge_budget_link_and_hours
Create Date: 2026-03-25
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_budget_project_month_fact_forecast_overrides"
down_revision: Union[str, None] = "0012_merge_budget_link_and_hours"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "budget_project_month_fact_forecast_overrides",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("budget_project_id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["budget_project_id"],
            ["budget_projects.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "budget_project_id",
            "year",
            "month",
            name="uq_bp_month_fact_forecast_override",
        ),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_month_fact_forecast_override_1_12"),
        sa.CheckConstraint("amount >= 0", name="chk_month_fact_forecast_override_non_negative"),
    )


def downgrade() -> None:
    op.drop_table("budget_project_month_fact_forecast_overrides")

