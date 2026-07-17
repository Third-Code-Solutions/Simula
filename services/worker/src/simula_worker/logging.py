"""Structured, payload-free worker logging."""

from __future__ import annotations

import logging
import os

import structlog


def configure_logging() -> None:
    level = os.getenv("SIMULA_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(format="%(message)s", level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(sort_keys=True),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
    )
