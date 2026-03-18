"""Full database backup download and restore (PostgreSQL)."""

import logging
import os
import tempfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, engine, get_db
from app.dependencies import get_current_user
from app.models import User
from app.services.backup import BackupError, parse_postgres_url, run_pg_dump, run_pg_restore
from app.services.auth import get_or_create_admin

router = APIRouter(prefix="/backup", tags=["backup"])
logger = logging.getLogger(__name__)
_limiter = Limiter(key_func=get_remote_address)

MAX_RESTORE_BYTES = 512 * 1024 * 1024  # 512 MiB


@router.get("/export")
@_limiter.limit("10/minute")
def export_full_backup(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Download a full PostgreSQL backup (pg_dump custom format)."""
    del request, db  # limiter / connection check via auth
    try:
        conn = parse_postgres_url(settings.DATABASE_URL)
        data = run_pg_dump(conn)
    except BackupError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e

    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"res-crm-backup-{ts}.dump"
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/restore", response_model=None)
@_limiter.limit("5/hour")
async def restore_full_backup(
    request: Request,
    file: UploadFile = File(...),
    confirm: str = Form(""),
    _: User = Depends(get_current_user),
):
    """
    Restore database from a .dump file produced by this app's export.
    Wipes current public schema. Requires confirm=true.
    Do not open a pooled DB session here: terminate_backends would kill it.
    """
    _ = request  # slowapi
    if (confirm or "").strip().lower() not in ("true", "1", "yes"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Восстановление отменено: укажите confirm=true и загрузите файл бэкапа.",
        )

    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран.")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".dump") as tmp:
            tmp_path = tmp.name
            total = 0
            chunk_size = 1024 * 1024
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_RESTORE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Файл больше {MAX_RESTORE_BYTES // (1024 * 1024)} МБ.",
                    )
                tmp.write(chunk)

        with open(tmp_path, "rb") as f:
            head = f.read(5)
        if head != b"PGDMP":
            raise HTTPException(
                status_code=400,
                detail="Неверный формат: нужен файл .dump, скачанный из «Полный бэкап» (pg_dump -Fc).",
            )

        try:
            conn = parse_postgres_url(settings.DATABASE_URL)
        except BackupError as e:
            raise HTTPException(status_code=400, detail=e.message) from e

        try:
            run_pg_restore(conn, tmp_path)
        except BackupError as e:
            raise HTTPException(status_code=500, detail=e.message) from e

        engine.dispose()

        db_session = None
        try:
            db_session = SessionLocal()
            get_or_create_admin(db_session)
            db_session.commit()
        except Exception:
            logger.exception("get_or_create_admin after restore")
        finally:
            if db_session:
                db_session.close()

        logger.info("Full database restore completed successfully.")
        return {"detail": "База данных восстановлена. Перезайдите в систему при необходимости."}
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
