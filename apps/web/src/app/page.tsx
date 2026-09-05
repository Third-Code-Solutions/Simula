import Link from "next/link";
import { Hero } from "./landing/hero";
import { ProductStory } from "./landing/product-story";
import { EvidenceLibrary } from "./landing/evidence-library";
import { SiteHeader } from "./landing/site-header";
import styles from "./landing/landing-page.module.css";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.main} id="main-content" tabIndex={-1}>
        <Hero />
        <ProductStory />
        <EvidenceLibrary />
        <section className={styles.closing} aria-labelledby="begin-title">
          <div>
            <p className={styles.eyebrow}>Your next step</p>
            <h2 id="begin-title">Bring a message worth testing.</h2>
            <p>
              Create a project, save your draft, and review what needs further
              research.
            </p>
          </div>
          <Link className={styles.primaryAction} href="/organizations">
            Open workspace <span aria-hidden="true">→</span>
          </Link>
        </section>
        <footer className={styles.footer}>
          <span>SIMULA · Experimental campaign research</span>
          <p>
            Modeled outputs support research planning. They do not replace
            evidence from people.
          </p>
          <Link href="/data-use">Data and access</Link>
        </footer>
      </main>
    </>
  );
}
