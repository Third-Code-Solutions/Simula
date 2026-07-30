import type { BehavioralEvidence } from "./behavioral-evidence-contract";
import { BehavioralEvidenceReview } from "./behavioral-evidence-review";
import { BehavioralComparisonPanel } from "./behavioral-comparison-panel";
import type { BehavioralResult } from "./behavioral-result-contract";

function label(value: string): string {
  return value.replaceAll("_", " ");
}

export function BehavioralResultRenderer({
  evidence,
  result,
}: Readonly<{
  evidence: BehavioralEvidence;
  result: BehavioralResult;
}>) {
  const report = result.report;
  const traceCounts = new Map(
    evidence.evidence_summary.map((summary) => [
      `${summary.evidence_kind}:${summary.evidence_key}`,
      summary.event_count,
    ]),
  );

  return (
    <>
      <section
        aria-labelledby="behavioral-result-title"
        className="result-section"
      >
        <div className="result-heading">
          <div>
            <p className="eyebrow">Experimental synthetic-agent diagnostic</p>
            <h2 id="behavioral-result-title">
              Behavioral pressure-test report
            </h2>
          </div>
          <span className="trust-label">Not human evidence</span>
        </div>
        <p className="lede result-disclosure">
          These deterministic heuristic scores describe this synthetic run only.
          They do not predict campaign lift, represent a population, or replace
          appropriately recruited people.
        </p>

        <dl className="behavioral-score-grid">
          {report.scores.map((score) => (
            <div key={score.key}>
              <dt>{label(score.key)}</dt>
              <dd>{score.value.toFixed(1)}</dd>
              <dd className="behavioral-score-note">
                Synthetic points · {traceCounts.get(`score:${score.key}`) ?? 0}{" "}
                traced events
              </dd>
            </div>
          ))}
        </dl>

        <div className="result-grid">
          <section className="panel result-panel">
            <h3>Synthetic action distribution</h3>
            <table>
              <caption>
                Weighted synthetic-agent actions; not measurements from people.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Share</th>
                </tr>
              </thead>
              <tbody>
                {report.action_shares.map(([action, share]) => (
                  <tr key={action}>
                    <th scope="row">{label(action)}</th>
                    <td>{(share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <p className="eyebrow">Synthetic dispersion</p>
            <h3>Not population uncertainty</h3>
            <dl className="compact-definition-list">
              <div>
                <dt>Effective synthetic agents</dt>
                <dd>{report.uncertainty.effective_agent_count}</dd>
              </div>
              <div>
                <dt>Attention standard deviation</dt>
                <dd>
                  {report.uncertainty.attention_weighted_standard_deviation.toFixed(
                    1,
                  )}
                </dd>
              </div>
              <div>
                <dt>Resonance standard deviation</dt>
                <dd>
                  {report.uncertainty.resonance_weighted_standard_deviation.toFixed(
                    1,
                  )}
                </dd>
              </div>
              <div>
                <dt>Trust standard deviation</dt>
                <dd>
                  {report.uncertainty.trust_weighted_standard_deviation.toFixed(
                    1,
                  )}
                </dd>
              </div>
            </dl>
            {report.uncertainty.limitations.map((limitation) => (
              <p className="field-note" key={limitation}>
                {limitation}
              </p>
            ))}
          </section>
        </div>

        <section
          className="behavioral-findings"
          aria-labelledby="findings-title"
        >
          <div>
            <p className="eyebrow">Evidence-bound outputs</p>
            <h3 id="findings-title">Findings and next checks</h3>
          </div>
          {report.findings.map((finding) => (
            <article className="panel" key={finding.finding_id}>
              <p className="eyebrow">{label(finding.output_type)}</p>
              <h4>{finding.title}</h4>
              <p>{finding.detail}</p>
              <p className="field-note">
                {traceCounts.get(`finding:${finding.finding_id}`) ?? 0} private
                synthetic events are bound to this finding.
              </p>
            </article>
          ))}
        </section>

        <section className="panel behavioral-synthesis">
          <p className="eyebrow">Synthetic-agent explanation</p>
          <h3>Qualitative synthesis</h3>
          <p>{report.synthesis.summary}</p>
          <p className="field-note">
            Generated from the listed findings. It is not testimony, a focus
            group transcript, or observed sentiment.
          </p>
        </section>

        <section
          aria-labelledby="behavioral-limitations-title"
          className="limitations-panel"
        >
          <h3 id="behavioral-limitations-title">Decision limitations</h3>
          <ul>
            {[...report.limitations, ...report.synthesis.limitations].map(
              (limitation, index) => (
                <li key={`${index}:${limitation}`}>{limitation}</li>
              ),
            )}
          </ul>
          <p className="field-note">
            Variant <code>{result.variant_key}</code> · methodology{" "}
            <code>{result.methodology_version}</code> · {result.provider_calls}{" "}
            deterministic provider calls. No winner or lift is claimed.
          </p>
        </section>
      </section>
      <BehavioralEvidenceReview evidence={evidence} />
      <BehavioralComparisonPanel
        candidateRunId={result.run_id}
        expectedStudyId={result.study_id}
      />
    </>
  );
}
