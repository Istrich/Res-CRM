"""budget_project_month_plans

Revision ID: 0005_budget_project_month_plans
Revises: 0004_position_planned_fields
Create Date: 2026-03-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_budget_project_month_plans"
down_revision: Union[str, None] = "0004_position_planned_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "budget_project_month_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("budget_project_id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["budget_project_id"], ["budget_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("budget_project_id", "year", "month", name="uq_bp_month_plan"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_month_plan_1_12"),
    )


def downgrade() -> None:
    op.drop_table("budget_project_month_plans")
