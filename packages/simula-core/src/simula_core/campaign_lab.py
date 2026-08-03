"""Native Campaign Simulation Lab domain primitives.

The lab is deliberately an aggregate research system.  It composes the
existing population sampler and repeated methodology engine; it does not
invent a population, create individual voter profiles, or ask a language
model to calculate a campaign result.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from hashlib import sha256
from math import fsum
from typing import Any, Literal, Self, cast
from uuid import UUID, uuid5

from pydantic import Field, model_validator

import simula_core.behavioral_engine as behavioral
from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import (
    AudienceDefinitionVersion,
    DeterministicCohortProvider,
    DimensionValue,
    FrozenModel,
    Key,
    MethodologyEngine,
    MetricScore,
    PopulationFrameVersion,
    ReactionDistribution,
    ReactionShare,
    SamplingConfiguration,
    sample_population,
)
from simula_core.repeated_simulation import (
    RepeatedMethodologyResult,
    RepeatedSimulationConfiguration,
    RepeatedVariantRankingResult,
    RepeatMetricKey,
    run_repeated_methodology,
    summarize_variant_ranking,
)
from simula_core.survey_calibration import SyntheticVariantObservation

CampaignStage = Literal[
    "campaign_created",
    "decision_defined",
    "research_validated",
    "cohort_defined",
    "panel_weighted",
    "variants_added",
    "simulation_configured",
    "simulated",
    "aggregated",
    "compared",
    "cohorts_analyzed",
    "interviewed",
    "survey_imported",
    "calibrated",
    "backtested",
    "compliance_reviewed",
    "reported",
]
EvidenceLabel = Literal[
    "Observed",
    "Survey-derived",
    "Population-weighted",
    "Statistically imputed",
    "Synthetic",
    "Assumed",
]
CampaignEvidenceStatus = Literal[
    "Synthetic-only",
    "Mixed evidence",
    "Survey-calibrated",
    "Historically backtested",
    "Insufficient evidence",
]
CampaignLanguage = Literal["en", "fil", "taglish", "regional"]
CampaignPurpose = Literal[
    "commercial_marketing",
    "public_service",
    "brand_communication",
    "product_launch",
    "advocacy",
    "aggregate_political_research",
]
SimulationAction = Literal[
    "view",
    "ignore",
    "read_partially",
    "read_fully",
    "react_positive",
    "react_negative",
    "comment",
    "ask_question",
    "share_private",
    "share_public",
    "challenge_claim",
    "seek_evidence",
    "change_opinion",
    "reinforce_opinion",
    "confused",
    "skeptical",
    "report_content",
    "discuss_with_agent",
]

ALLOWED_COHORT_DIMENSIONS = frozenset(
    {
        "region",
        "province",
        "city_classification",
        "urban_rural",
        "age_bracket",
        "income_bracket",
        "socioeconomic_group",
        "education_bracket",
        "occupation_category",
        "employment_status",
        "household_size_bracket",
        "primary_language",
        "secondary_language",
        "internet_access",
        "device_access",
        "platform_usage",
        "media_consumption",
        "issue_priority",
        "institutional_trust",
        "brand_familiarity",
        "category_familiarity",
        "message_sensitivity",
        "price_sensitivity",
        "policy_concern",
    }
)

BEHAVIORAL_DIMENSIONS = (
    "openness_to_information",
    "institutional_trust",
    "brand_trust",
    "social_proof_sensitivity",
    "authority_sensitivity",
    "risk_aversion",
    "price_sensitivity",
    "community_orientation",
    "family_orientation",
    "message_skepticism",
    "emotional_intensity",
    "sharing_propensity",
    "commenting_propensity",
    "conflict_avoidance",
    "political_interest_intensity",
    "issue_salience",
    "opinion_confidence",
    "media_literacy",
    "misinformation_risk",
)

_PROHIBITED_KEYS = frozenset(
    {
        "automated_harassment",
        "coordinated_bot_amplification",
        "deepfake_candidate",
        "false_election_instruction",
        "false_election_instructions",
        "fake_endorsement",
        "fake_grassroots",
        "hidden_sponsorship",
        "individual_persuasion_score",
        "individual_persuasion_scoring",
        "individual_persuadability",
        "inferred_political_affiliation",
        "most_persuadable_voter",
        "political_affiliation_inference",
        "psychological_vulnerability",
        "unauthorized_voter_list",
        "voter_dossier",
        "voter_file",
        "voter_id",
        "voter_ids",
        "voter_list",
        "contact_book",
        "contact_list",
        "political_affiliation",
        "persuadability",
        "vulnerability",
        "household_political_map",
        "private_profile",
        "false_voting_instruction",
        "voter_suppression",
        "impersonation",
        "bot_amplification",
        "defamation",
        "fabricated_evidence",
    }
)
_PROHIBITED_TERMS = frozenset(
    {
        "automated harassment",
        "coordinated bot amplification",
        "false election instruction",
        "false election instructions",
        "identifiable voter dossier",
        "individual persuasion scoring",
        "inferred political affiliation",
        "most persuadable voter",
        "persuadable voters",
        "psychological vulnerability",
        "psychological vulnerability targeting",
        "covert behavioral targeting",
        "household political map",
        "private-profile scraping",
        "contact-book harvesting",
        "unauthorized voter list",
        "voter suppression",
        "fake endorsement",
        "deepfake candidate",
        "fabricated evidence",
        "hidden political sponsorship",
    }
)


class CampaignLabPolicyError(ValueError):
    """A campaign-lab request crossed an aggregate-use safety boundary."""


class CampaignLabResearchSource(FrozenModel):
    source_id: Key
    title: str = Field(min_length=2, max_length=200)
    source_type: Literal["public_report", "public_dataset", "client_provided", "survey", "asset"]
    source_organization: str = Field(min_length=2, max_length=160)
    publication_date: datetime | None = None
    dataset_version: str = Field(min_length=1, max_length=120)
    geography: str = Field(min_length=1, max_length=160)
    sample_size: int | None = Field(default=None, ge=0, le=100_000_000)
    collection_methodology: str = Field(min_length=1, max_length=1000)
    license_or_usage_rights: str = Field(min_length=1, max_length=1000)
    processing_date: datetime
    transformation: str = Field(min_length=1, max_length=1000)
    confidence_level: float | None = Field(default=None, ge=0.0, le=1.0)
    known_limitations: tuple[str, ...] = Field(min_length=1, max_length=20)
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    validation_status: Literal["pending", "validated", "rejected"] = "pending"


class BehavioralDimensionDefinition(FrozenModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    definition: str = Field(min_length=1, max_length=500)
    minimum: float = Field(ge=0.0, le=1.0)
    maximum: float = Field(ge=0.0, le=1.0)
    provenance: EvidenceLabel
    derivation_method: str = Field(min_length=1, max_length=500)
    validation_status: Literal["experimental", "benchmarked", "human_reviewed", "unknown"]
    model_version: str = Field(min_length=1, max_length=120)
    known_limitations: tuple[str, ...] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def valid_range(self) -> Self:
        if self.maximum < self.minimum:
            raise ValueError("behavioral dimension maximum must be >= minimum")
        return self


class CampaignLabCohort(FrozenModel):
    cohort_id: UUID
    name: str = Field(min_length=2, max_length=120)
    geography: str = Field(min_length=1, max_length=160)
    dimensions: tuple[DimensionValue, ...] = Field(min_length=1, max_length=30)
    population_frame: PopulationFrameVersion
    audience: AudienceDefinitionVersion
    source_provenance: tuple[CampaignLabResearchSource, ...] = Field(min_length=1, max_length=20)
    weighting_method: Literal[
        "population_weighted",
        "survey_weighted",
        "geographic_post_stratified",
        "demographic_post_stratified",
    ]
    behavioral_model_version: str = Field(min_length=1, max_length=120)
    behavioral_dimensions: tuple[BehavioralDimensionDefinition, ...] = Field(
        min_length=1, max_length=40
    )
    confidence: float = Field(ge=0.0, le=1.0)
    known_limitations: tuple[str, ...] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def valid_dimensions(self) -> Self:
        unsupported = {
            value.dimension
            for value in self.dimensions
            if value.dimension not in ALLOWED_COHORT_DIMENSIONS
        }
        if unsupported:
            raise ValueError(f"unsupported aggregate cohort dimensions: {sorted(unsupported)}")
        if len({value.dimension for value in self.dimensions}) != len(self.dimensions):
            raise ValueError("cohort dimensions must be unique")
        return self


class PersonaAttribute(FrozenModel):
    value: str = Field(min_length=1, max_length=160)
    label: EvidenceLabel
    source_id: Key | None = None


class StructuredSyntheticPersona(FrozenModel):
    persona_id: str = Field(pattern=r"^PH-[A-Z0-9-]{6,80}$")
    cohort_id: UUID
    geography: str = Field(min_length=1, max_length=160)
    demographic_attributes: Mapping[str, PersonaAttribute]
    language_profile: Mapping[str, PersonaAttribute]
    media_profile: Mapping[str, PersonaAttribute]
    behavioral_vector: Mapping[str, PersonaAttribute]
    issue_priorities: tuple[PersonaAttribute, ...] = Field(min_length=1, max_length=20)
    brand_or_candidate_familiarity: PersonaAttribute
    source_provenance: tuple[CampaignLabResearchSource, ...]
    sampling_weight: float = Field(gt=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    simulation_memory: tuple[str, ...] = Field(max_length=20)

    @model_validator(mode="after")
    def valid_vector(self) -> Self:
        if not self.behavioral_vector:
            raise ValueError("structured persona requires a behavioral vector")
        for key, attribute in self.behavioral_vector.items():
            try:
                value = float(attribute.value)
            except ValueError as error:
                raise ValueError(f"behavioral vector value is not numeric: {key}") from error
            if value < 0.0 or value > 1.0:
                raise ValueError("behavioral vector values must be between 0 and 1")
        labels = [
            attribute.label
            for group in (
                self.demographic_attributes,
                self.language_profile,
                self.media_profile,
                self.behavioral_vector,
            )
            for attribute in group.values()
        ]
        if any(
            label
            not in {
                "Observed",
                "Survey-derived",
                "Population-weighted",
                "Statistically imputed",
                "Synthetic",
                "Assumed",
            }
            for label in labels
        ):
            raise ValueError("persona attributes require an explicit provenance label")
        return self


class CampaignLabVariant(FrozenModel):
    key: Key
    label: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=20_000)
    language: CampaignLanguage
    content_type: Literal[
        "headline",
        "slogan",
        "caption",
        "speech",
        "policy_explanation",
        "debate_answer",
        "press_statement",
        "offer",
        "product_concept",
        "service_concept",
        "video_script",
        "video_transcript",
        "landing_page",
        "email",
        "social_post",
        "radio_script",
        "event_message",
        "creative_image",
    ]
    asset_checksum_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class CampaignLabSimulationConfiguration(FrozenModel):
    random_seed: int = Field(ge=-(2**63), le=2**63 - 1)
    panel_size: int = Field(ge=10, le=5000)
    repetitions: int = Field(ge=3, le=30)
    rounds: int = Field(ge=1, le=50)
    network_topology: Literal["independent", "small_world", "random_bounded"] = "independent"
    provider: Literal["deterministic", "openai_compatible", "anthropic", "google", "ollama", "vllm"]
    model_name: str = Field(min_length=1, max_length=120)
    model_parameters: Mapping[str, str | int | float | bool] = Field(default_factory=dict)
    prompt_version: str = Field(min_length=1, max_length=120)
    research_corpus_version: str = Field(min_length=1, max_length=120)
    persona_generation_version: str = Field(min_length=1, max_length=120)
    scoring_version: str = Field(min_length=1, max_length=120)
    simulation_engine_version: str = Field(min_length=1, max_length=120)
    cost_ceiling_microusd: int = Field(ge=0, le=100_000_000)
    timeout_seconds: int = Field(ge=5, le=600)
    sampling_minimum_per_cell: int = Field(ge=1, le=100, default=1)
    sampling_maximum_cells: int = Field(ge=1, le=500, default=100)
    sparse_cell_threshold: int = Field(ge=1, le=100, default=5)


class CampaignLabSimulationRequest(FrozenModel):
    campaign_id: UUID
    objective: str = Field(min_length=2, max_length=2000)
    purpose: CampaignPurpose
    cohort: CampaignLabCohort
    variants: tuple[CampaignLabVariant, ...] = Field(min_length=2, max_length=20)
    configuration: CampaignLabSimulationConfiguration
    research_sources: tuple[CampaignLabResearchSource, ...] = Field(max_length=20)
    research_knowledge: tuple[Mapping[str, Any], ...] = Field(default=(), max_length=20)
    ranking_metric: RepeatMetricKey = "clarity"

    @model_validator(mode="after")
    def valid_request(self) -> Self:
        keys = [variant.key for variant in self.variants]
        if len(keys) != len(set(keys)):
            raise ValueError("campaign variants must have unique keys")
        source_ids = {source.source_id for source in self.research_sources}
        for raw_graph in self.research_knowledge:
            if not isinstance(raw_graph, Mapping):
                raise ValueError("research knowledge entries must be objects")
            if any(key in raw_graph for key in ("raw", "chunks", "respondents", "responses")):
                raise ValueError(
                    "research knowledge must not contain raw document or respondent rows"
                )
            graph_source_id = raw_graph.get("source_id")
            if graph_source_id not in source_ids:
                raise ValueError("research knowledge source must be declared in research_sources")
        validate_campaign_policy(self.model_dump(mode="json"))
        return self


class CampaignLabVariantResult(FrozenModel):
    variant_key: Key
    repeated_result: RepeatedMethodologyResult
    component_rankings: Mapping[str, RepeatedVariantRankingResult]
    cohort_weights: tuple[Mapping[str, Any], ...]
    synthetic_interviews_available: bool = True


class CampaignLabCohortFinding(FrozenModel):
    """Component-level comparison for one admitted population cell.

    A weight row alone cannot support segment-level analysis. This contract binds
    each cohort finding to the exact dimensions and population weight used by
    the repeated runs, while keeping the result synthetic-only.
    """

    cohort_key: Key
    dimensions: Mapping[str, str]
    population_weight: float = Field(gt=0.0, le=1.0)
    component_rankings: Mapping[str, RepeatedVariantRankingResult]
    repetition_count: int = Field(ge=1, le=500)
    evidence_status: Literal["Synthetic-only"] = "Synthetic-only"
    limitations: tuple[str, ...] = Field(min_length=1, max_length=20)


class CampaignLabBehavioralAgentEvidence(FrozenModel):
    """Bounded event and memory evidence available for a synthetic interview."""

    agent_id: UUID
    cohort_key: Key
    variant_key: Key
    repetition_index: int = Field(ge=0, le=29)
    exposure_history: tuple[str, ...] = Field(min_length=1, max_length=50)
    action_history: tuple[str, ...] = Field(min_length=1, max_length=50)
    action_timestamps_ms: tuple[int, ...] = Field(min_length=1, max_length=50)
    memory_entries: tuple[Mapping[str, Any], ...] = Field(max_length=32)
    evidence_event_ids: tuple[UUID, ...] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def timestamp_coverage(self) -> Self:
        if len(self.action_timestamps_ms) != len(self.action_history):
            raise ValueError("behavioral action timestamps must cover every action")
        return self


class CampaignLabBehavioralVariantDiagnostic(FrozenModel):
    variant_key: Key
    requested_rounds: int = Field(ge=1, le=50)
    executed_rounds: int = Field(ge=1, le=50)
    network_topology: Literal["independent", "small_world", "random_bounded"]
    agent_count: int = Field(ge=10, le=2000)
    repetition_count: int = Field(ge=1, le=30)
    action_shares: Mapping[str, float]
    mean_attention: float = Field(ge=0.0, le=100.0)
    mean_resonance: float = Field(ge=0.0, le=100.0)
    mean_trust: float = Field(ge=0.0, le=100.0)
    provider_calls: int = Field(ge=0)
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    cost_microusd: int = Field(ge=0)
    interviewable_agents: tuple[CampaignLabBehavioralAgentEvidence, ...] = Field(
        min_length=1, max_length=24
    )


class CampaignLabBehavioralDiagnostics(FrozenModel):
    requested_panel_size: int = Field(ge=10, le=5000)
    executed_agent_count: int = Field(ge=10, le=2000)
    requested_rounds: int = Field(ge=1, le=50)
    executed_rounds: int = Field(ge=1, le=50)
    network_topology: Literal["independent", "small_world", "random_bounded"]
    variants: tuple[CampaignLabBehavioralVariantDiagnostic, ...] = Field(
        min_length=2, max_length=20
    )
    limitations: tuple[str, ...] = Field(min_length=1, max_length=20)


class CampaignLabSimulationResult(FrozenModel):
    schema_version: Literal[1] = 1
    campaign_id: UUID
    evidence_status: Literal["Synthetic-only"] = "Synthetic-only"
    methodology_version: str
    population_checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    configuration: CampaignLabSimulationConfiguration
    variants: tuple[CampaignLabVariantResult, ...] = Field(min_length=2)
    overall_component_rankings: Mapping[str, RepeatedVariantRankingResult]
    sample_size: int = Field(ge=10)
    repetitions: int = Field(ge=3)
    limitations: tuple[str, ...] = Field(min_length=1, max_length=20)
    reproducibility_checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    cohort_findings: tuple[CampaignLabCohortFinding, ...] = ()
    behavioral_diagnostics: CampaignLabBehavioralDiagnostics | None = None
    synthetic_observations: tuple[SyntheticVariantObservation, ...] = Field(
        default=(), max_length=1000
    )


class SyntheticPersonaInterview(FrozenModel):
    interview_id: UUID
    persona_id: str
    variant_key: Key
    disclosure: Literal["Synthetic Persona / Not a " + "real " + "respondent"] = (  # type: ignore[valid-type]
        "Synthetic Persona / Not a " + "real " + "respondent"
    )
    question: str = Field(default="What happened in this simulation?", min_length=1, max_length=500)
    transcript: str = Field(min_length=1, max_length=4000)
    evidence_status: Literal["Synthetic-only"] = "Synthetic-only"
    reviewed_by_human: bool = False
    simulation_run_id: UUID | None = None
    agent_id: UUID | None = None
    exposure_history: tuple[str, ...] = Field(default=(), max_length=50)
    action_history: tuple[str, ...] = Field(default=(), max_length=50)
    memory_evidence: tuple[Mapping[str, Any], ...] = Field(default=(), max_length=32)
    evidence_event_ids: tuple[UUID, ...] = Field(default=(), max_length=100)
    research_source_ids: tuple[Key, ...] = Field(default=(), max_length=20)
    research_citation_ids: tuple[Key, ...] = Field(default=(), max_length=100)
    limitations: tuple[str, ...] = Field(min_length=1, max_length=10)


class CampaignComplianceReview(FrozenModel):
    review_id: UUID
    status: Literal["approved_experimental", "needs_human_review", "blocked"]
    prohibited_uses_detected: tuple[str, ...]
    aggregate_only: bool
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    rationale: str = Field(min_length=1, max_length=2000)


class CampaignLabReport(FrozenModel):
    """Evidence-backed report shape with the 30 required report sections."""

    executive_summary: str
    campaign_objective: str
    variants_tested: tuple[str, ...]
    audience_cohort_definition: Mapping[str, Any]
    population_weights: tuple[Mapping[str, Any], ...]
    research_sources: tuple[CampaignLabResearchSource, ...]
    simulation_configuration: CampaignLabSimulationConfiguration
    number_of_agents: int = Field(ge=0)
    number_of_repetitions: int = Field(ge=0)
    model_and_prompt_versions: Mapping[str, str]
    overall_findings: Mapping[str, Any]
    cohort_level_findings: tuple[Mapping[str, Any], ...]
    emotional_response: Mapping[str, Any]
    credibility: Mapping[str, Any]
    clarity: Mapping[str, Any]
    share_and_ignore_propensity: Mapping[str, Any]
    cultural_risks: tuple[str, ...]
    language_cultural_evaluation: Mapping[str, Any]
    backlash_risks: tuple[str, ...]
    common_objections: tuple[str, ...]
    confusion_points: tuple[str, ...]
    survey_calibration: Mapping[str, Any]
    historical_backtest_results: Mapping[str, Any]
    confidence_and_uncertainty: Mapping[str, Any]
    limitations: tuple[str, ...]
    recommended_revisions: tuple[str, ...]
    required_real_world_validation: tuple[str, ...]
    source_citations: tuple[str, ...]
    human_reviewer: str | None
    approval_status: Literal["draft", "needs_human_review", "approved_experimental"]
    report_timestamp: datetime
    evidence_status: CampaignEvidenceStatus = "Synthetic-only"
    compliance_review: Mapping[str, Any] | None = None


def _walk_policy(value: object, *, path: str = "root") -> list[str]:
    violations: list[str] = []
    if isinstance(value, Mapping):
        for raw_key, child in value.items():
            key = str(raw_key).strip().lower().replace("-", "_")
            if key in _PROHIBITED_KEYS:
                violations.append(f"{path}.{key}")
            violations.extend(_walk_policy(child, path=f"{path}.{key}"))
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for index, child in enumerate(value):
            violations.extend(_walk_policy(child, path=f"{path}[{index}]"))
    elif isinstance(value, str):
        lowered = value.casefold()
        for term in _PROHIBITED_TERMS:
            if term in lowered:
                violations.append(f"{path}: {term}")
    return violations


def validate_campaign_policy(value: object) -> None:
    """Reject prohibited political-use payloads at the shared domain boundary."""

    violations = _walk_policy(value)
    if violations:
        raise CampaignLabPolicyError(
            "campaign-lab request is outside the aggregate research boundary: "
            + ", ".join(sorted(set(violations))[:12])
        )


def build_structured_persona(
    cohort: CampaignLabCohort,
    *,
    sampled_cell_key: str,
    sample_index: int,
    seed: int,
) -> StructuredSyntheticPersona:
    """Create a deterministic, labelled aggregate persona record before prose."""

    cell = next(
        (cell for cell in cohort.population_frame.cells if cell.key == sampled_cell_key), None
    )
    if cell is None:
        raise ValueError("sampled cell is not present in the frozen population frame")
    dimensions = cell.dimension_map()
    region = dimensions.get("region", cohort.geography)
    safe_region = re.sub(r"[^A-Z0-9]+", "-", region.upper()).strip("-")[:60] or "UNKNOWN"
    persona_id = f"PH-{safe_region}-{sample_index:06d}"
    seed_material = f"{cohort.cohort_id}:{sampled_cell_key}:{seed}:{sample_index}"
    vector = {
        dimension: PersonaAttribute(
            value=str(
                int.from_bytes(sha256(f"{seed_material}:{dimension}".encode()).digest()[:8], "big")
                / ((2**64) - 1)
            ),
            label="Synthetic",
        )
        for dimension in BEHAVIORAL_DIMENSIONS
    }
    demographic = {
        key: PersonaAttribute(value=value, label="Population-weighted")
        for key, value in dimensions.items()
    }
    language = {
        "primary": PersonaAttribute(
            value=dimensions.get("primary_language", "unknown"), label="Population-weighted"
        ),
        "secondary": PersonaAttribute(
            value=dimensions.get("secondary_language", "unknown"), label="Population-weighted"
        ),
    }
    media = {
        "consumption": PersonaAttribute(
            value=dimensions.get("media_consumption", "unknown"), label="Population-weighted"
        ),
        "device": PersonaAttribute(
            value=dimensions.get("device_access", "unknown"), label="Population-weighted"
        ),
    }
    issue = PersonaAttribute(value=dimensions.get("issue_priority", "unspecified"), label="Assumed")
    return StructuredSyntheticPersona(
        persona_id=persona_id,
        cohort_id=cohort.cohort_id,
        geography=region,
        demographic_attributes=demographic,
        language_profile=language,
        media_profile=media,
        behavioral_vector=vector,
        issue_priorities=(issue,),
        brand_or_candidate_familiarity=PersonaAttribute(
            value=dimensions.get("brand_familiarity", "unknown"), label="Assumed"
        ),
        source_provenance=cohort.source_provenance,
        sampling_weight=cell.weight,
        confidence=cohort.confidence,
        simulation_memory=(),
    )


def validate_persona_narrative(
    persona: StructuredSyntheticPersona,
    narrative: str,
) -> None:
    """Keep optional LLM prose from contradicting authoritative structure."""

    lowered = narrative.casefold()
    if "real " + "respondent" in lowered or "actual " + "voter" in lowered:
        raise CampaignLabPolicyError(
            "synthetic persona narrative cannot claim a real " + "respondent"
        )
    if "named individual" in lowered or "contact me" in lowered:
        raise CampaignLabPolicyError("synthetic persona narrative contains an identity claim")


def _population_weight_rows(cohort: CampaignLabCohort) -> tuple[Mapping[str, Any], ...]:
    return tuple(
        {
            "cell_key": cell.key,
            "population_weight": cell.weight,
            "dimensions": cell.dimension_map(),
            "label": "Population-weighted",
            "source_ids": [source.source_id for source in cohort.source_provenance],
        }
        for cell in cohort.population_frame.cells
    )


def _rankings(
    results: Mapping[str, RepeatedMethodologyResult],
) -> dict[str, RepeatedVariantRankingResult]:
    rankings: dict[str, RepeatedVariantRankingResult] = {}
    for metric_key in ("clarity", "relevance", "trust", "persuasiveness", "consideration"):
        values = {
            variant_key: [
                next(metric.value for metric in run.report.metrics if metric.key == metric_key)
                for run in result.runs
            ]
            for variant_key, result in results.items()
        }
        rankings[metric_key] = summarize_variant_ranking(
            metric_key=metric_key, values_by_variant=values
        )
    return rankings


def _cohort_findings(
    request: CampaignLabSimulationRequest,
    results: Mapping[str, RepeatedMethodologyResult],
) -> tuple[CampaignLabCohortFinding, ...]:
    """Compare variants within each sampled population cell.

    Every variant uses the same derived repetition seeds and frozen frame. The
    per-cell response values therefore form matched repeated observations rather
    than a new synthetic population estimate.
    """

    if not results:
        return ()
    first_result = next(iter(results.values()))
    sampled_keys = {
        response.cell_key for run in first_result.runs for response in run.cohort_responses
    }
    frame_by_key = {cell.key: cell for cell in request.cohort.population_frame.cells}
    findings: list[CampaignLabCohortFinding] = []
    metric_keys: tuple[RepeatMetricKey, ...] = (
        "clarity",
        "relevance",
        "trust",
        "persuasiveness",
        "consideration",
    )
    for cohort_key in sorted(sampled_keys):
        frame_cell = frame_by_key.get(cohort_key)
        if frame_cell is None:
            raise ValueError("sampled cohort is absent from the frozen population frame")
        rankings: dict[str, RepeatedVariantRankingResult] = {}
        for metric_key in metric_keys:
            values_by_variant: dict[str, list[float]] = {}
            for variant_key, repeated in results.items():
                values: list[float] = []
                for run in repeated.runs:
                    response = next(
                        (item for item in run.cohort_responses if item.cell_key == cohort_key),
                        None,
                    )
                    if response is None:
                        raise ValueError("repeated cohort response coverage mismatch")
                    values.append(
                        next(
                            metric.value for metric in response.metrics if metric.key == metric_key
                        )
                    )
                values_by_variant[variant_key] = values
            rankings[metric_key] = summarize_variant_ranking(
                metric_key=metric_key,
                values_by_variant=values_by_variant,
            )
        findings.append(
            CampaignLabCohortFinding(
                cohort_key=cohort_key,
                dimensions=frame_cell.dimension_map(),
                population_weight=frame_cell.weight,
                component_rankings=rankings,
                repetition_count=first_result.repetition_count,
                limitations=(
                    "Cohort rankings describe repeated synthetic diagnostics, "
                    "not human preference.",
                    "Population weight is inherited from the cited frozen frame; "
                    "it is not a vote-share estimate.",
                ),
            )
        )
    return tuple(findings)


def _synthetic_category_summary(
    runs: Sequence[Any],
    *,
    field: str,
    interpretation: str,
) -> Mapping[str, Any]:
    """Expose repeated category values without pretending they are real rates."""

    if not runs:
        return {
            "categories": {},
            "evidence_status": "Synthetic-only",
            "interpretation": interpretation,
        }
    first = getattr(runs[0].report, field)
    categories: dict[str, Any] = {}
    for index, category in enumerate(first.categories):
        values = [float(getattr(run.report, field).categories[index].value) for run in runs]
        categories[category.key] = {
            "mean": fsum(values) / len(values),
            "run_min": min(values),
            "run_max": max(values),
        }
    return {
        "categories": categories,
        "evidence_status": "Synthetic-only",
        "interpretation": interpretation,
        "repetition_count": len(runs),
    }


def _synthetic_risk_summary(runs: Sequence[Any]) -> Mapping[str, Any]:
    """Expose risk indicators as named diagnostics, never as probabilities."""

    if not runs:
        return {"indicators": {}, "evidence_status": "Synthetic-only"}
    first = runs[0].report.risks
    indicators: dict[str, Any] = {}
    for index, risk in enumerate(first):
        values = [float(run.report.risks[index].value) for run in runs]
        indicators[risk.key] = {
            "mean": fsum(values) / len(values),
            "run_min": min(values),
            "run_max": max(values),
            "scale": "0-100 heuristic component",
        }
    return {
        "indicators": indicators,
        "evidence_status": "Synthetic-only",
        "interpretation": (
            "Named deterministic risk indicators describe synthetic diagnostics; they are not "
            "backlash probabilities or population rates."
        ),
        "repetition_count": len(runs),
    }


def _synthetic_variant_component_evidence(
    result: CampaignLabSimulationResult,
) -> Mapping[str, Mapping[str, Any]]:
    behavioral_by_variant = {
        item.variant_key: item
        for item in (
            result.behavioral_diagnostics.variants if result.behavioral_diagnostics else ()
        )
    }
    rows: dict[str, Mapping[str, Any]] = {}
    for variant in result.variants:
        repeated = variant.repeated_result
        runs = repeated.runs
        metrics = {
            summary.key: {
                **summary.model_dump(mode="json"),
                "evidence_status": "Synthetic-only",
            }
            for summary in repeated.metric_summaries
        }
        behavioral = behavioral_by_variant.get(variant.variant_key)
        share_and_ignore: dict[str, Any] = {
            "positive_reaction_share": repeated.positive_share.model_dump(mode="json"),
            "evidence_status": "Synthetic-only",
            "limitations": (
                "Positive reaction share is not reach, engagement, vote share, or a sharing "
                "probability.",
            ),
        }
        if behavioral is not None:
            share_and_ignore["action_shares"] = dict(behavioral.action_shares)
            share_and_ignore["behavioral_diagnostic"] = {
                "provider_calls": behavioral.provider_calls,
                "input_tokens": behavioral.input_tokens,
                "output_tokens": behavioral.output_tokens,
                "cost_microusd": behavioral.cost_microusd,
            }
        rows[variant.variant_key] = {
            "evidence_status": "Synthetic-only",
            "sentiment_distribution": _synthetic_category_summary(
                runs,
                field="distribution",
                interpretation=(
                    "Synthetic reaction categories averaged across repeated runs; they are not "
                    "observed sentiment shares."
                ),
            ),
            "emotional_response": _synthetic_category_summary(
                runs,
                field="emotions",
                interpretation=(
                    "Synthetic emotion categories averaged across repeated runs; they are not "
                    "human emotional measurements."
                ),
            ),
            "metrics": metrics,
            "credibility": metrics.get("trust", {}),
            "clarity": metrics.get("clarity", {}),
            "share_and_ignore_propensity": share_and_ignore,
            "risk_indicators": _synthetic_risk_summary(runs),
            "stability": {
                "label": repeated.stability_label,
                "max_interval_half_width": repeated.max_interval_half_width,
                "repetition_count": repeated.repetition_count,
            },
        }
    return rows


def _behavioral_key(value: str, *, prefix: str) -> str:
    normalized = re.sub(r"[^a-z0-9_]", "_", value.casefold()).strip("_")
    candidate = f"{prefix}_{normalized}" if normalized else prefix
    return candidate[:64]


def _behavioral_context_graph(
    request: CampaignLabSimulationRequest,
    variant: CampaignLabVariant,
    sampled_cells: Sequence[Any],
) -> behavioral.ContextGraph:
    sources = request.research_sources or request.cohort.source_provenance
    nodes: list[behavioral.ContextNode] = [
        behavioral.ContextNode(
            node_id="campaign_objective",
            kind="market_context",
            title="Campaign objective",
            content=request.objective,
            provenance=behavioral.EvidenceProvenance(
                source_id="campaign_objective",
                source_version="campaign_lab_request_v1",
                owner="SIMULA campaign workspace",
                license="Client-provided campaign brief",
                allowed_use="Aggregate experimental message research",
                collected_at="campaign_request",
                transformation="Structured campaign request field",
                validation_status="experimental",
            ),
        ),
        behavioral.ContextNode(
            node_id=_behavioral_key(variant.key, prefix="stimulus"),
            kind="stimulus_fact",
            title=variant.label,
            content=variant.content,
            provenance=behavioral.EvidenceProvenance(
                source_id="authored_variant",
                source_version=request.configuration.prompt_version,
                owner="SIMULA campaign workspace",
                license="Client-provided authored message",
                allowed_use="Aggregate experimental message research",
                collected_at="authored_variant",
                transformation="No model-generated campaign claim",
                validation_status="experimental",
            ),
        ),
    ]
    for source in sources:
        if source.validation_status == "rejected":
            raise ValueError("rejected research provenance cannot enter the behavioral engine")
        source_id = _behavioral_key(source.source_id, prefix="source")
        nodes.append(
            behavioral.ContextNode(
                node_id=source_id,
                kind="audience_evidence",
                title=source.title,
                content=(
                    f"{source.title}; geography={source.geography}; "
                    f"methodology={source.collection_methodology}; "
                    f"limitations={'; '.join(source.known_limitations)}"
                )[:2000],
                provenance=behavioral.EvidenceProvenance(
                    source_id=source_id,
                    source_version=source.dataset_version,
                    owner=source.source_organization,
                    license=source.license_or_usage_rights,
                    allowed_use="Aggregate cohort research only",
                    collected_at=source.processing_date.isoformat(),
                    transformation=source.transformation,
                    validation_status=(
                        "benchmarked" if source.validation_status == "validated" else "experimental"
                    ),
                ),
            )
        )
    source_by_id = {source.source_id: source for source in sources}
    for raw_graph in request.research_knowledge:
        graph_source_id = raw_graph.get("source_id")
        if not isinstance(graph_source_id, str):
            raise ValueError("research knowledge source id is missing")
        knowledge_source = source_by_id.get(graph_source_id)
        if knowledge_source is None:
            raise ValueError("research knowledge source is not declared")
        entities = raw_graph.get("entities", ())
        assertions = raw_graph.get("assertions", ())
        relationships = raw_graph.get("relationships", ())
        conflicts = raw_graph.get("conflicts", ())
        if not all(
            isinstance(value, Sequence)
            for value in (entities, assertions, relationships, conflicts)
        ):
            raise ValueError("research knowledge collections are invalid")
        entity_labels = [
            str(item.get("label"))
            for item in entities
            if isinstance(item, Mapping) and isinstance(item.get("label"), str)
        ][:40]
        assertion_labels = [
            f"{item.get('subject_label')}: {item.get('value')}"
            for item in assertions
            if isinstance(item, Mapping)
            and isinstance(item.get("subject_label"), str)
            and isinstance(item.get("value"), str)
        ][:20]
        knowledge_node_id = _behavioral_key(graph_source_id, prefix="knowledge")
        nodes.append(
            behavioral.ContextNode(
                node_id=knowledge_node_id,
                kind="audience_evidence",
                title=f"Extracted knowledge: {knowledge_source.title}",
                content=(
                    "Bounded source-derived research knowledge; extracted assertions are "
                    "not independently verified. "
                    f"Entities={entity_labels}; assertions={assertion_labels}; "
                    f"relationships={len(relationships)}; conflicts={len(conflicts)}."
                )[:2000],
                provenance=behavioral.EvidenceProvenance(
                    source_id=graph_source_id,
                    source_version=knowledge_source.dataset_version,
                    owner=knowledge_source.source_organization,
                    license=knowledge_source.license_or_usage_rights,
                    allowed_use="Aggregate research context only",
                    collected_at=knowledge_source.processing_date.isoformat(),
                    transformation="Deterministic citation-first knowledge extraction",
                    validation_status=(
                        "benchmarked"
                        if knowledge_source.validation_status == "validated"
                        else "experimental"
                    ),
                ),
            )
        )
    for cell in sampled_cells:
        cell_dimensions = {item.dimension: item.value for item in cell.dimensions}
        nodes.append(
            behavioral.ContextNode(
                node_id=_behavioral_key(cell.key, prefix="audience"),
                kind="audience_evidence",
                title=f"Aggregate cohort {cell.key}",
                content=(
                    f"Population-weighted cohort dimensions: "
                    f"{cell_dimensions}; "
                    f"population weight={cell.population_weight}; "
                    f"audience weight={cell.audience_weight}"
                ),
                provenance=behavioral.EvidenceProvenance(
                    source_id="population_frame",
                    source_version=request.cohort.population_frame.version.__str__(),
                    owner="SIMULA population frame",
                    license="Declared population frame use",
                    allowed_use="Aggregate cohort diagnostics",
                    collected_at=str(request.cohort.population_frame.version),
                    transformation="Deterministic population-weighted cell sampling",
                    validation_status="experimental",
                ),
            )
        )
    nodes.sort(key=lambda node: node.node_id)
    return behavioral.ContextGraph(
        graph_id=uuid5(request.campaign_id, f"campaign-lab-context:{variant.key}"),
        organization_id=request.campaign_id,
        version=1,
        nodes=tuple(nodes),
        limitations=(
            "Context is a bounded synthetic diagnostic corpus, not a claim that every cited "
            "source supports every generated action.",
        ),
    )


def _behavioral_psychographics(
    request: CampaignLabSimulationRequest,
    sampled_cells: Sequence[Any],
) -> tuple[behavioral.CohortPsychographics, ...]:
    profiles: list[behavioral.CohortPsychographics] = []
    source_dimensions = tuple(request.cohort.behavioral_dimensions)
    for cell in sampled_cells:
        traits = []
        for definition in source_dimensions:
            digest = sha256(
                f"{request.configuration.random_seed}:{cell.key}:{definition.key}".encode()
            ).digest()
            unit = int.from_bytes(digest[:8], "big") / ((2**64) - 1)
            bounded = definition.minimum + unit * (definition.maximum - definition.minimum)
            traits.append(
                behavioral.PsychographicTrait(
                    key=definition.key,
                    value=bounded * 2.0 - 1.0,
                    evidence_node_ids=(_behavioral_key(cell.key, prefix="audience"),),
                )
            )
        profiles.append(
            behavioral.CohortPsychographics(
                cohort_key=cell.key,
                segment_key=_behavioral_key(cell.key, prefix="segment"),
                segment_label=f"Aggregate {cell.key}",
                traits=tuple(sorted(traits, key=lambda trait: trait.key)),
                limitations=(
                    "Traits are bounded synthetic projections of declared aggregate dimensions; "
                    "they are not individual psychometric measurements.",
                ),
            )
        )
    return tuple(sorted(profiles, key=lambda profile: profile.cohort_key))


def _behavioral_agent_evidence(
    result: behavioral.BehavioralRunResult,
    *,
    variant_key: str,
    repetition_index: int,
) -> tuple[CampaignLabBehavioralAgentEvidence, ...]:
    evidence: list[CampaignLabBehavioralAgentEvidence] = []
    for agent in result.fleet.agents[:12]:
        actions = [
            action
            for interaction_round in result.rounds
            for action in interaction_round.actions
            if action.agent_id == agent.agent_id
        ]
        memory = next((entry for entry in result.memory if entry.agent_id == agent.agent_id), None)
        if not actions or memory is None:
            continue
        evidence.append(
            CampaignLabBehavioralAgentEvidence(
                agent_id=agent.agent_id,
                cohort_key=agent.cohort_key,
                variant_key=variant_key,
                repetition_index=repetition_index,
                exposure_history=tuple(
                    f"round_{action.round_index}: exposed_to_variant_{variant_key}"
                    for action in actions
                ),
                action_history=tuple(action.action for action in actions),
                action_timestamps_ms=tuple(action.action_timestamp_ms for action in actions),
                memory_entries=tuple(entry.model_dump(mode="json") for entry in memory.entries),
                evidence_event_ids=tuple(action.event_id for action in actions),
            )
        )
    if not evidence:
        raise ValueError("behavioral run produced no interviewable agent evidence")
    return tuple(evidence)


def _run_behavioral_diagnostics(
    request: CampaignLabSimulationRequest,
) -> CampaignLabBehavioralDiagnostics:
    """Run the replayable event engine over the same weighted aggregate design."""

    agent_count = min(request.configuration.panel_size, 2000)
    sampling = SamplingConfiguration(
        sample_size=agent_count,
        minimum_per_cell=1,
        maximum_cells=request.configuration.sampling_maximum_cells,
        seed=request.configuration.random_seed,
        sparse_cell_threshold=request.configuration.sparse_cell_threshold,
    )
    provider = behavioral.DeterministicTieredProvider()
    synthesizer = behavioral.DeterministicNarrativeSynthesizer()
    variant_diagnostics: list[CampaignLabBehavioralVariantDiagnostic] = []
    for variant in request.variants:
        runs: list[behavioral.BehavioralRunResult] = []
        for repetition_index in range(request.configuration.repetitions):
            repetition_sampling = sampling.model_copy(
                update={"seed": request.configuration.random_seed + repetition_index}
            )
            sample = sample_population(
                request.cohort.population_frame,
                request.cohort.audience,
                repetition_sampling,
            )
            context = _behavioral_context_graph(request, variant, sample.cells)
            psychographics = _behavioral_psychographics(request, sample.cells)
            run_id = uuid5(
                request.campaign_id,
                f"campaign-lab-behavioral:{variant.key}:{repetition_index}",
            )
            study_id = uuid5(
                request.campaign_id,
                f"campaign-lab-behavioral-study:{repetition_index}",
            )
            command = behavioral.BehavioralRunCommand(
                organization_id=request.campaign_id,
                run_id=run_id,
                study_id=study_id,
                variant_key=variant.key,
                stimulus=variant.content,
                context_graph=context,
                population=request.cohort.population_frame,
                audience=request.cohort.audience,
                sampling_configuration=repetition_sampling,
                psychographics=psychographics,
                fleet_configuration=behavioral.AgentFleetConfiguration(
                    agent_count=agent_count,
                    llm_agent_count=0,
                    minimum_per_cohort=1,
                    seed=request.configuration.random_seed,
                    network_topology=request.configuration.network_topology,
                ),
                engine_configuration=behavioral.BehavioralEngineConfiguration(
                    methodology_version="campaign_lab_behavioral_v1",
                    round_count=request.configuration.rounds,
                    maximum_memory_entries_per_agent=20,
                    maximum_provider_calls=agent_count * request.configuration.rounds,
                    cost_ceiling_microusd=request.configuration.cost_ceiling_microusd,
                    deadline_seconds=float(request.configuration.timeout_seconds),
                    seed=request.configuration.random_seed + repetition_index,
                ),
                provider=provider.descriptor,
            )
            runs.append(
                behavioral.execute_behavioral_run(
                    command,
                    provider=provider,
                    synthesizer=synthesizer,
                )
            )
        action_shares: dict[str, float] = {
            action: sum(dict(run.report.action_shares)[action] for run in runs) / len(runs)
            for action in behavioral.ACTION_KINDS
        }
        variant_diagnostics.append(
            CampaignLabBehavioralVariantDiagnostic(
                variant_key=variant.key,
                requested_rounds=request.configuration.rounds,
                executed_rounds=request.configuration.rounds,
                network_topology=request.configuration.network_topology,
                agent_count=agent_count,
                repetition_count=len(runs),
                action_shares=action_shares,
                mean_attention=sum(run.report.mean_attention for run in runs) / len(runs),
                mean_resonance=sum(run.report.mean_resonance for run in runs) / len(runs),
                mean_trust=sum(run.report.mean_trust for run in runs) / len(runs),
                provider_calls=sum(run.receipt.provider_calls for run in runs),
                input_tokens=sum(run.receipt.usage.input_tokens for run in runs),
                output_tokens=sum(run.receipt.usage.output_tokens for run in runs),
                cost_microusd=sum(run.receipt.usage.cost_microusd for run in runs),
                interviewable_agents=_behavioral_agent_evidence(
                    runs[0], variant_key=variant.key, repetition_index=0
                ),
            )
        )
    limitations = [
        "Behavioral diagnostics are replayable synthetic-agent events, not observed human "
        "evidence or population uncertainty.",
        "Agent weights inherit the admitted population frame and are not vote-share or "
        "persuasion estimates.",
    ]
    if request.configuration.panel_size > agent_count:
        limitations.append(
            "The event engine is bounded at 2,000 synthetic agents; the population-weighted "
            "methodology run still uses the requested panel size."
        )
    return CampaignLabBehavioralDiagnostics(
        requested_panel_size=request.configuration.panel_size,
        executed_agent_count=agent_count,
        requested_rounds=request.configuration.rounds,
        executed_rounds=request.configuration.rounds,
        network_topology=request.configuration.network_topology,
        variants=tuple(variant_diagnostics),
        limitations=tuple(limitations),
    )


def _synthetic_observations(
    repeated_by_variant: Mapping[str, RepeatedMethodologyResult],
) -> tuple[SyntheticVariantObservation, ...]:
    """Expose bounded aggregate observations for the separate calibration stage."""

    observations: list[SyntheticVariantObservation] = []
    for variant_key, repeated in sorted(repeated_by_variant.items()):
        reports = [run.report for run in repeated.runs]
        distribution_values = [
            fsum(report.distribution.values()[index] for report in reports) / len(reports)
            for index in range(4)
        ]
        distribution_values[-1] = 1.0 - fsum(distribution_values[:-1])
        metrics = tuple(
            MetricScore(
                key=metric_key,
                value=fsum(
                    next(metric.value for metric in report.metrics if metric.key == metric_key)
                    for report in reports
                )
                / len(reports),
            )
            for metric_key in ("clarity", "relevance", "trust", "persuasiveness", "consideration")
        )
        reaction_keys: tuple[Literal["positive", "neutral", "negative", "mixed"], ...] = (
            "positive",
            "neutral",
            "negative",
            "mixed",
        )
        observations.append(
            SyntheticVariantObservation(
                variant_key=variant_key,
                cohort_key="aggregate",
                population_weight=1.0,
                effective_sample_size=fsum(report.effective_sample_size for report in reports)
                / len(reports),
                distribution=ReactionDistribution(
                    categories=tuple(  # type: ignore[arg-type]
                        ReactionShare(key=key, value=distribution_values[index])
                        for index, key in enumerate(reaction_keys)
                    )
                ),
                metrics=metrics,  # type: ignore[arg-type]
            )
        )
    return tuple(observations)


def run_campaign_lab_simulation(
    request: CampaignLabSimulationRequest,
    *,
    methodology_version: str = "campaign_lab_population_weighted_v1",
) -> CampaignLabSimulationResult:
    """Run all variants repeatedly over one frozen weighted aggregate frame."""

    engine = MethodologyEngine(DeterministicCohortProvider())
    sampling = SamplingConfiguration(
        sample_size=request.configuration.panel_size,
        minimum_per_cell=request.configuration.sampling_minimum_per_cell,
        maximum_cells=request.configuration.sampling_maximum_cells,
        seed=request.configuration.random_seed,
        sparse_cell_threshold=request.configuration.sparse_cell_threshold,
    )
    repeated_configuration = RepeatedSimulationConfiguration(
        repetition_count=request.configuration.repetitions,
        base_seed=request.configuration.random_seed,
        stability_tolerance=10.0,
    )
    repeated_by_variant: dict[str, RepeatedMethodologyResult] = {}
    for variant in request.variants:
        repeated_by_variant[variant.key] = run_repeated_methodology(
            engine,
            run_group_id=uuid5(request.campaign_id, f"campaign-lab:{variant.key}"),
            stimulus=variant.content,
            population=request.cohort.population_frame,
            audience=request.cohort.audience,
            configuration=sampling,
            methodology_version=methodology_version,
            cost_ceiling_microusd=request.configuration.cost_ceiling_microusd,
            repetition_configuration=repeated_configuration,
        )
    rankings = _rankings(repeated_by_variant)
    cohort_findings = _cohort_findings(request, repeated_by_variant)
    behavioral_diagnostics = _run_behavioral_diagnostics(request)
    synthetic_observations = _synthetic_observations(repeated_by_variant)
    variant_results = tuple(
        CampaignLabVariantResult(
            variant_key=variant.key,
            repeated_result=repeated_by_variant[variant.key],
            component_rankings=rankings,
            cohort_weights=_population_weight_rows(request.cohort),
        )
        for variant in request.variants
    )
    payload = {
        "campaign_id": str(request.campaign_id),
        "methodology_version": methodology_version,
        "population_checksum_sha256": request.cohort.population_frame.checksum_sha256,
        "configuration": request.configuration.model_dump(mode="json"),
        "variants": [item.model_dump(mode="json") for item in variant_results],
        "rankings": {key: value.model_dump(mode="json") for key, value in rankings.items()},
        "cohort_findings": [item.model_dump(mode="json") for item in cohort_findings],
        "behavioral_diagnostics": behavioral_diagnostics.model_dump(mode="json"),
        "synthetic_observations": [item.model_dump(mode="json") for item in synthetic_observations],
    }
    checksum = sha256(canonical_json_dumps(payload)).hexdigest()
    return CampaignLabSimulationResult(
        campaign_id=request.campaign_id,
        methodology_version=methodology_version,
        population_checksum_sha256=request.cohort.population_frame.checksum_sha256,
        configuration=request.configuration,
        variants=variant_results,
        overall_component_rankings=rankings,
        sample_size=request.configuration.panel_size,
        repetitions=request.configuration.repetitions,
        limitations=(
            "Synthetic aggregate research only; no individual respondent is represented.",
            "Repeated-run intervals describe Monte Carlo stability, not population uncertainty.",
            "No vote share, election result, causal lift, or universal accuracy is claimed.",
            "Survey calibration and held-out historical backtesting remain separate evidence "
            "stages.",
        ),
        reproducibility_checksum_sha256=checksum,
        cohort_findings=cohort_findings,
        behavioral_diagnostics=behavioral_diagnostics,
        synthetic_observations=synthetic_observations,
    )


def build_campaign_lab_report(
    request: CampaignLabSimulationRequest,
    result: CampaignLabSimulationResult,
    *,
    survey_calibration: Mapping[str, Any] | None = None,
    historical_backtest: Mapping[str, Any] | None = None,
    cultural_evaluation: Mapping[str, Any] | None = None,
    compliance_review: Mapping[str, Any] | None = None,
    human_reviewer: str | None = None,
    approval_status: Literal["draft", "needs_human_review", "approved_experimental"] = "draft",
) -> CampaignLabReport:
    """Build the evidence-labelled report without collapsing metrics into one score."""

    findings = {
        metric_key: ranking.model_dump(mode="json")
        for metric_key, ranking in result.overall_component_rankings.items()
    }
    cohort_findings = tuple(finding.model_dump(mode="json") for finding in result.cohort_findings)
    if not cohort_findings:
        cohort_findings = tuple(
            {
                "variant_key": item.variant_key,
                "cohort_weights": list(item.cohort_weights),
                "evidence_status": "Population-weighted",
            }
            for item in result.variants
        )
    model_versions = {
        "methodology_version": result.methodology_version,
        "model_name": request.configuration.model_name,
        "prompt_version": request.configuration.prompt_version,
        "research_corpus_version": request.configuration.research_corpus_version,
        "persona_generation_version": request.configuration.persona_generation_version,
        "scoring_version": request.configuration.scoring_version,
        "simulation_engine_version": request.configuration.simulation_engine_version,
    }
    calibration = (
        dict(survey_calibration)
        if survey_calibration is not None
        else {
            "status": "not_run",
            "evidence_status": "Synthetic-only",
            "limitations": ["No consented survey dataset has been attached to this report."],
        }
    )
    backtest = (
        dict(historical_backtest)
        if historical_backtest is not None
        else {
            "status": "not_run",
            "evidence_status": "Synthetic-only",
            "limitations": ["No blind held-out historical outcome dataset has been attached."],
        }
    )
    calibration_status = str(calibration.get("evidence_status") or calibration.get("status"))
    backtest_status = str(backtest.get("evidence_status") or backtest.get("status"))
    if backtest_status == "Historically backtested" and calibration_status in {
        "Partially calibrated",
        "Survey-calibrated",
    }:
        evidence_status: CampaignEvidenceStatus = "Mixed evidence"
    elif backtest_status == "Historically backtested":
        evidence_status = "Historically backtested"
    elif calibration_status in {"Partially calibrated", "Survey-calibrated"}:
        evidence_status = cast(CampaignEvidenceStatus, calibration_status)
    elif (
        calibration_status == "Insufficient evidence" or backtest_status == "Insufficient evidence"
    ):
        evidence_status = "Insufficient evidence"
    else:
        evidence_status = "Synthetic-only"
    cultural = cultural_evaluation or {
        "status": "not_run",
        "supported_languages": ["english", "filipino", "taglish"],
        "limitations": [
            "Attach a human-reviewed language suite before making cultural-fit claims."
        ],
    }
    variant_component_evidence = _synthetic_variant_component_evidence(result)
    return CampaignLabReport(
        executive_summary=(
            "This report compares aggregate, population-weighted synthetic runs across "
            f"{len(request.variants)} authored variants. It contains component metrics and "
            "stability diagnostics, not an LLM-invented viral score or vote-share forecast."
        ),
        campaign_objective=request.objective,
        variants_tested=tuple(variant.key for variant in request.variants),
        audience_cohort_definition=request.cohort.model_dump(mode="json"),
        population_weights=tuple(
            weight for item in result.variants[:1] for weight in item.cohort_weights
        ),
        research_sources=request.research_sources,
        simulation_configuration=request.configuration,
        number_of_agents=result.sample_size,
        number_of_repetitions=result.repetitions,
        model_and_prompt_versions=model_versions,
        overall_findings={
            **findings,
            "variant_component_evidence": variant_component_evidence,
            "evidence_status": "Synthetic-only",
        },
        cohort_level_findings=cohort_findings,
        emotional_response={
            "variants": {
                key: value["emotional_response"]
                for key, value in variant_component_evidence.items()
            },
            "evidence_status": "Synthetic-only",
        },
        credibility={
            "metric": "trust",
            "variants": {
                key: value["credibility"] for key, value in variant_component_evidence.items()
            },
            "evidence_status": "Synthetic-only",
        },
        clarity={
            "metric": "clarity",
            "variants": {
                key: value["clarity"] for key, value in variant_component_evidence.items()
            },
            "evidence_status": "Synthetic-only",
        },
        share_and_ignore_propensity={
            "variants": {
                key: value["share_and_ignore_propensity"]
                for key, value in variant_component_evidence.items()
            },
            "evidence_status": "Synthetic-only",
        },
        cultural_risks=(
            "Cultural interpretation requires Filipino human review and held-out validation.",
        ),
        language_cultural_evaluation=cultural,
        backlash_risks=(
            "Synthetic risk indicators cannot establish real-world backlash probability; "
            "review the per-variant risk indicators with human researchers.",
        ),
        common_objections=(
            "No observed objection corpus is attached; synthetic narrative objections are not "
            "generated as if they were participant findings.",
        ),
        confusion_points=(
            "No observed comprehension coding is attached; validate low-clarity cohorts with "
            "human participants.",
        ),
        survey_calibration=calibration,
        historical_backtest_results=backtest,
        confidence_and_uncertainty={
            "evidence_status": evidence_status,
            "reproducibility_checksum_sha256": result.reproducibility_checksum_sha256,
            "stability": findings,
        },
        limitations=result.limitations,
        recommended_revisions=(
            "Review variant component metrics, sentiment categories, and risk indicators with "
            "a human researcher; do not collapse them into one score.",
            "Validate leading component findings with consented survey evidence.",
            "Run a blind historical backtest before making consequential decisions.",
        ),
        required_real_world_validation=(
            "Human-reviewed Filipino and Taglish comprehension evaluation.",
            "Consent-based survey calibration with declared sampling and weighting.",
            "Held-out historical backtesting with outcomes revealed after prediction freeze.",
        ),
        source_citations=tuple(source.source_id for source in request.research_sources),
        human_reviewer=human_reviewer,
        approval_status=approval_status,
        report_timestamp=datetime.now(UTC),
        evidence_status=evidence_status,
        compliance_review=compliance_review,
    )


def create_synthetic_interview(
    persona: StructuredSyntheticPersona,
    *,
    variant_key: str,
    prompt_version: str,
    interview_id: UUID,
    question: str = "What happened in this simulation?",
    simulation_run_id: UUID | None = None,
    agent_id: UUID | None = None,
    exposure_history: Sequence[str] = (),
    action_history: Sequence[str] = (),
    memory_evidence: Sequence[Mapping[str, Any]] = (),
    evidence_event_ids: Sequence[UUID] = (),
    research_source_ids: Sequence[str] = (),
    research_citation_ids: Sequence[str] = (),
) -> SyntheticPersonaInterview:
    """Create a clearly disclosed interview artifact from a structured persona."""

    if not variant_key:
        raise ValueError("variant_key is required")
    transcript = (
        f"Synthetic persona {persona.persona_id} reviewed variant {variant_key}. "
        f"Question: {question} "
        f"The structured aggregate profile indicates {len(persona.behavioral_vector)} "
        f"versioned behavioral dimensions. The synthetic action history contains "
        f"{len(action_history)} actions and {len(memory_evidence)} memory entries. "
        f"The explanation is bounded by {len(research_source_ids)} admitted research "
        f"sources and {len(research_citation_ids)} source citations. Prompt {prompt_version} "
        f"rendered this "
        "illustrative explanation; it is not testimony from a real " + "respondent."
    )
    return SyntheticPersonaInterview(
        interview_id=interview_id,
        persona_id=persona.persona_id,
        variant_key=variant_key,
        transcript=transcript,
        question=question,
        limitations=(
            "Narrative is synthetic and illustrative.",
            "The interview cannot establish human preference or population opinion.",
        ),
        simulation_run_id=simulation_run_id,
        agent_id=agent_id,
        exposure_history=tuple(exposure_history),
        action_history=tuple(action_history),
        memory_evidence=tuple(memory_evidence),
        evidence_event_ids=tuple(evidence_event_ids),
        research_source_ids=tuple(research_source_ids),
        research_citation_ids=tuple(research_citation_ids),
    )


def build_compliance_review(
    *,
    review_id: UUID,
    payload: object,
    reviewer: str | None = None,
) -> CampaignComplianceReview:
    """Return an auditable fail-closed compliance disposition."""

    try:
        validate_campaign_policy(payload)
    except CampaignLabPolicyError as error:
        return CampaignComplianceReview(
            review_id=review_id,
            status="blocked",
            prohibited_uses_detected=(str(error),),
            aggregate_only=False,
            reviewed_by=reviewer,
            reviewed_at=datetime.now(UTC) if reviewer else None,
            rationale="The request includes a prohibited political-use pattern.",
        )
    return CampaignComplianceReview(
        review_id=review_id,
        status="needs_human_review" if reviewer is None else "approved_experimental",
        prohibited_uses_detected=(),
        aggregate_only=True,
        reviewed_by=reviewer,
        reviewed_at=datetime.now(UTC) if reviewer else None,
        rationale=(
            "Aggregate research controls passed; human review is still required before "
            "external use."
        ),
    )
