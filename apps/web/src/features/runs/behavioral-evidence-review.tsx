import type { BehavioralEvidence } from "./behavioral-evidence-contract";

function label(value: string): string {
  return value.replaceAll("_", " ");
}

export function BehavioralEvidenceReview({
  evidence,
}: Readonly<{ evidence: BehavioralEvidence }>) {
  const graph = evidence.context_graph;

  return (
    <section
      aria-labelledby="behavioral-evidence-title"
      className="behavioral-evidence-section"
    >
      <div className="result-heading">
        <div>
          <p className="eyebrow">Inspect the basis</p>
          <h2 id="behavioral-evidence-title">Context and evidence review</h2>
        </div>
        <span className="trust-label">Event content stays private</span>
      </div>
      <p className="lede result-disclosure">
        These are authored or admitted context records used by synthetic agents.
        Event IDs prove traceability; they are not participant responses.
      </p>

      <section aria-labelledby="behavioral-fleet-title">
        <div className="result-heading">
          <div>
            <p className="eyebrow">Synthetic fleet</p>
            <h3 id="behavioral-fleet-title">Who was simulated</h3>
          </div>
          <span className="trust-label">Synthetic identities only</span>
        </div>
        <dl className="behavioral-fleet-grid">
          <div>
            <dt>Agents</dt>
            <dd>{evidence.fleet_summary.agent_count}</dd>
          </div>
          <div>
            <dt>Rule agents</dt>
            <dd>{evidence.fleet_summary.rule_agent_count}</dd>
          </div>
          <div>
            <dt>LLM-tier agents</dt>
            <dd>{evidence.fleet_summary.llm_agent_count}</dd>
          </div>
          <div>
            <dt>Cohorts</dt>
            <dd>{evidence.fleet_summary.cohort_count}</dd>
          </div>
          <div>
            <dt>Relationships</dt>
            <dd>{evidence.fleet_summary.relationship_count}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="behavioral-timeline-title"
        className="panel result-panel"
        tabIndex={0}
      >
        <div className="result-heading">
          <div>
            <p className="eyebrow">Replayable rounds</p>
            <h3 id="behavioral-timeline-title">Interaction timeline</h3>
          </div>
          <span className="trust-label">{evidence.rounds.length} rounds</span>
        </div>
        <table>
          <caption>
            Aggregate synthetic actions and pressure-test signals by round.
          </caption>
          <thead>
            <tr>
              <th scope="col">Round</th>
              <th scope="col">Actions</th>
              <th scope="col">Attention</th>
              <th scope="col">Resonance</th>
              <th scope="col">Trust</th>
              <th scope="col">Leading action</th>
            </tr>
          </thead>
          <tbody>
            {evidence.rounds.map((round) => {
              const leadingAction = round.action_shares.reduce(
                (leading, candidate) =>
                  candidate[1] > leading[1] ? candidate : leading,
              );
              return (
                <tr key={round.round_index}>
                  <th scope="row">{round.round_index}</th>
                  <td>{round.event_count}</td>
                  <td>{round.mean_attention.toFixed(1)}</td>
                  <td>{round.mean_resonance.toFixed(1)}</td>
                  <td>{round.mean_trust.toFixed(1)}</td>
                  <td>
                    {label(leadingAction[0])}{" "}
                    <span className="resource-meta">
                      {(leadingAction[1] * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="synthetic-interviews-title">
        <div className="result-heading">
          <div>
            <p className="eyebrow">Bounded replay</p>
            <h3 id="synthetic-interviews-title">Synthetic interviews</h3>
          </div>
          <span className="trust-label">Not testimony</span>
        </div>
        <p className="field-note">
          Each response is a fixed summary of recorded synthetic actions. SIMULA
          does not invent a quote, motive, or participant statement.
        </p>
        <div className="synthetic-interview-grid">
          {evidence.synthetic_interviews.map((interview) => (
            <details
              className="synthetic-interview-card"
              key={interview.synthetic_agent_id}
            >
              <summary>
                Agent {interview.synthetic_agent_id.slice(-6)} ·{" "}
                {interview.tier} tier
              </summary>
              <p className="eyebrow">Fixed prompt</p>
              <p>{interview.prompt}</p>
              <p>{interview.response_summary}</p>
              <p className="field-note">{interview.disclosure}</p>
              <p className="resource-meta">
                {interview.round_count} rounds · final action{" "}
                {label(interview.latest_action)}
              </p>
            </details>
          ))}
        </div>
      </section>

      <div className="behavioral-context-list">
        {graph.nodes.map((node) => (
          <article className="panel behavioral-context-card" key={node.node_id}>
            <p className="eyebrow">{label(node.kind)}</p>
            <h3>{node.title}</h3>
            <p>{node.content}</p>
            <dl className="compact-definition-list">
              <div>
                <dt>Source</dt>
                <dd>
                  {node.provenance.source_id} · {node.provenance.source_version}
                </dd>
              </div>
              <div>
                <dt>Owner / license</dt>
                <dd>
                  {node.provenance.owner} · {node.provenance.license}
                </dd>
              </div>
              <div>
                <dt>Allowed use</dt>
                <dd>{node.provenance.allowed_use}</dd>
              </div>
              <div>
                <dt>Validation</dt>
                <dd>{node.provenance.validation_status}</dd>
              </div>
            </dl>
            <p className="resource-meta">
              Content SHA-256: <code>{node.content_sha256}</code>
            </p>
          </article>
        ))}
      </div>

      <div className="result-grid">
        <section className="panel result-panel">
          <h3>Context relationships</h3>
          {graph.edges.length === 0 ? (
            <p className="field-note">
              No explicit relationship edges were recorded for this graph.
            </p>
          ) : (
            <table>
              <caption>Directed relationships between context nodes.</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Relationship</th>
                  <th scope="col">Target</th>
                  <th scope="col">Strength</th>
                </tr>
              </thead>
              <tbody>
                {graph.edges.map((edge) => (
                  <tr
                    key={`${edge.source_node_id}:${edge.target_node_id}:${edge.relationship}`}
                  >
                    <td>{edge.source_node_id}</td>
                    <td>{label(edge.relationship)}</td>
                    <td>{edge.target_node_id}</td>
                    <td>{edge.evidence_strength.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel result-panel">
          <h3>Report trace summary</h3>
          {evidence.evidence_summary.length === 0 ? (
            <p className="field-note">
              No public trace groups are available. SIMULA will not infer them.
            </p>
          ) : (
            <table>
              <caption>
                Bounded references to private synthetic action events.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Output</th>
                  <th scope="col">Type</th>
                  <th scope="col">Events</th>
                </tr>
              </thead>
              <tbody>
                {evidence.evidence_summary.map((summary) => (
                  <tr
                    key={`${summary.evidence_kind}:${summary.evidence_key}:${summary.output_type}`}
                  >
                    <th scope="row">{label(summary.evidence_key)}</th>
                    <td>
                      {summary.evidence_kind} · {summary.output_type}
                    </td>
                    <td>{summary.event_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <aside className="limitations-panel" aria-label="Public summary limits">
        <strong>What these views cannot establish</strong>
        <ul>
          {evidence.public_summary_limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </aside>

      <details className="provenance-panel">
        <summary>View graph identity and limitations</summary>
        <dl className="compact-definition-list">
          <div>
            <dt>Graph</dt>
            <dd>
              {graph.graph_id} · version {graph.version}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              {new Date(evidence.context_graph_created_at).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>SHA-256</dt>
            <dd>
              <code>{graph.checksum_sha256}</code>
            </dd>
          </div>
        </dl>
        <ul>
          {graph.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
