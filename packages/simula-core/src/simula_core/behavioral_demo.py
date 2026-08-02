"""Repository-authored behavioral demo input; it represents no real population."""

from __future__ import annotations

from uuid import UUID

from simula_core.behavioral_engine import (
    AgentFleetConfiguration,
    BehavioralEngineConfiguration,
    BehavioralRunCommand,
    CohortPsychographics,
    ContextGraph,
    ContextNode,
    DeterministicTieredProvider,
    EvidenceProvenance,
    PsychographicTrait,
)
from simula_core.methodology import (
    AudienceCriterion,
    AudienceDefinitionVersion,
    DimensionValue,
    PopulationCell,
    PopulationFrameVersion,
    SamplingConfiguration,
    SourceProvenance,
)


def authored_demo_behavioral_command(
    *,
    organization_id: UUID,
    run_id: UUID,
    study_id: UUID,
    variant_key: str,
    stimulus: str,
    agent_count: int = 10,
    llm_agent_count: int = 2,
    round_count: int = 1,
    deadline_seconds: float = 30,
) -> BehavioralRunCommand:
    """Build a conspicuously fictional command for deterministic local rehearsal."""

    context_graph = ContextGraph(
        graph_id=UUID("00000000-0000-4000-8000-000000000002"),
        organization_id=organization_id,
        version=1,
        nodes=(
            ContextNode(
                node_id="audience_context",
                kind="audience_evidence",
                title="Authored context",
                content="Synthetic fixture only; represents no person.",
                provenance=EvidenceProvenance(
                    source_id="authored_fixture",
                    source_version="1",
                    owner="SIMULA repository",
                    license="Repository fixture",
                    allowed_use="Local deterministic engineering rehearsal.",
                    collected_at="Not collected.",
                    transformation="No transformation.",
                    validation_status="experimental",
                ),
            ),
        ),
        limitations=("No real market or population.",),
    )
    population = PopulationFrameVersion(
        id=UUID("00000000-0000-4000-8000-000000000003"),
        frame_id=UUID("00000000-0000-4000-8000-000000000004"),
        version=1,
        name="Authored behavioral demo frame",
        geography="Fictional",
        target_population="No real population.",
        inclusion=("Authored cohort.",),
        exclusion=("Every real person.",),
        provenance=(
            SourceProvenance(
                source_id="authored_fixture",
                source_version="1",
                owner="SIMULA repository",
                license="Repository fixture",
                allowed_uses=("Local deterministic engineering rehearsal.",),
                collection_period="Not collected.",
                sampling_frame="No human frame.",
                known_biases=("Authored.",),
                coverage_limitations=("No population coverage.",),
            ),
        ),
        cells=(
            PopulationCell(
                key="cohort_a",
                weight=1.0,
                dimensions=(DimensionValue(dimension="segment", value="a"),),
            ),
        ),
        validation_status="experimental",
        limitations=("Authored frame estimates nobody.",),
    )
    audience = AudienceDefinitionVersion(
        id=UUID("00000000-0000-4000-8000-000000000005"),
        audience_id=UUID("00000000-0000-4000-8000-000000000006"),
        version=1,
        name="Authored behavioral demo audience",
        criteria=(AudienceCriterion(dimension="segment", allowed_values=("a",)),),
        provenance_status="demo",
        limitations=("No real audience.",),
    )
    return BehavioralRunCommand(
        organization_id=organization_id,
        run_id=run_id,
        study_id=study_id,
        variant_key=variant_key,
        stimulus=stimulus,
        context_graph=context_graph,
        population=population,
        audience=audience,
        sampling_configuration=SamplingConfiguration(
            sample_size=20,
            minimum_per_cell=2,
            maximum_cells=10,
            seed=11,
            sparse_cell_threshold=2,
        ),
        psychographics=(
            CohortPsychographics(
                cohort_key="cohort_a",
                segment_key="authored_segment",
                segment_label="Authored segment",
                traits=(
                    PsychographicTrait(
                        key="risk_aversion",
                        value=0.4,
                        evidence_node_ids=("audience_context",),
                    ),
                ),
                limitations=("Authored trait; not measured.",),
            ),
        ),
        fleet_configuration=AgentFleetConfiguration(
            agent_count=agent_count,
            llm_agent_count=llm_agent_count,
            minimum_per_cohort=2,
            seed=13,
        ),
        engine_configuration=BehavioralEngineConfiguration(
            methodology_version="behavioral_engine_v1",
            round_count=round_count,
            maximum_memory_entries_per_agent=1,
            maximum_provider_calls=agent_count * round_count,
            cost_ceiling_microusd=0,
            deadline_seconds=deadline_seconds,
            seed=17,
        ),
        provider=DeterministicTieredProvider.descriptor,
    )
