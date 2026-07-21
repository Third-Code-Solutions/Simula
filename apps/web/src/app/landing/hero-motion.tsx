"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP);
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  gsap.registerPlugin(ScrollTrigger);
}

export function HeroMotion() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    if (typeof window.matchMedia !== "function") return;
    const section = markerRef.current?.closest("section");
    const media = section?.querySelector<HTMLElement>("[data-hero-media]");
    const windowPreview = section?.querySelector<HTMLElement>("figure");
    if (!section || !media || !windowPreview) return;

    const match = gsap.matchMedia();
    match.add(
      "(min-width: 801px) and (prefers-reduced-motion: no-preference)",
      () => {
        gsap.fromTo(
          media,
          { scale: 1.08, yPercent: -2 },
          {
            scale: 1,
            yPercent: 8,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: "bottom top",
              scrub: 1,
            },
          },
        );
        gsap.fromTo(
          windowPreview,
          { y: 72 },
          { y: 0, duration: 1.15, delay: 0.25, ease: "power3.out" },
        );
      },
    );
    return () => match.revert();
  }, []);

  return (
    <span aria-hidden="true" ref={markerRef} style={{ display: "none" }} />
  );
}
