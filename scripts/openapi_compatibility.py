"""Conservative OpenAPI v1 compatibility checks with no runtime dependency."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal

HTTP_METHODS = frozenset({"delete", "get", "head", "options", "patch", "post", "put", "trace"})
type Direction = Literal["request", "response"]
type JsonObject = Mapping[str, Any]


def find_breaking_changes(baseline: JsonObject, candidate: JsonObject) -> list[str]:
    """Return stable, human-readable incompatibilities from baseline to candidate."""

    changes: list[str] = []
    baseline_paths = _mapping(baseline.get("paths"))
    candidate_paths = _mapping(candidate.get("paths"))
    for path, baseline_path_item_value in baseline_paths.items():
        location = f"paths.{path}"
        if path not in candidate_paths:
            changes.append(f"{location}: path removed")
            continue
        baseline_path_item = _mapping(baseline_path_item_value)
        candidate_path_item = _mapping(candidate_paths[path])
        for method in sorted(HTTP_METHODS.intersection(baseline_path_item)):
            operation_location = f"{location}.{method}"
            if method not in candidate_path_item:
                changes.append(f"{operation_location}: operation removed")
                continue
            _compare_operation(
                baseline,
                candidate,
                _mapping(baseline_path_item[method]),
                _mapping(candidate_path_item[method]),
                baseline_path_item.get("parameters", []),
                candidate_path_item.get("parameters", []),
                operation_location,
                changes,
            )
    return changes


def _compare_operation(
    baseline_document: JsonObject,
    candidate_document: JsonObject,
    baseline: JsonObject,
    candidate: JsonObject,
    baseline_path_parameters: object,
    candidate_path_parameters: object,
    location: str,
    changes: list[str],
) -> None:
    if baseline.get("operationId") != candidate.get("operationId"):
        changes.append(f"{location}.operationId: operation identifier changed")
    if baseline.get("security") != candidate.get("security"):
        changes.append(f"{location}.security: security requirements changed")
    _compare_parameters(
        baseline_document,
        candidate_document,
        [*_list(baseline_path_parameters), *_list(baseline.get("parameters", []))],
        [*_list(candidate_path_parameters), *_list(candidate.get("parameters", []))],
        location,
        changes,
    )
    baseline_body = baseline.get("requestBody")
    candidate_body = candidate.get("requestBody")
    if baseline_body is not None and candidate_body is None:
        changes.append(f"{location}.requestBody: request body removed")
    elif baseline_body is None and candidate_body is not None:
        if bool(_mapping(_resolve(candidate_document, candidate_body)).get("required")):
            changes.append(f"{location}.requestBody: required request body added")
    elif baseline_body is not None and candidate_body is not None:
        baseline_body_object = _mapping(_resolve(baseline_document, baseline_body))
        candidate_body_object = _mapping(_resolve(candidate_document, candidate_body))
        if not bool(baseline_body_object.get("required")) and bool(
            candidate_body_object.get("required")
        ):
            changes.append(f"{location}.requestBody: request body became required")
        _compare_content(
            baseline_document,
            candidate_document,
            baseline_body_object.get("content"),
            candidate_body_object.get("content"),
            f"{location}.requestBody.content",
            "request",
            changes,
        )

    baseline_responses = _mapping(baseline.get("responses"))
    candidate_responses = _mapping(candidate.get("responses"))
    for status, baseline_response in baseline_responses.items():
        response_location = f"{location}.responses.{status}"
        if status not in candidate_responses:
            changes.append(f"{response_location}: response removed")
            continue
        baseline_response_object = _mapping(_resolve(baseline_document, baseline_response))
        candidate_response_object = _mapping(
            _resolve(candidate_document, candidate_responses[status])
        )
        _compare_response_headers(
            baseline_document,
            candidate_document,
            baseline_response_object.get("headers"),
            candidate_response_object.get("headers"),
            response_location,
            changes,
        )
        _compare_content(
            baseline_document,
            candidate_document,
            baseline_response_object.get("content"),
            candidate_response_object.get("content"),
            f"{response_location}.content",
            "response",
            changes,
        )


def _compare_response_headers(
    baseline_document: JsonObject,
    candidate_document: JsonObject,
    baseline_value: object,
    candidate_value: object,
    location: str,
    changes: list[str],
) -> None:
    baseline_headers = _mapping(baseline_value)
    candidate_headers = _mapping(candidate_value)
    for name, baseline_header in baseline_headers.items():
        header_location = f"{location}.headers.{name}"
        if name not in candidate_headers:
            changes.append(f"{header_location}: response header removed")
            continue
        _compare_schema(
            baseline_document,
            candidate_document,
            _mapping(_resolve(baseline_document, baseline_header)).get("schema"),
            _mapping(_resolve(candidate_document, candidate_headers[name])).get("schema"),
            f"{header_location}.schema",
            "response",
            changes,
        )


def _compare_parameters(
    baseline_document: JsonObject,
    candidate_document: JsonObject,
    baseline_value: object,
    candidate_value: object,
    location: str,
    changes: list[str],
) -> None:
    baseline_parameters = {
        _parameter_key(parameter): _mapping(_resolve(baseline_document, parameter))
        for parameter in _list(baseline_value)
    }
    candidate_parameters = {
        _parameter_key(parameter): _mapping(_resolve(candidate_document, parameter))
        for parameter in _list(candidate_value)
    }
    for key, baseline_parameter in baseline_parameters.items():
        parameter_location = f"{location}.parameters.{key[0]}:{key[1]}"
        candidate_parameter = candidate_parameters.get(key)
        if candidate_parameter is None:
            changes.append(f"{parameter_location}: parameter removed")
            continue
        if not bool(baseline_parameter.get("required")) and bool(
            candidate_parameter.get("required")
        ):
            changes.append(f"{parameter_location}: parameter became required")
        _compare_schema(
            baseline_document,
            candidate_document,
            baseline_parameter.get("schema"),
            candidate_parameter.get("schema"),
            f"{parameter_location}.schema",
            "request",
            changes,
        )
    for key, candidate_parameter in candidate_parameters.items():
        if key not in baseline_parameters and bool(candidate_parameter.get("required")):
            changes.append(f"{location}.parameters.{key[0]}:{key[1]}: required parameter added")


def _compare_content(
    baseline_document: JsonObject,
    candidate_document: JsonObject,
    baseline_value: object,
    candidate_value: object,
    location: str,
    direction: Direction,
    changes: list[str],
) -> None:
    baseline_content = _mapping(baseline_value)
    candidate_content = _mapping(candidate_value)
    for media_type, baseline_media in baseline_content.items():
        media_location = f"{location}.{media_type}"
        if media_type not in candidate_content:
            changes.append(f"{media_location}: media type removed")
            continue
        _compare_schema(
            baseline_document,
            candidate_document,
            _mapping(baseline_media).get("schema"),
            _mapping(candidate_content[media_type]).get("schema"),
            f"{media_location}.schema",
            direction,
            changes,
        )


def _compare_schema(
    baseline_document: JsonObject,
    candidate_document: JsonObject,
    baseline_value: object,
    candidate_value: object,
    location: str,
    direction: Direction,
    changes: list[str],
) -> None:
    if baseline_value is None:
        return
    if candidate_value is None:
        changes.append(f"{location}: schema removed")
        return
    baseline = _mapping(_resolve(baseline_document, baseline_value))
    candidate = _mapping(_resolve(candidate_document, candidate_value))

    baseline_types = _types(baseline.get("type"))
    candidate_types = _types(candidate.get("type"))
    if baseline_types and candidate_types and baseline_types != candidate_types:
        changes.append(f"{location}: type changed from {baseline_types} to {candidate_types}")

    if "const" in baseline and baseline.get("const") != candidate.get("const"):
        changes.append(f"{location}: const changed")
    for keyword in ("format", "contentEncoding", "contentMediaType"):
        if baseline.get(keyword) != candidate.get(keyword):
            changes.append(f"{location}.{keyword}: value changed")

    baseline_enum = baseline.get("enum")
    candidate_enum = candidate.get("enum")
    if isinstance(baseline_enum, list) and isinstance(candidate_enum, list):
        baseline_values = {_json_key(item) for item in baseline_enum}
        candidate_values = {_json_key(item) for item in candidate_enum}
        incompatible = (
            not baseline_values.issubset(candidate_values)
            if direction == "request"
            else not candidate_values.issubset(baseline_values)
        )
        if incompatible:
            changes.append(f"{location}: enum changed incompatibly")
    elif isinstance(baseline_enum, list) and candidate_enum is None and direction == "response":
        changes.append(f"{location}: response enum constraint removed")
    elif baseline_enum is None and isinstance(candidate_enum, list) and direction == "request":
        changes.append(f"{location}: request enum constraint added")

    baseline_required = set(_strings(baseline.get("required")))
    candidate_required = set(_strings(candidate.get("required")))
    if direction == "request":
        for name in sorted(candidate_required - baseline_required):
            changes.append(f"{location}.required.{name}: required request property added")
    else:
        for name in sorted(baseline_required - candidate_required):
            changes.append(f"{location}.required.{name}: required response property removed")
        for name in sorted(candidate_required - baseline_required):
            changes.append(f"{location}.required.{name}: required response property added")

    baseline_properties = _mapping(baseline.get("properties"))
    candidate_properties = _mapping(candidate.get("properties"))
    for name, baseline_property in baseline_properties.items():
        property_location = f"{location}.properties.{name}"
        if name not in candidate_properties:
            changes.append(f"{property_location}: property removed")
            continue
        _compare_schema(
            baseline_document,
            candidate_document,
            baseline_property,
            candidate_properties[name],
            property_location,
            direction,
            changes,
        )

    _compare_bounds(baseline, candidate, location, direction, changes)
    _compare_compositions(baseline, candidate, location, changes)
    if "items" in baseline:
        _compare_schema(
            baseline_document,
            candidate_document,
            baseline.get("items"),
            candidate.get("items"),
            f"{location}.items",
            direction,
            changes,
        )

    baseline_additional = baseline.get("additionalProperties", True)
    candidate_additional = candidate.get("additionalProperties", True)
    if (
        direction == "request"
        and baseline_additional is not False
        and candidate_additional is False
    ):
        changes.append(f"{location}: request additionalProperties became false")
    if (
        direction == "response"
        and baseline_additional is False
        and candidate_additional is not False
    ):
        changes.append(f"{location}: response additionalProperties became permissive")


def _compare_bounds(
    baseline: JsonObject,
    candidate: JsonObject,
    location: str,
    direction: Direction,
    changes: list[str],
) -> None:
    minimums = ("minLength", "minItems", "minProperties", "minimum", "exclusiveMinimum")
    maximums = ("maxLength", "maxItems", "maxProperties", "maximum", "exclusiveMaximum")
    for keyword in minimums:
        old = baseline.get(keyword)
        new = candidate.get(keyword)
        if isinstance(old, (int, float)) and isinstance(new, (int, float)):
            if (direction == "request" and new > old) or (direction == "response" and new < old):
                changes.append(f"{location}.{keyword}: bound changed incompatibly")
        elif old is None and isinstance(new, (int, float)) and direction == "request":
            changes.append(f"{location}.{keyword}: request bound added")
        elif isinstance(old, (int, float)) and new is None and direction == "response":
            changes.append(f"{location}.{keyword}: response bound removed")
    for keyword in maximums:
        old = baseline.get(keyword)
        new = candidate.get(keyword)
        if isinstance(old, (int, float)) and isinstance(new, (int, float)):
            if (direction == "request" and new < old) or (direction == "response" and new > old):
                changes.append(f"{location}.{keyword}: bound changed incompatibly")
        elif old is None and isinstance(new, (int, float)) and direction == "request":
            changes.append(f"{location}.{keyword}: request bound added")
        elif isinstance(old, (int, float)) and new is None and direction == "response":
            changes.append(f"{location}.{keyword}: response bound removed")
    if baseline.get("pattern") != candidate.get("pattern") and (
        "pattern" in baseline or "pattern" in candidate
    ):
        changes.append(f"{location}.pattern: pattern changed")


def _compare_compositions(
    baseline: JsonObject, candidate: JsonObject, location: str, changes: list[str]
) -> None:
    for keyword in ("allOf", "anyOf", "oneOf", "not"):
        if baseline.get(keyword) != candidate.get(keyword):
            changes.append(f"{location}.{keyword}: composition changed")


def _resolve(document: JsonObject, value: object) -> object:
    current = value
    visited: set[str] = set()
    while isinstance(current, Mapping) and isinstance(current.get("$ref"), str):
        reference = current["$ref"]
        if not reference.startswith("#/") or reference in visited:
            return current
        visited.add(reference)
        resolved: object = document
        for part in reference[2:].split("/"):
            key = part.replace("~1", "/").replace("~0", "~")
            container = _mapping(resolved)
            if key not in container:
                raise ValueError(f"unresolved OpenAPI reference: {reference}")
            resolved = container[key]
        current = resolved
    return current


def _parameter_key(value: object) -> tuple[str, str]:
    parameter = _mapping(value)
    reference = parameter.get("$ref")
    if isinstance(reference, str):
        return ("$ref", reference)
    return (str(parameter.get("in", "unknown")), str(parameter.get("name", "unknown")))


def _mapping(value: object) -> JsonObject:
    return value if isinstance(value, Mapping) else {}


def _list(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _strings(value: object) -> list[str]:
    return [item for item in _list(value) if isinstance(item, str)]


def _types(value: object) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value,)
    return tuple(sorted(_strings(value)))


def _json_key(value: object) -> str:
    return repr(value)
