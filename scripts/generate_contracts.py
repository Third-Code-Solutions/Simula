"""Generate normalized public contracts from Python authorities."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from simula_api.app import app

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
    _write_json(output_directory / "openapi.json", openapi)
    _write_json(
        output_directory / "result.schema.json",
        {
            "$comment": "GENERATED: no result contract exists before P2-04",
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "not": {},
            "x-generated-by": GENERATED_BY,
        },
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
