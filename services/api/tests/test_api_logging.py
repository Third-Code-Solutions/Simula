from simula_api.logging import _enforce_log_allowlist


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
