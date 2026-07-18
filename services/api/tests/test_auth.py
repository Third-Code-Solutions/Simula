from __future__ import annotations

import json
from time import time
from typing import Any, cast
from uuid import UUID

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from simula_api.auth import SupabaseTokenVerifier
from simula_api.config import ApiSettings
from simula_api.problems import AppProblem

ISSUER = "https://auth.example.test/auth/v1"
USER_ID = "00000000-0000-4000-8000-000000000001"
SESSION_ID = "00000000-0000-4000-8000-000000000011"


def _settings(*, environment: str = "test") -> ApiSettings:
    return ApiSettings(
        environment=environment,
        database_url="postgresql://simula_api:password@127.0.0.1:54322/postgres?sslmode=disable",
        supabase_url="https://auth.example.test",
        supabase_issuer=ISSUER,
        supabase_jwks_url=f"{ISSUER}/.well-known/jwks.json",
        supabase_publishable_key="sb_publishable_test_key",
        redis_url="redis://127.0.0.1:6379/0",
        rate_limit_key_prefix="simula:rate:v1",
        cursor_secret=b"c" * 32,
        cors_origins=("http://127.0.0.1:3000",),
    )


def _claims(**overrides: object) -> dict[str, object]:
    return {
        "sub": USER_ID,
        "iss": ISSUER,
        "aud": "authenticated",
        "role": "authenticated",
        "session_id": SESSION_ID,
        "exp": int(time()) + 600,
        **overrides,
    }


def _jwk(private_key: Any, *, key_id: str) -> dict[str, object]:
    public = cast(
        dict[str, object],
        json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key())),
    )
    public.update({"kid": key_id, "alg": "RS256", "key_ops": ["verify"]})
    return public


def _token(private_key: Any, *, key_id: str, claims: dict[str, object] | None = None) -> str:
    return jwt.encode(
        _claims() if claims is None else claims,
        private_key,
        algorithm="RS256",
        headers={"kid": key_id, "typ": "JWT"},
    )


async def _assert_unauthenticated(verifier: SupabaseTokenVerifier, token: str) -> None:
    with pytest.raises(AppProblem) as raised:
        await verifier.verify(token)
    assert raised.value.status == 401
    assert raised.value.code == "unauthenticated"


async def test_asymmetric_verifier_rejects_invalid_required_claims_and_signatures() -> None:
    private_key = rsa.generate_private_key(public_exponent=65_537, key_size=2_048)
    key = _jwk(private_key, key_id="key-1")

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == f"{ISSUER}/.well-known/jwks.json"
        return httpx.Response(200, json={"keys": [key]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        verifier = SupabaseTokenVerifier(_settings(), client)
        identity = await verifier.verify(_token(private_key, key_id="key-1"))
        assert identity.user_id == UUID(USER_ID)
        assert identity.session_id == UUID(SESSION_ID)

        for claims in (
            _claims(aud="other"),
            _claims(exp=int(time()) - 1),
            _claims(iss="https://other.example.test/auth/v1"),
            _claims(nbf=int(time()) + 60),
            _claims(role="service_role"),
            _claims(session_id="not-a-canonical-uuid"),
            _claims(sub="not-a-canonical-uuid"),
        ):
            await _assert_unauthenticated(
                verifier,
                _token(private_key, key_id="key-1", claims=claims),
            )

        forged = _token(private_key, key_id="key-1")
        header, payload, signature = forged.split(".")
        forged_signature = ("A" if signature[0] != "A" else "B") + signature[1:]
        await _assert_unauthenticated(
            verifier,
            f"{header}.{payload}.{forged_signature}",
        )


async def test_jwks_unknown_key_refreshes_once_and_accepts_rotated_key() -> None:
    first_key = rsa.generate_private_key(public_exponent=65_537, key_size=2_048)
    second_key = rsa.generate_private_key(public_exponent=65_537, key_size=2_048)
    first_jwk = _jwk(first_key, key_id="key-1")
    second_jwk = _jwk(second_key, key_id="key-2")
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        keys = [first_jwk] if calls == 1 else [first_jwk, second_jwk]
        return httpx.Response(200, json={"keys": keys})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        verifier = SupabaseTokenVerifier(_settings(), client)
        await verifier.verify(_token(first_key, key_id="key-1"))
        rotated = await verifier.verify(_token(second_key, key_id="key-2"))
        assert rotated.user_id == UUID(USER_ID)
        assert calls == 2

        unknown_key = rsa.generate_private_key(public_exponent=65_537, key_size=2_048)
        await _assert_unauthenticated(verifier, _token(unknown_key, key_id="unknown"))
        assert calls == 3


async def test_symmetric_tokens_are_only_delegated_to_local_auth() -> None:
    local_token = jwt.encode(_claims(), "local-signing-secret-at-least-32-bytes", algorithm="HS256")
    auth_calls = 0

    def local_handler(request: httpx.Request) -> httpx.Response:
        nonlocal auth_calls
        auth_calls += 1
        assert str(request.url) == f"{ISSUER}/user"
        return httpx.Response(200, json={"id": USER_ID})

    async with httpx.AsyncClient(transport=httpx.MockTransport(local_handler)) as client:
        local_verifier = SupabaseTokenVerifier(_settings(), client)
        local_identity = await local_verifier.verify(local_token)
        assert local_identity.user_id == UUID(USER_ID)
        assert auth_calls == 1

        deployed_verifier = SupabaseTokenVerifier(_settings(environment="production"), client)
        await _assert_unauthenticated(deployed_verifier, local_token)
        assert auth_calls == 1
