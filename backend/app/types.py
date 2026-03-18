"""Custom SQLAlchemy types for cross-database compatibility."""
import uuid

from sqlalchemy import String, TypeDecorator
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


class GUID(TypeDecorator):
    """Platform-independent UUID type.

    Uses PostgreSQL's native UUID on PG; stores as CHAR(36) on SQLite/other.
    This enables tests to run with SQLite without schema issues.
    """

    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name != "postgresql":
            return str(value) if isinstance(value, uuid.UUID) else str(value)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if dialect.name != "postgresql":
            if isinstance(value, uuid.UUID):
                return value
            return uuid.UUID(value)
        return value
