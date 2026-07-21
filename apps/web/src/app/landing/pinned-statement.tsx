"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import styles from "./motion-sections.module.css";

gsap.registerPlugin(useGSAP);
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  gsap.registerPlugin(ScrollTrigger);
}

type PinnedStatementProps = {
  eyebrow: string;
  lead: string;
  emphasis: string;
  tail: string;
  tone?: "light" | "mint";
};

export function PinnedStatement({
  eyebrow,
  lead,
  emphasis,
  tail,
  tone = "light",
}: PinnedStatementProps) {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (typeof window.matchMedia !== "function") return;

      const media = gsap.matchMedia();
      media.add(
        "(min-width: 960px) and (prefers-reduced-motion: no-preference)",
        () => {
          const words = gsap.utils.toArray<HTMLElement>("[data-word]");
          gsap.fromTo(
            words,
            { y: 24 },
            {
              y: 0,
              stagger: 0.08,
              ease: "none",
              scrollTrigger: {
                trigger: sectionRef.current,
                start: "top top",
                end: "bottom bottom",
                scrub: 0.8,
              },
            },
          );
        },
      );
      return () => media.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section className={`${styles.statement} ${styles[tone]}`} ref={sectionRef}>
      <div className={styles.statementSticky}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>
          <span data-word>{lead}</span> <em data-word>{emphasis}</em>{" "}
          <span data-word>{tail}</span>
        </h2>
        <p className={styles.statementNote}>
          Every generated observation stays attached to the setup that produced
          it.
        </p>
      </div>
    </section>
  );
}
