"""Runtime services owned by the FastAPI lifespan."""

from __future__ import annotations

from dataclasses import dataclass

from simula_api.auth import SupabaseTokenVerifier
from simula_api.cursor import CursorCodec
from simula_api.database import DatabaseGateway


@dataclass(frozen=True)
class AppServices:
    verifier: SupabaseTokenVerifier
    database: DatabaseGateway
    cursors: CursorCodec
