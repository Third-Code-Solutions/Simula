"use client";

import Link from "next/link";
import { useState } from "react";

import styles from "./hero.module.css";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className={styles.siteHeader}>
      <div className={styles.headerFrame}>
        <Link
          aria-label="SIMULA home"
          className={styles.wordmark}
          href="/"
          onClick={closeMenu}
        >
          <span aria-hidden="true" className={styles.wordmarkMark}>
            S
          </span>
          <span>SIMULA</span>
        </Link>

        <nav
          aria-label="Landing page"
          className={`${styles.sectionNav} ${menuOpen ? styles.sectionNavOpen : ""}`}
          id="landing-section-nav"
        >
          <Link href="#workflow" onClick={closeMenu}>
            Workflow
          </Link>
          <Link href="#product" onClick={closeMenu}>
            Product
          </Link>
          <Link href="#method" onClick={closeMenu}>
            Method
          </Link>
          <Link
            className={styles.mobileSignIn}
            href="/sign-in"
            onClick={closeMenu}
          >
            Sign in
          </Link>
        </nav>

        <div className={styles.headerActions}>
          <Link className={styles.signInLink} href="/sign-in">
            Sign in
          </Link>
          <Link className={styles.workspaceLink} href="/organizations">
            Open workspace
            <span aria-hidden="true">↗</span>
          </Link>
          <button
            aria-controls="landing-section-nav"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            className={styles.menuToggle}
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true" className={styles.menuIcon}>
              <i />
              <i />
              <i />
            </span>
            <span className={styles.menuLabel}>
              {menuOpen ? "Close" : "Menu"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
