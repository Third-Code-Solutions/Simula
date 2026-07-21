import Image from "next/image";
import Link from "next/link";

import { ContextGraph } from "../context-graph";
import styles from "./support-sections.module.css";

const actions = [
  {
    index: "01",
    label: "Frame",
    title: "Name the decision",
    copy: "Set the message, decision owner, audience scenario, and the real question behind the request.",
  },
  {
    index: "02",
    label: "Rehearse",
    title: "Expose the tension",
    copy: "Use an explicitly modeled run to surface competing interpretations, assumptions, and missing proof.",
  },
  {
    index: "03",
    label: "Inspect",
    title: "Keep the receipt",
    copy: "Review generated rationale beside method, limits, timestamps, and a concrete human research handoff.",
  },
] as const;

const principles = [
  [
    "01",
    "Immutable by default",
    "Every saved message becomes a version. Prior text and checksums remain available for inspection.",
  ],
  [
    "02",
    "Async without mystery",
    "Queued, running, retrying, failed, canceled, and complete stay visible from launch to result.",
  ],
  [
    "03",
    "Results with boundaries",
    "Generated rationale, demo values, limitations, and unavailable outputs remain distinct.",
  ],
  [
    "04",
    "Human evidence stays human",
    "SIMULA proposes research questions. It does not recast authored output as participant behavior.",
  ],
] as const;

export function DecisionActions() {
  return (
    <section
      className={styles.actions}
      id="workflow"
      aria-labelledby="actions-title"
    >
      <div className={styles.sectionHead}>
        <p>From uncertainty to a researchable question</p>
        <h2 id="actions-title">SIMULA moves when you frame the decision.</h2>
      </div>
      <ol className={styles.actionGrid}>
        {actions.map((action) => (
          <li key={action.label}>
            <article>
              <header>
                <span>{action.index}</span>
                <small>{action.label}</small>
              </header>
              <div className={styles.actionArt} aria-hidden="true">
                <i />
                <i />
                <i />
                <b>{action.index}</b>
              </div>
              <h3>{action.title}</h3>
              <p>{action.copy}</p>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SourceRail() {
  return (
    <section className={styles.sourceRail} aria-labelledby="source-title">
      <p>Designed around the evidence teams already carry</p>
      <h2 id="source-title">
        Messages <i /> Briefs <i /> Claims <i /> Assumptions <i /> Research
        notes
      </h2>
      <span>Every source stays named from first input to final handoff.</span>
    </section>
  );
}

export function ContextSurface() {
  return (
    <section
      className={styles.surface}
      id="method"
      aria-labelledby="context-title"
    >
      <div className={styles.contextHead}>
        <p>Personal context graph</p>
        <h2 id="context-title">The full context stays attached.</h2>
        <span>
          A result without its source, audience, method, and limits is not a
          result you can responsibly use.
        </span>
      </div>
      <div className={styles.contextFrame}>
        <ContextGraph />
      </div>

      <div className={styles.principleHead}>
        <p>Calm product. Hard boundaries.</p>
        <h2>Designed for accountable decisions.</h2>
      </div>
      <ol className={styles.principleGrid}>
        {principles.map(([index, title, copy]) => (
          <li key={title}>
            <article>
              <span>{index}</span>
              <i aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          </li>
        ))}
      </ol>

      <div className={styles.console}>
        <div className={styles.consoleTop}>
          <span>SIMULA / evidence boundary</span>
          <small>run_01.trace</small>
        </div>
        <div className={styles.consoleBody}>
          <div>
            <small>01</small>
            <span>input.stimulus</span>
            <strong>frozen:v3</strong>
          </div>
          <div>
            <small>02</small>
            <span>audience.authority</span>
            <strong>authored_demo:v1</strong>
          </div>
          <div>
            <small>03</small>
            <span>method.provider</span>
            <strong>deterministic_mock:v1</strong>
          </div>
          <div>
            <small>04</small>
            <span>output.population_estimate</span>
            <strong className={styles.denied}>unavailable</strong>
          </div>
          <div>
            <small>05</small>
            <span>handoff.next_step</span>
            <strong>human_research</strong>
          </div>
        </div>
        <p>
          <b>&gt;</b> Trace complete. The receipt keeps what the conclusion
          would otherwise forget.
          <i />
        </p>
      </div>
    </section>
  );
}

export function ClosingSection() {
  return (
    <>
      <section className={styles.closing} aria-labelledby="closing-title">
        <div className={styles.closingMedia}>
          <Image
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 1200px"
            src="/images/simula/decision-horizon.png"
          />
          <div className={styles.closingWash} />
          <nav aria-label="Closing navigation" className={styles.closingNav}>
            <Link href="#workflow">Workflow</Link>
            <Link href="#product">Product</Link>
            <Link href="#method">Method</Link>
          </nav>
          <div className={styles.closingCopy}>
            <p>Ready to challenge the message?</p>
            <h2 id="closing-title">
              Rehearse the decision.
              <br />
              <em>Keep the receipt.</em>
            </h2>
            <div>
              <Link href="/organizations">
                Start a rehearsal <span aria-hidden="true">↗</span>
              </Link>
              <Link href="#method">Read the method</Link>
            </div>
          </div>
        </div>
      </section>
      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div>
            <strong>SIMULA</strong>
            <p>
              Experimental decision rehearsal.
              <br />
              Authored demo. Estimates nobody.
            </p>
          </div>
          <nav aria-label="Product">
            <span>Product</span>
            <Link href="#workflow">Workflow</Link>
            <Link href="#product">Rehearsal</Link>
            <Link href="#method">Provenance</Link>
          </nav>
          <nav aria-label="Account">
            <span>Account</span>
            <Link href="/sign-in">Sign in</Link>
            <Link href="/organizations">Workspace</Link>
          </nav>
          <nav aria-label="Method">
            <span>Boundary</span>
            <p>
              Modeled output is not participant evidence. Validate with people.
            </p>
          </nav>
        </div>
        <div className={styles.footerBottom}>
          <span>SIMULA / decision rehearsal with receipts</span>
          <span>Experimental interface</span>
        </div>
      </footer>
    </>
  );
}
