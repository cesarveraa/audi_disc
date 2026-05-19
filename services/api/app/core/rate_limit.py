from __future__ import annotations

import math
import time
from dataclasses import dataclass
from threading import Lock

from fastapi import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings
from app.core.security import is_public_path


RATE_LIMIT_RESPONSE_HEADERS = (
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "Retry-After",
)
EXEMPT_PATHS = {"/health", "/api/v1/health"}
MUTATING_METHODS = {"POST", "PATCH", "DELETE"}
SENSITIVE_PREFIXES = (
    "/access",
    "/analytics",
    "/audit-logs",
    "/dashboard",
    "/reports",
)
SENSITIVE_PATHS = {"/sales/history", "/ventas/history"}


@dataclass(frozen=True)
class RateLimitPolicy:
    bucket: str
    limit: int
    window_seconds: int


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    reset_seconds: int


class FixedWindowRateLimiter:
    def __init__(self) -> None:
        self._lock = Lock()
        self._windows: dict[str, tuple[float, int]] = {}

    def check(self, *, key: str, limit: int, window_seconds: int) -> RateLimitDecision:
        now = time.monotonic()
        window_start = now - (now % window_seconds)
        reset_at = window_start + window_seconds

        with self._lock:
            bucket = self._windows.get(key)
            if bucket is None or bucket[0] != window_start:
                count = 0
            else:
                count = bucket[1]

            count += 1
            self._windows[key] = (window_start, count)
            if len(self._windows) > 10_000:
                self._windows = {
                    stored_key: stored_bucket
                    for stored_key, stored_bucket in self._windows.items()
                    if stored_bucket[0] == window_start
                }

        reset_seconds = max(1, math.ceil(reset_at - now))
        remaining = max(limit - count, 0)
        return RateLimitDecision(
            allowed=count <= limit,
            limit=limit,
            remaining=remaining,
            reset_seconds=reset_seconds,
        )


def _normalized_path(path: str) -> str:
    if path.startswith("/api/v1/"):
        return path.removeprefix("/api/v1")
    return path


def _is_sensitive_path(path: str) -> bool:
    normalized_path = _normalized_path(path)
    return normalized_path in SENSITIVE_PATHS or any(
        normalized_path == prefix or normalized_path.startswith(f"{prefix}/")
        for prefix in SENSITIVE_PREFIXES
    )


def _client_identifier(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or "unknown"
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip() or "unknown"
    return request.client.host if request.client else "unknown"


def policy_for_request(request: Request, settings: Settings) -> RateLimitPolicy | None:
    if not settings.rate_limit_enabled or request.method == "OPTIONS" or request.url.path in EXEMPT_PATHS:
        return None

    if is_public_path(request.url.path):
        return RateLimitPolicy(
            bucket="public",
            limit=settings.rate_limit_public_requests,
            window_seconds=settings.rate_limit_window_seconds,
        )

    if _is_sensitive_path(request.url.path):
        return RateLimitPolicy(
            bucket="sensitive",
            limit=settings.rate_limit_sensitive_requests,
            window_seconds=settings.rate_limit_window_seconds,
        )

    if request.method in MUTATING_METHODS:
        return RateLimitPolicy(
            bucket="mutating",
            limit=settings.rate_limit_mutating_requests,
            window_seconds=settings.rate_limit_window_seconds,
        )

    return RateLimitPolicy(
        bucket="authenticated",
        limit=settings.rate_limit_authenticated_requests,
        window_seconds=settings.rate_limit_window_seconds,
    )


def rate_limit_key(request: Request, policy: RateLimitPolicy) -> str:
    return f"{policy.bucket}:{_client_identifier(request)}"


def rate_limit_headers(decision: RateLimitDecision) -> dict[str, str]:
    return {
        "X-RateLimit-Limit": str(decision.limit),
        "X-RateLimit-Remaining": str(decision.remaining),
        "X-RateLimit-Reset": str(decision.reset_seconds),
    }


def apply_rate_limit(request: Request, settings: Settings) -> Response | None:
    policy = policy_for_request(request, settings)
    if policy is None:
        return None

    limiter = request.app.state.rate_limiter
    decision = limiter.check(
        key=rate_limit_key(request, policy),
        limit=policy.limit,
        window_seconds=policy.window_seconds,
    )
    request.state.rate_limit_decision = decision
    if decision.allowed:
        return None

    headers = {
        **rate_limit_headers(decision),
        "Retry-After": str(decision.reset_seconds),
        "X-Error-Message": "Rate limit exceeded",
    }
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"},
        headers=headers,
    )
