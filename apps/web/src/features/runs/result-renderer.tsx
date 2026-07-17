import type { SimulationResult } from "./result-contract";

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ResultRenderer({
  result,
}: Readonly<{ result: SimulationResult }>) {
  const artifact = result.result;
  const output = artifact.outputs[0];

  return (
    <section aria-labelledby="result-title" className="result-section">
      <div className="result-heading">
        <div>
          <p className="eyebrow">Experimental deterministic mock</p>
          <h2 id="result-title">Pipeline demo values</h2>
        </div>
        <span className="trust-label">Estimates nobody</span>
      </div>
      <p className="lede result-disclosure">
        This authored, non-representative demo is not human research and must
        not guide a decision without appropriately recruited people.
      </p>
      <div className="panel result-panel">
        <h3>{output.label}</h3>
        <table>
          <caption>
            Fixed demonstration distribution; values represent no population.
          </caption>
          <thead>
            <tr>
              <th scope="col">Demo category</th>
              <th scope="col">Display value</th>
            </tr>
          </thead>
          <tbody>
            {output.value.categories.map((category) => (
              <tr key={category.key}>
                <th scope="row">{category.key.replaceAll("_", " ")}</th>
                <td>{percentage(category.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="field-note">
          Uncertainty: {output.uncertainty.status.replaceAll("_", " ")} —{" "}
          {output.uncertainty.reason}.
        </p>
      </div>
      <div className="result-grid">
        <section className="panel">
          <p className="eyebrow">Synthetic rationale</p>
          <h3>Generated explanation</h3>
          <p>{artifact.qualitative[0].text}</p>
        </section>
        <section className="panel">
          <p className="eyebrow">Human research next step</p>
          <h3>Recommendation</h3>
          <p>{artifact.recommendations[0].text}</p>
        </section>
      </div>
      <section
        aria-labelledby="limitations-title"
        className="limitations-panel"
      >
        <h3 id="limitations-title">Limitations</h3>
        <ul>
          {artifact.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
