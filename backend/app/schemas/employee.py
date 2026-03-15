import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, field_validator, model_validator


class SalaryRecordOut(BaseModel):
    id: uuid.UUID
    year: int
    month: int
    salary: float
    kpi_bonus: float
    fixed_bonus: float
    one_time_bonus: float
    total: float
    is_raise: bool = False

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_total(cls, obj):
        return cls(
            id=obj.id,
            year=obj.year,
            month=obj.month,
            salary=float(obj.salary),
            kpi_bonus=float(obj.kpi_bonus),
            fixed_bonus=float(obj.fixed_bonus),
            one_time_bonus=float(obj.one_time_bonus),
            total=obj.total,
            is_raise=getattr(obj, "is_raise", False),
        )


class SalaryRecordUpsert(BaseModel):
    salary: float = 0
    kpi_bonus: float = 0
    fixed_bonus: float = 0
    one_time_bonus: float = 0
    is_raise: bool = False


class ProjectBrief(BaseModel):
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True


class AssignmentOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    rate: float
    valid_from: date
    valid_to: Optional[date]

    class Config:
        from_attributes = True


class EmployeeImportRow(BaseModel):
    """One row for bulk import. Column order: Фамилия, Имя, Отчество, Специализация, Должность, Подразделение, Дата найма, Дата увольнения, Комментарий."""
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    specialization: Optional[str] = None
    title: Optional[str] = None  # должность, required in DB (non-empty)
    department: Optional[str] = None
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    comment: Optional[str] = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.hire_date and self.termination_date:
            if self.termination_date < self.hire_date:
                raise ValueError("termination_date cannot be before hire_date")
        return self


class EmployeeCreate(BaseModel):
    is_position: bool = False
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    title: str
    department: Optional[str] = None
    specialization: Optional[str] = None
    comment: Optional[str] = None
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.hire_date and self.termination_date:
            if self.termination_date < self.hire_date:
                raise ValueError("termination_date cannot be before hire_date")
        return self


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    specialization: Optional[str] = None
    comment: Optional[str] = None
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.hire_date and self.termination_date:
            if self.termination_date < self.hire_date:
                raise ValueError("termination_date cannot be before hire_date")
        return self


class EmployeeOut(BaseModel):
    id: uuid.UUID
    is_position: bool
    first_name: Optional[str]
    last_name: Optional[str]
    middle_name: Optional[str]
    display_name: str
    title: str
    department: Optional[str]
    specialization: Optional[str]
    comment: Optional[str]
    hire_date: Optional[date]
    termination_date: Optional[date]
    assignments: list[AssignmentOut] = []
    salary_records: list[SalaryRecordOut] = []
    has_projects: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmployeeListItem(BaseModel):
    id: uuid.UUID
    is_position: bool
    display_name: str
    title: str
    department: Optional[str]
    specialization: Optional[str]
    hire_date: Optional[date]
    termination_date: Optional[date]
    assignments: list[AssignmentOut] = []
    has_projects: bool
    monthly_totals: Optional[list[float]] = None  # 12 values for the requested year (Jan..Dec)

    class Config:
        from_attributes = True
