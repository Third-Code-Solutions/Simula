"use client";

import { useRef, useState, type ComponentType } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import styles from "./motion-sections.module.css";

gsap.registerPlugin(useGSAP);
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  gsap.registerPlugin(ScrollTrigger);
}

const STEPS = [
  {
    label: "Frame",
    eyebrow: "01 / Version the question",
    title: "Lock the message before interpretation begins.",
    body: "The stimulus, decision context, and owner become a stable starting point. A later edit creates a new version—not a silent rewrite.",
  },
  {
    label: "Audience",
    eyebrow: "02 / Declare the audience",
    title: "An authored scenario, clearly bounded.",
    body: "The demo audience is a designed input for rehearsal. It is not a sampled population, respondent panel, or claim about people.",
  },
  {
    label: "Rehearse",
    eyebrow: "03 / Run the method",
    title: "Watch checks resolve without hiding uncertainty.",
    body: "Run state, deterministic method, resource limits, and failures remain visible while the rehearsal turns assumptions into inspectable tension.",
  },
  {
    label: "Inspect",
    eyebrow: "04 / Read the receipt",
    title: "Trace every output back to its conditions.",
    body: "Generated rationale, demo values, limitations, and provenance are separate objects—so context does not fall off when results travel.",
  },
  {
    label: "Decide",
    eyebrow: "05 / Return to people",
    title: "Leave with sharper questions, never a verdict.",
    body: "The useful endpoint is a human research brief: what to test, what proof to request, and which assumption deserves challenge first.",
  },
] as const;

function FrameUI() {
  return (
    <div className={styles.appPanel}>
      <PanelTop title="Decision frame" status="Frozen · v3" />
      <div className={styles.editorCard}>
        <span className={styles.fieldLabel}>Message under rehearsal</span>
        <strong>Make the safer choice feel like progress.</strong>
        <p>Campaign direction / Q3 launch / owner: strategy team</p>
      </div>
      <div className={styles.versionRow}>
        <SmallMetric label="Stimulus" value="v3" />
        <SmallMetric label="Checksum" value="7F4A" />
        <SmallMetric label="Status" value="Locked" />
      </div>
    </div>
  );
}

function AudienceUI() {
  return (
    <div className={styles.appPanel}>
      <PanelTop title="Audience scenario" status="Authored demo" />
      <div className={styles.personaGrid}>
        {["Context", "Tensions", "Vocabulary", "Unknowns"].map(
          (item, index) => (
            <article key={item}>
              <span>0{index + 1}</span>
              <strong>{item}</strong>
              <i />
              <i />
            </article>
          ),
        )}
      </div>
      <Boundary>Non-representative · no population estimate</Boundary>
    </div>
  );
}

function RehearseUI() {
  return (
    <div className={styles.appPanel}>
      <PanelTop title="Run 01" status="4 / 5 checks" />
      <div className={styles.runTrack}>
        <span />
      </div>
      <ul className={styles.runList}>
        {[
          "Inputs verified",
          "Claim tension mapped",
          "Assumptions exposed",
          "Contradictions retained",
        ].map((item) => (
          <li key={item}>
            <b>✓</b>
            <span>{item}</span>
            <small>Complete</small>
          </li>
        ))}
        <li className={styles.running}>
          <b />
          <span>Forming field questions</span>
          <small>Running</small>
        </li>
      </ul>
    </div>
  );
}

function InspectUI() {
  return (
    <div className={styles.appPanel}>
      <PanelTop title="Provenance receipt" status="Trace complete" />
      <div className={styles.receiptGraph}>
        <span>Stimulus v3</span>
        <i />
        <span>Audience v1</span>
        <i />
        <strong>Run 01</strong>
        <i />
        <span>Limits</span>
        <i />
        <span>Receipt</span>
      </div>
      <dl className={styles.receiptRows}>
        <div>
          <dt>Method</dt>
          <dd>Deterministic mock · v1</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>Timestamp attached</dd>
        </div>
        <div>
          <dt>Boundary</dt>
          <dd>Estimates nobody</dd>
        </div>
      </dl>
    </div>
  );
}

function DecideUI() {
  const questions = [
    "Which proof makes progress feel credible?",
    "Where does safety still imply compromise?",
    "What wording should participants challenge first?",
  ];
  return (
    <div className={styles.appPanel}>
      <PanelTop title="Human research brief" status="Ready to review" />
      <ol className={styles.questionList}>
        {questions.map((question, index) => (
          <li key={question}>
            <span>0{index + 1}</span>
            <strong>{question}</strong>
          </li>
        ))}
      </ol>
      <Boundary>Output becomes a question, never a verdict.</Boundary>
    </div>
  );
}

function PanelTop({ title, status }: { title: string; status: string }) {
  return (
    <div className={styles.panelTop}>
      <div>
        <span className={styles.miniMark}>S</span>
        <strong>{title}</strong>
      </div>
      <small>{status}</small>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Boundary({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.boundary}>
      <span />
      {children}
    </p>
  );
}

const PANELS: readonly ComponentType[] = [
  FrameUI,
  AudienceUI,
  RehearseUI,
  InspectUI,
  DecideUI,
];

export function ProductStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useGSAP(
    () => {
      if (typeof window.matchMedia !== "function") return;
      const media = gsap.matchMedia();
      media.add(
        "(min-width: 960px) and (prefers-reduced-motion: no-preference)",
        () => {
          ScrollTrigger.create({
            trigger: sectionRef.current,
            start: "top top",
            end: "bottom bottom",
            onUpdate: (self) => {
              const next = Math.min(
                STEPS.length - 1,
                Math.floor(self.progress * STEPS.length),
              );
              setActiveIndex(next);
            },
          });
        },
      );
      return () => media.revert();
    },
    { scope: sectionRef },
  );

  function jumpTo(index: number) {
    setActiveIndex(index);
    if (
      !sectionRef.current ||
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(min-width: 960px)").matches
    ) {
      return;
    }
    const top = sectionRef.current.offsetTop;
    const range = sectionRef.current.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: top + range * ((index + 0.12) / STEPS.length),
      behavior: "smooth",
    });
  }

  const activeStep = STEPS[activeIndex] ?? STEPS[0];

  return (
    <section
      className={styles.productStory}
      id="product"
      ref={sectionRef}
      aria-labelledby="product-story-title"
    >
      <div className={styles.productSticky}>
        <div className={styles.productFrame}>
          <div className={styles.productCopy}>
            <p className={styles.eyebrow}>The complete rehearsal</p>
            <h2 id="product-story-title">
              One decision.
              <br />
              <em>Five inspectable moves.</em>
            </h2>
            <div className={styles.stepRail} aria-label="Rehearsal steps">
              {STEPS.map((step, index) => (
                <button
                  aria-current={activeIndex === index ? "step" : undefined}
                  key={step.label}
                  onClick={() => jumpTo(index)}
                  type="button"
                >
                  <span>0{index + 1}</span>
                  {step.label}
                </button>
              ))}
            </div>
            <div className={styles.activeCopy} aria-live="polite">
              <p>{activeStep.eyebrow}</p>
              <h3>{activeStep.title}</h3>
              <span>{activeStep.body}</span>
            </div>
          </div>
          <div className={styles.productVisual}>
            <div className={styles.productChrome}>
              <span />
              <span />
              <span />
              <small>simula / rehearsal-01</small>
            </div>
            <div className={styles.panelStack}>
              {PANELS.map((Panel, index) => {
                const step = STEPS[index] ?? STEPS[0];
                return (
                  <div
                    aria-hidden={activeIndex !== index}
                    className={styles.storyPanel}
                    data-active={activeIndex === index}
                    key={step.label}
                  >
                    <Panel />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.mobileSteps}>
        {STEPS.map((step, index) => {
          const Panel = PANELS[index] ?? FrameUI;
          return (
            <article key={step.label}>
              <p>{step.eyebrow}</p>
              <h3>{step.title}</h3>
              <span>{step.body}</span>
              <div className={styles.mobilePanel}>
                <Panel />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
