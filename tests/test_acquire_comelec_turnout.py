from __future__ import annotations

import json
from pathlib import Path
from urllib.request import Request

import pytest

from scripts import acquire_comelec_turnout
from scripts.acquire_comelec_turnout import acquire_and_verify, validate_manifest

MANIFEST_PATH = (
    Path(__file__).parents[1] / "docs" / "data" / "comelec-national-turnout-1992-2025.json"
)


def test_acquisition_manifest_is_valid_and_fail_closed() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    summary = validate_manifest(manifest)

    assert summary == {
        "artifact_count": 2,
        "election_count": 12,
        "first_election": 1992,
        "last_election": 2025,
        "normalized_sha256": manifest["normalized_sha256"],
        "source_bundle_sha256": manifest["source_bundle_sha256"],
    }

    changed = json.loads(json.dumps(manifest))
    changed["observations"][0]["registered_voters"] += 1
    with pytest.raises(ValueError, match="normalized checksum"):
        validate_manifest(changed)


@pytest.mark.parametrize("filename", ("../escape.pdf", "nested/file.pdf", r"nested\file.pdf"))
def test_acquisition_rejects_artifact_paths(filename: str) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest["artifacts"][0]["filename"] = filename

    with pytest.raises(ValueError, match="plain basename"):
        validate_manifest(manifest)


def test_acquisition_rejects_redirects_outside_official_allowlist(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    class RedirectedResponse:
        status = 200

        def __enter__(self) -> RedirectedResponse:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def geturl(self) -> str:
            return "https://example.invalid/redirected.pdf"

        def read(self, _: int) -> bytes:
            return b""

    monkeypatch.setattr(
        acquire_comelec_turnout,
        "_open_official_url",
        lambda *_args, **_kwargs: RedirectedResponse(),
    )

    with pytest.raises(ValueError, match="redirected outside"):
        acquire_and_verify(manifest, tmp_path)


def test_redirect_handler_rejects_nonofficial_location_before_following() -> None:
    handler = acquire_comelec_turnout._AllowlistedRedirectHandler()

    with pytest.raises(ValueError, match="redirected outside"):
        handler.redirect_request(
            Request("https://www.comelec.gov.ph/php-tpls-attachments/source.pdf"),
            None,
            302,
            "Found",
            {},
            "https://example.invalid/redirected.pdf",
        )


def test_acquisition_rejects_response_larger_than_source_lock(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    expected_bytes = int(manifest["artifacts"][0]["bytes"])
    canonical_url = str(manifest["artifacts"][0]["canonical_url"])

    class OversizedResponse:
        status = 200

        def __init__(self) -> None:
            self.headers = {"Content-Type": "application/pdf"}

        def __enter__(self) -> OversizedResponse:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def geturl(self) -> str:
            return canonical_url

        def read(self, _: int) -> bytes:
            if getattr(self, "_read", False):
                return b""
            self._read = True
            return b"x" * (expected_bytes + 1)

    monkeypatch.setattr(
        acquire_comelec_turnout,
        "_open_official_url",
        lambda *_args, **_kwargs: OversizedResponse(),
    )

    with pytest.raises(ValueError, match="exceeds the locked byte size"):
        acquire_and_verify(manifest, tmp_path)


def test_source_extraction_prevents_rechecksumming_changed_manifest_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    official_rows = {
        row["election_year"]: (
            row["registered_voters"],
            row["voters_who_actually_voted"],
        )
        for row in manifest["observations"]
    }
    changed = json.loads(json.dumps(manifest))
    changed["observations"][0]["registered_voters"] += 1
    changed["normalized_sha256"] = acquire_comelec_turnout._normalized_checksum(
        changed["observations"]
    )
    validate_manifest(changed)
    monkeypatch.setattr(
        acquire_comelec_turnout,
        "_extract_comparative_pdf",
        lambda _path: {year: values for year, values in official_rows.items() if year < 2025},
    )
    monkeypatch.setattr(
        acquire_comelec_turnout,
        "_extract_2025_xlsx",
        lambda _path: official_rows[2025],
    )

    with pytest.raises(ValueError, match="do not match the locked official source bytes"):
        acquire_comelec_turnout._validate_extracted_observations(
            changed,
            {
                "comelec_comparative_turnout_1992_2022": Path("comparative.pdf"),
                "comelec_2025_local_aes_turnout": Path("turnout.xlsx"),
            },
        )


@pytest.mark.parametrize(
    ("field", "replacement"),
    (
        ("election_date", "1992-05-12"),
        ("scope_code", "invented_scope"),
        ("source_artifact_key", "comelec_2025_local_aes_turnout"),
    ),
)
def test_source_extraction_locks_model_metadata(
    monkeypatch: pytest.MonkeyPatch, field: str, replacement: str
) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    official_rows = {
        row["election_year"]: (
            row["registered_voters"],
            row["voters_who_actually_voted"],
        )
        for row in manifest["observations"]
    }
    changed = json.loads(json.dumps(manifest))
    changed["observations"][0][field] = replacement
    changed["normalized_sha256"] = acquire_comelec_turnout._normalized_checksum(
        changed["observations"]
    )
    monkeypatch.setattr(
        acquire_comelec_turnout,
        "_extract_comparative_pdf",
        lambda _path: {year: values for year, values in official_rows.items() if year < 2025},
    )
    monkeypatch.setattr(
        acquire_comelec_turnout,
        "_extract_2025_xlsx",
        lambda _path: official_rows[2025],
    )

    with pytest.raises(ValueError, match="metadata do not match"):
        acquire_comelec_turnout._validate_extracted_observations(
            changed,
            {
                "comelec_comparative_turnout_1992_2022": Path("comparative.pdf"),
                "comelec_2025_local_aes_turnout": Path("turnout.xlsx"),
            },
        )
