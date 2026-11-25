"""
Sliding-window in-memory rate limiter for AgniShield FastAPI endpoints.
Protects /api/v1/scan, /api/v1/analyze/ai, and /api/v1/model/train from abuse.
"""

import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# (max_requests, window_seconds)
ENDPOINT_LIMITS: Dict[str, Tuple[int, int]] = {
    "/api/v1/model/train": (5, 60),
    "/api/v1/scan": (30, 60),
    "/api/v1/analyze/ai": (30, 60),
}
DEFAULT_API_LIMIT: Tuple[int, int] = (120, 60)


class RateLimiter:
    """Thread-safe sliding-window rate limiter keyed by (client_ip, route_bucket)."""

    def __init__(self) -> None:
        self._hits: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def check(self, client_ip: str, path: str) -> Tuple[bool, int, int, int]:
        """Return (allowed, limit, remaining, retry_after_seconds)."""
        limit, window = ENDPOINT_LIMITS.get(path, DEFAULT_API_LIMIT)
        bucket = path if path in ENDPOINT_LIMITS else "default"
        key = (client_ip, bucket)
        now = time.monotonic()
        cutoff = now - window

        with self._lock:
            q = self._hits[key]
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= limit:
                retry_after = max(1, int(window - (now - q[0])) + 1)
                return False, limit, 0, retry_after
            q.append(now)
            remaining = max(0, limit - len(q))
            return True, limit, remaining, 0


rate_limiter = RateLimiter()


def get_client_ip(request: Request) -> str:
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if os.getenv("RATE_LIMIT_ENABLED", "true").lower() != "true":
            return await call_next(request)

        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)

        client_ip = get_client_ip(request)
        allowed, limit, remaining, retry_after = rate_limiter.check(client_ip, path)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded ({limit} requests/min). Please retry shortly."},
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
