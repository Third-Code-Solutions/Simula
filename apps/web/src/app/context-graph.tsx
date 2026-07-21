import styles from "./context-graph.module.css";

type ContextNode = {
  id: string;
  index: string;
  kind: string;
  title: string;
  detail: string;
  position:
    "input" | "audience" | "authority" | "method" | "limits" | "receipt";
  tone: "teal" | "coral" | "blue" | "amber" | "orchid" | "forest";
};

const CONTEXT_NODES = [
  {
    id: "context-input",
    index: "01",
    kind: "Input",
    title: "Stimulus \u00b7 version 3",
    detail: "Immutable source",
    position: "input",
    tone: "teal",
  },
  {
    id: "context-audience",
    index: "02",
    kind: "Audience",
    title: "Authored demo \u00b7 v1",
    detail: "Non-representative",
    position: "audience",
    tone: "coral",
  },
  {
    id: "context-method",
    index: "03",
    kind: "Method",
    title: "Deterministic mock",
    detail: "Provider mock-v1",
    position: "method",
    tone: "amber",
  },
  {
    id: "context-authority",
    index: "04",
    kind: "Run authority",
    title: "Frozen rehearsal",
    detail: "Run 01 \u00b7 inputs locked",
    position: "authority",
    tone: "blue",
  },
  {
    id: "context-limits",
    index: "05",
    kind: "Limits",
    title: "Bounded resources",
    detail: "Policy enforced",
    position: "limits",
    tone: "orchid",
  },
  {
    id: "context-receipt",
    index: "06",
    kind: "Receipt",
    title: "Provenance + timestamps",
    detail: "Inspectable record",
    position: "receipt",
    tone: "forest",
  },
] as const satisfies readonly ContextNode[];

function ContextCard({ node }: { node: ContextNode }) {
  const isAuthority = node.position === "authority";

  return (
    <li
      className={`${styles.node} ${styles[node.position]} ${styles[node.tone]}`}
      id={node.id}
    >
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <span className={styles.index}>{node.index}</span>
          <span className={styles.kind}>{node.kind}</span>
          {isAuthority ? (
            <span className={styles.locked}>
              <span aria-hidden="true" />
              Locked
            </span>
          ) : null}
        </header>
        <strong className={styles.cardTitle}>{node.title}</strong>
        <p className={styles.cardDetail}>{node.detail}</p>
      </article>
    </li>
  );
}

export function ContextGraph() {
  return (
    <figure className={styles.frame} aria-labelledby="context-graph-caption">
      <div className={styles.innerFrame}>
        <header className={styles.toolbar}>
          <div className={styles.toolbarTitle}>
            <span className={styles.toolbarMark} aria-hidden="true">
              <span />
            </span>
            <div>
              <strong>Rehearsal context</strong>
              <span>Frozen dependency graph</span>
            </div>
          </div>
          <div className={styles.toolbarMeta} aria-label="Graph metadata">
            <span>Run 01</span>
            <span>6 artifacts</span>
            <span className={styles.verified}>Receipt attached</span>
          </div>
        </header>

        <div className={styles.canvas}>
          <svg
            aria-hidden="true"
            className={styles.routes}
            preserveAspectRatio="none"
            viewBox="0 0 1000 560"
          >
            <defs>
              <marker
                id="context-arrow"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
              >
                <path d="M 0 0 L 8 4 L 0 8 Z" className={styles.arrow} />
              </marker>
            </defs>
            <path
              className={styles.route}
              d="M 258 121 C 344 121 355 243 414 243"
              markerEnd="url(#context-arrow)"
            />
            <path
              className={styles.route}
              d="M 742 121 C 656 121 645 243 586 243"
              markerEnd="url(#context-arrow)"
            />
            <path
              className={styles.route}
              d="M 274 445 C 350 445 358 308 414 308"
              markerEnd="url(#context-arrow)"
            />
            <path
              className={styles.route}
              d="M 586 308 C 642 308 650 445 726 445"
              markerEnd="url(#context-arrow)"
            />
            <path
              className={`${styles.route} ${styles.primaryRoute}`}
              d="M 500 332 L 500 402"
              markerEnd="url(#context-arrow)"
            />
            <circle className={styles.junction} cx="500" cy="243" r="4" />
            <circle className={styles.junction} cx="500" cy="308" r="4" />
          </svg>

          <p className={styles.screenReaderSummary}>
            Stimulus version 3, authored demo audience version 1, and the
            deterministic mock method feed the frozen rehearsal. The rehearsal
            applies bounded resource limits and produces an inspectable
            provenance receipt with timestamps.
          </p>

          <ol className={styles.nodes}>
            {CONTEXT_NODES.map((node) => (
              <ContextCard key={node.id} node={node} />
            ))}
          </ol>
        </div>

        <figcaption className={styles.caption} id="context-graph-caption">
          <span>Trace complete</span>
          Every output remains attached to its source, method, operating limits,
          and immutable receipt.
        </figcaption>
      </div>
    </figure>
  );
}
