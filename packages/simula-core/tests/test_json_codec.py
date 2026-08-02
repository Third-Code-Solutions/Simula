import json

import pytest
from simula_core.json_codec import (
    MAX_CANONICAL_JSON_BYTES,
    MAX_JSON_BYTES,
    CanonicalJsonCodecError,
    canonical_json_dumps,
    canonical_json_dumps_bounded,
    canonical_json_loads,
)


def test_canonical_json_round_trip() -> None:
    value = {"unicode": "Maynila", "arguments": [1, True, None], "keywords": {}}

    encoded = canonical_json_dumps(value)

    assert encoded == b'{"arguments":[1,true,null],"keywords":{},"unicode":"Maynila"}'
    assert canonical_json_loads(encoded) == value


@pytest.mark.parametrize(
    "payload",
    [
        b'{"b":1, "a":2}',
        b'{"duplicate":1,"duplicate":2}',
        b'{"nan":NaN}',
        b'"\\ud800"',
        b"\xff",
    ],
)
def test_canonical_json_rejects_unsafe_or_noncanonical_bytes(payload: bytes) -> None:
    with pytest.raises(CanonicalJsonCodecError):
        canonical_json_loads(payload)


def test_canonical_json_rejects_oversize_payload() -> None:
    with pytest.raises(CanonicalJsonCodecError, match="maximum size"):
        canonical_json_loads(b" " * (MAX_JSON_BYTES + 1))


def test_explicit_bounded_encoder_does_not_reuse_the_queue_budget() -> None:
    value = {"payload": "x" * MAX_JSON_BYTES}

    with pytest.raises(CanonicalJsonCodecError, match=str(MAX_JSON_BYTES)):
        canonical_json_dumps(value)

    encoded = canonical_json_dumps_bounded(
        value,
        maximum_bytes=MAX_JSON_BYTES + 100,
    )

    assert len(encoded) > MAX_JSON_BYTES


@pytest.mark.parametrize("maximum_bytes", (0, True, MAX_CANONICAL_JSON_BYTES + 1))
def test_explicit_bounded_encoder_rejects_unsafe_limits(maximum_bytes: int) -> None:
    with pytest.raises(CanonicalJsonCodecError, match="maximum size must be"):
        canonical_json_dumps_bounded({}, maximum_bytes=maximum_bytes)


def test_canonical_json_rejects_non_json_value() -> None:
    with pytest.raises(CanonicalJsonCodecError, match="strict JSON"):
        canonical_json_dumps({"value": object()})


def test_stdlib_never_accepts_pickle_canary() -> None:
    pickle_canary = b"cos\nsystem\n(S'echo unsafe'\ntR."

    with pytest.raises(CanonicalJsonCodecError):
        canonical_json_loads(pickle_canary)
    with pytest.raises((json.JSONDecodeError, UnicodeDecodeError)):
        json.loads(pickle_canary.decode("utf-8"))
