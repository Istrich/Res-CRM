"""position planned_exit_date, position_status, planned_salary

Revision ID: 0004_position_planned_fields
Revises: 0003_salary_record_is_raise
Create Date: 2026-03-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_position_planned_fields"
down_revision: Union[str, None] = "0003_salary_record_is_raise"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("planned_exit_date", sa.Date(), nullable=True))
    op.add_column("employees", sa.Column("position_status", sa.String(50), nullable=True))
    op.add_column("employees", sa.Column("planned_salary", sa.Numeric(15, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "planned_salary")
    op.drop_column("employees", "position_status")
    op.drop_column("employees", "planned_exit_date")
