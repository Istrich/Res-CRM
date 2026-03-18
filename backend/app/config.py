from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    DEBUG_MODE: bool = False
    CORS_ORIGINS: str = "*"  # In production set to allowed origins, e.g. "https://app.example.com"
    # Set to False in local dev (HTTP). In production (HTTPS) leave True.
    COOKIE_SECURE: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
