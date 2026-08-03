from __future__ import annotations

import base64
import io
import zipfile
from datetime import UTC, datetime

import pytest
from simula_core.campaign_lab import CampaignLabResearchSource
from simula_core.research_ingestion import ResearchIngestionError, ingest_research_document
from simula_core.research_knowledge import (
    build_research_knowledge_graph,
    ground_campaign_claim,
    merge_research_knowledge,
    retrieve_research_context,
)


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
    assert result.knowledge_graph.citations
    assert result.knowledge_graph.freshness.status == "undated"


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


def test_knowledge_layer_extracts_entities_relationships_and_grounding() -> None:
    result = ingest_research_document(
        source=_source(),
        filename="knowledge.md",
        media_type="text/markdown",
        secret_payload={
            "content": (
                "# Public transport\n"
                "Organization: Civic Lab\n"
                "Geography: Philippines\n"
                "Trust: high\n"
                "Civic Lab supports public transport.\n"
            )
        },
    )

    graph = result.knowledge_graph
    assert {entity.entity_type for entity in graph.entities} >= {
        "topic",
        "organization",
        "geography",
        "metric",
    }
    assert graph.citations
    assert graph.relationships
    grounding = ground_campaign_claim("Public transport trust", graph)
    assert grounding.grounded is True
    assert grounding.citation_ids
    retrieval = retrieve_research_context(
        "Public transport trust",
        graph,
        tuple((chunk.chunk_id, chunk.text) for chunk in result.chunks),
    )
    assert retrieval.hits[0].citation_id in grounding.citation_ids


def test_knowledge_layer_flags_conflicting_source_assertions() -> None:
    first = build_research_knowledge_graph(
        source=_source(),
        document_checksum_sha256="a" * 64,
        chunks=(("research_fixture_00000", "Trust: high"),),
    )
    second_source = _source().model_copy(update={"source_id": "research_other"})
    second = build_research_knowledge_graph(
        source=second_source,
        document_checksum_sha256="b" * 64,
        chunks=(("research_other_00000", "Trust: low"),),
    )

    conflicts = merge_research_knowledge((first, second))
    assert len(conflicts) == 1
    assert set(conflicts[0].source_ids) == {"research_fixture", "research_other"}
