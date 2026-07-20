from __future__ import annotations

from copy import deepcopy

from scripts.openapi_compatibility import find_breaking_changes


def _document() -> dict[str, object]:
    return {
        "openapi": "3.1.0",
        "x-simula-stable-problem-codes": ["forbidden", "rate_limited"],
        "paths": {
            "/widgets": {
                "post": {
                    "operationId": "create_widget",
                    "parameters": [
                        {
                            "in": "header",
                            "name": "Idempotency-Key",
                            "required": False,
                            "schema": {"type": "string", "minLength": 1},
                        }
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/WidgetRequest"}
                            }
                        },
                    },
                    "responses": {
                        "201": {
                            "description": "Created",
                            "headers": {"ETag": {"schema": {"type": "string"}}},
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/WidgetResponse"}
                                }
                            },
                        }
                    },
                }
            }
        },
        "components": {
            "securitySchemes": {
                "bearer": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
            },
            "schemas": {
                "WidgetRequest": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {"name": {"type": "string", "maxLength": 80}},
                    "required": ["name"],
                },
                "WidgetResponse": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"},
                        "state": {"type": "string", "enum": ["created", "ready"]},
                    },
                    "required": ["id", "state"],
                },
            },
        },
    }


def test_additive_optional_request_and_response_fields_are_compatible() -> None:
    baseline = _document()
    candidate = deepcopy(baseline)
    schemas = candidate["components"]["schemas"]  # type: ignore[index]
    schemas["WidgetRequest"]["properties"]["note"] = {"type": "string"}
    schemas["WidgetResponse"]["properties"]["detail"] = {"type": "string"}

    assert find_breaking_changes(baseline, candidate) == []


def test_removed_operation_and_tightened_request_are_breaking() -> None:
    baseline = _document()
    candidate = deepcopy(baseline)
    candidate["paths"] = {}

    assert find_breaking_changes(baseline, candidate) == ["paths./widgets: path removed"]

    candidate = deepcopy(baseline)
    request = candidate["components"]["schemas"]["WidgetRequest"]  # type: ignore[index]
    request["properties"]["name"]["maxLength"] = 40
    breaking = find_breaking_changes(baseline, candidate)
    assert any("maxLength" in change for change in breaking)


def test_response_property_and_enum_expansion_are_breaking() -> None:
    baseline = _document()
    candidate = deepcopy(baseline)
    response = candidate["components"]["schemas"]["WidgetResponse"]  # type: ignore[index]
    del response["properties"]["id"]
    response["properties"]["state"]["enum"].append("unknown")

    breaking = find_breaking_changes(baseline, candidate)
    assert any("properties.id: property removed" in change for change in breaking)
    assert any("enum changed incompatibly" in change for change in breaking)


def test_operation_identity_security_and_response_headers_are_governed() -> None:
    baseline = _document()
    candidate = deepcopy(baseline)
    operation = candidate["paths"]["/widgets"]["post"]  # type: ignore[index]
    operation["operationId"] = "replace_widget"
    operation["security"] = [{"bearer": []}]
    del operation["responses"]["201"]["headers"]["ETag"]

    breaking = find_breaking_changes(baseline, candidate)
    assert any("operationId" in change for change in breaking)
    assert any("security" in change for change in breaking)
    assert any("response header removed" in change for change in breaking)


def test_broken_reference_fails_closed() -> None:
    baseline = _document()
    candidate = deepcopy(baseline)
    request_body = candidate["paths"]["/widgets"]["post"]["requestBody"]  # type: ignore[index]
    request_body["content"]["application/json"]["schema"]["$ref"] = "#/components/schemas/Missing"

    try:
        find_breaking_changes(baseline, candidate)
    except ValueError as error:
        assert "unresolved OpenAPI reference" in str(error)
    else:
        raise AssertionError("broken candidate reference was accepted")


def test_security_scheme_definition_change_is_breaking() -> None:
    baseline = _document()
    candidate = deepcopy(baseline)
    candidate["components"]["securitySchemes"]["bearer"]["type"] = "apiKey"  # type: ignore[index]

    assert any(
        "securitySchemes.bearer" in change for change in find_breaking_changes(baseline, candidate)
    )


def test_response_type_removal_fails_closed() -> None:
    baseline = _document()
    response_candidate = deepcopy(baseline)
    response_id = response_candidate["components"]["schemas"]["WidgetResponse"][  # type: ignore[index]
        "properties"
    ]["id"]
    del response_id["type"]
    assert any("type" in change for change in find_breaking_changes(baseline, response_candidate))


def test_added_request_type_constraint_and_removed_stable_code_are_breaking() -> None:
    baseline = _document()
    del baseline["components"]["schemas"]["WidgetRequest"]["properties"]["name"][  # type: ignore[index]
        "type"
    ]
    candidate = deepcopy(baseline)
    candidate["components"]["schemas"]["WidgetRequest"]["properties"]["name"][  # type: ignore[index]
        "type"
    ] = "string"
    candidate["x-simula-stable-problem-codes"] = ["forbidden"]

    breaking = find_breaking_changes(baseline, candidate)
    assert any("request type constraint added" in change for change in breaking)
    assert any("stable problem code removed" in change for change in breaking)
