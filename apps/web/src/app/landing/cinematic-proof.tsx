"use client";

import Image from "next/image";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import styles from "./motion-sections.module.css";

gsap.registerPlugin(useGSAP);
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  gsap.registerPlugin(ScrollTrigger);
}

export function CinematicProof() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (typeof window.matchMedia !== "function") return;
      const media = gsap.matchMedia();
      media.add(
        "(min-width: 960px) and (prefers-reduced-motion: no-preference)",
        () => {
          gsap.fromTo(
            "[data-proof-media]",
            { scale: 1.05, yPercent: -3 },
            {
              scale: 1.18,
              yPercent: 7,
              ease: "none",
              scrollTrigger: {
                trigger: sectionRef.current,
                start: "top bottom",
                end: "bottom top",
                scrub: 1,
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
    <section
      className={styles.proof}
      ref={sectionRef}
      aria-labelledby="proof-title"
    >
      <div className={styles.proofMedia} data-proof-media>
        <Image
          alt=""
          fill
          priority={false}
          sizes="100vw"
          src="/images/simula/decision-horizon.png"
        />
      </div>
      <div className={styles.proofVeil} />
      <div className={styles.proofCopy}>
        <p>SIMULA operating principle / 01</p>
        <h2 id="proof-title">
          The fastest insight is useless when its limits fall off.
        </h2>
        <span>Keep the method. Keep the provenance. Keep the doubt.</span>
      </div>
    </section>
  );
}
