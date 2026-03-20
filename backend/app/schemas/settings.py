from pydantic import BaseModel, Field, model_validator


class WorkingHoursMonthItem(BaseModel):
    month: int = Field(ge=1, le=12)
    hours: float = Field(ge=0)


class WorkingHoursUpsert(BaseModel):
    items: list[WorkingHoursMonthItem]

    @model_validator(mode="after")
    def validate_items(self):
        if len(self.items) != 12:
            raise ValueError("items must contain exactly 12 entries (months 1..12)")
        months = [it.month for it in self.items]
        expected = set(range(1, 13))
        if set(months) != expected:
            raise ValueError("items must cover all months 1..12 exactly once")
        if len(months) != len(set(months)):
            raise ValueError("items must not contain duplicate months")
        return self


class WorkingHoursOut(BaseModel):
    year: int
    items: list[WorkingHoursMonthItem]

