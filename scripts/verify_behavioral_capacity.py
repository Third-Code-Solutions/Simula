"""Deterministic local capacity and zero-cost proof for the behavioral engine."""

from __future__ import annotations

import json
import platform
import statistics
import time
import tracemalloc
from dataclasses import asdict, dataclass
from math import ceil
from uuid import UUID

from simula_core.behavioral_demo import authored_demo_behavioral_command
from simula_core.behavioral_engine import (
    MAX_BEHAVIORAL_RESULT_BYTES,
    DeterministicNarrativeSynthesizer,
    DeterministicTieredProvider,
    execute_behavioral_run,
)
from simula_core.json_codec import canonical_json_dumps_bounded


@dataclass(frozen=True, slots=True)
class CapacityCase:
    name: str
    agents: int
    llm_agents: int
    rounds: int
    samples: int
    p95_budget_seconds: float
    peak_memory_budget_bytes: int


CASES = (
    CapacityCase("demo", 10, 2, 1, 10, 1.0, 64 * 1024 * 1024),
    CapacityCase("standard", 200, 20, 3, 5, 10.0, 256 * 1024 * 1024),
    CapacityCase("maximum", 2000, 100, 5, 2, 60.0, 768 * 1024 * 1024),
)


def _p95(values: list[float]) -> float:
    return sorted(values)[ceil(0.95 * len(values)) - 1]


def _run_case(case: CapacityCase) -> dict[str, object]:
    durations: list[float] = []
    result_sizes: list[int] = []
    checksums: list[str] = []
    peak_bytes = 0
    provider = DeterministicTieredProvider()
    synthesizer = DeterministicNarrativeSynthesizer()
    for _sample in range(case.samples):
        command = authored_demo_behavioral_command(
            organization_id=UUID("00000000-0000-4000-8000-000000000101"),
            run_id=UUID("00000000-0000-4000-8000-000000000103"),
            study_id=UUID("00000000-0000-4000-8000-000000000102"),
            variant_key="capacity_fixture",
            stimulus="Authored deterministic capacity fixture.",
            agent_count=case.agents,
            llm_agent_count=case.llm_agents,
            round_count=case.rounds,
            deadline_seconds=case.p95_budget_seconds,
        )
        tracemalloc.start()
        started_at = time.perf_counter()
        result = execute_behavioral_run(
            command,
            provider=provider,
            synthesizer=synthesizer,
        )
        duration = time.perf_counter() - started_at
        _, observed_peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        serialized = canonical_json_dumps_bounded(
            result.model_dump(mode="json"),
            maximum_bytes=MAX_BEHAVIORAL_RESULT_BYTES,
        )
        expected_calls = case.agents * case.rounds
        if result.receipt.provider_calls != expected_calls:
            raise RuntimeError(f"{case.name} provider-call binding failed")
        if result.receipt.usage.cost_microusd != 0:
            raise RuntimeError(f"{case.name} deterministic cost was not zero")
        if len(serialized) > MAX_BEHAVIORAL_RESULT_BYTES:
            raise RuntimeError(f"{case.name} result exceeded the result envelope")
        durations.append(duration)
        result_sizes.append(len(serialized))
        checksums.append(result.receipt.output_sha256)
        peak_bytes = max(peak_bytes, observed_peak)

    p95_seconds = _p95(durations)
    if p95_seconds >= case.p95_budget_seconds:
        raise RuntimeError(
            f"{case.name} p95 {p95_seconds:.3f}s exceeded {case.p95_budget_seconds:.3f}s"
        )
    if peak_bytes >= case.peak_memory_budget_bytes:
        raise RuntimeError(
            f"{case.name} peak allocation {peak_bytes} exceeded {case.peak_memory_budget_bytes}"
        )
    if len(set(checksums)) != 1:
        raise RuntimeError(f"{case.name} deterministic checksum drifted")
    return {
        **asdict(case),
        "duration_seconds": {
            "maximum": round(max(durations), 6),
            "median": round(statistics.median(durations), 6),
            "minimum": round(min(durations), 6),
            "p95": round(p95_seconds, 6),
        },
        "maximum_result_bytes": max(result_sizes),
        "peak_traced_allocation_bytes": peak_bytes,
        "provider_calls_per_run": case.agents * case.rounds,
        "total_cost_microusd_per_run": 0,
        "unique_result_checksums": len(set(checksums)),
    }


def main() -> None:
    results = [_run_case(case) for case in CASES]
    print(
        json.dumps(
            {
                "cases": results,
                "platform": platform.platform(),
                "python": platform.python_version(),
                "status": "ok",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
