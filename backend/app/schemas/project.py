import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class BudgetProjectCreate(BaseModel):
    name: str
    year: int
    total_budget: Optional[float] = None


class BudgetProjectUpdate(BaseModel):
    name: Optional[str] = None
    year: Optional[int] = None
    total_budget: Optional[float] = None


class BudgetProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    year: int
    total_budget: Optional[float]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BudgetProjectWithStats(BudgetProjectOut):
    projects_count: int = 0
    spent: float = 0
    forecast: float = 0
    remaining: Optional[float] = None
    status: str = "ok"  # ok | warning | overrun


class BudgetMonthItem(BaseModel):
    month: int  # 1-12
    amount: float = 0


class BudgetProjectMonthPlanIn(BaseModel):
    items: list[BudgetMonthItem]  # 12 items, month 1..12


class BudgetProjectMonthPlanOut(BaseModel):
    items: list[BudgetMonthItem]


class ProjectCreate(BaseModel):
    name: str
    budget_project_id: Optional[uuid.UUID] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    budget_project_id: Optional[uuid.UUID] = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    budget_project_id: Optional[uuid.UUID]
    budget_project_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectWithStats(ProjectOut):
    employee_count: int = 0
    spent: float = 0
    forecast: float = 0
    last_calculated_at: Optional[datetime] = None
