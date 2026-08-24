"use client";

import type { SimulationRun } from "@/lib/api";

export function MethodologyReportPanel({
  run,
}: Readonly<{
  defaultVariantKey: string;
  run: SimulationRun;
}>) {
  return (
    <section className="panel form-stack" aria-labelledby="methodology-report">
      <p className="eyebrow">Durable experimental artifact</p>
      <h2 id="methodology-report">Methodology report</h2>
      <p className="methodology-warning" role="status">
        Methodology report creation, legacy display, and export are unavailable
        until simulation runs record a canonical immutable binding to the exact
        frozen configuration executed by the methodology engine. Report rows
        created before that binding can be proven are quarantined.
      </p>
      <p className="field-note">
        Run <code>{run.id}</code> remains available in the simulation audit
        trail; no legacy report artifact is exposed from this panel.
      </p>
    </section>
  );
}
