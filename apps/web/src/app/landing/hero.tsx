import Image from "next/image";
import Link from "next/link";

import { HeroMotion } from "./hero-motion";
import styles from "./hero.module.css";

const signals = [
  { label: "Claim clarity", state: "Review", tone: "coral" },
  { label: "Cultural wording", state: "Test", tone: "gold" },
  { label: "Proof expectation", state: "Ask", tone: "blue" },
] as const;

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className={styles.hero}>
      <HeroMotion />
      <div aria-hidden="true" className={styles.imageField} data-hero-media>
        <Image
          alt=""
          className={styles.horizonImage}
          fill
          loading="eager"
          sizes="100vw"
          src="/images/simula/decision-horizon.png"
        />
        <div className={styles.imageWash} />
        <div className={styles.imageGrain} />
      </div>

      <div className={styles.heroFrame}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>
            <span aria-hidden="true" />
            Experimental decision rehearsal
          </p>
          <h1 id="hero-title">
            Rehearse the <em>decision.</em>
            <br />
            Keep the <em>doubt.</em>
          </h1>
          <p className={styles.lede}>
            Pressure-test the message before fieldwork. SIMULA freezes every
            input, keeps generated output separate from evidence, and carries
            the limits all the way to the decision.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/organizations">
              Start a rehearsal
              <span aria-hidden="true">↗</span>
            </Link>
            <Link className={styles.secondaryAction} href="#method">
              Explore the method
            </Link>
          </div>
          <p className={styles.boundary}>
            <span>Authored demo</span>
            <span>Deterministic mock</span>
            <span>Estimates nobody</span>
          </p>
        </div>

        <figure
          aria-label="SIMULA rehearsal workspace showing a completed, non-representative demo"
          className={styles.productWindow}
        >
          <div aria-hidden="true" className={styles.productChrome}>
            <aside className={styles.sidebar}>
              <div className={styles.miniBrand}>
                <span>S</span>
                <strong>SIMULA</strong>
              </div>
              <div className={styles.workspaceLabel}>Decision workspace</div>
              <nav className={styles.previewNav}>
                <span className={styles.activeNav}>
                  <i /> Overview
                </span>
                <span>
                  <i /> Stimuli
                </span>
                <span>
                  <i /> Rehearsals
                </span>
                <span>
                  <i /> Evidence trail
                </span>
              </nav>
              <div className={styles.sidebarFooter}>
                <span>KS</span>
                <div>
                  <strong>Demo owner</strong>
                  <small>Strategy lead</small>
                </div>
              </div>
            </aside>

            <div className={styles.workspace}>
              <div className={styles.workspaceTopbar}>
                <div className={styles.searchField}>
                  <span>⌕</span>
                  Ask about this rehearsal…
                  <kbd>⌘ K</kbd>
                </div>
                <span className={styles.topbarIcon}>?</span>
                <span className={styles.topbarAvatar}>KS</span>
              </div>

              <div className={styles.workspaceBody}>
                <div className={styles.breadcrumbs}>
                  Projects <span>/</span> Launch message <span>/</span> Run 04
                </div>
                <div className={styles.titleRow}>
                  <div>
                    <p>
                      Campaign message &middot; authored scenario &middot;
                      English
                    </p>
                    <h2>Launch message rehearsal</h2>
                  </div>
                  <span className={styles.status}>
                    <i /> Complete
                  </span>
                </div>

                <div className={styles.receiptBar}>
                  <div className={styles.receiptCopy}>
                    <span className={styles.receiptIcon}>✓</span>
                    <div>
                      <small>Rehearsal receipt</small>
                      <strong>All checks recorded</strong>
                    </div>
                  </div>
                  <div className={styles.receiptProgress}>
                    <span>4 / 4</span>
                    <i />
                  </div>
                </div>

                <div className={styles.previewGrid}>
                  <section className={styles.signalCard}>
                    <header>
                      <div>
                        <small>Modeled tensions</small>
                        <h3>Questions worth testing</h3>
                      </div>
                      <span className={styles.cardMenu}>•••</span>
                    </header>
                    <p>Synthetic demo prompts. No population estimates.</p>
                    <div className={styles.signalList}>
                      {signals.map((signal, index) => (
                        <div className={styles.signalRow} key={signal.label}>
                          <span
                            className={styles[signal.tone]}
                            data-index={`0${index + 1}`}
                          />
                          <strong>{signal.label}</strong>
                          <small>{signal.state}</small>
                        </div>
                      ))}
                    </div>
                    <footer>
                      <span>3 open questions</span>
                      <strong>Prepare fieldwork →</strong>
                    </footer>
                  </section>

                  <div className={styles.previewStack}>
                    <section className={styles.setupCard}>
                      <small>Frozen setup</small>
                      <h3>Run authority</h3>
                      <dl>
                        <div>
                          <dt>Stimulus</dt>
                          <dd>Version 3</dd>
                        </div>
                        <div>
                          <dt>Audience</dt>
                          <dd>Authored demo · v1</dd>
                        </div>
                        <div>
                          <dt>Method</dt>
                          <dd>Mock · v1</dd>
                        </div>
                      </dl>
                    </section>
                    <section className={styles.limitCard}>
                      <span aria-hidden="true">!</span>
                      <div>
                        <small>Boundary</small>
                        <strong>Non-representative.</strong>
                        <p>Validate with people before making a claim.</p>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <figcaption>
            Frozen inputs. Typed output. Visible limits. One portable receipt.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
