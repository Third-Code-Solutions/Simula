import Link from "next/link";

import styles from "./auth-proof.module.css";

export function AuthContext() {
  return (
    <section className="auth-context" aria-label="About SIMULA">
      <Link
        aria-label="SIMULA home"
        className="wordmark"
        href="/"
        prefetch={false}
      >
        SIMULA
      </Link>
      <div>
        <p className="eyebrow">Decision rehearsal, with receipts</p>
        <h2>Bring a draft. Find the weak spots.</h2>
        <p>
          Private project workspaces, immutable text versions, bounded demo
          runs, and inspectable provenance.
        </p>
        <div className={styles.proofRail}>
          <p className={styles.supportLine}>
            Built for rehearsal, not prediction.
          </p>
          <ul
            aria-label="SIMULA product assurances"
            className={styles.proofList}
          >
            <li className={styles.proofCard}>
              <span className={styles.proofNumber}>01</span>
              <span className={styles.proofLabel}>Versioned</span>
            </li>
            <li className={styles.proofCard}>
              <span className={styles.proofNumber}>02</span>
              <span className={styles.proofLabel}>Bounded</span>
            </li>
            <li className={styles.proofCard}>
              <span className={styles.proofNumber}>03</span>
              <span className={styles.proofLabel}>Traceable</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
