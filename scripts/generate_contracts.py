"""Generate normalized public contracts from Python authorities."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from simula_api.app import app
from simula_api.problem_codes import STABLE_PROBLEM_CODES
from simula_core.behavioral_engine import (
    BehavioralReport,
    ContextGraph,
    MatchedVariantComparison,
)
from simula_core.behavioral_evaluation import BehavioralEvaluationReport
from simula_core.simulation import SimulationResultV1

GENERATED_BY = "scripts/generate_contracts.py"


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def generate(output_directory: Path) -> None:
    openapi = app.openapi()
    openapi["x-generated-by"] = GENERATED_BY
    openapi["x-simula-stable-problem-codes"] = list(STABLE_PROBLEM_CODES)
    _write_json(output_directory / "openapi.json", openapi)
    result_schema = SimulationResultV1.model_json_schema()
    result_schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    result_schema["x-generated-by"] = GENERATED_BY
    _write_json(output_directory / "result.schema.json", result_schema)
    behavioral_report_schema = BehavioralReport.model_json_schema()
    behavioral_report_schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    behavioral_report_schema["x-generated-by"] = GENERATED_BY
    _write_json(
        output_directory / "behavioral-report.schema.json",
        behavioral_report_schema,
    )
    context_graph_schema = ContextGraph.model_json_schema()
    context_graph_schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    context_graph_schema["x-generated-by"] = GENERATED_BY
    _write_json(output_directory / "context-graph.schema.json", context_graph_schema)
    comparison_schema = MatchedVariantComparison.model_json_schema()
    comparison_schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    comparison_schema["x-generated-by"] = GENERATED_BY
    _write_json(
        output_directory / "behavioral-comparison.schema.json",
        comparison_schema,
    )
    evaluation_report_schema = BehavioralEvaluationReport.model_json_schema()
    evaluation_report_schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    evaluation_report_schema["x-generated-by"] = GENERATED_BY
    _write_json(
        output_directory / "behavioral-evaluation-report.schema.json",
        evaluation_report_schema,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("packages/contracts"),
        help="directory receiving openapi.json and result.schema.json",
    )
    args = parser.parse_args()
    generate(args.output)


if __name__ == "__main__":
    main()
