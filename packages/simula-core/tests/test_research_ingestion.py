from __future__ import annotations

import base64
import io
import zipfile
from datetime import UTC, datetime

import pytest
from simula_core.campaign_lab import CampaignLabResearchSource
from simula_core.research_ingestion import ResearchIngestionError, ingest_research_document


def _source() -> CampaignLabResearchSource:
    return CampaignLabResearchSource(
        source_id="research_fixture",
        title="Research fixture",
        source_type="public_report",
        source_organization="SIMULA test authors",
        dataset_version="fixture-v1",
        geography="Philippines aggregate fixture",
        collection_methodology="Authored aggregate fixture.",
        license_or_usage_rights="Internal test use only.",
        processing_date=datetime(2026, 8, 2, tzinfo=UTC),
        transformation="None.",
        known_limitations=("Not representative.",),
        checksum_sha256="a" * 64,
    )


def test_text_research_is_chunked_and_checksummed() -> None:
    result = ingest_research_document(
        source=_source(),
        filename="fixture.md",
        media_type="text/markdown",
        secret_payload={"content": "A" * 450, "content_encoding": "utf8"},
        chunk_size=200,
        overlap=20,
    )

    assert result.extraction_method == "utf8"
    assert len(result.chunks) == 3
    assert result.chunks[0].chunk_id == "research_fixture_00000"
    assert result.document_checksum_sha256


def test_json_and_docx_inputs_are_normalized_without_raw_secret_metadata() -> None:
    json_result = ingest_research_document(
        source=_source(),
        filename="fixture.json",
        media_type="application/json",
        secret_payload={"content": '{"b": 2, "a": 1}'},
    )
    assert json_result.extraction_method == "json_canonical"
    assert '"a": 1' in json_result.chunks[0].text

    document = io.BytesIO()
    with zipfile.ZipFile(document, "w") as archive:
        archive.writestr(
            "word/document.xml",
            '<document xmlns="urn:test"><body><p><t>DOCX fixture</t></p></body></document>',
        )
    docx_result = ingest_research_document(
        source=_source(),
        filename="fixture.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        secret_payload={
            "content": base64.b64encode(document.getvalue()).decode("ascii"),
            "content_encoding": "base64",
        },
    )
    assert docx_result.extraction_method == "docx_xml"
    assert "DOCX fixture" in docx_result.chunks[0].text


def test_scanned_pdf_fails_closed_and_does_not_fake_ocr() -> None:
    with pytest.raises(ResearchIngestionError, match="requires OCR"):
        ingest_research_document(
            source=_source(),
            filename="scan.pdf",
            media_type="application/pdf",
            secret_payload={"content": "%PDF-1.7\n%%EOF"},
        )
