from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    # If true, on each app startup the admin password_hash in DB is replaced from ADMIN_PASSWORD.
    # Use once after changing ADMIN_PASSWORD in .env (otherwise the DB still has the old hash).
    ADMIN_SYNC_PASSWORD_FROM_ENV: bool = False
    DEBUG_MODE: bool = False
    CORS_ORIGINS: str = "*"  # In production set to allowed origins, e.g. "https://app.example.com"
    # Set to False in local dev (HTTP). In production (HTTPS) leave True.
    COOKIE_SECURE: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
