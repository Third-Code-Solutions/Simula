"use client";

import { useState } from "react";

import styles from "./evidence-library.module.css";

type EvidenceCard = {
  description: string;
  label: string;
  title: string;
  tone: "message" | "audience" | "method" | "limits" | "receipt";
};

const evidenceCards: EvidenceCard[] = [
  {
    description:
      "Freeze the exact campaign copy under review. New edits become a new version; the original stays inspectable.",
    label: "Input object",
    title: "The message, exactly as tested",
    tone: "message",
  },
  {
    description:
      "Name the authored demo audience, its version, and its boundary. It is never presented as a real population.",
    label: "Audience object",
    title: "A modeled lens with a visible edge",
    tone: "audience",
  },
  {
    description:
      "Keep provider, configuration, code version, and seed beside the run so the rehearsal can be examined again.",
    label: "Method object",
    title: "A method you can retrace",
    tone: "method",
  },
  {
    description:
      "Unsupported slices and missing evidence stay explicit. No invented zero quietly fills the gap.",
    label: "Limits object",
    title: "Unknown stays unknown",
    tone: "limits",
  },
  {
    description:
      "Bring the frozen inputs, typed outputs, timestamps, and limitations into one reviewable record.",
    label: "Receipt object",
    title: "The doubt travels with the result",
    tone: "receipt",
  },
];

const supportCards = [
  {
    code: "01 / VERSION",
    copy: "Prior stimulus versions remain intact when the wording changes.",
    title: "Immutable inputs",
  },
  {
    code: "02 / OUTPUT",
    copy: "Each result declares what kind of modeled output it is.",
    title: "Typed findings",
  },
  {
    code: "03 / ABSENCE",
    copy: "Unsupported, absent, and suppressed are shown as distinct states.",
    title: "Honest omissions",
  },
  {
    code: "04 / NEXT STEP",
    copy: "Modeled tension becomes a question to test with people, not a claim about them.",
    title: "Human research handoff",
  },
];

const filters = [
  ["all", "All objects"],
  ["message", "Message"],
  ["audience", "Audience"],
  ["method", "Method"],
  ["limits", "Limits"],
  ["receipt", "Receipt"],
] as const;

const toneClass: Record<EvidenceCard["tone"], string> = {
  audience: styles.audience!,
  limits: styles.limits!,
  message: styles.message!,
  method: styles.method!,
  receipt: styles.receipt!,
};

function EvidenceArtwork({ tone }: Pick<EvidenceCard, "tone">) {
  if (tone === "message") {
    return (
      <div aria-hidden="true" className={styles.messageArt}>
        <span className={styles.documentLabel}>STIMULUS · V3</span>
        <strong>Make room for what matters.</strong>
        <i />
        <i />
        <i />
        <b>REVISION 02</b>
      </div>
    );
  }

  if (tone === "audience") {
    return (
      <div aria-hidden="true" className={styles.audienceArt}>
        <span className={styles.audienceFlag}>AUTHORED DEMO</span>
        <div className={styles.avatarGrid}>
          {Array.from({ length: 9 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        <small>NON-REPRESENTATIVE · V1</small>
      </div>
    );
  }

  if (tone === "method") {
    return (
      <div aria-hidden="true" className={styles.methodArt}>
        <span>INPUT</span>
        <span>SEED</span>
        <span>MOCK</span>
        <span>RESULT</span>
        <svg viewBox="0 0 300 118">
          <path d="M25 42H94L128 76H202L228 44H278" />
          <circle cx="25" cy="42" r="5" />
          <circle cx="128" cy="76" r="5" />
          <circle cx="228" cy="44" r="5" />
          <circle cx="278" cy="44" r="5" />
        </svg>
        <small>DETERMINISTIC MOCK</small>
      </div>
    );
  }

  if (tone === "limits") {
    return (
      <div aria-hidden="true" className={styles.limitsArt}>
        <span>BOUNDARY NOTICE</span>
        <strong>Estimates nobody.</strong>
        <div>
          <i />
          <small>No population inference</small>
        </div>
        <div>
          <i />
          <small>No behavioral observation</small>
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className={styles.receiptArt}>
      <div>
        <span>RUN RECEIPT</span>
        <b>R-0187</b>
      </div>
      <dl>
        <dt>Stimulus</dt>
        <dd>version 3</dd>
        <dt>Audience</dt>
        <dd>authored demo</dd>
        <dt>Status</dt>
        <dd>frozen</dd>
      </dl>
      <small>PROVENANCE ATTACHED</small>
    </div>
  );
}

export function EvidenceLibrary() {
  const [activeFilter, setActiveFilter] =
    useState<(typeof filters)[number][0]>("all");
  const visibleCards =
    activeFilter === "all"
      ? evidenceCards
      : evidenceCards.filter((card) => card.tone === activeFilter);

  return (
    <section
      aria-labelledby="evidence-library-title"
      className={styles.section}
      id="evidence-library"
    >
      <div className={styles.inner}>
        <header className={styles.heading}>
          <div aria-hidden="true" className={styles.sectionMark}>
            <span>01</span>
          </div>
          <div>
            <p className={styles.eyebrow}>Decision evidence library</p>
            <h2 id="evidence-library-title">
              Every rehearsal keeps its evidence.
            </h2>
            <p className={styles.intro} id="evidence-library-description">
              The useful output is not a verdict. It is a traceable set of
              modeled tensions, explicit limits, and better questions for human
              research.
            </p>
          </div>
        </header>

        <ul aria-label="Evidence object types" className={styles.filters}>
          {filters.map(([key, label]) => (
            <li key={key}>
              <button
                aria-pressed={activeFilter === key}
                className={
                  activeFilter === key ? styles.activeFilter : undefined
                }
                onClick={() => setActiveFilter(key)}
                type="button"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>

        <div
          aria-describedby="evidence-library-description"
          aria-label="Evidence cards. Scroll horizontally to inspect all five objects."
          className={styles.scroller}
          tabIndex={0}
        >
          <ol className={styles.featureTrack}>
            {visibleCards.map((card) => {
              const index = evidenceCards.findIndex(
                (item) => item.tone === card.tone,
              );
              return (
                <li
                  className={`${styles.featureCard} ${toneClass[card.tone]}`}
                  key={card.tone}
                >
                  <article>
                    <div className={styles.cardMeta}>
                      <span>{card.label}</span>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <EvidenceArtwork tone={card.tone} />
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>
        <p aria-hidden="true" className={styles.scrollCue}>
          Scroll to inspect <span>→</span>
        </p>

        <div className={styles.supportHeading}>
          <p className={styles.eyebrow}>Built into the rehearsal</p>
          <h3 id="receipt-preservation-title">
            What the receipt is designed to preserve
          </h3>
        </div>
        <ol
          aria-labelledby="receipt-preservation-title"
          className={styles.supportGrid}
          tabIndex={0}
        >
          {supportCards.map((card) => (
            <li key={card.code}>
              <article>
                <span>{card.code}</span>
                <h4>{card.title}</h4>
                <p>{card.copy}</p>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
