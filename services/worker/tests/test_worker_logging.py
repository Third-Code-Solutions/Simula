from simula_worker.logging import _enforce_log_allowlist


def test_worker_log_allowlist_removes_payload_and_exception_details() -> None:
    result = _enforce_log_allowlist(
        None,
        "error",
        {
            "event": "run_execution_provider_failed",
            "level": "error",
            "run_id": "00000000-0000-4000-8000-000000000001",
            "error_class": "RuntimeError",
            "correlation_id": "00000000-0000-4000-8000-000000000002",
            "span_id": "0123456789abcdef",
            "trace_id": "0123456789abcdef0123456789abcdef",
            "provider_request": "sensitive-stimulus",
            "provider_response": "sensitive-result",
            "exc_info": RuntimeError("sensitive-token"),
        },
    )

    assert result == {
        "event": "run_execution_provider_failed",
        "level": "error",
        "run_id": "00000000-0000-4000-8000-000000000001",
        "error_class": "RuntimeError",
        "correlation_id": "00000000-0000-4000-8000-000000000002",
        "span_id": "0123456789abcdef",
        "trace_id": "0123456789abcdef0123456789abcdef",
    }
    assert "sensitive" not in str(result)


def test_worker_foreign_log_content_is_redacted() -> None:
    result = _enforce_log_allowlist(
        None,
        "error",
        {"event": "redis leaked sensitive command", "level": "error"},
    )

    assert result == {"event": "foreign_log", "level": "error"}
