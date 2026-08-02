"""Bounded, provenance-first research document ingestion primitives.

The API stores document bytes only in a worker secret envelope.  The worker
normalizes supported documents, validates structured formats, and emits a
bounded chunked corpus with checksums.  No OCR claim is made for scanned
documents: those are rejected unless a configured extractor has produced text.
"""

from __future__ import annotations

import base64
import binascii
import csv
import io
import json
import re
import zipfile
import zlib
from collections.abc import Mapping
from hashlib import sha256
from typing import Literal
from xml.etree import ElementTree

from pydantic import Field

from simula_core.campaign_lab import CampaignLabResearchSource
from simula_core.methodology import FrozenModel, Key

ResearchMediaType = Literal[
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]
MAX_RESEARCH_DOCUMENT_BYTES = 4 * 1024 * 1024
MAX_RESEARCH_CHUNKS = 10_000


class ResearchIngestionError(ValueError):
    """A document cannot be safely admitted to the research corpus."""


class ResearchChunk(FrozenModel):
    chunk_id: Key
    ordinal: int = Field(ge=0, le=MAX_RESEARCH_CHUNKS - 1)
    text: str = Field(min_length=1, max_length=4000)
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ResearchIngestionResult(FrozenModel):
    schema_version: Literal[1] = 1
    source: CampaignLabResearchSource
    filename: str = Field(min_length=1, max_length=240)
    media_type: ResearchMediaType
    extraction_method: Literal[
        "utf8",
        "json_canonical",
        "csv_rows",
        "docx_xml",
        "pdf_text_heuristic",
    ]
    document_checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    byte_size: int = Field(gt=0, le=MAX_RESEARCH_DOCUMENT_BYTES)
    chunks: tuple[ResearchChunk, ...] = Field(min_length=1, max_length=MAX_RESEARCH_CHUNKS)
    limitations: tuple[str, ...] = Field(min_length=1, max_length=10)


def _decode_document(secret_payload: Mapping[str, object]) -> bytes:
    raw = secret_payload.get("content")
    if not isinstance(raw, str) or not raw:
        raise ResearchIngestionError("research document content is missing")
    encoding = secret_payload.get("content_encoding", "utf8")
    if encoding == "utf8":
        data = raw.encode("utf-8")
    elif encoding == "base64":
        try:
            data = base64.b64decode(raw, validate=True)
        except (ValueError, binascii.Error) as error:
            raise ResearchIngestionError("research document base64 is invalid") from error
    else:
        raise ResearchIngestionError("research document encoding is unsupported")
    if not data or len(data) > MAX_RESEARCH_DOCUMENT_BYTES:
        raise ResearchIngestionError("research document exceeds the bounded size contract")
    return data


def _decode_pdf_literal(value: bytes) -> str:
    result = bytearray()
    index = 0
    while index < len(value):
        if value[index] != 92:
            result.append(value[index])
            index += 1
            continue
        index += 1
        if index >= len(value):
            break
        escaped = value[index]
        mapping = {ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12}
        result.append(mapping.get(escaped, escaped))
        index += 1
    return result.decode("utf-8", errors="replace")


def _extract_pdf_text(data: bytes) -> str:
    if not data.startswith(b"%PDF-"):
        raise ResearchIngestionError("document does not match the declared PDF type")
    streams: list[bytes] = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.DOTALL):
        payload = match.group(1)
        try:
            streams.append(zlib.decompress(payload))
        except zlib.error:
            streams.append(payload)
    searchable = b"\n".join(streams) + b"\n" + data
    values = [
        _decode_pdf_literal(match.group(1))
        for match in re.finditer(rb"\((.*?)\)\s*T[jJ]", searchable, re.DOTALL)
    ]
    text = " ".join(value.strip() for value in values if value.strip())
    if not text:
        raise ResearchIngestionError(
            "research document requires OCR; no embedded PDF text was found"
        )
    return text


def _extract_docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as error:
        raise ResearchIngestionError("document does not match the declared DOCX type") from error
    if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
        raise ResearchIngestionError("DOCX document contains a forbidden XML declaration")
    try:
        root = ElementTree.fromstring(xml)  # noqa: S314 - DTD and entity declarations are rejected above.
    except ElementTree.ParseError as error:
        raise ResearchIngestionError("DOCX document XML is invalid") from error
    text = " ".join(
        node.text.strip()
        for node in root.iter()
        if node.tag.rsplit("}", 1)[-1] == "t" and node.text and node.text.strip()
    )
    if not text:
        raise ResearchIngestionError("DOCX document contains no extractable text")
    return text


def _extract_text(data: bytes, media_type: ResearchMediaType) -> tuple[str, str]:
    if media_type == "application/pdf":
        return _extract_pdf_text(data), "pdf_text_heuristic"
    if media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _extract_docx_text(data), "docx_xml"
    try:
        decoded = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ResearchIngestionError(
            "document is not valid UTF-8; use base64 with a supported parser"
        ) from error
    if media_type == "application/json":
        try:
            value = json.loads(decoded)
        except json.JSONDecodeError as error:
            raise ResearchIngestionError("research JSON is invalid") from error
        return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2), "json_canonical"
    if media_type == "text/csv":
        try:
            rows = list(csv.reader(io.StringIO(decoded)))
        except csv.Error as error:
            raise ResearchIngestionError("research CSV is invalid") from error
        if not rows:
            raise ResearchIngestionError("research CSV is empty")
        return "\n".join(",".join(row) for row in rows), "csv_rows"
    return decoded, "utf8"


def _chunk_text(
    text: str, *, source_id: str, chunk_size: int, overlap: int
) -> tuple[ResearchChunk, ...]:
    if chunk_size not in range(200, 4001) or overlap not in range(0, chunk_size):
        raise ResearchIngestionError("research chunk sizing is outside the bounded contract")
    normalized = re.sub(r"\r\n?", "\n", text).strip()
    if not normalized:
        raise ResearchIngestionError("research document contains no text")
    step = chunk_size - overlap
    chunks: list[ResearchChunk] = []
    for ordinal, start in enumerate(range(0, len(normalized), step)):
        if ordinal >= MAX_RESEARCH_CHUNKS:
            raise ResearchIngestionError("research document produces too many chunks")
        part = normalized[start : start + chunk_size].strip()
        if not part:
            continue
        chunks.append(
            ResearchChunk(
                chunk_id=f"{source_id}_{ordinal:05d}",
                ordinal=ordinal,
                text=part,
                checksum_sha256=sha256(part.encode("utf-8")).hexdigest(),
            )
        )
    if not chunks:
        raise ResearchIngestionError("research document produced no chunks")
    return tuple(chunks)


def ingest_research_document(
    *,
    source: CampaignLabResearchSource,
    filename: str,
    media_type: ResearchMediaType,
    secret_payload: Mapping[str, object],
    chunk_size: int = 1200,
    overlap: int = 120,
) -> ResearchIngestionResult:
    """Parse one bounded document and return an auditable chunked corpus."""

    data = _decode_document(secret_payload)
    extracted, extraction_method = _extract_text(data, media_type)
    source_key = re.sub(r"[^a-z0-9_]", "_", source.source_id.casefold()).strip("_")[:48]
    source_key = source_key or "source"
    chunks = _chunk_text(
        extracted,
        source_id=source_key,
        chunk_size=chunk_size,
        overlap=overlap,
    )
    return ResearchIngestionResult(
        source=source,
        filename=filename,
        media_type=media_type,
        extraction_method=extraction_method,  # type: ignore[arg-type]
        document_checksum_sha256=sha256(data).hexdigest(),
        byte_size=len(data),
        chunks=chunks,
        limitations=(
            "The corpus is source text extracted from the submitted document; it is not a "
            "survey row store.",
            "PDF extraction covers embedded text only. Scanned-image OCR requires an "
            "explicitly configured OCR provider.",
        ),
    )
