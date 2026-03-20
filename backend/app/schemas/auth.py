from pydantic import BaseModel, field_validator


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username", "password", mode="before")
    @classmethod
    def strip_outer_whitespace(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip()
        return value


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    username: str

    class Config:
        from_attributes = True
