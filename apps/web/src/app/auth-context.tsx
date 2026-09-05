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
        <p className="eyebrow">Campaign research workspace</p>
        <h2>A clearer next step for your campaign.</h2>
        <p>
          Save your drafts, compare modeled findings, and prepare better
          questions for research with people.
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
              <span className={styles.proofLabel}>Saved drafts</span>
            </li>
            <li className={styles.proofCard}>
              <span className={styles.proofNumber}>02</span>
              <span className={styles.proofLabel}>Visible limits</span>
            </li>
            <li className={styles.proofCard}>
              <span className={styles.proofNumber}>03</span>
              <span className={styles.proofLabel}>Run history</span>
            </li>
          </ul>
        </div>
      </div>
      <Link href="/data-use">Data and access</Link>
    </section>
  );
}
