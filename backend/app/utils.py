"""Shared utilities for the application."""


def escape_like(s: str) -> str:
    """Escape special characters for SQL LIKE/ILIKE patterns.

    Escapes %, _, and \\ so user-supplied search terms cannot
    accidentally match everything or cause pattern-expansion DoS.
    Must be used together with Column.ilike(..., escape='\\\\').
    """
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
