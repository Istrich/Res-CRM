"""Application middleware: structured access logging."""
import logging
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("access")


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Log each request with method, path, status code, duration and user hint."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        logger.info(
            "%(method)s %(path)s → %(status)s (%(ms).1fms)",
            {
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "ms": duration_ms,
            },
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "client": request.client.host if request.client else "-",
            },
        )
        return response
