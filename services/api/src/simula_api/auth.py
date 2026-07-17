"""Supabase bearer-token verification without symmetric signing secrets."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from time import monotonic
from typing import Any, cast
from uuid import UUID

import httpx
import jwt

from simula_api.config import ApiSettings
from simula_api.problems import AppProblem, unauthenticated

ASYMMETRIC_ALGORITHMS = frozenset({"ES256", "RS256"})
JWKS_TTL_SECONDS = 600.0
MAX_JWKS_BYTES = 64 * 1024


@dataclass(frozen=True)
class VerifiedIdentity:
    user_id: UUID
    issuer: str
    expires_at: int

    def database_claims(self) -> dict[str, str | int]:
        return {
            "sub": str(self.user_id),
            "role": "authenticated",
            "iss": self.issuer,
            "aud": "authenticated",
            "exp": self.expires_at,
        }


class SupabaseTokenVerifier:
    def __init__(self, settings: ApiSettings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._keys: dict[str, jwt.PyJWK] = {}
        self._keys_expire_at = 0.0
        self._keys_lock = asyncio.Lock()

    async def verify(self, token: str) -> VerifiedIdentity:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise unauthenticated() from error

        if header.get("typ") != "JWT":
            raise unauthenticated()
        algorithm = header.get("alg")
        if algorithm == "HS256":
            if self._settings.environment not in {"local", "test"}:
                raise unauthenticated()
            return await self._verify_local_symmetric(token)
        if algorithm not in ASYMMETRIC_ALGORITHMS:
            raise unauthenticated()

        key_id = header.get("kid")
        if not isinstance(key_id, str) or not key_id:
            raise unauthenticated()
        key = await self._key_for(key_id)
        if key.algorithm_name != algorithm:
            raise unauthenticated()

        try:
            claims = jwt.decode(
                token,
                key=key.key,
                algorithms=[algorithm],
                audience="authenticated",
                issuer=self._settings.supabase_issuer,
                options={
                    "require": ["aud", "exp", "iss", "role", "sub"],
                    "verify_aud": True,
                    "verify_exp": True,
                    "verify_iss": True,
                    "verify_nbf": True,
                    "verify_signature": True,
                },
            )
        except jwt.PyJWTError as error:
            raise unauthenticated() from error
        return self._identity(claims)

    async def _verify_local_symmetric(self, token: str) -> VerifiedIdentity:
        try:
            response = await self._client.get(
                f"{self._settings.supabase_issuer}/user",
                headers={
                    "apikey": self._settings.supabase_publishable_key,
                    "Authorization": f"Bearer {token}",
                },
            )
        except httpx.HTTPError as error:
            raise self._dependency_unavailable() from error
        if response.status_code >= 500:
            raise self._dependency_unavailable()
        if response.status_code != 200:
            raise unauthenticated()

        try:
            user = response.json()
            user_id = user["id"]
            claims = jwt.decode(
                token,
                algorithms=["HS256"],
                audience="authenticated",
                issuer=self._settings.supabase_issuer,
                options={
                    "require": ["aud", "exp", "iss", "role", "sub"],
                    "verify_aud": True,
                    "verify_exp": True,
                    "verify_iss": True,
                    "verify_nbf": True,
                    "verify_signature": False,
                },
            )
        except (KeyError, TypeError, ValueError, jwt.PyJWTError) as error:
            raise unauthenticated() from error

        identity = self._identity(claims)
        if not isinstance(user_id, str) or user_id != str(identity.user_id):
            raise unauthenticated()
        return identity

    async def _key_for(self, key_id: str) -> jwt.PyJWK:
        if monotonic() >= self._keys_expire_at:
            await self._refresh_keys()
        key = self._keys.get(key_id)
        if key is None:
            await self._refresh_keys(force=True)
            key = self._keys.get(key_id)
        if key is None:
            raise unauthenticated()
        return key

    async def _refresh_keys(self, *, force: bool = False) -> None:
        async with self._keys_lock:
            if not force and monotonic() < self._keys_expire_at:
                return
            try:
                response = await self._client.get(self._settings.supabase_jwks_url)
                response.raise_for_status()
            except httpx.HTTPError as error:
                raise self._dependency_unavailable() from error
            if len(response.content) > MAX_JWKS_BYTES:
                raise self._dependency_unavailable()
            try:
                payload = response.json()
                raw_keys = payload["keys"]
                if not isinstance(raw_keys, list):
                    raise TypeError
                parsed: dict[str, jwt.PyJWK] = {}
                for raw_key in raw_keys:
                    if not isinstance(raw_key, dict):
                        raise TypeError
                    key_id = raw_key.get("kid")
                    algorithm = raw_key.get("alg")
                    if (
                        not isinstance(key_id, str)
                        or not key_id
                        or algorithm not in ASYMMETRIC_ALGORITHMS
                        or raw_key.get("key_ops") != ["verify"]
                    ):
                        continue
                    parsed[key_id] = jwt.PyJWK.from_dict(cast(dict[str, Any], raw_key))
                if not parsed:
                    raise ValueError
            except (KeyError, TypeError, ValueError, jwt.PyJWTError) as error:
                raise self._dependency_unavailable() from error
            self._keys = parsed
            self._keys_expire_at = monotonic() + JWKS_TTL_SECONDS

    def _identity(self, claims: dict[str, Any]) -> VerifiedIdentity:
        try:
            subject = claims["sub"]
            issuer = claims["iss"]
            audience = claims["aud"]
            role = claims["role"]
            expires_at = claims["exp"]
            if (
                not isinstance(subject, str)
                or not isinstance(issuer, str)
                or audience != "authenticated"
                or role != "authenticated"
                or not isinstance(expires_at, int)
                or isinstance(expires_at, bool)
                or issuer != self._settings.supabase_issuer
            ):
                raise ValueError
            user_id = UUID(subject)
            if str(user_id) != subject:
                raise ValueError
        except (KeyError, TypeError, ValueError) as error:
            raise unauthenticated() from error
        return VerifiedIdentity(user_id=user_id, issuer=issuer, expires_at=expires_at)

    @staticmethod
    def _dependency_unavailable() -> AppProblem:
        return AppProblem(
            status=503,
            code="dependency_unavailable",
            title="Authentication service unavailable",
            detail="Authentication could not be verified. Retry shortly.",
            retry_after=5,
        )
