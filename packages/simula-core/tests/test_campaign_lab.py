from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest
from simula_core.campaign_lab import (
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
    validate_campaign_policy,
    validate_persona_narrative,
)
from simula_core.methodology import DimensionValue
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
    assert result.reproducibility_checksum_sha256 != "0" * 64
    assert "viral_score" not in result.model_dump(mode="json")


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


def test_policy_rejects_individual_persuasion_and_compliance_fails_closed() -> None:
    with pytest.raises(CampaignLabPolicyError):
        validate_campaign_policy({"persuadability": "high"})

    review = build_compliance_review(
        review_id=UUID("30000000-0000-4000-8000-000000000104"),
        payload={"voter_suppression": True},
    )
    assert review.status == "blocked"
    assert review.aggregate_only is False


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
    assert "viral_score" not in report.model_dump(mode="json")
