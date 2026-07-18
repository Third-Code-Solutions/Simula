from simula_core.safe_logs import sanitize_log_event


def test_known_log_event_keeps_only_event_specific_allowlisted_fields() -> None:
    result = sanitize_log_event(
        {
            "event": "request_completed",
            "level": "info",
            "route": "/safe/template",
            "authorization": "Bearer sensitive-token",
            "payload": "sensitive-stimulus",
            "exc_info": RuntimeError("sensitive-result"),
        },
        allowed_fields={"request_completed": frozenset({"route"})},
        unknown_event="foreign_log",
    )

    assert result == {
        "event": "request_completed",
        "level": "info",
        "route": "/safe/template",
    }
    assert "sensitive" not in str(result)


def test_unknown_log_event_is_reduced_to_fixed_content_free_event() -> None:
    result = sanitize_log_event(
        {
            "event": "dependency leaked sensitive-sql-and-cookie",
            "level": "error",
            "message": "sensitive-provider-payload",
            "args": ("sensitive-token",),
        },
        allowed_fields={"request_completed": frozenset({"route"})},
        unknown_event="foreign_log",
    )

    assert result == {"event": "foreign_log", "level": "error"}
    assert "sensitive" not in str(result)
