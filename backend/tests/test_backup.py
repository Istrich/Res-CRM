"""Backup API: PostgreSQL-only; SQLite test env returns 400 on export."""

from io import BytesIO


def test_backup_export_rejects_non_postgres(authed_client):
    r = authed_client.get("/backup/export")
    assert r.status_code == 400
    assert "PostgreSQL" in r.json()["detail"]


def test_backup_restore_requires_confirm(authed_client):
    fake_dump = b"PGDMP" + b"\x00" * 64
    r = authed_client.post(
        "/backup/restore",
        files={"file": ("backup.dump", BytesIO(fake_dump), "application/octet-stream")},
        data={"confirm": "false"},
    )
    assert r.status_code == 400
    assert "отменено" in r.json()["detail"].lower() or "confirm" in r.json()["detail"].lower()


def test_backup_restore_rejects_bad_magic(authed_client):
    r = authed_client.post(
        "/backup/restore",
        files={"file": ("bad.dump", BytesIO(b"not-a-dump"), "application/octet-stream")},
        data={"confirm": "true"},
    )
    assert r.status_code == 400
    assert "формат" in r.json()["detail"] or "dump" in r.json()["detail"].lower()
