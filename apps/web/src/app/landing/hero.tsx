import Link from "next/link";
import styles from "./hero.module.css";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.kicker}>Campaign research · Philippines</p>
        <h1 id="hero-title">
          Test your message.
          <br />
          Know what to ask next.
        </h1>
        <p className={styles.lede}>
          Review campaign drafts with a clearly defined audience and method.
          Keep the inputs, findings, and limitations together before you take
          the questions into fieldwork.
        </p>
        <div className={styles.heroActions}>
          <Link className={styles.primaryAction} href="/organizations">
            Start a rehearsal <span aria-hidden="true">→</span>
          </Link>
          <Link className={styles.secondaryAction} href="#product">
            How it works
          </Link>
        </div>
        <p className={styles.boundary}>
          Experimental software. Simulated responses are not observed human
          behavior or validated population estimates.
        </p>
      </div>
      <aside className={styles.preview} aria-labelledby="preview-title">
        <div className={styles.previewTop}>
          <span>Research workflow</span>
          <span>Illustrative example</span>
        </div>
        <h2 id="preview-title">From draft to research questions</h2>
        <ol className={styles.checklist}>
          <li>
            <span>01</span>
            <div>
              <strong>Save the message</strong>
              <p>Keep an exact version of the copy you want to test.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Set the audience and method</strong>
              <p>Declare your assumptions and the limits of the test.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Review the findings</strong>
              <p>
                Separate modeled output from evidence and plan follow-up
                research.
              </p>
            </div>
          </li>
        </ol>
        <p className={styles.previewNote}>
          Every run keeps a record of its inputs and limitations.
        </p>
      </aside>
    </section>
  );
}
