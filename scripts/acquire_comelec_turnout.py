"""Verify and acquire the checksum-locked COMELEC national turnout sources.

The normalized values are extracted from two fixed official artifacts. This
command fails closed when either the source bytes or normalized rows drift.
It does not use mirrors, unofficial APIs, or respondent data.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zlib
from collections.abc import Mapping, Sequence
from hashlib import sha256
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree
from zipfile import ZipFile

WORKSPACE_ROOT = Path(__file__).parents[1]
DEFAULT_MANIFEST_PATH = WORKSPACE_ROOT / "docs" / "data" / "comelec-national-turnout-1992-2025.json"
DEFAULT_DOWNLOAD_DIR = (
    WORKSPACE_ROOT / "docs" / "data" / "raw" / "comelec-national-turnout-1992-2025"
)
ALLOWED_HOST = "www.comelec.gov.ph"
ALLOWED_PATH_PREFIX = "/php-tpls-attachments/"
PDF_ELECTION_YEARS = (1992, 1995, 1998, 2001, 2004, 2007, 2010, 2013, 2016, 2019, 2022)
SPREADSHEET_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
OFFICIAL_OBSERVATION_METADATA = {
    1992: ("1992-05-11", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    1995: ("1995-05-08", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    1998: ("1998-05-11", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    2001: ("2001-05-14", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    2004: ("2004-05-10", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    2007: ("2007-05-14", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    2010: ("2010-05-10", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    2013: ("2013-05-13", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    2016: ("2016-05-09", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    2019: ("2019-05-13", "comelec_comparative_headline", "comelec_comparative_turnout_1992_2022"),
    2022: (
        "2022-05-09",
        "comelec_comparative_headline_lav_and_63_barmm_barangays",
        "comelec_comparative_turnout_1992_2022",
    ),
    2025: ("2025-05-12", "local_aes", "comelec_2025_local_aes_turnout"),
}


def _require_official_url(value: object, label: str) -> str:
    url = _require_str(value, label)
    parsed = urlparse(url)
    try:
        port = parsed.port
    except ValueError as error:
        raise ValueError(f"{label} is outside the official COMELEC allowlist: {url}") from error
    if (
        parsed.scheme != "https"
        or parsed.hostname != ALLOWED_HOST
        or parsed.username is not None
        or parsed.password is not None
        or port is not None
        or parsed.query
        or parsed.fragment
        or not parsed.path.startswith(ALLOWED_PATH_PREFIX)
    ):
        raise ValueError(f"{label} is outside the official COMELEC allowlist: {url}")
    return url


class _AllowlistedRedirectHandler(HTTPRedirectHandler):
    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> Request | None:
        try:
            _require_official_url(newurl, "redirected artifact URL")
        except ValueError as error:
            raise ValueError(
                f"official source redirected outside the COMELEC allowlist: {newurl}"
            ) from error
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open_official_url(request: Request, *, timeout: int) -> Any:
    return build_opener(_AllowlistedRedirectHandler()).open(request, timeout=timeout)


def _require_basename(value: object, label: str) -> str:
    filename = _require_str(value, label)
    if filename in {".", ".."} or "/" in filename or "\\" in filename:
        raise ValueError(f"{label} must be a plain basename")
    return filename


def _require_mapping(value: object, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be an object")
    return value


def _require_sequence(value: object, label: str) -> Sequence[Any]:
    if isinstance(value, str) or not isinstance(value, Sequence):
        raise ValueError(f"{label} must be an array")
    return value


def _require_str(value: object, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string")
    return value


def _require_int(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{label} must be an integer")
    return value


def _source_bundle_checksum(artifacts: Sequence[Any]) -> str:
    lines = []
    for raw_artifact in artifacts:
        artifact = _require_mapping(raw_artifact, "artifact")
        lines.append(
            "|".join(
                (
                    _require_str(artifact.get("artifact_key"), "artifact_key"),
                    _require_str(artifact.get("sha256"), "artifact sha256"),
                    str(_require_int(artifact.get("bytes"), "artifact bytes")),
                )
            )
        )
    return sha256("\n".join(sorted(lines)).encode()).hexdigest()


def _normalized_checksum(observations: Sequence[Any]) -> str:
    rows: list[tuple[tuple[str, str, str, str, str], str]] = []
    for raw_observation in observations:
        observation = _require_mapping(raw_observation, "observation")
        year = _require_int(observation.get("election_year"), "election_year")
        election_date = _require_str(observation.get("election_date"), "election_date")
        registered = _require_int(observation.get("registered_voters"), "registered_voters")
        voted = _require_int(
            observation.get("voters_who_actually_voted"), "voters_who_actually_voted"
        )
        if registered <= 0 or voted < 0 or voted > registered:
            raise ValueError(f"invalid voter counts for election {year}")
        for option_key, votes in (
            ("did_not_vote", registered - voted),
            ("voted", voted),
        ):
            election_key = f"nle_{year}"
            row = "|".join(
                (
                    election_key,
                    election_date,
                    "voter_turnout",
                    "philippines",
                    option_key,
                    option_key,
                    str(votes),
                    str(registered),
                )
            )
            rows.append(
                (
                    (
                        election_date,
                        election_key,
                        "voter_turnout",
                        "philippines",
                        option_key,
                    ),
                    row,
                )
            )
    payload = "\n".join(row for _, row in sorted(rows))
    return sha256(payload.encode()).hexdigest()


def validate_manifest(manifest: Mapping[str, Any]) -> dict[str, int | str]:
    """Validate source locks, normalization, chronology, and target boundary."""

    if manifest.get("schema_version") != 1:
        raise ValueError("unsupported manifest schema version")
    artifacts = _require_sequence(manifest.get("artifacts"), "artifacts")
    observations = _require_sequence(manifest.get("observations"), "observations")
    if len(artifacts) != 2:
        raise ValueError("manifest must contain exactly two official artifacts")
    if len(observations) < 10:
        raise ValueError("manifest requires at least ten historical elections")

    artifact_keys: set[str] = set()
    artifact_filenames: set[str] = set()
    for raw_artifact in artifacts:
        artifact = _require_mapping(raw_artifact, "artifact")
        key = _require_str(artifact.get("artifact_key"), "artifact_key")
        filename = _require_basename(artifact.get("filename"), "artifact filename")
        canonical_url = _require_official_url(
            artifact.get("canonical_url"), "artifact canonical_url"
        )
        final_url = _require_official_url(artifact.get("final_url"), "artifact final_url")
        if (
            final_url != canonical_url
            or _require_int(artifact.get("http_status"), "http_status") != 200
        ):
            raise ValueError("artifact retrieval receipt must record a direct HTTP 200 response")
        _require_str(artifact.get("content_type"), "artifact content_type")
        _require_str(artifact.get("http_last_modified"), "artifact http_last_modified")
        if key in artifact_keys or filename in artifact_filenames:
            raise ValueError("artifact keys and filenames must be unique")
        artifact_keys.add(key)
        artifact_filenames.add(filename)
        expected_hash = _require_str(artifact.get("sha256"), "artifact sha256")
        if len(expected_hash) != 64 or any(
            character not in "0123456789abcdef" for character in expected_hash
        ):
            raise ValueError("artifact sha256 must be lowercase hexadecimal")

    expected_source_checksum = _require_str(
        manifest.get("source_bundle_sha256"), "source_bundle_sha256"
    )
    if _source_bundle_checksum(artifacts) != expected_source_checksum:
        raise ValueError("source bundle checksum mismatch")

    years: list[int] = []
    dates: list[str] = []
    for raw_observation in observations:
        observation = _require_mapping(raw_observation, "observation")
        year = _require_int(observation.get("election_year"), "election_year")
        election_date = _require_str(observation.get("election_date"), "election_date")
        registered = _require_int(observation.get("registered_voters"), "registered_voters")
        voted = _require_int(
            observation.get("voters_who_actually_voted"), "voters_who_actually_voted"
        )
        published = observation.get("published_turnout_pct")
        if isinstance(published, bool) or not isinstance(published, (int, float)):
            raise ValueError("published_turnout_pct must be numeric")
        if registered <= 0 or voted < 0 or voted > registered:
            raise ValueError(f"invalid voter counts for election {year}")
        if abs(100.0 * voted / registered - float(published)) > 0.011:
            raise ValueError(f"published turnout does not reconcile for election {year}")
        source_key = _require_str(observation.get("source_artifact_key"), "source_artifact_key")
        if source_key not in artifact_keys:
            raise ValueError(f"unknown source artifact for election {year}")
        years.append(year)
        dates.append(election_date)
    if years != sorted(years) or len(years) != len(set(years)):
        raise ValueError("elections must be unique and chronological")
    if dates != sorted(dates):
        raise ValueError("election dates must be chronological")

    expected_normalized_checksum = _require_str(
        manifest.get("normalized_sha256"), "normalized_sha256"
    )
    if _normalized_checksum(observations) != expected_normalized_checksum:
        raise ValueError("normalized checksum mismatch")

    targets = _require_sequence(manifest.get("default_targets"), "default_targets")
    if len(targets) < 2:
        raise ValueError("default forecast requires at least two options")
    for raw_target in targets:
        target = _require_mapping(raw_target, "default target")
        target_date = _require_str(target.get("election_date"), "target election_date")
        if target_date <= dates[-1]:
            raise ValueError("default forecast target must be later than every observation")

    return {
        "artifact_count": len(artifacts),
        "election_count": len(observations),
        "first_election": years[0],
        "last_election": years[-1],
        "normalized_sha256": expected_normalized_checksum,
        "source_bundle_sha256": expected_source_checksum,
    }


def _hash_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _pdf_text_arrays(path: Path) -> list[str]:
    payload = path.read_bytes()
    arrays: list[str] = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", payload, re.DOTALL):
        try:
            stream = zlib.decompress(match.group(1))
        except zlib.error:
            continue
        for text_array in re.finditer(rb"\[(.*?)\]\s*TJ", stream, re.DOTALL):
            parts = re.findall(rb"\((?:\\.|[^\\)])*\)", text_array.group(1))
            joined = b"".join(part[1:-1] for part in parts)
            arrays.append(
                joined.replace(rb"\(", b"(")
                .replace(rb"\)", b")")
                .replace(rb"\\", b"\\")
                .decode("latin-1")
            )
    return arrays


def _extract_comparative_pdf(path: Path) -> dict[int, tuple[int, int]]:
    texts = _pdf_text_arrays(path)
    numbers = [
        match for text in texts for match in re.findall(r"(?<!\d)(\d{2},\d{3},\d{3})(?!\d)", text)
    ]
    try:
        first_axis = numbers.index("10,000,000")
        registered = numbers[:first_axis]
        actual_start = numbers.index("70,000,000", first_axis) + 1
        actual_end = numbers.index("10,000,000", actual_start)
        actual = numbers[actual_start:actual_end]
    except ValueError as error:
        raise ValueError("official comparative PDF chart structure is unrecognized") from error
    if len(registered) != len(PDF_ELECTION_YEARS) or len(actual) != len(PDF_ELECTION_YEARS):
        raise ValueError("official comparative PDF does not contain eleven election totals")
    joined_text = "\n".join(texts)
    if any(str(year) not in joined_text for year in PDF_ELECTION_YEARS):
        raise ValueError("official comparative PDF election-year labels are incomplete")
    return {
        year: (int(registered_value.replace(",", "")), int(actual_value.replace(",", "")))
        for year, registered_value, actual_value in zip(
            PDF_ELECTION_YEARS, registered, actual, strict=True
        )
    }


def _xlsx_shared_strings(archive: ZipFile) -> list[str]:
    root = ElementTree.fromstring(  # noqa: S314 - exact bytes are SHA-256 locked first
        archive.read("xl/sharedStrings.xml")
    )
    namespace = {"m": SPREADSHEET_NAMESPACE}
    return [
        "".join(node.text or "" for node in item.findall(".//m:t", namespace))
        for item in root.findall("m:si", namespace)
    ]


def _xlsx_cell_value(cell: ElementTree.Element, shared_strings: Sequence[str]) -> str:
    namespace = {"m": SPREADSHEET_NAMESPACE}
    value = cell.findtext("m:v", default="", namespaces=namespace)
    if cell.get("t") == "s" and value:
        return shared_strings[int(value)]
    if cell.get("t") == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", namespace))
    return value


def _xlsx_column(cell: ElementTree.Element) -> str | None:
    match = re.match(r"[A-Z]+", cell.get("r", ""))
    return None if match is None else match.group(0)


def _extract_2025_xlsx(path: Path) -> tuple[int, int]:
    namespace = {"m": SPREADSHEET_NAMESPACE, "r": RELATIONSHIP_NAMESPACE}
    with ZipFile(path) as archive:
        workbook = ElementTree.fromstring(  # noqa: S314 - exact bytes are SHA-256 locked first
            archive.read("xl/workbook.xml")
        )
        summary = next(
            (
                sheet
                for sheet in workbook.findall(".//m:sheet", namespace)
                if sheet.get("name") == "SUMMARY"
            ),
            None,
        )
        if summary is None or summary.get(f"{{{RELATIONSHIP_NAMESPACE}}}id") != "rId1":
            raise ValueError("official 2025 workbook SUMMARY sheet is missing")
        shared_strings = _xlsx_shared_strings(archive)
        worksheet = ElementTree.fromstring(  # noqa: S314 - locked workbook bytes only
            archive.read("xl/worksheets/sheet1.xml")
        )
        for row in worksheet.findall(".//m:row", namespace):
            values = {
                column: _xlsx_cell_value(cell, shared_strings)
                for cell in row.findall("m:c", namespace)
                if (column := _xlsx_column(cell)) is not None
            }
            if values.get("A") == "Local AES":
                try:
                    registered = int(values["E"])
                    actual = int(values["F"])
                except (KeyError, ValueError) as error:
                    raise ValueError("official 2025 Local AES totals are malformed") from error
                if registered <= 0 or not 0 <= actual <= registered:
                    raise ValueError("official 2025 Local AES totals are invalid")
                return registered, actual
    raise ValueError("official 2025 workbook Local AES row is missing")


def _validate_extracted_observations(
    manifest: Mapping[str, Any], artifacts_by_key: Mapping[str, Path]
) -> None:
    try:
        extracted = _extract_comparative_pdf(
            artifacts_by_key["comelec_comparative_turnout_1992_2022"]
        )
        extracted[2025] = _extract_2025_xlsx(artifacts_by_key["comelec_2025_local_aes_turnout"])
    except KeyError as error:
        raise ValueError("verified artifact set is incomplete") from error
    manifest_rows = {
        _require_int(row.get("election_year"), "election_year"): (
            _require_int(row.get("registered_voters"), "registered_voters"),
            _require_int(row.get("voters_who_actually_voted"), "voters_who_actually_voted"),
        )
        for raw_row in _require_sequence(manifest.get("observations"), "observations")
        for row in (_require_mapping(raw_row, "observation"),)
    }
    if extracted != manifest_rows:
        raise ValueError("normalized observations do not match the locked official source bytes")
    manifest_metadata = {
        _require_int(row.get("election_year"), "election_year"): (
            _require_str(row.get("election_date"), "election_date"),
            _require_str(row.get("scope_code"), "scope_code"),
            _require_str(row.get("source_artifact_key"), "source_artifact_key"),
        )
        for raw_row in _require_sequence(manifest.get("observations"), "observations")
        for row in (_require_mapping(raw_row, "observation"),)
    }
    if manifest_metadata != OFFICIAL_OBSERVATION_METADATA:
        raise ValueError("normalized observation metadata do not match the locked source protocol")


def acquire_and_verify(manifest: Mapping[str, Any], destination: Path) -> list[dict[str, Any]]:
    """Download allowed official artifacts and verify exact bytes and hashes."""

    validate_manifest(manifest)
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    verified: list[dict[str, Any]] = []
    artifacts_by_key: dict[str, Path] = {}
    for raw_artifact in _require_sequence(manifest.get("artifacts"), "artifacts"):
        artifact = _require_mapping(raw_artifact, "artifact")
        filename = _require_basename(artifact.get("filename"), "artifact filename")
        url = _require_official_url(artifact.get("canonical_url"), "artifact canonical_url")
        expected_bytes = _require_int(artifact.get("bytes"), "artifact bytes")
        expected_hash = _require_str(artifact.get("sha256"), "artifact sha256")
        expected_content_type = _require_str(artifact.get("content_type"), "artifact content_type")
        target = (destination / filename).resolve()
        if target.parent != destination:
            raise ValueError("artifact filename escapes the download directory")
        receipt: dict[str, Any] = {
            "canonical_url": url,
            "final_url": url,
            "http_status": 200,
            "content_type": expected_content_type,
            "content_length": expected_bytes,
            "last_modified": artifact.get("http_last_modified"),
            "etag": None,
            "receipt_basis": "manifest-recorded retrieval",
        }
        if target.exists():
            if target.stat().st_size != expected_bytes or _hash_file(target) != expected_hash:
                raise ValueError(f"existing artifact does not match source lock: {target}")
        else:
            partial = destination / f"{filename}.partial"
            if partial.exists():
                raise ValueError(f"partial artifact already exists: {partial}")
            request = Request(  # noqa: S310 - canonical URL is allowlisted above
                url, headers={"User-Agent": "SIMULA-source-verifier/1"}
            )
            try:
                with _open_official_url(request, timeout=60) as response:
                    final_url = response.geturl()
                    try:
                        _require_official_url(final_url, "redirected artifact URL")
                    except ValueError as error:
                        raise ValueError(
                            f"official source redirected outside the COMELEC allowlist: {final_url}"
                        ) from error
                    if response.status != 200:
                        raise ValueError(f"official source returned HTTP {response.status}: {url}")
                    content_type = (
                        str(response.headers.get("Content-Type", "")).split(";", 1)[0].strip()
                    )
                    if content_type != expected_content_type:
                        raise ValueError(
                            f"official source content type does not match source lock: {url}"
                        )
                    content_length = response.headers.get("Content-Length")
                    if content_length is not None:
                        try:
                            declared_bytes = int(content_length)
                        except ValueError as error:
                            raise ValueError(
                                f"official source returned invalid Content-Length: {url}"
                            ) from error
                        if declared_bytes != expected_bytes:
                            raise ValueError(
                                f"official source Content-Length does not match source lock: {url}"
                            )
                    receipt = {
                        "canonical_url": url,
                        "final_url": final_url,
                        "http_status": response.status,
                        "content_type": content_type,
                        "content_length": expected_bytes,
                        "last_modified": response.headers.get("Last-Modified"),
                        "etag": response.headers.get("ETag"),
                        "receipt_basis": "live verified response",
                    }
                    downloaded_bytes = 0
                    with partial.open("wb") as stream:
                        while chunk := response.read(1024 * 1024):
                            downloaded_bytes += len(chunk)
                            if downloaded_bytes > expected_bytes:
                                raise ValueError(
                                    f"official source exceeds the locked byte size: {url}"
                                )
                            stream.write(chunk)
                if partial.stat().st_size != expected_bytes or _hash_file(partial) != expected_hash:
                    raise ValueError(f"downloaded artifact does not match source lock: {url}")
                partial.replace(target)
            finally:
                if partial.exists():
                    partial.unlink()
        verified.append(
            {
                "artifact_key": artifact["artifact_key"],
                "bytes": target.stat().st_size,
                "filename": filename,
                "sha256": _hash_file(target),
                "retrieval_receipt": receipt,
            }
        )
        artifacts_by_key[_require_str(artifact.get("artifact_key"), "artifact_key")] = target
    _validate_extracted_observations(manifest, artifacts_by_key)
    return verified


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Acquire and verify checksum-locked official COMELEC turnout sources."
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument(
        "--download-dir",
        type=Path,
        default=DEFAULT_DOWNLOAD_DIR,
        help=f"Retain immutable verified raw sources here. Default: {DEFAULT_DOWNLOAD_DIR}",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    manifest = _require_mapping(json.loads(args.manifest.read_text(encoding="utf-8")), "manifest")
    summary = validate_manifest(manifest)
    verified = acquire_and_verify(manifest, args.download_dir.resolve())
    print(json.dumps({"manifest": summary, "verified_artifacts": verified}, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
