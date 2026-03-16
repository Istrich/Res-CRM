"""project_month_plans

Revision ID: 0006_project_month_plans
Revises: 0005_budget_project_month_plans
Create Date: 2026-03-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_project_month_plans"
down_revision: Union[str, None] = "0005_budget_project_month_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_month_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "year", "month", name="uq_project_month_plan"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="chk_project_month_plan_1_12"),
    )


def downgrade() -> None:
    op.drop_table("project_month_plans")

