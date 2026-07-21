import { CinematicProof } from "./landing/cinematic-proof";
import { EvidenceLibrary } from "./landing/evidence-library";
import { Hero } from "./landing/hero";
import styles from "./landing/landing-page.module.css";
import { PinnedStatement } from "./landing/pinned-statement";
import { ProductStory } from "./landing/product-story";
import { SiteHeader } from "./landing/site-header";
import {
  ClosingSection,
  ContextSurface,
  DecisionActions,
  SourceRail,
} from "./landing/support-sections";

const trustAnchors = [
  "Frozen inputs",
  "Typed outputs",
  "Visible limits",
  "Human next steps",
] as const;

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.main} id="main-content" tabIndex={-1}>
        <Hero />

        <section
          aria-label="SIMULA evidence commitments"
          className={styles.trust}
        >
          <div className={styles.trustInner}>
            <p>Fast feedback only matters when its receipt travels with it.</p>
            {trustAnchors.map((anchor) => (
              <span key={anchor}>{anchor}</span>
            ))}
          </div>
        </section>

        <PinnedStatement
          eyebrow="A decision rehearsal with memory"
          emphasis="inspectable"
          lead="Meet your most"
          tail="rehearsal."
        />
        <EvidenceLibrary />
        <DecisionActions />
        <SourceRail />
        <PinnedStatement
          eyebrow="One connected system"
          emphasis="rehearsal"
          lead="Everything the"
          tail="needs."
          tone="mint"
        />
        <ProductStory />
        <CinematicProof />
        <ContextSurface />
        <ClosingSection />
      </main>
    </>
  );
}
