from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest
from simula_core.campaign_lab import (
    BEHAVIORAL_DIMENSIONS,
    BehavioralDimensionDefinition,
    CampaignLabCohort,
    CampaignLabPolicyError,
    CampaignLabResearchSource,
    CampaignLabSimulationConfiguration,
    CampaignLabSimulationRequest,
    CampaignLabVariant,
    build_campaign_lab_report,
    build_compliance_review,
    build_structured_persona,
    create_synthetic_interview,
    run_campaign_lab_simulation,
    validate_campaign_lab_population_admission,
    validate_campaign_policy,
    validate_persona_narrative,
)
from simula_core.methodology import DimensionValue
from simula_core.population_sources import psa_2020_regional_population_frame
from simula_core.research_ingestion import ingest_research_document
from test_methodology import _audience, _population

CAMPAIGN_ID = UUID("30000000-0000-4000-8000-000000000101")
COHORT_ID = UUID("30000000-0000-4000-8000-000000000102")


def _source() -> CampaignLabResearchSource:
    return CampaignLabResearchSource(
        source_id="psa_fixture",
        title="Authored aggregate fixture",
        source_type="public_dataset",
        source_organization="SIMULA test authors",
        dataset_version="fixture-v1",
        geography="Philippines aggregate fixture",
        collection_methodology="Authored non-representative test fixture.",
        license_or_usage_rights="Internal test use only.",
        processing_date=datetime(2026, 8, 2, tzinfo=UTC),
        transformation="None.",
        known_limitations=("Not representative.",),
        checksum_sha256="0" * 64,
    )


def _cohort() -> CampaignLabCohort:
    dimensions = (
        DimensionValue(dimension="age_bracket", value="25_34"),
        DimensionValue(dimension="region", value="ncr"),
    )
    behavioral = tuple(
        BehavioralDimensionDefinition(
            key=key,
            definition=f"Bounded aggregate fixture for {key}.",
            minimum=0.0,
            maximum=1.0,
            provenance="Population-weighted",
            derivation_method="Authored deterministic fixture.",
            validation_status="experimental",
            model_version="behavioral_fixture_v1",
            known_limitations=("Not human validated.",),
        )
        for key in ("institutional_trust", "message_skepticism", "issue_salience")
    )
    return CampaignLabCohort(
        cohort_id=COHORT_ID,
        name="Aggregate fixture cohort",
        geography="Philippines aggregate fixture",
        dimensions=dimensions,
        population_frame=_population(),
        audience=_audience(geography=("metro", "regional")),
        source_provenance=(_source(),),
        weighting_method="population_weighted",
        behavioral_model_version="behavioral_fixture_v1",
        behavioral_dimensions=behavioral,
        confidence=0.2,
        known_limitations=("Authored fixture; not representative.",),
    )


def _request() -> CampaignLabSimulationRequest:
    return CampaignLabSimulationRequest(
        campaign_id=CAMPAIGN_ID,
        objective="Compare two fictional message variants before human research.",
        purpose="commercial_marketing",
        cohort=_cohort(),
        variants=(
            CampaignLabVariant(
                key="variant_a",
                label="Clear message",
                content="A fictional clear message for a product test.",
                language="en",
                content_type="caption",
            ),
            CampaignLabVariant(
                key="variant_b",
                label="Warm message",
                content="A fictional warm message for a product test.",
                language="en",
                content_type="caption",
            ),
        ),
        configuration=CampaignLabSimulationConfiguration(
            random_seed=17,
            panel_size=40,
            repetitions=3,
            rounds=2,
            provider="deterministic",
            model_name="deterministic-statistical-v1",
            prompt_version="none",
            research_corpus_version="fixture-v1",
            persona_generation_version="structured-persona-v1",
            scoring_version="campaign-lab-scoring-v1",
            simulation_engine_version="campaign-lab-engine-v1",
            cost_ceiling_microusd=0,
            timeout_seconds=30,
        ),
        research_sources=(_source(),),
    )


def test_campaign_lab_repeated_result_has_population_weights_and_no_standalone_score() -> None:
    result = run_campaign_lab_simulation(_request())

    assert result.evidence_status == "Synthetic-only"
    assert result.repetitions == 3
    assert len(result.variants) == 2
    assert result.variants[0].cohort_weights[0]["label"] == "Population-weighted"
    assert len(result.cohort_findings) == 4
    assert {finding.cohort_key for finding in result.cohort_findings} == {
        "metro_early",
        "metro_late",
        "regional_late",
        "regional_early",
    }
    assert set(result.cohort_findings[0].component_rankings) == {
        "clarity",
        "relevance",
        "trust",
        "persuasiveness",
        "consideration",
    }
    assert all(
        {variant.variant_key for variant in ranking.variants} == {"variant_a", "variant_b"}
        for ranking in result.cohort_findings[0].component_rankings.values()
    )
    assert result.reproducibility_checksum_sha256 != "0" * 64
    assert {item.variant_key for item in result.synthetic_observations} == {
        "variant_a",
        "variant_b",
    }
    assert all(item.cohort_key == "aggregate" for item in result.synthetic_observations)
    assert "viral_score" not in result.model_dump(mode="json")


def test_production_admission_rejects_authored_population_fixture() -> None:
    with pytest.raises(CampaignLabPolicyError, match="verified aggregate audience"):
        validate_campaign_lab_population_admission(_request(), environment="production")

    validate_campaign_lab_population_admission(_request(), environment="test")


def test_production_admission_accepts_verified_validated_population_frame() -> None:
    request = _request()
    validated_source = _source().model_copy(update={"validation_status": "validated"})
    cohort = request.cohort.model_copy(
        update={
            "population_frame": psa_2020_regional_population_frame(),
            "audience": request.cohort.audience.model_copy(
                update={"criteria": (), "provenance_status": "verified"}
            ),
            "source_provenance": (validated_source,),
        }
    )
    admitted = request.model_copy(
        update={"cohort": cohort, "research_sources": (validated_source,)}
    )

    validate_campaign_lab_population_admission(admitted, environment="production")


def test_campaign_lab_binds_admitted_research_knowledge_to_behavioral_context() -> None:
    source = _source()
    knowledge = ingest_research_document(
        source=source,
        filename="fixture.md",
        media_type="text/markdown",
        secret_payload={"content": "# Transport\nTrust: high"},
    ).knowledge_graph
    request = _request().model_copy(
        update={"research_knowledge": (knowledge.model_dump(mode="json"),)}
    )

    result = run_campaign_lab_simulation(request)

    assert result.behavioral_diagnostics is not None
    assert result.behavioral_diagnostics.variants


def test_structured_persona_has_explicit_labels_and_disclosed_interview() -> None:
    persona = build_structured_persona(
        _cohort(), sampled_cell_key="metro_early", sample_index=184, seed=17
    )
    assert persona.persona_id.startswith("PH-")
    assert all(
        attribute.label in {"Population-weighted", "Assumed"}
        for attribute in persona.demographic_attributes.values()
    )
    interview = create_synthetic_interview(
        persona,
        variant_key="variant_a",
        prompt_version="none",
        interview_id=UUID("30000000-0000-4000-8000-000000000103"),
    )
    assert interview.disclosure == "Synthetic Persona / Not a real respondent"
    assert "not testimony" in interview.transcript.casefold()
    assert "action history" in interview.transcript.casefold()
    assert tuple(persona.behavioral_vector) == BEHAVIORAL_DIMENSIONS
    assert len(persona.behavioral_vector) == 19
    assert {attribute.label for attribute in persona.behavioral_vector.values()} == {"Synthetic"}


def test_policy_rejects_individual_persuasion_and_compliance_fails_closed() -> None:
    with pytest.raises(CampaignLabPolicyError):
        validate_campaign_policy({"persuadability": "high"})

    review = build_compliance_review(
        review_id=UUID("30000000-0000-4000-8000-000000000104"),
        payload={"voter_suppression": True},
    )
    assert review.status == "blocked"
    assert review.aggregate_only is False


@pytest.mark.parametrize(
    "payload",
    [
        {"voter_dossier": {"region": "ncr"}},
        {"political_affiliation_inference": "party_a"},
        {"individual_persuasion_scoring": True},
        {"false_election_instructions": "polling place"},
    ],
)
def test_policy_rejects_additional_prohibited_political_patterns(
    payload: dict[str, object],
) -> None:
    with pytest.raises(CampaignLabPolicyError):
        validate_campaign_policy(payload)


def test_persona_narrative_cannot_claim_a_real_respondent() -> None:
    persona = build_structured_persona(
        _cohort(), sampled_cell_key="metro_early", sample_index=1, seed=17
    )
    with pytest.raises(CampaignLabPolicyError):
        validate_persona_narrative(persona, "This is a real respondent's testimony.")


def test_campaign_lab_report_keeps_cultural_evaluation_separate_from_component_metrics() -> None:
    result = run_campaign_lab_simulation(_request())
    report = build_campaign_lab_report(
        _request(),
        result,
        cultural_evaluation={
            "status": "Human-reviewed",
            "suite_id": "philippine_language_suite",
            "supported_languages": ["english", "filipino", "taglish"],
        },
    )

    assert report.language_cultural_evaluation["status"] == "Human-reviewed"
    assert report.cohort_level_findings[0]["cohort_key"] == "metro_early"
    assert "component_rankings" in report.cohort_level_findings[0]
    assert report.emotional_response["evidence_status"] == "Synthetic-only"
    assert set(report.clarity["variants"]) == {"variant_a", "variant_b"}
    assert "risk_indicators" in report.overall_findings["variant_component_evidence"]["variant_a"]
    assert "viral_score" not in report.model_dump(mode="json")


def test_campaign_lab_report_labels_mixed_evidence_without_collapsing_metrics() -> None:
    result = run_campaign_lab_simulation(_request())
    report = build_campaign_lab_report(
        _request(),
        result,
        survey_calibration={"status": "Survey-calibrated"},
        historical_backtest={"status": "Historically backtested"},
    )

    assert report.evidence_status == "Mixed evidence"
    assert report.confidence_and_uncertainty["evidence_status"] == "Mixed evidence"


def test_campaign_lab_report_can_carry_durable_compliance_evidence() -> None:
    result = run_campaign_lab_simulation(_request())
    report = build_campaign_lab_report(
        _request(),
        result,
        compliance_review={
            "status": "approved_experimental",
            "aggregate_only": True,
            "reviewed_by": "research-lead",
        },
        human_reviewer="research-lead",
        approval_status="approved_experimental",
    )

    assert report.approval_status == "approved_experimental"
    assert report.compliance_review is not None
    assert report.compliance_review["aggregate_only"] is True
