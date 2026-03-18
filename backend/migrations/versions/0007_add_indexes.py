"""add_indexes_for_frequent_queries

Revision ID: 0007_add_indexes
Revises: 0006_project_month_plans
Create Date: 2026-03-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_add_indexes"
down_revision: Union[str, None] = "0006_project_month_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("idx_employees_department", "employees", ["department"])
    op.create_index("idx_employees_specialization", "employees", ["specialization"])
    op.create_index("idx_employees_is_position", "employees", ["is_position"])
    op.create_index("idx_budget_projects_year", "budget_projects", ["year"])
    op.create_index(
        "idx_salary_records_employee_year_month",
        "salary_records",
        ["employee_id", "year", "month"],
    )


def downgrade() -> None:
    op.drop_index("idx_salary_records_employee_year_month", table_name="salary_records")
    op.drop_index("idx_budget_projects_year", table_name="budget_projects")
    op.drop_index("idx_employees_is_position", table_name="employees")
    op.drop_index("idx_employees_specialization", table_name="employees")
    op.drop_index("idx_employees_department", table_name="employees")
