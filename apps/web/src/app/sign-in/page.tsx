import type { Metadata } from "next";
import Link from "next/link";

import { SignInForm } from "./sign-in-form";
import { safeNextPath } from "./safe-next-path";
import styles from "../auth-proof.module.css";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function SignInPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const { next } = await searchParams;

  return (
    <main className="centered-main" id="main-content" tabIndex={-1}>
      <section className="auth-context" aria-label="About SIMULA">
        <Link aria-label="SIMULA home" className="wordmark" href="/">
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
      <section className="auth-card" aria-labelledby="page-title">
        <p className="eyebrow">Authorized prototype access</p>
        <h1 id="page-title">Sign in</h1>
        <p className="lede">
          Use an authorized local account. SIMULA&apos;s authored demo artifacts
          are experimental, non-representative, and estimate nobody.
        </p>
        <SignInForm nextPath={safeNextPath(next)} />
      </section>
    </main>
  );
}
