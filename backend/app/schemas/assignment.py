import uuid
from datetime import date
from typing import Optional

from pydantic import BaseModel, field_validator


class AssignmentCreate(BaseModel):
    employee_id: uuid.UUID
    project_id: uuid.UUID
    rate: float
    valid_from: date
    valid_to: Optional[date] = None

    @field_validator("rate")
    @classmethod
    def rate_positive(cls, v):
        if v <= 0:
            raise ValueError("rate must be > 0")
        return v


class AssignmentUpdate(BaseModel):
    rate: Optional[float] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None

    @field_validator("rate")
    @classmethod
    def rate_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError("rate must be > 0")
        return v


class AssignmentMonthRateSet(BaseModel):
    """Body for setting rate for one (assignment, year, month)."""
    rate: float

    @field_validator("rate")
    @classmethod
    def rate_positive(cls, v):
        if v <= 0:
            raise ValueError("rate must be > 0")
        return v


class AssignmentOut(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    employee_display_name: str
    rate: float
    valid_from: date
    valid_to: Optional[date]

    class Config:
        from_attributes = True
