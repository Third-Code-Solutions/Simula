import Link from "next/link";

import styles from "./hero.module.css";

export function SiteHeader() {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.headerFrame}>
        <Link aria-label="SIMULA home" className={styles.wordmark} href="/">
          <span aria-hidden="true" className={styles.wordmarkMark}>
            S
          </span>
          <span>SIMULA</span>
        </Link>

        <nav aria-label="Landing page" className={styles.sectionNav}>
          <Link href="#workflow">Workflow</Link>
          <Link href="#product">Product</Link>
          <Link href="#method">Method</Link>
        </nav>

        <div className={styles.headerActions}>
          <Link className={styles.signInLink} href="/sign-in">
            Sign in
          </Link>
          <Link className={styles.workspaceLink} href="/organizations">
            Open workspace
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
