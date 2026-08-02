"""Private SIMULA behavioral-engine HTTP boundary."""

from simula_core.observability import initialize_observability

initialize_observability("ai-engine")

# Import only after telemetry patches framework and client libraries.
from simula_ai_engine.app import create_app  # noqa: E402

__all__ = ["create_app"]
