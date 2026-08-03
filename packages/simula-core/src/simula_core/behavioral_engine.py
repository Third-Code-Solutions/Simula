"""Governed, replayable behavioral-engine primitives.

This independently implements the PhantomCrowd-inspired decomposition recorded
in ADR-0012. It creates synthetic agents, not fictional human respondents, and
produces experimental diagnostics, not population estimates.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Sequence
from hashlib import sha256
from math import fsum, isclose, sqrt
from time import monotonic
from typing import Annotated, Literal, Protocol, Self
from uuid import UUID, uuid5

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from simula_core.json_codec import canonical_json_dumps_bounded
from simula_core.methodology import (
    AudienceDefinitionVersion,
    AudienceSample,
    DimensionValue,
    Key,
    PopulationFrameVersion,
    ProviderUsage,
    SampledCell,
    SamplingConfiguration,
    sample_population,
)

Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
Label = Annotated[str, StringConstraints(min_length=1, max_length=120)]
ShortText = Annotated[str, StringConstraints(min_length=1, max_length=1000)]
AgentTier = Literal["llm", "rule"]
ActionKind = Literal[
    "attend",
    "resonate",
    "question",
    "reject",
    "share",
    "discuss",
    "reconsider",
    "ignore",
]
ACTION_KINDS: tuple[ActionKind, ...] = (
    "attend",
    "resonate",
    "question",
    "reject",
    "share",
    "discuss",
    "reconsider",
    "ignore",
)

SYNTHETIC_LIMITATION = (
    "Synthetic-agent diagnostic only. It is not observed human evidence or a population estimate."
)


class BehavioralRunCancelledError(RuntimeError):
    """A cooperative cancellation request stopped the synthetic run."""


class FrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


MAX_BEHAVIORAL_RESULT_BYTES = 16_000_000


def _checksum(value: object) -> str:
    return sha256(
        canonical_json_dumps_bounded(
            value,
            maximum_bytes=MAX_BEHAVIORAL_RESULT_BYTES,
        )
    ).hexdigest()


class EvidenceProvenance(FrozenModel):
    source_id: Key
    source_version: Label
    owner: Label
    license: Label
    allowed_use: ShortText
    collected_at: ShortText
    transformation: ShortText
    validation_status: Literal["experimental", "benchmarked"]


class ContextNode(FrozenModel):
    node_id: Key
    kind: Literal[
        "stimulus_fact",
        "market_context",
        "cultural_context",
        "brand_constraint",
        "audience_evidence",
    ]
    title: Label
    content: Annotated[str, StringConstraints(min_length=1, max_length=2000)]
    content_sha256: Sha256 = "0" * 64
    provenance: EvidenceProvenance

    @model_validator(mode="after")
    def content_is_bound(self) -> Self:
        expected = _checksum(self.content)
        if self.content_sha256 == "0" * 64:
            object.__setattr__(self, "content_sha256", expected)
        elif self.content_sha256 != expected:
            raise ValueError("context node content checksum mismatch")
        return self


class ContextEdge(FrozenModel):
    source_node_id: Key
    target_node_id: Key
    relationship: Literal[
        "supports",
        "qualifies",
        "contradicts",
        "constrains",
        "applies_to",
    ]
    evidence_strength: float = Field(ge=0.0, le=1.0)


class ContextGraph(FrozenModel):
    graph_id: UUID
    organization_id: UUID
    version: int = Field(ge=1)
    nodes: tuple[ContextNode, ...] = Field(min_length=1, max_length=500)
    edges: tuple[ContextEdge, ...] = Field(default=(), max_length=2000)
    checksum_sha256: Sha256 = "0" * 64
    limitations: tuple[ShortText, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def canonical_and_bound(self) -> Self:
        node_ids = tuple(node.node_id for node in self.nodes)
        if node_ids != tuple(sorted(node_ids)) or len(node_ids) != len(set(node_ids)):
            raise ValueError("context nodes must be unique and canonically ordered")
        node_set = set(node_ids)
        edge_keys = tuple(
            (edge.source_node_id, edge.target_node_id, edge.relationship) for edge in self.edges
        )
        if edge_keys != tuple(sorted(edge_keys)) or len(edge_keys) != len(set(edge_keys)):
            raise ValueError("context edges must be unique and canonically ordered")
        if any(
            edge.source_node_id not in node_set
            or edge.target_node_id not in node_set
            or edge.source_node_id == edge.target_node_id
            for edge in self.edges
        ):
            raise ValueError("context edge endpoint is invalid")
        payload = self.model_dump(mode="json", exclude={"checksum_sha256"})
        expected = _checksum(payload)
        if self.checksum_sha256 == "0" * 64:
            object.__setattr__(self, "checksum_sha256", expected)
        elif self.checksum_sha256 != expected:
            raise ValueError("context graph checksum mismatch")
        return self


class PsychographicTrait(FrozenModel):
    key: Key
    value: float = Field(ge=-1.0, le=1.0)
    evidence_node_ids: tuple[Key, ...] = Field(min_length=1, max_length=20)

    @field_validator("evidence_node_ids")
    @classmethod
    def canonical_evidence(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if value != tuple(sorted(value)) or len(value) != len(set(value)):
            raise ValueError("trait evidence must be unique and canonically ordered")
        return value


class CohortPsychographics(FrozenModel):
    cohort_key: Key
    segment_key: Key
    segment_label: Label
    traits: tuple[PsychographicTrait, ...] = Field(min_length=1, max_length=20)
    limitations: tuple[ShortText, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def canonical_traits(self) -> Self:
        keys = tuple(trait.key for trait in self.traits)
        if keys != tuple(sorted(keys)) or len(keys) != len(set(keys)):
            raise ValueError("psychographic traits must be unique and canonically ordered")
        return self


class AgentFleetConfiguration(FrozenModel):
    agent_count: int = Field(ge=10, le=2000)
    llm_agent_count: int = Field(ge=0, le=100)
    minimum_per_cohort: int = Field(default=1, ge=1, le=100)
    seed: int = Field(ge=-(2**63), le=2**63 - 1)
    network_topology: Literal["ring", "independent", "small_world", "random_bounded"] = "ring"

    @model_validator(mode="after")
    def valid_counts(self) -> Self:
        if self.llm_agent_count > self.agent_count:
            raise ValueError("LLM agent count cannot exceed total agent count")
        return self


class AgentManifest(FrozenModel):
    agent_id: UUID
    cohort_key: Key
    segment_key: Key
    tier: AgentTier
    weight: float = Field(gt=0.0, le=1.0)
    seed: int = Field(ge=0, le=2**63 - 1)
    dimensions: tuple[DimensionValue, ...]
    traits: tuple[PsychographicTrait, ...]
    synthetic_identity: Literal[True] = True


class AgentRelationship(FrozenModel):
    source_agent_id: UUID
    target_agent_id: UUID
    kind: Literal["peer"]
    strength: float = Field(gt=0.0, le=1.0)


class AgentFleet(FrozenModel):
    study_id: UUID
    configuration: AgentFleetConfiguration
    agents: tuple[AgentManifest, ...]
    relationships: tuple[AgentRelationship, ...]
    checksum_sha256: Sha256 = "0" * 64

    @model_validator(mode="after")
    def canonical_and_bound(self) -> Self:
        if len(self.agents) != self.configuration.agent_count:
            raise ValueError("agent fleet count does not match configuration")
        agent_keys = tuple(str(agent.agent_id) for agent in self.agents)
        if agent_keys != tuple(sorted(agent_keys)) or len(agent_keys) != len(set(agent_keys)):
            raise ValueError("agents must be unique and canonically ordered")
        if not isclose(fsum(agent.weight for agent in self.agents), 1.0, abs_tol=1e-9):
            raise ValueError("agent weights must sum to one")
        llm_count = sum(agent.tier == "llm" for agent in self.agents)
        if llm_count != self.configuration.llm_agent_count:
            raise ValueError("agent tier allocation does not match configuration")
        agent_ids = {agent.agent_id for agent in self.agents}
        relationship_keys = tuple(
            (str(item.source_agent_id), str(item.target_agent_id), item.kind)
            for item in self.relationships
        )
        if relationship_keys != tuple(sorted(relationship_keys)) or len(relationship_keys) != len(
            set(relationship_keys)
        ):
            raise ValueError("relationships must be unique and canonically ordered")
        if any(
            relationship.source_agent_id not in agent_ids
            or relationship.target_agent_id not in agent_ids
            or relationship.source_agent_id == relationship.target_agent_id
            for relationship in self.relationships
        ):
            raise ValueError("agent relationship endpoint is invalid")
        expected = _checksum(self.model_dump(mode="json", exclude={"checksum_sha256"}))
        if self.checksum_sha256 == "0" * 64:
            object.__setattr__(self, "checksum_sha256", expected)
        elif self.checksum_sha256 != expected:
            raise ValueError("agent fleet checksum mismatch")
        return self


def _rank(seed: int, value: str) -> bytes:
    return sha256(f"{seed}:{value}".encode()).digest()


def _allocate_agents(
    cells: Sequence[SampledCell],
    configuration: AgentFleetConfiguration,
) -> dict[str, int]:
    minimum_required = len(cells) * configuration.minimum_per_cohort
    if configuration.agent_count < minimum_required:
        raise ValueError("agent count cannot satisfy minimum per cohort")
    remaining = configuration.agent_count - minimum_required
    exact = [cell.audience_weight * remaining for cell in cells]
    extras = [int(value) for value in exact]
    remainder = remaining - sum(extras)
    order = sorted(
        range(len(cells)),
        key=lambda index: (
            -(exact[index] - extras[index]),
            _rank(configuration.seed, cells[index].key),
        ),
    )
    for index in order[:remainder]:
        extras[index] += 1
    return {
        cell.key: configuration.minimum_per_cohort + extras[index]
        for index, cell in enumerate(cells)
    }


def build_agent_fleet(
    *,
    study_id: UUID,
    sample: AudienceSample,
    psychographics: Sequence[CohortPsychographics],
    configuration: AgentFleetConfiguration,
) -> AgentFleet:
    """Build a deterministic fleet only from admitted cohort data and traits."""

    profile_by_key = {profile.cohort_key: profile for profile in psychographics}
    if len(profile_by_key) != len(psychographics) or set(profile_by_key) != {
        cell.key for cell in sample.cells
    }:
        raise ValueError("psychographic coverage must exactly match sampled cohorts")
    evidence_nodes = {
        evidence
        for profile in psychographics
        for trait in profile.traits
        for evidence in trait.evidence_node_ids
    }
    if not evidence_nodes:
        raise ValueError("psychographics require evidence")
    allocations = _allocate_agents(sample.cells, configuration)
    candidates: list[tuple[bytes, UUID, SampledCell, CohortPsychographics, int]] = []
    for cell in sample.cells:
        profile = profile_by_key[cell.key]
        for index in range(allocations[cell.key]):
            identity = uuid5(study_id, f"agent:{cell.key}:{index}")
            candidates.append(
                (
                    _rank(configuration.seed, str(identity)),
                    identity,
                    cell,
                    profile,
                    index,
                )
            )
    llm_ids = {
        identity
        for _rank_value, identity, _cell, _profile, _index in sorted(candidates)[
            : configuration.llm_agent_count
        ]
    }
    agents = []
    for _rank_value, identity, cell, profile, index in candidates:
        count = allocations[cell.key]
        seed_bytes = sha256(f"{configuration.seed}:{cell.key}:{index}".encode()).digest()[:8]
        agents.append(
            AgentManifest(
                agent_id=identity,
                cohort_key=cell.key,
                segment_key=profile.segment_key,
                tier="llm" if identity in llm_ids else "rule",
                weight=cell.audience_weight / count,
                seed=int.from_bytes(seed_bytes) % (2**63),
                dimensions=cell.dimensions,
                traits=profile.traits,
            )
        )
    agents.sort(key=lambda agent: str(agent.agent_id))
    relationships = []
    if len(agents) > 1 and configuration.network_topology != "independent":
        edge_pairs: set[tuple[int, int]] = set()
        if configuration.network_topology in {"ring", "small_world"}:
            for index in range(len(agents)):
                edge_pairs.add((index, (index + 1) % len(agents)))
                if configuration.network_topology == "small_world":
                    edge_pairs.add((index, (index + 2) % len(agents)))
        else:
            for index, agent in enumerate(agents):
                ranked_targets = sorted(
                    (
                        _rank(configuration.seed, f"{agent.agent_id}:{candidate.agent_id}"),
                        candidate_index,
                    )
                    for candidate_index, candidate in enumerate(agents)
                    if candidate_index != index
                )
                for _rank_value, candidate_index in ranked_targets[:2]:
                    edge_pairs.add((index, candidate_index))
        for source_index, target_index in sorted(edge_pairs):
            agent = agents[source_index]
            target = agents[target_index]
            strength = (
                0.25
                + (
                    int.from_bytes(
                        sha256(f"{agent.agent_id}:{target.agent_id}".encode()).digest()[:2]
                    )
                    % 751
                )
                / 1000
            )
            relationships.append(
                AgentRelationship(
                    source_agent_id=agent.agent_id,
                    target_agent_id=target.agent_id,
                    kind="peer",
                    strength=strength,
                )
            )
    relationships.sort(
        key=lambda item: (str(item.source_agent_id), str(item.target_agent_id), item.kind)
    )
    return AgentFleet(
        study_id=study_id,
        configuration=configuration,
        agents=tuple(agents),
        relationships=tuple(relationships),
    )


class BehavioralProviderDescriptor(FrozenModel):
    provider_id: Key
    provider_version: Label
    model_id: Label
    template_id: Key
    supported_tiers: tuple[AgentTier, ...]

    @field_validator("supported_tiers")
    @classmethod
    def canonical_tiers(cls, value: tuple[AgentTier, ...]) -> tuple[AgentTier, ...]:
        order = {"llm": 0, "rule": 1}
        if value != tuple(sorted(value, key=order.__getitem__)) or len(value) != len(set(value)):
            raise ValueError("provider tiers must be unique and canonically ordered")
        return value


class MemoryEntry(FrozenModel):
    sequence: int = Field(ge=1)
    round_index: int = Field(ge=1, le=50)
    actor_agent_id: UUID
    target_agent_id: UUID | None
    action: ActionKind
    valence: float = Field(ge=-1.0, le=1.0)


class AgentMemory(FrozenModel):
    agent_id: UUID
    entries: tuple[MemoryEntry, ...] = Field(max_length=32)
    run_scoped: Literal[True] = True


class CrowdPulse(FrozenModel):
    round_index: int = Field(ge=1, le=50)
    action_shares: tuple[tuple[ActionKind, float], ...]
    mean_valence: float = Field(ge=-1.0, le=1.0)
    mean_attention: float = Field(ge=0.0, le=100.0)
    mean_resonance: float = Field(ge=0.0, le=100.0)
    mean_trust: float = Field(ge=0.0, le=100.0)
    evidence_node_ids: tuple[Key, ...]
    checksum_sha256: Sha256 = "0" * 64

    @model_validator(mode="after")
    def canonical_and_bound(self) -> Self:
        if tuple(key for key, _value in self.action_shares) != ACTION_KINDS:
            raise ValueError("crowd-pulse actions must use canonical order")
        if any(value < 0.0 or value > 1.0 for _key, value in self.action_shares):
            raise ValueError("crowd-pulse action shares must be bounded")
        if not isclose(
            fsum(value for _key, value in self.action_shares),
            1.0,
            abs_tol=1e-9,
        ):
            raise ValueError("crowd-pulse action shares must sum to one")
        if self.evidence_node_ids != tuple(sorted(set(self.evidence_node_ids))):
            raise ValueError("crowd-pulse evidence must be unique and ordered")
        expected = _checksum(self.model_dump(mode="json", exclude={"checksum_sha256"}))
        if self.checksum_sha256 == "0" * 64:
            object.__setattr__(self, "checksum_sha256", expected)
        elif self.checksum_sha256 != expected:
            raise ValueError("crowd-pulse checksum mismatch")
        return self


class AgentDecisionRequest(FrozenModel):
    run_id: UUID
    round_index: int = Field(ge=1, le=50)
    stimulus: Annotated[str, StringConstraints(min_length=1, max_length=5000)]
    engine_seed: int = Field(ge=-(2**63), le=2**63 - 1)
    context_graph_checksum_sha256: Sha256
    context_node_ids: tuple[Key, ...]
    context_nodes: tuple[ContextNode, ...] = Field(min_length=1, max_length=500)
    agent: AgentManifest
    related_agent_ids: tuple[UUID, ...]
    previous_pulse: CrowdPulse | None
    memory: AgentMemory
    methodology_version: Key

    @model_validator(mode="after")
    def context_is_canonical(self) -> Self:
        if self.context_node_ids != tuple(node.node_id for node in self.context_nodes):
            raise ValueError("decision context node identifiers do not match context nodes")
        return self


class AgentDecisionResponse(FrozenModel):
    agent_id: UUID
    round_index: int = Field(ge=1, le=50)
    action: ActionKind
    target_agent_id: UUID | None
    valence: float = Field(ge=-1.0, le=1.0)
    attention: float = Field(ge=0.0, le=100.0)
    resonance: float = Field(ge=0.0, le=100.0)
    trust: float = Field(ge=0.0, le=100.0)
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_node_ids: tuple[Key, ...] = Field(min_length=1, max_length=20)
    rationale: ShortText
    rationale_is_synthetic: Literal[True] = True
    provider: BehavioralProviderDescriptor
    usage: ProviderUsage

    @field_validator("evidence_node_ids")
    @classmethod
    def canonical_evidence(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if value != tuple(sorted(value)) or len(value) != len(set(value)):
            raise ValueError("decision evidence must be unique and ordered")
        return value

    @model_validator(mode="after")
    def target_matches_action(self) -> Self:
        if (self.action == "discuss") != (self.target_agent_id is not None):
            raise ValueError("only discuss actions require a target agent")
        return self


class BehavioralDecisionProvider(Protocol):
    @property
    def descriptor(self) -> BehavioralProviderDescriptor: ...

    def decide(self, request: AgentDecisionRequest) -> AgentDecisionResponse: ...


class DeterministicTieredProvider(BehavioralDecisionProvider):
    """Zero-cost seeded provider for engine invariants and replay proof."""

    descriptor = BehavioralProviderDescriptor(
        provider_id="deterministic_tiered",
        provider_version="1",
        model_id="deterministic_behavior_fixture_v1",
        template_id="behavioral_action_v1",
        supported_tiers=("llm", "rule"),
    )

    def decide(self, request: AgentDecisionRequest) -> AgentDecisionResponse:
        digest = sha256(
            canonical_json_dumps_bounded(
                request.model_dump(mode="json"),
                maximum_bytes=MAX_BEHAVIORAL_RESULT_BYTES,
            )
        ).digest()
        action = ACTION_KINDS[digest[0] % len(ACTION_KINDS)]
        if action == "discuss" and not request.related_agent_ids:
            action = "question"
        target = (
            request.related_agent_ids[0]
            if action == "discuss" and request.related_agent_ids
            else None
        )
        evidence = request.context_node_ids[digest[1] % len(request.context_node_ids)]
        return AgentDecisionResponse(
            agent_id=request.agent.agent_id,
            round_index=request.round_index,
            action=action,
            target_agent_id=target,
            valence=(digest[2] / 255) * 2 - 1,
            attention=float(20 + digest[3] % 81),
            resonance=float(20 + digest[4] % 81),
            trust=float(20 + digest[5] % 81),
            confidence=0.5 + (digest[6] / 510),
            evidence_node_ids=(evidence,),
            rationale=(
                "Deterministic synthetic-agent fixture; use only to verify engine "
                "replay and interaction invariants."
            ),
            provider=self.descriptor,
            usage=ProviderUsage(
                input_tokens=0,
                output_tokens=0,
                cost_microusd=0,
            ),
        )


class AgentActionEvent(FrozenModel):
    event_id: UUID
    sequence: int = Field(ge=1)
    action_timestamp_ms: int = Field(ge=0)
    run_id: UUID
    round_index: int = Field(ge=1, le=50)
    agent_id: UUID
    cohort_key: Key
    segment_key: Key
    tier: AgentTier
    weight: float = Field(gt=0.0, le=1.0)
    action: ActionKind
    target_agent_id: UUID | None
    valence: float = Field(ge=-1.0, le=1.0)
    attention: float = Field(ge=0.0, le=100.0)
    resonance: float = Field(ge=0.0, le=100.0)
    trust: float = Field(ge=0.0, le=100.0)
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_node_ids: tuple[Key, ...]
    synthetic_rationale: ShortText
    provider: BehavioralProviderDescriptor


def replay_crowd_pulse(
    round_index: int,
    actions: Sequence[AgentActionEvent],
) -> CrowdPulse:
    if not actions or any(action.round_index != round_index for action in actions):
        raise ValueError("crowd pulse requires one nonempty exact round")
    total_weight = fsum(action.weight for action in actions)
    if not isclose(total_weight, 1.0, abs_tol=1e-9):
        raise ValueError("round action weights must sum to one")
    shares = tuple(
        (
            kind,
            fsum(action.weight for action in actions if action.action == kind),
        )
        for kind in ACTION_KINDS
    )
    normalized = list(shares)
    normalized[-1] = (
        normalized[-1][0],
        1.0 - fsum(value for _kind, value in normalized[:-1]),
    )
    return CrowdPulse(
        round_index=round_index,
        action_shares=tuple(normalized),
        mean_valence=fsum(action.weight * action.valence for action in actions),
        mean_attention=fsum(action.weight * action.attention for action in actions),
        mean_resonance=fsum(action.weight * action.resonance for action in actions),
        mean_trust=fsum(action.weight * action.trust for action in actions),
        evidence_node_ids=tuple(
            sorted({node_id for action in actions for node_id in action.evidence_node_ids})
        ),
    )


class InteractionRound(FrozenModel):
    round_index: int = Field(ge=1, le=50)
    actions: tuple[AgentActionEvent, ...]
    pulse: CrowdPulse
    checksum_sha256: Sha256 = "0" * 64

    @model_validator(mode="after")
    def replayable(self) -> Self:
        if tuple(str(action.agent_id) for action in self.actions) != tuple(
            sorted(str(action.agent_id) for action in self.actions)
        ):
            raise ValueError("round actions must use canonical agent order")
        replayed = replay_crowd_pulse(self.round_index, self.actions)
        if replayed != self.pulse:
            raise ValueError("crowd pulse does not replay from action events")
        expected = _checksum(self.model_dump(mode="json", exclude={"checksum_sha256"}))
        if self.checksum_sha256 == "0" * 64:
            object.__setattr__(self, "checksum_sha256", expected)
        elif self.checksum_sha256 != expected:
            raise ValueError("interaction round checksum mismatch")
        return self


class BehavioralEngineConfiguration(FrozenModel):
    methodology_version: Key
    round_count: int = Field(ge=1, le=50)
    maximum_memory_entries_per_agent: int = Field(ge=0, le=32)
    maximum_provider_calls: int = Field(ge=1, le=100_000)
    cost_ceiling_microusd: int = Field(ge=0, le=100_000_000)
    deadline_seconds: float = Field(gt=0.0, le=300.0)
    seed: int = Field(ge=-(2**63), le=2**63 - 1)


class BehavioralRunCommand(FrozenModel):
    schema_version: Literal[1] = 1
    organization_id: UUID
    run_id: UUID
    study_id: UUID
    variant_key: Key
    stimulus: Annotated[str, StringConstraints(min_length=1, max_length=5000)]
    context_graph: ContextGraph
    population: PopulationFrameVersion
    audience: AudienceDefinitionVersion
    sampling_configuration: SamplingConfiguration
    psychographics: tuple[CohortPsychographics, ...] = Field(min_length=1, max_length=500)
    fleet_configuration: AgentFleetConfiguration
    engine_configuration: BehavioralEngineConfiguration
    provider: BehavioralProviderDescriptor

    @model_validator(mode="after")
    def organization_is_bound(self) -> Self:
        if self.context_graph.organization_id != self.organization_id:
            raise ValueError("context graph does not belong to the command organization")
        return self


class BehavioralFinding(FrozenModel):
    finding_id: Key
    output_type: Literal["heuristic", "qualitative", "recommendation"]
    title: Label
    detail: ShortText
    evidence_event_ids: tuple[UUID, ...] = Field(min_length=1, max_length=100)


class BehavioralScore(FrozenModel):
    key: Literal["attention", "resonance", "trust"]
    score_type: Literal["heuristic"] = "heuristic"
    value: float = Field(ge=0.0, le=100.0)
    unit: Literal["synthetic_points"] = "synthetic_points"
    method: Literal["weighted_synthetic_agent_mean"] = "weighted_synthetic_agent_mean"
    evidence_event_ids: tuple[UUID, ...] = Field(min_length=1, max_length=2000)


class SyntheticUncertainty(FrozenModel):
    uncertainty_type: Literal["synthetic_agent_dispersion_not_population_uncertainty"] = (
        "synthetic_agent_dispersion_not_population_uncertainty"
    )
    effective_agent_count: float = Field(ge=1.0)
    attention_weighted_standard_deviation: float = Field(ge=0.0, le=100.0)
    resonance_weighted_standard_deviation: float = Field(ge=0.0, le=100.0)
    trust_weighted_standard_deviation: float = Field(ge=0.0, le=100.0)
    limitations: tuple[ShortText, ...] = (
        "Dispersion describes this frozen synthetic fleet only; it is not sampling error, "
        "formal population inference, or population uncertainty.",
    )


class NarrativeSynthesis(FrozenModel):
    output_type: Literal["qualitative"] = "qualitative"
    claim_scope: Literal["synthetic_agent_explanation"] = "synthetic_agent_explanation"
    summary: ShortText
    evidence_finding_ids: tuple[Key, ...] = Field(min_length=1, max_length=50)
    limitations: tuple[ShortText, ...] = Field(min_length=1)


class BehavioralReport(FrozenModel):
    action_shares: tuple[tuple[ActionKind, float], ...]
    mean_attention: float = Field(ge=0.0, le=100.0)
    mean_resonance: float = Field(ge=0.0, le=100.0)
    mean_trust: float = Field(ge=0.0, le=100.0)
    scores: tuple[BehavioralScore, BehavioralScore, BehavioralScore]
    uncertainty: SyntheticUncertainty
    findings: tuple[BehavioralFinding, ...]
    synthesis: NarrativeSynthesis
    validation_label: Literal["experimental"] = "experimental"
    limitations: tuple[ShortText, ...] = (SYNTHETIC_LIMITATION,)

    @model_validator(mode="after")
    def typed_scores_match_aggregates(self) -> Self:
        if tuple(key for key, _value in self.action_shares) != ACTION_KINDS:
            raise ValueError("behavioral report actions must use canonical order")
        if any(value < 0.0 or value > 1.0 for _key, value in self.action_shares):
            raise ValueError("behavioral report action shares must be bounded")
        if not isclose(
            fsum(value for _key, value in self.action_shares),
            1.0,
            abs_tol=1e-9,
        ):
            raise ValueError("behavioral report action shares must sum to one")
        expected = (
            ("attention", self.mean_attention),
            ("resonance", self.mean_resonance),
            ("trust", self.mean_trust),
        )
        actual = tuple((score.key, score.value) for score in self.scores)
        if actual != expected:
            raise ValueError("typed behavioral scores do not match report aggregates")
        if self.synthesis.evidence_finding_ids != tuple(
            finding.finding_id for finding in self.findings
        ):
            raise ValueError("narrative synthesis evidence binding is invalid")
        return self


class NarrativeSynthesizer(Protocol):
    def synthesize(
        self,
        *,
        findings: tuple[BehavioralFinding, ...],
        final_pulse: CrowdPulse,
    ) -> NarrativeSynthesis: ...


class DeterministicNarrativeSynthesizer(NarrativeSynthesizer):
    def synthesize(
        self,
        *,
        findings: tuple[BehavioralFinding, ...],
        final_pulse: CrowdPulse,
    ) -> NarrativeSynthesis:
        del final_pulse
        return NarrativeSynthesis(
            summary=(
                "Synthetic agents produced a replayable mix of attention, "
                "resonance, questions, and rejection. Review the linked event "
                "evidence and validate decisions with human research."
            ),
            evidence_finding_ids=tuple(finding.finding_id for finding in findings),
            limitations=(SYNTHETIC_LIMITATION,),
        )


def _report(
    rounds: Sequence[InteractionRound],
    synthesizer: NarrativeSynthesizer,
) -> BehavioralReport:
    final = rounds[-1].pulse
    actions = rounds[-1].actions
    strongest = tuple(
        action.event_id
        for action in sorted(actions, key=lambda item: (-item.resonance, str(item.event_id)))[:10]
    )
    concerns = tuple(
        action.event_id
        for action in sorted(actions, key=lambda item: (item.trust, str(item.event_id)))[:10]
    )
    findings = (
        BehavioralFinding(
            finding_id="resonance_signal",
            output_type="heuristic",
            title="Synthetic resonance signal",
            detail="Highest synthetic resonance actions in the final interaction round.",
            evidence_event_ids=strongest,
        ),
        BehavioralFinding(
            finding_id="trust_review",
            output_type="recommendation",
            title="Review low-trust reactions",
            detail="Inspect the lowest synthetic trust actions before refining the stimulus.",
            evidence_event_ids=concerns,
        ),
    )
    synthesis = synthesizer.synthesize(findings=findings, final_pulse=final)
    finding_ids = tuple(finding.finding_id for finding in findings)
    if synthesis.evidence_finding_ids != finding_ids:
        raise ValueError("narrative synthesis evidence binding is invalid")
    event_ids = tuple(action.event_id for action in actions)
    effective_agent_count = 1.0 / fsum(action.weight**2 for action in actions)

    def weighted_standard_deviation(
        field: Literal["attention", "resonance", "trust"],
        mean: float,
    ) -> float:
        return sqrt(
            max(
                0.0,
                fsum(action.weight * (getattr(action, field) - mean) ** 2 for action in actions),
            )
        )

    return BehavioralReport(
        action_shares=final.action_shares,
        mean_attention=final.mean_attention,
        mean_resonance=final.mean_resonance,
        mean_trust=final.mean_trust,
        scores=(
            BehavioralScore(
                key="attention",
                value=final.mean_attention,
                evidence_event_ids=event_ids,
            ),
            BehavioralScore(
                key="resonance",
                value=final.mean_resonance,
                evidence_event_ids=event_ids,
            ),
            BehavioralScore(
                key="trust",
                value=final.mean_trust,
                evidence_event_ids=event_ids,
            ),
        ),
        uncertainty=SyntheticUncertainty(
            effective_agent_count=effective_agent_count,
            attention_weighted_standard_deviation=weighted_standard_deviation(
                "attention", final.mean_attention
            ),
            resonance_weighted_standard_deviation=weighted_standard_deviation(
                "resonance", final.mean_resonance
            ),
            trust_weighted_standard_deviation=weighted_standard_deviation(
                "trust", final.mean_trust
            ),
        ),
        findings=findings,
        synthesis=synthesis,
    )


class BehavioralRunReceipt(FrozenModel):
    methodology_version: Key
    context_graph_checksum_sha256: Sha256
    agent_fleet_checksum_sha256: Sha256
    input_sha256: Sha256
    stimulus_sha256: Sha256
    output_sha256: Sha256
    provider: BehavioralProviderDescriptor
    provider_calls: int = Field(ge=1)
    usage: ProviderUsage
    seed: int


class BehavioralRunResult(FrozenModel):
    schema_version: Literal[1] = 1
    run_id: UUID
    study_id: UUID
    variant_key: Key
    context_graph: ContextGraph
    fleet: AgentFleet
    configuration: BehavioralEngineConfiguration
    rounds: tuple[InteractionRound, ...]
    memory: tuple[AgentMemory, ...]
    report: BehavioralReport
    receipt: BehavioralRunReceipt

    @model_validator(mode="after")
    def receipt_replays(self) -> Self:
        if (
            self.receipt.methodology_version != self.configuration.methodology_version
            or self.receipt.context_graph_checksum_sha256 != self.context_graph.checksum_sha256
            or self.receipt.agent_fleet_checksum_sha256 != self.fleet.checksum_sha256
            or self.receipt.seed != self.configuration.seed
            or self.receipt.provider_calls
            != len(self.fleet.agents) * self.configuration.round_count
        ):
            raise ValueError("behavioral run receipt binding is invalid")
        if tuple(interaction_round.round_index for interaction_round in self.rounds) != tuple(
            range(1, self.configuration.round_count + 1)
        ):
            raise ValueError("behavioral run rounds do not match configuration")
        if tuple(memory.agent_id for memory in self.memory) != tuple(
            agent.agent_id for agent in self.fleet.agents
        ):
            raise ValueError("behavioral run memory does not match the agent fleet")
        if any(
            action.provider != self.receipt.provider
            for interaction_round in self.rounds
            for action in interaction_round.actions
        ):
            raise ValueError("behavioral run provider receipt is inconsistent")
        input_payload = {
            "configuration": self.configuration.model_dump(mode="json"),
            "context_graph_checksum_sha256": self.context_graph.checksum_sha256,
            "fleet_checksum_sha256": self.fleet.checksum_sha256,
            "run_id": str(self.run_id),
            "stimulus_sha256": self.receipt.stimulus_sha256,
            "study_id": str(self.study_id),
            "variant_key": self.variant_key,
        }
        output_payload = {
            "memory": [item.model_dump(mode="json") for item in self.memory],
            "report": self.report.model_dump(mode="json"),
            "rounds": [item.model_dump(mode="json") for item in self.rounds],
        }
        if self.receipt.input_sha256 != _checksum(
            input_payload
        ) or self.receipt.output_sha256 != _checksum(output_payload):
            raise ValueError("behavioral run checksum receipt does not replay")
        return self


class BehavioralEngine:
    def __init__(
        self,
        provider: BehavioralDecisionProvider,
        synthesizer: NarrativeSynthesizer,
        *,
        monotonic_seconds: Callable[[], float] = monotonic,
    ) -> None:
        self.provider = provider
        self.synthesizer = synthesizer
        self.monotonic_seconds = monotonic_seconds

    def run(
        self,
        *,
        run_id: UUID,
        study_id: UUID,
        variant_key: Key,
        stimulus: str,
        context_graph: ContextGraph,
        fleet: AgentFleet,
        configuration: BehavioralEngineConfiguration,
        should_cancel: Callable[[], bool] = lambda: False,
    ) -> BehavioralRunResult:
        if fleet.study_id != study_id:
            raise ValueError("agent fleet does not belong to the matched study")
        graph_evidence = {node.node_id for node in context_graph.nodes}
        trait_evidence = {
            evidence_node_id
            for agent in fleet.agents
            for trait in agent.traits
            for evidence_node_id in trait.evidence_node_ids
        }
        if not trait_evidence.issubset(graph_evidence):
            raise ValueError("agent trait evidence is not bound to the context graph")
        if not {agent.tier for agent in fleet.agents}.issubset(
            set(self.provider.descriptor.supported_tiers)
        ):
            raise ValueError("provider does not support the complete agent fleet")
        expected_calls = len(fleet.agents) * configuration.round_count
        if expected_calls > configuration.maximum_provider_calls:
            raise ValueError("provider call ceiling cannot cover the configured run")
        input_payload = {
            "configuration": configuration.model_dump(mode="json"),
            "context_graph_checksum_sha256": context_graph.checksum_sha256,
            "fleet_checksum_sha256": fleet.checksum_sha256,
            "run_id": str(run_id),
            "stimulus_sha256": _checksum(stimulus),
            "study_id": str(study_id),
            "variant_key": variant_key,
        }
        started_at = self.monotonic_seconds()
        node_ids = tuple(node.node_id for node in context_graph.nodes)
        relationship_targets: dict[UUID, list[UUID]] = defaultdict(list)
        for relationship in fleet.relationships:
            relationship_targets[relationship.source_agent_id].append(relationship.target_agent_id)
        memory_by_agent: dict[UUID, list[MemoryEntry]] = {
            agent.agent_id: [] for agent in fleet.agents
        }
        rounds: list[InteractionRound] = []
        previous_pulse: CrowdPulse | None = None
        total_input_tokens = 0
        total_output_tokens = 0
        total_cost = 0
        sequence = 0
        for round_index in range(1, configuration.round_count + 1):
            actions = []
            for agent in fleet.agents:
                if should_cancel():
                    raise BehavioralRunCancelledError("behavioral run was cancelled")
                if self.monotonic_seconds() - started_at >= configuration.deadline_seconds:
                    raise TimeoutError("behavioral engine deadline exceeded")
                response = self.provider.decide(
                    AgentDecisionRequest(
                        run_id=run_id,
                        round_index=round_index,
                        stimulus=stimulus,
                        engine_seed=configuration.seed,
                        context_graph_checksum_sha256=context_graph.checksum_sha256,
                        context_node_ids=node_ids,
                        context_nodes=context_graph.nodes,
                        agent=agent,
                        related_agent_ids=tuple(
                            sorted(relationship_targets[agent.agent_id], key=str)
                        ),
                        previous_pulse=previous_pulse,
                        memory=AgentMemory(
                            agent_id=agent.agent_id,
                            entries=tuple(memory_by_agent[agent.agent_id]),
                        ),
                        methodology_version=configuration.methodology_version,
                    )
                )
                if should_cancel():
                    raise BehavioralRunCancelledError("behavioral run was cancelled")
                if self.monotonic_seconds() - started_at >= configuration.deadline_seconds:
                    raise TimeoutError("behavioral engine deadline exceeded")
                if (
                    response.agent_id != agent.agent_id
                    or response.round_index != round_index
                    or response.provider != self.provider.descriptor
                    or agent.tier not in response.provider.supported_tiers
                    or not set(response.evidence_node_ids).issubset(graph_evidence)
                    or (
                        response.target_agent_id is not None
                        and response.target_agent_id not in relationship_targets[agent.agent_id]
                    )
                ):
                    raise ValueError("provider response binding is invalid")
                total_input_tokens += response.usage.input_tokens
                total_output_tokens += response.usage.output_tokens
                total_cost += response.usage.cost_microusd
                if total_cost > configuration.cost_ceiling_microusd:
                    raise ValueError("behavioral provider cost ceiling exceeded")
                sequence += 1
                event = AgentActionEvent(
                    event_id=uuid5(run_id, f"action:{round_index}:{agent.agent_id}"),
                    sequence=sequence,
                    # Logical timestamps preserve byte-reproducible replay. Wall-clock
                    # execution timestamps live on the durable run and attempt records.
                    action_timestamp_ms=(round_index - 1) * 1000 + sequence,
                    run_id=run_id,
                    round_index=round_index,
                    agent_id=agent.agent_id,
                    cohort_key=agent.cohort_key,
                    segment_key=agent.segment_key,
                    tier=agent.tier,
                    weight=agent.weight,
                    action=response.action,
                    target_agent_id=response.target_agent_id,
                    valence=response.valence,
                    attention=response.attention,
                    resonance=response.resonance,
                    trust=response.trust,
                    confidence=response.confidence,
                    evidence_node_ids=response.evidence_node_ids,
                    synthetic_rationale=response.rationale,
                    provider=response.provider,
                )
                actions.append(event)
                if configuration.maximum_memory_entries_per_agent > 0:
                    entry = MemoryEntry(
                        sequence=sequence,
                        round_index=round_index,
                        actor_agent_id=agent.agent_id,
                        target_agent_id=response.target_agent_id,
                        action=response.action,
                        valence=response.valence,
                    )
                    own_memory = memory_by_agent[agent.agent_id]
                    own_memory.append(entry)
                    del own_memory[
                        : max(
                            0,
                            len(own_memory) - configuration.maximum_memory_entries_per_agent,
                        )
                    ]
                    if response.target_agent_id is not None:
                        target_memory = memory_by_agent[response.target_agent_id]
                        target_memory.append(entry)
                        del target_memory[
                            : max(
                                0,
                                len(target_memory) - configuration.maximum_memory_entries_per_agent,
                            )
                        ]
            pulse = replay_crowd_pulse(round_index, actions)
            interaction_round = InteractionRound(
                round_index=round_index,
                actions=tuple(actions),
                pulse=pulse,
            )
            rounds.append(interaction_round)
            previous_pulse = pulse
        memory = tuple(
            AgentMemory(
                agent_id=agent.agent_id,
                entries=tuple(memory_by_agent[agent.agent_id]),
            )
            for agent in fleet.agents
        )
        report = _report(rounds, self.synthesizer)
        output_payload = {
            "memory": [item.model_dump(mode="json") for item in memory],
            "report": report.model_dump(mode="json"),
            "rounds": [item.model_dump(mode="json") for item in rounds],
        }
        receipt = BehavioralRunReceipt(
            methodology_version=configuration.methodology_version,
            context_graph_checksum_sha256=context_graph.checksum_sha256,
            agent_fleet_checksum_sha256=fleet.checksum_sha256,
            input_sha256=_checksum(input_payload),
            stimulus_sha256=_checksum(stimulus),
            output_sha256=_checksum(output_payload),
            provider=self.provider.descriptor,
            provider_calls=expected_calls,
            usage=ProviderUsage(
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                cost_microusd=total_cost,
            ),
            seed=configuration.seed,
        )
        return BehavioralRunResult(
            run_id=run_id,
            study_id=study_id,
            variant_key=variant_key,
            context_graph=context_graph,
            fleet=fleet,
            configuration=configuration,
            rounds=tuple(rounds),
            memory=memory,
            report=report,
            receipt=receipt,
        )


def execute_behavioral_run(
    command: BehavioralRunCommand,
    *,
    provider: BehavioralDecisionProvider,
    synthesizer: NarrativeSynthesizer,
    monotonic_seconds: Callable[[], float] = monotonic,
    should_cancel: Callable[[], bool] = lambda: False,
) -> BehavioralRunResult:
    """Execute one explicit, provider-bound command without a fallback path."""

    if provider.descriptor != command.provider:
        raise ValueError("behavioral provider is not admitted for this command")
    sample = sample_population(
        command.population,
        command.audience,
        command.sampling_configuration,
    )
    fleet = build_agent_fleet(
        study_id=command.study_id,
        sample=sample,
        psychographics=command.psychographics,
        configuration=command.fleet_configuration,
    )
    return BehavioralEngine(
        provider,
        synthesizer,
        monotonic_seconds=monotonic_seconds,
    ).run(
        run_id=command.run_id,
        study_id=command.study_id,
        variant_key=command.variant_key,
        stimulus=command.stimulus,
        context_graph=command.context_graph,
        fleet=fleet,
        configuration=command.engine_configuration,
        should_cancel=should_cancel,
    )


class SyntheticInterview(FrozenModel):
    agent_id: UUID
    label: Literal["synthetic_agent_explanation"] = "synthetic_agent_explanation"
    question: ShortText
    answer: ShortText
    evidence_event_ids: tuple[UUID, ...] = Field(min_length=1)
    limitations: tuple[ShortText, ...] = (SYNTHETIC_LIMITATION,)


def synthetic_interview(
    result: BehavioralRunResult,
    *,
    agent_id: UUID,
    question: ShortText,
) -> SyntheticInterview:
    actions = [
        action
        for interaction_round in result.rounds
        for action in interaction_round.actions
        if action.agent_id == agent_id
    ]
    if not actions:
        raise ValueError("synthetic interview agent is not part of the run")
    latest = actions[-1]
    return SyntheticInterview(
        agent_id=agent_id,
        question=question,
        answer=(
            f"This synthetic agent last chose '{latest.action}' with an experimental "
            "reaction generated from the frozen context and fleet. It is not a "
            "quotation or testimony from a person."
        ),
        evidence_event_ids=tuple(action.event_id for action in actions),
    )


class MetricDelta(FrozenModel):
    key: Literal["attention", "resonance", "trust"]
    candidate_minus_baseline: float = Field(ge=-100.0, le=100.0)


class ActionShareDelta(FrozenModel):
    key: ActionKind
    candidate_minus_baseline: float = Field(ge=-1.0, le=1.0)


class MatchedVariantComparison(FrozenModel):
    study_id: UUID
    baseline_run_id: UUID
    candidate_run_id: UUID
    paired_agents: int = Field(ge=1)
    metric_deltas: tuple[MetricDelta, MetricDelta, MetricDelta]
    action_share_deltas: tuple[
        ActionShareDelta,
        ActionShareDelta,
        ActionShareDelta,
        ActionShareDelta,
        ActionShareDelta,
        ActionShareDelta,
        ActionShareDelta,
        ActionShareDelta,
    ]
    interpretation: Literal["experimental_matched_synthetic_difference"] = (
        "experimental_matched_synthetic_difference"
    )
    winner: None = None
    limitations: tuple[ShortText, ...] = (
        "No variant winner, lift, causal effect, or human preference is established.",
        SYNTHETIC_LIMITATION,
    )


def compare_matched_variants(
    baseline: BehavioralRunResult,
    candidate: BehavioralRunResult,
) -> MatchedVariantComparison:
    if (
        baseline.study_id != candidate.study_id
        or baseline.fleet.checksum_sha256 != candidate.fleet.checksum_sha256
        or baseline.context_graph.checksum_sha256 != candidate.context_graph.checksum_sha256
        or baseline.configuration != candidate.configuration
        or baseline.variant_key == candidate.variant_key
        or baseline.run_id == candidate.run_id
    ):
        raise ValueError("variant runs do not share one frozen matched design")
    baseline_actions = {action.agent_id: action for action in baseline.rounds[-1].actions}
    candidate_actions = {action.agent_id: action for action in candidate.rounds[-1].actions}
    if set(baseline_actions) != set(candidate_actions):
        raise ValueError("variant runs do not cover identical agents")
    weights = {agent.agent_id: agent.weight for agent in baseline.fleet.agents}

    def delta(field: Literal["attention", "resonance", "trust"]) -> float:
        return fsum(
            weights[agent_id]
            * (
                getattr(candidate_actions[agent_id], field)
                - getattr(baseline_actions[agent_id], field)
            )
            for agent_id in weights
        )

    baseline_shares = dict(baseline.report.action_shares)
    candidate_shares = dict(candidate.report.action_shares)
    return MatchedVariantComparison(
        study_id=baseline.study_id,
        baseline_run_id=baseline.run_id,
        candidate_run_id=candidate.run_id,
        paired_agents=len(weights),
        metric_deltas=(
            MetricDelta(
                key="attention",
                candidate_minus_baseline=delta("attention"),
            ),
            MetricDelta(
                key="resonance",
                candidate_minus_baseline=delta("resonance"),
            ),
            MetricDelta(
                key="trust",
                candidate_minus_baseline=delta("trust"),
            ),
        ),
        action_share_deltas=tuple(  # type: ignore[arg-type]
            ActionShareDelta(
                key=kind,
                candidate_minus_baseline=candidate_shares[kind] - baseline_shares[kind],
            )
            for kind in ACTION_KINDS
        ),
    )
