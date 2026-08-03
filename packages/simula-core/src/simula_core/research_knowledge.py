"""Deterministic, citation-first research knowledge primitives.

This module deliberately uses bounded lexical extraction.  It creates a small
auditable knowledge layer for authored research text; it does not pretend to be
OCR, an open-world entity resolver, or a language-model fact checker.
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from hashlib import sha256
from math import floor
from typing import Literal

from pydantic import Field, model_validator

from simula_core.campaign_lab import CampaignLabResearchSource
from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import FrozenModel, Key, Label, Sha256, ShortText

ResearchEntityType = Literal["topic", "organization", "geography", "metric", "claim"]
ResearchRelationshipType = Literal["co_occurs", "mentions", "supports", "contradicts"]
FreshnessStatus = Literal["fresh", "aging", "stale", "undated"]

_EXTRACTOR_VERSION = "research_knowledge_lexical_v1"
_FRESHNESS_POLICY_VERSION = "source_freshness_365_1095_days_v1"
_MAX_LABEL_LENGTH = 160
_METRIC_TERMS = (
    "clarity",
    "credibility",
    "cpc",
    "ctr",
    "engagement",
    "memorability",
    "relevance",
    "sentiment",
    "share",
    "trust",
)
_GEOGRAPHY_TERMS = (
    "philippines",
    "ncr",
    "luzon",
    "visayas",
    "mindanao",
    "metro manila",
)
_ASSERTION_RE = re.compile(
    r"^\s*(?:claim|finding|observation|metric)?\s*[:\-]?\s*"
    r"(?P<subject>[A-Za-z][A-Za-z0-9 /&'_-]{1,79}?)\s*"
    r"(?:(?P<operator>is|are|=|:)\s*)"
    r"(?P<value>[^.;]{1,160})\s*[.;]?\s*$",
    re.IGNORECASE,
)
_EXPLICIT_RELATIONSHIP_RE = re.compile(
    r"(?P<left>[A-Za-z][A-Za-z0-9 /&'_-]{1,60})\s+"
    r"(?P<predicate>supports|contradicts|relates to|is related to)\s+"
    r"(?P<right>[A-Za-z][A-Za-z0-9 /&'_-]{1,60})",
    re.IGNORECASE,
)
_TOKEN_RE = re.compile(r"[a-z0-9]{2,}")


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold().strip())


def _key(value: str, *, prefix: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", _normalize(value)).strip("_")
    normalized = normalized[:48] or "item"
    return f"{prefix}_{normalized}"[:64]


def _bounded_label(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())[:_MAX_LABEL_LENGTH]


class ResearchEntity(FrozenModel):
    entity_id: Key
    entity_type: ResearchEntityType
    label: str = Field(min_length=1, max_length=_MAX_LABEL_LENGTH)
    normalized_label: Key
    source_chunk_ids: tuple[Key, ...] = Field(min_length=1, max_length=100)


class ResearchCitation(FrozenModel):
    citation_id: Key
    source_id: Key
    chunk_id: Key
    locator: str = Field(min_length=1, max_length=200)
    excerpt_checksum_sha256: Sha256


class ResearchAssertion(FrozenModel):
    assertion_id: Key
    subject_entity_id: Key
    subject_label: str = Field(min_length=1, max_length=_MAX_LABEL_LENGTH)
    value: str = Field(min_length=1, max_length=_MAX_LABEL_LENGTH)
    normalized_value: Key
    source_id: Key
    citation_ids: tuple[Key, ...] = Field(min_length=1, max_length=20)


class ResearchRelationship(FrozenModel):
    relationship_id: Key
    subject_entity_id: Key
    predicate: ResearchRelationshipType
    object_entity_id: Key
    source_chunk_ids: tuple[Key, ...] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def endpoints_differ(self) -> ResearchRelationship:
        if self.subject_entity_id == self.object_entity_id:
            raise ValueError("research relationship endpoints must differ")
        return self


class ResearchConflict(FrozenModel):
    conflict_id: Key
    assertion_key: Key
    source_ids: tuple[Key, ...] = Field(min_length=1, max_length=50)
    assertion_ids: tuple[Key, ...] = Field(min_length=2, max_length=50)
    conflicting_values: tuple[str, ...] = Field(min_length=2, max_length=20)
    severity: Literal["review"] = "review"


class ResearchFreshnessMetadata(FrozenModel):
    source_id: Key
    publication_date: datetime | None
    processing_date: datetime
    age_days: int | None = Field(default=None, ge=0)
    status: FreshnessStatus
    policy_version: Label
    limitations: tuple[ShortText, ...] = Field(min_length=1, max_length=10)


class ResearchClaimGrounding(FrozenModel):
    claim: str = Field(min_length=1, max_length=2000)
    grounded: bool
    matched_entity_ids: tuple[Key, ...] = Field(max_length=20)
    citation_ids: tuple[Key, ...] = Field(max_length=50)
    conflict_ids: tuple[Key, ...] = Field(max_length=20)
    limitations: tuple[ShortText, ...] = Field(min_length=1, max_length=10)


class ResearchRetrievalHit(FrozenModel):
    citation_id: Key
    chunk_id: Key
    relevance: float = Field(gt=0.0, le=1.0)
    excerpt: str = Field(min_length=1, max_length=4000)
    excerpt_checksum_sha256: Sha256


class ResearchRetrievalResult(FrozenModel):
    query: str = Field(min_length=1, max_length=500)
    method: Literal["bounded_lexical_overlap"] = "bounded_lexical_overlap"
    hits: tuple[ResearchRetrievalHit, ...] = Field(max_length=20)
    limitations: tuple[ShortText, ...] = Field(min_length=1, max_length=10)


class ResearchKnowledgeGraph(FrozenModel):
    schema_version: Literal[1] = 1
    source_id: Key
    document_checksum_sha256: Sha256
    extractor_version: Label
    entities: tuple[ResearchEntity, ...] = Field(max_length=500)
    assertions: tuple[ResearchAssertion, ...] = Field(max_length=500)
    relationships: tuple[ResearchRelationship, ...] = Field(max_length=2000)
    citations: tuple[ResearchCitation, ...] = Field(max_length=10_000)
    conflicts: tuple[ResearchConflict, ...] = Field(max_length=500)
    freshness: ResearchFreshnessMetadata
    limitations: tuple[ShortText, ...] = Field(min_length=1, max_length=20)
    checksum_sha256: Sha256 = "0" * 64

    @model_validator(mode="after")
    def bind_source_and_checksum(self) -> ResearchKnowledgeGraph:
        if any(citation.source_id != self.source_id for citation in self.citations):
            raise ValueError("research citations must bind to the graph source")
        if self.freshness.source_id != self.source_id:
            raise ValueError("research freshness must bind to the graph source")
        expected = sha256(
            canonical_json_dumps(self.model_dump(mode="json", exclude={"checksum_sha256"}))
        ).hexdigest()
        if self.checksum_sha256 == "0" * 64:
            object.__setattr__(self, "checksum_sha256", expected)
        elif self.checksum_sha256 != expected:
            raise ValueError("research knowledge checksum mismatch")
        return self


def _freshness(source: CampaignLabResearchSource) -> ResearchFreshnessMetadata:
    processing = source.processing_date
    publication = source.publication_date
    if publication is None:
        return ResearchFreshnessMetadata(
            source_id=source.source_id,
            publication_date=None,
            processing_date=processing,
            status="undated",
            policy_version=_FRESHNESS_POLICY_VERSION,
            limitations=("The source has no publication date; freshness cannot be established.",),
        )
    computed_age_days = max(0, floor((processing - publication).total_seconds() / 86_400))
    age_days: int | None = computed_age_days
    status: FreshnessStatus = (
        "fresh" if computed_age_days <= 365 else "aging" if computed_age_days <= 1095 else "stale"
    )
    limitations = ("Freshness is a source-age flag, not a measure of source quality or truth.",)
    if publication > processing:
        status = "undated"
        age_days = None
        limitations = ("Publication date is later than processing date; review source metadata.",)
    return ResearchFreshnessMetadata(
        source_id=source.source_id,
        publication_date=publication,
        processing_date=processing,
        age_days=age_days,
        status=status,
        policy_version=_FRESHNESS_POLICY_VERSION,
        limitations=limitations,
    )


def _entity(
    *,
    label: str,
    entity_type: ResearchEntityType,
    chunk_ids: set[str],
) -> ResearchEntity:
    normalized = _normalize(label)
    normalized_key = _key(normalized, prefix="term")
    return ResearchEntity(
        entity_id=_key(f"{entity_type}:{normalized}", prefix="entity"),
        entity_type=entity_type,
        label=_bounded_label(label),
        normalized_label=normalized_key,
        source_chunk_ids=tuple(sorted(chunk_ids)),
    )


def _candidate_entities(text: str, chunk_id: str) -> list[tuple[str, ResearchEntityType]]:
    candidates: list[tuple[str, ResearchEntityType]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        heading = re.sub(r"^#+\s*", "", line)
        if heading != line or line.casefold().startswith(("topic:", "issue:", "theme:")):
            label = heading.split(":", 1)[-1].strip()
            if label:
                candidates.append((_bounded_label(label), "topic"))
        entity_specs: tuple[tuple[str, ResearchEntityType], ...] = (
            ("organization:", "organization"),
            ("agency:", "organization"),
            ("geography:", "geography"),
            ("location:", "geography"),
        )
        for prefix, entity_type in entity_specs:
            if line.casefold().startswith(prefix):
                value = line.split(":", 1)[1].strip()
                if value:
                    candidates.append((_bounded_label(value), entity_type))
        for metric in _METRIC_TERMS:
            if re.search(rf"\b{re.escape(metric)}\b", line, re.IGNORECASE):
                candidates.append((metric, "metric"))
        for geography in _GEOGRAPHY_TERMS:
            if re.search(rf"\b{re.escape(geography)}\b", line, re.IGNORECASE):
                candidates.append((geography, "geography"))
    return candidates


def _assertions(
    text: str,
    *,
    source_id: str,
    chunk_id: str,
    entity_by_normalized: dict[str, ResearchEntity],
    citations: Sequence[ResearchCitation],
) -> list[ResearchAssertion]:
    results: list[ResearchAssertion] = []
    citation_ids = tuple(
        citation.citation_id for citation in citations if citation.chunk_id == chunk_id
    )
    if not citation_ids:
        return results
    for line in text.splitlines():
        match = _ASSERTION_RE.match(line.strip())
        if match is None:
            continue
        subject = _bounded_label(match.group("subject"))
        value = _bounded_label(match.group("value"))
        if not value or _normalize(subject) in {"claim", "finding", "observation", "metric"}:
            continue
        normalized_subject = _normalize(subject)
        entity = entity_by_normalized.get(normalized_subject)
        if entity is None:
            entity = _entity(label=subject, entity_type="claim", chunk_ids={chunk_id})
            entity_by_normalized[normalized_subject] = entity
        results.append(
            ResearchAssertion(
                assertion_id=_key(
                    f"{source_id}:{chunk_id}:{normalized_subject}:{_normalize(value)}",
                    prefix="assert",
                ),
                subject_entity_id=entity.entity_id,
                subject_label=subject,
                value=value,
                normalized_value=_key(value, prefix="value"),
                source_id=source_id,
                citation_ids=citation_ids,
            )
        )
    return results


def _conflicts(assertions: Sequence[ResearchAssertion]) -> tuple[ResearchConflict, ...]:
    grouped: dict[str, list[ResearchAssertion]] = defaultdict(list)
    for assertion in assertions:
        grouped[assertion.subject_entity_id].append(assertion)
    conflicts: list[ResearchConflict] = []
    for subject_id, items in sorted(grouped.items()):
        values = tuple(sorted({item.normalized_value for item in items}))
        if len(values) < 2:
            continue
        conflicts.append(
            ResearchConflict(
                conflict_id=_key(f"{subject_id}:{':'.join(values)}", prefix="conflict"),
                assertion_key=subject_id,
                source_ids=tuple(sorted({item.source_id for item in items})),
                assertion_ids=tuple(sorted(item.assertion_id for item in items)),
                conflicting_values=tuple(sorted({item.value for item in items})),
            )
        )
    return tuple(conflicts)


def build_research_knowledge_graph(
    *,
    source: CampaignLabResearchSource,
    document_checksum_sha256: str,
    chunks: Sequence[tuple[str, str]],
) -> ResearchKnowledgeGraph:
    """Extract bounded entities, relationships, citations, and conflicts."""

    entities_by_id: dict[str, ResearchEntity] = {}
    entities_by_normalized: dict[str, ResearchEntity] = {}
    citations: list[ResearchCitation] = []
    for chunk_id, text in chunks:
        citation = ResearchCitation(
            citation_id=_key(f"{source.source_id}:{chunk_id}", prefix="citation"),
            source_id=source.source_id,
            chunk_id=chunk_id,
            locator=f"{source.source_id}#{chunk_id}",
            excerpt_checksum_sha256=sha256(text.encode("utf-8")).hexdigest(),
        )
        citations.append(citation)
        for label, entity_type in _candidate_entities(text, chunk_id):
            normalized = _normalize(label)
            existing = entities_by_normalized.get(normalized)
            if existing is not None:
                merged = existing.model_copy(
                    update={
                        "source_chunk_ids": tuple(
                            sorted(set(existing.source_chunk_ids) | {chunk_id})
                        )
                    }
                )
                entities_by_normalized[normalized] = merged
                entities_by_id[merged.entity_id] = merged
                continue
            entity = _entity(label=label, entity_type=entity_type, chunk_ids={chunk_id})
            entities_by_normalized[normalized] = entity
            entities_by_id[entity.entity_id] = entity

    assertions: list[ResearchAssertion] = []
    for chunk_id, text in chunks:
        assertions.extend(
            _assertions(
                text,
                source_id=source.source_id,
                chunk_id=chunk_id,
                entity_by_normalized=entities_by_normalized,
                citations=citations,
            )
        )
    for entity in entities_by_normalized.values():
        entities_by_id[entity.entity_id] = entity

    relationships_by_id: dict[str, ResearchRelationship] = {}
    for chunk_id, text in chunks:
        present = sorted(
            {
                entity.entity_id
                for entity in entities_by_id.values()
                if chunk_id in entity.source_chunk_ids
            }
        )
        for left_index, left_id in enumerate(present):
            for right_id in present[left_index + 1 :]:
                relationship = ResearchRelationship(
                    relationship_id=_key(f"{left_id}:{right_id}:{chunk_id}", prefix="relation"),
                    subject_entity_id=left_id,
                    predicate="co_occurs",
                    object_entity_id=right_id,
                    source_chunk_ids=(chunk_id,),
                )
                relationships_by_id[relationship.relationship_id] = relationship
        for match in _EXPLICIT_RELATIONSHIP_RE.finditer(text):
            left = entities_by_normalized.get(_normalize(match.group("left")))
            right = entities_by_normalized.get(_normalize(match.group("right")))
            if left is None or right is None or left.entity_id == right.entity_id:
                continue
            predicate = (
                "supports" if match.group("predicate").casefold() == "supports" else "contradicts"
            )
            relationship = ResearchRelationship(
                relationship_id=_key(
                    f"{left.entity_id}:{predicate}:{right.entity_id}", prefix="relation"
                ),
                subject_entity_id=left.entity_id,
                predicate=predicate,  # type: ignore[arg-type]
                object_entity_id=right.entity_id,
                source_chunk_ids=(chunk_id,),
            )
            relationships_by_id[relationship.relationship_id] = relationship

    graph = ResearchKnowledgeGraph(
        source_id=source.source_id,
        document_checksum_sha256=document_checksum_sha256,
        extractor_version=_EXTRACTOR_VERSION,
        entities=tuple(sorted(entities_by_id.values(), key=lambda item: item.entity_id)),
        assertions=tuple(sorted(assertions, key=lambda item: item.assertion_id)),
        relationships=tuple(
            sorted(relationships_by_id.values(), key=lambda item: item.relationship_id)
        ),
        citations=tuple(sorted(citations, key=lambda item: item.citation_id)),
        conflicts=_conflicts(assertions),
        freshness=_freshness(source),
        limitations=(
            "Entity and relationship extraction is deterministic lexical extraction, not "
            "open-world semantic understanding.",
            "Citations identify source chunks and checksums; they do not prove the underlying "
            "source is correct.",
            "Conflicts require human review and are not resolved automatically.",
        ),
    )
    return graph


def merge_research_knowledge(
    graphs: Sequence[ResearchKnowledgeGraph],
) -> tuple[ResearchConflict, ...]:
    """Detect contradictory assertions across separately admitted sources."""

    assertions = [assertion for graph in graphs for assertion in graph.assertions]
    return _conflicts(assertions)


def retrieve_research_context(
    query: str,
    graph: ResearchKnowledgeGraph,
    chunks: Sequence[tuple[str, str]],
    *,
    max_hits: int = 5,
) -> ResearchRetrievalResult:
    """Retrieve cited source excerpts with bounded lexical overlap only."""

    if max_hits < 1 or max_hits > 20:
        raise ValueError("research retrieval max_hits must be between 1 and 20")
    query_terms = set(_TOKEN_RE.findall(_normalize(query)))
    if not query_terms:
        raise ValueError("research retrieval query must contain searchable terms")
    citations_by_chunk = {citation.chunk_id: citation for citation in graph.citations}
    hits: list[ResearchRetrievalHit] = []
    for chunk_id, text in chunks:
        citation = citations_by_chunk.get(chunk_id)
        if citation is None:
            continue
        chunk_terms = set(_TOKEN_RE.findall(_normalize(text)))
        overlap = query_terms & chunk_terms
        if not overlap:
            continue
        relevance = len(overlap) / len(query_terms)
        hits.append(
            ResearchRetrievalHit(
                citation_id=citation.citation_id,
                chunk_id=chunk_id,
                relevance=relevance,
                excerpt=text[:4000],
                excerpt_checksum_sha256=sha256(text[:4000].encode("utf-8")).hexdigest(),
            )
        )
    ordered = tuple(sorted(hits, key=lambda hit: (-hit.relevance, hit.chunk_id))[:max_hits])
    return ResearchRetrievalResult(
        query=query,
        hits=ordered,
        limitations=(
            "Retrieval uses bounded lexical overlap and does not infer semantic similarity.",
            "A retrieved excerpt is source context, not a verified fact or representative finding.",
        ),
    )


def ground_campaign_claim(
    claim: str,
    graph: ResearchKnowledgeGraph,
) -> ResearchClaimGrounding:
    """Bind a claim to known entities and source citations without inventing support."""

    normalized_claim = _normalize(claim)
    matched = tuple(
        entity
        for entity in graph.entities
        if entity.normalized_label.removeprefix("term_").replace("_", " ") in normalized_claim
    )
    entity_ids = tuple(sorted({entity.entity_id for entity in matched}))
    citation_ids = tuple(
        sorted(
            {
                citation.citation_id
                for entity in matched
                for citation in graph.citations
                if citation.chunk_id in entity.source_chunk_ids
            }
        )
    )
    conflict_ids = tuple(
        conflict.conflict_id for conflict in graph.conflicts if conflict.assertion_key in entity_ids
    )
    return ResearchClaimGrounding(
        claim=claim,
        grounded=bool(entity_ids and citation_ids and not conflict_ids),
        matched_entity_ids=entity_ids,
        citation_ids=citation_ids,
        conflict_ids=conflict_ids,
        limitations=(
            "Grounding means lexical overlap with an admitted source chunk; it is not fact "
            "verification.",
            "Claims with conflicting evidence remain ungrounded until human review.",
        ),
    )
