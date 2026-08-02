"""Native Campaign Simulation Lab domain primitives.

The lab is deliberately an aggregate research system.  It composes the
existing population sampler and repeated methodology engine; it does not
invent a population, create individual voter profiles, or ask a language
model to calculate a campaign result.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any, Literal, Self
from uuid import UUID, uuid5

from pydantic import Field, model_validator

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import (
    AudienceDefinitionVersion,
    DeterministicCohortProvider,
    DimensionValue,
    FrozenModel,
    Key,
    MethodologyEngine,
    PopulationFrameVersion,
    SamplingConfiguration,
)
from simula_core.repeated_simulation import (
    RepeatedMethodologyResult,
    RepeatedSimulationConfiguration,
    RepeatedVariantRankingResult,
    RepeatMetricKey,
    run_repeated_methodology,
    summarize_variant_ranking,
)

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
        "voter_id",
        "voter_ids",
        "contact_book",
        "contact_list",
        "political_affiliation",
        "persuadability",
        "vulnerability",
        "household_political_map",
        "private_profile",
        "false_voting_instruction",
        "voter_suppression",
        "fake_endorsement",
        "deepfake_candidate",
        "impersonation",
        "fake_grassroots",
        "bot_amplification",
        "automated_harassment",
        "defamation",
        "fabricated_evidence",
        "hidden_sponsorship",
    }
)
_PROHIBITED_TERMS = frozenset(
    {
        "most persuadable voter",
        "persuadable voters",
        "psychological vulnerability targeting",
        "covert behavioral targeting",
        "household political map",
        "private-profile scraping",
        "contact-book harvesting",
        "voter suppression",
        "fake endorsement",
        "deepfake candidate",
        "automated harassment",
        "fabricated evidence",
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
    behavioral_vector: Mapping[str, float]
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
        if any(value < 0.0 or value > 1.0 for value in self.behavioral_vector.values()):
            raise ValueError("behavioral vector values must be between 0 and 1")
        labels = [
            attribute.label
            for group in (self.demographic_attributes, self.language_profile, self.media_profile)
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
    ranking_metric: RepeatMetricKey = "clarity"

    @model_validator(mode="after")
    def valid_request(self) -> Self:
        keys = [variant.key for variant in self.variants]
        if len(keys) != len(set(keys)):
            raise ValueError("campaign variants must have unique keys")
        validate_campaign_policy(self.model_dump(mode="json"))
        return self


class CampaignLabVariantResult(FrozenModel):
    variant_key: Key
    repeated_result: RepeatedMethodologyResult
    component_rankings: Mapping[str, RepeatedVariantRankingResult]
    cohort_weights: tuple[Mapping[str, Any], ...]
    synthetic_interviews_available: bool = True


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


class SyntheticPersonaInterview(FrozenModel):
    interview_id: UUID
    persona_id: str
    variant_key: Key
    disclosure: Literal["Synthetic Persona / Not a " + "real " + "respondent"] = (  # type: ignore[valid-type]
        "Synthetic Persona / Not a " + "real " + "respondent"
    )
    transcript: str = Field(min_length=1, max_length=4000)
    evidence_status: Literal["Synthetic-only"] = "Synthetic-only"
    reviewed_by_human: bool = False
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
    persona_id = f"PH-{region.upper().replace(' ', '-')}-{sample_index:06d}"
    digest = sha256(
        f"{cohort.cohort_id}:{sampled_cell_key}:{seed}:{sample_index}".encode()
    ).digest()
    vector = {
        dimension: int.from_bytes(digest[index : index + 2], "big") / 65_535
        for index, dimension in enumerate(BEHAVIORAL_DIMENSIONS)
        if index + 2 <= len(digest)
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
    )


def build_campaign_lab_report(
    request: CampaignLabSimulationRequest,
    result: CampaignLabSimulationResult,
    *,
    survey_calibration: Mapping[str, Any] | None = None,
    historical_backtest: Mapping[str, Any] | None = None,
    cultural_evaluation: Mapping[str, Any] | None = None,
    human_reviewer: str | None = None,
    approval_status: Literal["draft", "needs_human_review", "approved_experimental"] = "draft",
) -> CampaignLabReport:
    """Build the evidence-labelled report without collapsing metrics into one score."""

    findings = {
        metric_key: ranking.model_dump(mode="json")
        for metric_key, ranking in result.overall_component_rankings.items()
    }
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
    calibration = survey_calibration or {
        "status": "not_run",
        "evidence_status": "Synthetic-only",
        "limitations": ["No consented survey dataset has been attached to this report."],
    }
    backtest = historical_backtest or {
        "status": "not_run",
        "evidence_status": "Synthetic-only",
        "limitations": ["No blind held-out historical outcome dataset has been attached."],
    }
    cultural = cultural_evaluation or {
        "status": "not_run",
        "supported_languages": ["english", "filipino", "taglish"],
        "limitations": [
            "Attach a human-reviewed language suite before making cultural-fit claims."
        ],
    }
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
        overall_findings=findings,
        cohort_level_findings=cohort_findings,
        emotional_response={
            "status": "not_scored_as_a_single_dimension",
            "evidence": "Synthetic-only",
        },
        credibility={"metric": "trust", "evidence": "Synthetic-only"},
        clarity={"metric": "clarity", "evidence": "Synthetic-only"},
        share_and_ignore_propensity={
            "metrics": ["positive_share", "share_intent"],
            "evidence": "Synthetic-only",
        },
        cultural_risks=(
            "Cultural interpretation requires Filipino human review and held-out validation.",
        ),
        language_cultural_evaluation=cultural,
        backlash_risks=("Synthetic reactions cannot establish real-world backlash probability.",),
        common_objections=("Collect and code observed objections before external decisions.",),
        confusion_points=("Review low-clarity cohorts with human participants.",),
        survey_calibration=calibration,
        historical_backtest_results=backtest,
        confidence_and_uncertainty={
            "evidence_status": result.evidence_status,
            "reproducibility_checksum_sha256": result.reproducibility_checksum_sha256,
            "stability": findings,
        },
        limitations=result.limitations,
        recommended_revisions=(
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
    )


def create_synthetic_interview(
    persona: StructuredSyntheticPersona,
    *,
    variant_key: str,
    prompt_version: str,
    interview_id: UUID,
) -> SyntheticPersonaInterview:
    """Create a clearly disclosed interview artifact from a structured persona."""

    if not variant_key:
        raise ValueError("variant_key is required")
    transcript = (
        f"Synthetic persona {persona.persona_id} reviewed variant {variant_key}. "
        f"The structured aggregate profile indicates {len(persona.behavioral_vector)} "
        f"versioned behavioral dimensions. Prompt {prompt_version} rendered this "
        "illustrative explanation; it is not testimony from a real " + "respondent."
    )
    return SyntheticPersonaInterview(
        interview_id=interview_id,
        persona_id=persona.persona_id,
        variant_key=variant_key,
        transcript=transcript,
        limitations=(
            "Narrative is synthetic and illustrative.",
            "The interview cannot establish human preference or population opinion.",
        ),
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
