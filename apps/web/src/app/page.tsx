import Link from "next/link";

import { RehearsalStory } from "./rehearsal-story";

const trustAnchors = [
  "Frozen inputs",
  "Typed outputs",
  "Visible limits",
  "Human next steps",
] as const;

const features = [
  {
    code: "01",
    title: "Immutable by default",
    body: "Every saved message becomes a version. Prior text and checksums stay intact for later inspection.",
  },
  {
    code: "02",
    title: "Async without mystery",
    body: "Queued, running, retrying, failed, canceled, and complete states stay visible from launch to result.",
  },
  {
    code: "03",
    title: "Results with boundaries",
    body: "Generated rationale, demo distributions, limitations, and unavailable outputs remain visibly distinct.",
  },
  {
    code: "04",
    title: "Human evidence stays human",
    body: "SIMULA points toward research questions. It never recasts authored demo output as participant behavior.",
  },
] as const;

const graphNodes = [
  {
    className: "graph-node-one",
    label: "Input",
    value: "Stimulus · version 3",
  },
  {
    className: "graph-node-two",
    label: "Run authority",
    value: "Frozen rehearsal",
  },
  {
    className: "graph-node-three",
    label: "Audience",
    value: "Authored demo · v1",
  },
  {
    className: "graph-node-four",
    label: "Method",
    value: "Deterministic mock",
  },
  { className: "graph-node-five", label: "Limits", value: "Bounded resources" },
  {
    className: "graph-node-six",
    label: "Receipt",
    value: "Provenance + timestamps",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <div className="nav-frame">
          <Link aria-label="SIMULA home" className="wordmark" href="/">
            SIMULA
          </Link>
          <nav aria-label="Primary navigation" className="landing-nav">
            <Link href="#workflow">Workflow</Link>
            <Link href="#method">Method</Link>
            <Link href="#principles">Principles</Link>
          </nav>
          <div className="nav-actions">
            <Link className="text-link" href="/sign-in">
              Sign in
            </Link>
            <Link className="button-ghost" href="/organizations">
              Open workspace
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-kicker">Experimental decision rehearsal</p>
              <h1 id="hero-title">Rehearse the decision. Keep the doubt.</h1>
              <p className="hero-lede">
                SIMULA pressure-tests campaign messages before fieldwork—while
                freezing inputs, separating generated output from evidence, and
                showing every limit.
              </p>
              <div className="hero-actions">
                <Link className="button-white" href="/organizations">
                  Start a rehearsal
                </Link>
                <Link className="button-ghost" href="#method">
                  See how it works
                </Link>
              </div>
              <p className="hero-boundary">
                Authored demo audience · deterministic mock · estimates nobody
              </p>
            </div>

            <div
              aria-label="SIMULA product workspace preview"
              className="product-window"
              role="img"
            >
              <aside className="product-sidebar-preview" aria-hidden="true">
                <div className="product-mini-brand">
                  <span>S</span>
                  <span>SIMULA</span>
                </div>
                <ul className="product-preview-nav">
                  <li>
                    <span className="nav-dot" /> Overview
                  </li>
                  <li>
                    <span className="nav-dot" /> Messages
                  </li>
                  <li>
                    <span className="nav-dot" /> Rehearsals
                  </li>
                  <li>
                    <span className="nav-dot" /> Provenance
                  </li>
                </ul>
              </aside>
              <div className="product-main-preview">
                <div className="preview-topbar">
                  <div className="preview-prompt">
                    Ask about this rehearsal…
                  </div>
                  <span className="preview-avatar">KS</span>
                </div>
                <div className="preview-title-row">
                  <div>
                    <p>Campaign message · Philippines · English</p>
                    <h2>Launch message rehearsal</h2>
                  </div>
                  <span className="preview-status">Complete</span>
                </div>
                <div className="preview-progress" aria-hidden="true">
                  <div className="preview-progress-copy">
                    <span className="preview-pulse" />
                    <span>Rehearsal receipt</span>
                    <strong>4 / 4 checks</strong>
                  </div>
                  <span className="preview-progress-track">
                    <i />
                  </span>
                </div>
                <div className="preview-grid">
                  <section className="preview-card">
                    <h3>Questions worth testing</h3>
                    <p>Synthetic demo prompts. No population estimates.</p>
                    <ul className="signal-list">
                      <li>
                        <i /> <span>Claim clarity</span> <span>REVIEW</span>
                      </li>
                      <li>
                        <i /> <span>Cultural wording</span> <span>TEST</span>
                      </li>
                      <li>
                        <i /> <span>Proof expectation</span> <span>ASK</span>
                      </li>
                    </ul>
                  </section>
                  <div className="preview-stack">
                    <section className="preview-card">
                      <h3>Frozen setup</h3>
                      <dl className="preview-meta">
                        <div>
                          <dt>Stimulus</dt>
                          <dd>v3</dd>
                        </div>
                        <div>
                          <dt>Audience</dt>
                          <dd>demo-v1</dd>
                        </div>
                        <div>
                          <dt>Method</dt>
                          <dd>mock-v1</dd>
                        </div>
                      </dl>
                    </section>
                    <section className="preview-card">
                      <h3>Boundary</h3>
                      <p>Non-representative. Use people to validate.</p>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="SIMULA trust anchors" className="trust-strip">
          <div className="trust-strip-inner">
            <p>Fast feedback only matters when its receipt travels with it.</p>
            {trustAnchors.map((item) => (
              <strong className="trust-item" key={item}>
                {item}
              </strong>
            ))}
          </div>
        </section>

        <section
          className="landing-section"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <div className="section-center">
            <p className="eyebrow">One connected rehearsal</p>
            <h2 id="workflow-title">The full context stays attached.</h2>
            <p>
              A result without its source, audience, method, and limits is not a
              result you can responsibly use. SIMULA keeps that graph intact.
            </p>
          </div>
          <div className="context-graph" aria-label="Rehearsal context graph">
            <span className="graph-line graph-line-one" />
            <span className="graph-line graph-line-two" />
            <span className="graph-line graph-line-three" />
            <span className="graph-line graph-line-four" />
            <span className="graph-line graph-line-five" />
            {graphNodes.map((node) => (
              <article
                className={`graph-node ${node.className}`}
                key={node.value}
              >
                <p>{node.label}</p>
                <strong>{node.value}</strong>
              </article>
            ))}
          </div>
        </section>

        <RehearsalStory />

        <section
          className="landing-section"
          id="principles"
          aria-labelledby="principles-title"
        >
          <div className="section-center">
            <p className="eyebrow">Calm product, hard boundaries</p>
            <h2 id="principles-title">Designed to resist false confidence.</h2>
            <p>
              Product details carry the trust work. Every state says what
              happened, what did not happen, and what a person should do next.
            </p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-block" key={feature.title}>
                <span className="feature-icon">{feature.code}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="landing-section split-section"
          id="method"
          aria-labelledby="method-title"
        >
          <div className="split-copy">
            <p className="eyebrow">A rehearsal, never a verdict</p>
            <h2 id="method-title">Better questions before bigger spend.</h2>
            <p>
              SIMULA separates synthetic rationale, demo values, limitations,
              and human-research recommendations. Nothing silently becomes
              evidence.
            </p>
          </div>
          <div className="result-preview">
            <div className="result-preview-head">
              <strong>Result structure</strong>
              <span>Estimates nobody</span>
            </div>
            <div className="result-preview-body">
              <div className="result-preview-row">
                <i />
                <div>
                  <strong>Generated explanation</strong>
                  <p>Synthetic rationale stays labeled as generated.</p>
                </div>
              </div>
              <div className="result-preview-row">
                <i />
                <div>
                  <strong>Limitations</strong>
                  <p>Known gaps sit beside the output, not in fine print.</p>
                </div>
              </div>
              <div className="result-preview-row">
                <i />
                <div>
                  <strong>Human next step</strong>
                  <p>Turn uncertainty into a fieldwork question.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cta-band" aria-labelledby="cta-title">
          <div className="cta-inner">
            <div>
              <p className="eyebrow">Start narrow</p>
              <h2 id="cta-title">Bring one message. Find what to test.</h2>
            </div>
            <div className="cta-actions">
              <Link className="button-white" href="/organizations">
                Open SIMULA
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <p>SIMULA · experimental decision-rehearsal workspace</p>
          <div className="footer-links">
            <Link href="#method">Method</Link>
            <Link href="#principles">Boundaries</Link>
            <Link href="/sign-in">Sign in</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
