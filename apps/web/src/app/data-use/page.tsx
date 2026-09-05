import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../landing/site-header";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Data and access · SIMULA",
  description:
    "Experimental-use boundaries, workspace access, and unresolved data-handling limits for SIMULA.",
};

export default function DataUsePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <Link href="/" className={styles.back}>
          ← Back to SIMULA
        </Link>
        <p className={styles.label}>Product information</p>
        <h1>Data and access</h1>
        <p className={styles.intro}>
          SIMULA is experimental research software. This page explains the
          current operating boundaries; it is not a privacy policy, terms of
          service, or a compliance certification.
        </p>
        <section aria-labelledby="inputs">
          <h2 id="inputs">Start with fictional, non-personal inputs</h2>
          <p>
            Use authored demo content while evaluating the product. Do not
            include personal information, sensitive attributes, participant
            records, or confidential client material without a separately
            approved data-handling process.
          </p>
          <p>
            A public source is not automatically licensed for reuse. Confirm
            your rights and the approved purpose before adding material.
          </p>
        </section>
        <section aria-labelledby="outputs">
          <h2 id="outputs">
            Treat modeled findings as questions to investigate
          </h2>
          <p>
            Authored demo audiences are not sampled populations. Generated
            responses and experimental scores do not establish how people
            actually behave. Review the run’s method, source, and limitations
            before using its output.
          </p>
        </section>
        <section aria-labelledby="access">
          <h2 id="access">Review access with your workspace owner</h2>
          <p>
            Sign in to view the organizations available to your account. Ask
            your organization owner to confirm who should have access and what
            material is approved for that workspace.
          </p>
          <Link href="/organizations">Open your workspaces →</Link>
        </section>
        <section aria-labelledby="limits">
          <h2 id="limits">Retention and deletion have unresolved limits</h2>
          <p>
            Local organization-deletion workflows are implemented, but this does
            not establish deletion from every hosted system, provider, exported
            file, log, or backup. Account deletion, production retention
            schedules, and downstream deletion guarantees are not confirmed
            here.
          </p>
          <p>
            Final hosted privacy notices, legal roles, processing regions, and
            service terms remain release requirements. Do not treat this page as
            approval to upload personal research data.
          </p>
        </section>
        <footer className={styles.footer}>
          <Link href="/">SIMULA home</Link>
          <Link href="/sign-in">Sign in</Link>
        </footer>
      </main>
    </>
  );
}
