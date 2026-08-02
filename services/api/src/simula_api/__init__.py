"""SIMULA API package."""

from simula_core.observability import initialize_observability

initialize_observability("api")

# Import only after telemetry patches framework and client libraries.
from simula_api.app import create_app  # noqa: E402

__all__ = ["create_app"]
