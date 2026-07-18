"use client";

import { useRef, useState } from "react";

import styles from "./rehearsal-story.module.css";

type StoryKey = "frame" | "rehearse" | "decide";

type StoryTab = {
  id: StoryKey;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
};

const STORY_TABS = [
  {
    id: "frame",
    label: "Frame",
    eyebrow: "Frozen setup",
    title: "Version the frame before the run.",
    description:
      "Lock the stimulus, audience model, and mock behavior into one inspectable starting point.",
  },
  {
    id: "rehearse",
    label: "Rehearse",
    eyebrow: "Run state",
    title: "Watch the reasoning, not a score.",
    description:
      "Trace each completed check while SIMULA keeps the non-representative boundary in view.",
  },
  {
    id: "decide",
    label: "Decide",
    eyebrow: "Human next step",
    title: "Leave with sharper field questions.",
    description:
      "Turn modeled tension into a research plan a human team can challenge and own.",
  },
] as const satisfies readonly StoryTab[];

function FramePanel() {
  return (
    <div className={styles.productBody}>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.panelEyebrow}>Decision frame</p>
          <h3>Campaign direction / Q3</h3>
        </div>
        <span className={styles.statusTag}>Frozen &middot; v3</span>
      </div>

      <div className={styles.frameCard}>
        <div className={styles.frameIndex}>01</div>
        <div>
          <p className={styles.cardLabel}>Stimulus</p>
          <p className={styles.cardTitle}>
            Make the safer choice feel like progress.
          </p>
          <p className={styles.cardCopy}>
            Audience frame: cautious category switchers, modeled from an
            authored scenario.
          </p>
        </div>
      </div>

      <dl className={styles.versionGrid}>
        <div>
          <dt>Stimulus</dt>
          <dd>v3</dd>
        </div>
        <div>
          <dt>Authored demo</dt>
          <dd>v1</dd>
        </div>
        <div>
          <dt>Deterministic mock</dt>
          <dd>v1</dd>
        </div>
      </dl>

      <p className={styles.boundaryNote}>
        <span aria-hidden="true" />
        Versioned inputs cannot silently change.
      </p>
    </div>
  );
}

function RehearsePanel() {
  const checks = [
    "Frame and stimulus verified",
    "Claim tension mapped",
    "Assumptions exposed",
    "Contradictions retained",
  ];

  return (
    <div className={styles.productBody}>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.panelEyebrow}>Run 01 / authored demo</p>
          <h3>Rehearsal in progress</h3>
        </div>
        <span className={styles.progressLabel}>4 of 5 checks</span>
      </div>

      <div
        aria-label="Four of five rehearsal checks complete"
        aria-valuemax={5}
        aria-valuemin={0}
        aria-valuenow={4}
        className={styles.progressTrack}
        role="progressbar"
      >
        <span />
      </div>

      <ul className={styles.checkList}>
        {checks.map((check) => (
          <li key={check}>
            <span className={styles.checkMark} aria-hidden="true">
              &#10003;
            </span>
            <span>{check}</span>
            <span className={styles.checkStatus}>Complete</span>
          </li>
        ))}
        <li className={styles.liveCheck}>
          <span className={styles.livePulse} aria-hidden="true" />
          <span>Forming research questions</span>
          <span className={styles.checkStatus}>Live</span>
        </li>
      </ul>

      <p className={styles.boundaryNote}>
        <span aria-hidden="true" />
        Modeled reactions are non-representative.
      </p>
    </div>
  );
}

function DecidePanel() {
  const questions = [
    "Which proof makes progress feel credible rather than promotional?",
    "Where does the safer choice still imply compromise?",
    "What language should field participants challenge first?",
  ];

  return (
    <div className={styles.productBody}>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.panelEyebrow}>Human next step</p>
          <h3>Questions worth taking to the field</h3>
        </div>
        <span className={styles.humanTag}>Research brief</span>
      </div>

      <ol className={styles.questionList}>
        {questions.map((question, index) => (
          <li key={question}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{question}</p>
          </li>
        ))}
      </ol>

      <div className={styles.decisionBoundary}>
        <strong>Estimates nobody</strong>
        <p>Output becomes a question, never a verdict.</p>
      </div>
    </div>
  );
}

function ActivePanel({ activeTab }: { activeTab: StoryKey }) {
  if (activeTab === "rehearse") {
    return <RehearsePanel />;
  }

  if (activeTab === "decide") {
    return <DecidePanel />;
  }

  return <FramePanel />;
}

export function RehearsalStory() {
  const [activeTab, setActiveTab] = useState<StoryKey>("frame");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function activateAndFocus(index: number) {
    const tab = STORY_TABS[index];
    if (!tab) {
      return;
    }

    setActiveTab(tab.id);
    tabRefs.current[index]?.focus();
  }

  function handleTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % STORY_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + STORY_TABS.length) % STORY_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = STORY_TABS.length - 1;
    }

    if (nextIndex === undefined) {
      return;
    }

    event.preventDefault();
    activateAndFocus(nextIndex);
  }

  const activeIndex = STORY_TABS.findIndex((tab) => tab.id === activeTab);
  const active = STORY_TABS[activeIndex] ?? STORY_TABS[0];

  return (
    <section className={styles.section} aria-labelledby="rehearsal-story-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>One decision. Three inspectable moves.</p>
        <h2 id="rehearsal-story-title">A rehearsal you can follow.</h2>
        <p>
          SIMULA keeps the frame, modeled run, and human next step
          connected&mdash;so the team can inspect how a question was formed.
        </p>
      </div>

      <div className={styles.stage}>
        <div
          aria-label="Rehearsal stages"
          className={styles.tabs}
          role="tablist"
        >
          {STORY_TABS.map((tab, index) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                aria-controls="rehearsal-story-panel"
                aria-label={tab.label}
                aria-selected={isActive}
                className={styles.tab}
                id={`rehearsal-story-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                <span className={styles.tabIndicator} aria-hidden="true" />
                <span className={styles.tabNumber}>0{index + 1}</span>
                <span className={styles.tabCopy}>
                  <span className={styles.tabEyebrow}>{tab.eyebrow}</span>
                  <strong>{tab.label}</strong>
                  <span>{tab.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.productFrame}>
          <div className={styles.productChrome} aria-hidden="true">
            <span />
            <span />
            <span />
            <p>simula / rehearsal</p>
          </div>
          <div
            aria-labelledby={`rehearsal-story-tab-${activeTab}`}
            className={styles.panel}
            id="rehearsal-story-panel"
            key={activeTab}
            role="tabpanel"
            tabIndex={0}
          >
            <div className={styles.mobilePanelTitle}>
              <p>{active.eyebrow}</p>
              <strong>{active.title}</strong>
            </div>
            <ActivePanel activeTab={activeTab} />
          </div>
        </div>
      </div>
    </section>
  );
}
