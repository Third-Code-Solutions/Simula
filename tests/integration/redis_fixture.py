"""Fail-closed Redis coordinates owned by the foundation integration tests."""

from __future__ import annotations

from arq.connections import RedisSettings

TEST_REDIS_URL = "redis://127.0.0.1:6379/15"
TEST_QUEUE_NAME = "simula:test:foundation:queue:v1"
TEST_STATE_PREFIX = "simula:test:foundation:state:"
RETRY_JOB_ID = "simula:test:foundation:job:retry:v1"
CRASH_JOB_ID = "simula:test:foundation:job:crash:v1"
CRASH_PROBE_ID = "crash:v1"


def redis_test_settings() -> RedisSettings:
    """Return an immutable local-only target; production environment variables are ignored."""
    return RedisSettings.from_dsn(TEST_REDIS_URL)


def redis_test_state_key(kind: str, token: str) -> str:
    """Build a key inside the namespace exclusively owned by these tests."""
    return f"{TEST_STATE_PREFIX}{kind}:{token}"
