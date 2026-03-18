"""Full PostgreSQL backup/restore via pg_dump / pg_restore."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from urllib.parse import unquote, urlparse

logger = logging.getLogger(__name__)

# Custom-format dump magic (pg_dump -Fc)
PGDUMP_CUSTOM_MAGIC = b"PGDMP"


class BackupError(Exception):
    """User-facing safe message; details only in logs."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class PgConnection:
    host: str
    port: int
    user: str
    password: str
    database: str


def parse_postgres_url(database_url: str) -> PgConnection:
    """Parse SQLAlchemy/async DSN into connection parts."""
    raw = database_url.strip()
    for prefix in ("postgresql+psycopg2://", "postgresql+asyncpg://", "postgres://"):
        raw = raw.replace(prefix, "postgresql://", 1)
    parsed = urlparse(raw)
    if parsed.scheme not in ("postgresql", "postgres"):
        raise BackupError("Резервное копирование доступно только при подключении к PostgreSQL.")

    if not parsed.hostname:
        raise BackupError("В DATABASE_URL не указан хост БД.")

    user = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    database = (parsed.path or "").lstrip("/") or ""
    if not user or not database:
        raise BackupError("В DATABASE_URL должны быть указаны пользователь и имя базы.")

    port = parsed.port or 5432
    return PgConnection(
        host=parsed.hostname,
        port=port,
        user=user,
        password=password,
        database=database,
    )


def _pg_env(conn: PgConnection) -> dict[str, str]:
    env = os.environ.copy()
    env["PGPASSWORD"] = conn.password
    return env


def run_pg_dump(conn: PgConnection, timeout_sec: int = 600) -> bytes:
    """Return custom-format pg_dump bytes."""
    if not shutil.which("pg_dump"):
        raise BackupError("Утилита pg_dump не найдена (нужен пакет postgresql-client).")

    with tempfile.NamedTemporaryFile(suffix=".dump", delete=False) as tmp:
        out_path = tmp.name

    try:
        cmd = [
            "pg_dump",
            "-h",
            conn.host,
            "-p",
            str(conn.port),
            "-U",
            conn.user,
            "-d",
            conn.database,
            "-Fc",
            "-f",
            out_path,
            "--no-owner",
            "--no-acl",
        ]
        proc = subprocess.run(
            cmd,
            env=_pg_env(conn),
            capture_output=True,
            timeout=timeout_sec,
            text=True,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            logger.warning("pg_dump failed: %s", err[:500] if err else "(no stderr)")
            raise BackupError("Не удалось создать резервную копию. Проверьте доступ к БД и логи сервера.")

        with open(out_path, "rb") as f:
            data = f.read()
        if len(data) < 32 or not data.startswith(PGDUMP_CUSTOM_MAGIC):
            raise BackupError("Получен некорректный дамп.")
        return data
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def run_pg_restore(conn: PgConnection, dump_path: str, timeout_sec: int = 600) -> None:
    """Replace public schema with contents of custom-format dump."""
    if not shutil.which("pg_restore") or not shutil.which("psql"):
        raise BackupError("Утилиты pg_restore/psql не найдены.")

    env = _pg_env(conn)
    base = [
        "psql",
        "-h",
        conn.host,
        "-p",
        str(conn.port),
        "-U",
        conn.user,
        "-d",
        conn.database,
        "-v",
        "ON_ERROR_STOP=1",
    ]

    term_sql = (
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
        "WHERE datname = current_database() AND pid <> pg_backend_pid();"
    )
    t1 = subprocess.run(
        [*base, "-c", term_sql],
        env=env,
        capture_output=True,
        timeout=120,
        text=True,
    )
    if t1.returncode != 0:
        logger.warning("terminate backends: %s", (t1.stderr or "")[:300])
        # Continue — our session is still alive

    t2 = subprocess.run(
        [*base, "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"],
        env=env,
        capture_output=True,
        timeout=120,
        text=True,
    )
    if t2.returncode != 0:
        err = (t2.stderr or t2.stdout or "").strip()
        logger.warning("schema reset failed: %s", err[:500])
        raise BackupError("Не удалось подготовить базу к восстановлению (права на DROP SCHEMA?).")

    proc = subprocess.run(
        [
            "pg_restore",
            "-h",
            conn.host,
            "-p",
            str(conn.port),
            "-U",
            conn.user,
            "-d",
            conn.database,
            "--no-owner",
            "--no-acl",
            dump_path,
        ],
        env=env,
        capture_output=True,
        timeout=timeout_sec,
        text=True,
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        logger.warning("pg_restore failed: %s", err[:800])
        raise BackupError(
            "Восстановление не завершилось. База могла остаться пустой или частично заполненной — "
            "повторите восстановление из бэкапа или разверните миграции заново."
        )
