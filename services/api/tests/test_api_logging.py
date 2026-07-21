import json
import logging

import pytest
import structlog
from simula_api.logging import _enforce_log_allowlist, configure_logging


def test_api_log_allowlist_removes_payload_credentials_and_exception_details() -> None:
    result = _enforce_log_allowlist(
        None,
        "error",
        {
            "event": "http_request_failed",
            "level": "error",
            "route_template": "/api/v1/runs/{run_id}",
            "error_class": "RuntimeError",
            "authorization": "Bearer sensitive-token",
            "stimulus": "sensitive-stimulus",
            "result": "sensitive-result",
            "exc_info": RuntimeError("sensitive-provider-body"),
        },
    )

    assert result == {
        "event": "http_request_failed",
        "level": "error",
        "route_template": "/api/v1/runs/{run_id}",
        "error_class": "RuntimeError",
    }
    assert "sensitive" not in str(result)


def test_api_foreign_log_content_is_redacted() -> None:
    result = _enforce_log_allowlist(
        None,
        "error",
        {
            "event": "SQL sensitive bind values",
            "level": "error",
            "message": "cookie=sensitive-cookie",
        },
    )

    assert result == {"event": "foreign_log", "level": "error"}


def test_api_foreign_stdlib_log_renders_redacted_json(
    capsys: pytest.CaptureFixture[str],
) -> None:
    root_logger = logging.getLogger()
    previous_handlers = root_logger.handlers[:]
    previous_level = root_logger.level

    try:
        configure_logging()
        logging.getLogger("httpx").info(
            "HTTP Request: GET https://example.test?token=sensitive-token"
        )
        captured = capsys.readouterr()
    finally:
        root_logger.handlers.clear()
        root_logger.handlers.extend(previous_handlers)
        root_logger.setLevel(previous_level)
        structlog.reset_defaults()

    assert "Logging error" not in captured.err
    payload = json.loads(captured.out)
    assert payload["event"] == "foreign_log"
    assert payload["level"] == "info"
    assert payload["service"] == "api"
    assert payload["timestamp"]
    assert "sensitive-token" not in captured.out
