"""salary_record_is_raise

Revision ID: 0003_salary_record_is_raise
Revises: 0002_assignment_month_rates
Create Date: 2025-03-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_salary_record_is_raise"
down_revision: Union[str, None] = "0002_assignment_month_rates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("salary_records", sa.Column("is_raise", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("salary_records", "is_raise")
