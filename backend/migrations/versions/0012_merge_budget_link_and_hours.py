"""merge parallel 0011 branches (budget link + planned/actual hours)

Revision ID: 0012_merge_budget_link_and_hours
Revises: 0011_staffer_budget_link, 0011_staffer_hours
Create Date: 2026-03-25

Merges two heads that both branched from 0010_staffer_month_rates.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0012_merge_budget_link_and_hours"
down_revision: Union[str, tuple[str, ...], None] = ("0011_staffer_budget_link", "0011_staffer_hours")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
