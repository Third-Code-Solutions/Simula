"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ApiProblem,
  type ProductRecord,
  type SimulationRun,
  createReportExport,
  createRunMethodologyReport,
  downloadReportExport,
  getRunReport,
  listSimulationConfigurations,
} from "@/lib/api";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): ProductRecord {
  return value && typeof value === "object" ? (value as ProductRecord) : {};
}

function message(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not complete that request.";
}

function safeVariantKey(value: string): string {
  return /^[a-z][a-z0-9_.]{0,63}$/.test(value) ? value : "selected_variant";
}

export function MethodologyReportPanel({
  defaultVariantKey,
  run,
}: Readonly<{
  defaultVariantKey: string;
  run: SimulationRun;
}>) {
  const [configurations, setConfigurations] = useState<ProductRecord[]>([]);
  const [report, setReport] = useState<ProductRecord>();
  const [busy, setBusy] = useState<
    "load" | "report" | "json" | "csv" | undefined
  >("load");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let stale = false;
    async function load(): Promise<void> {
      try {
        const loadedConfigurations = await listSimulationConfigurations(
          run.project_id,
        );
        let loadedReport: ProductRecord | undefined;
        try {
          const response = await getRunReport(run.id);
          const identity = record(record(response.data.artifact).identity);
          if (
            text(response.data.run_id) !== run.id ||
            text(identity.run_id) !== run.id ||
            text(identity.report_id) !== text(response.data.report_id)
          ) {
            throw new Error("methodology report identity mismatch");
          }
          loadedReport = response.data;
        } catch (loadError) {
          if (!(loadError instanceof ApiProblem && loadError.status === 404)) {
            throw loadError;
          }
        }
        if (!stale) {
          setConfigurations(loadedConfigurations.items);
          setReport(loadedReport);
          setError(undefined);
        }
      } catch (loadError) {
        if (!stale) {
          setError(message(loadError));
        }
      } finally {
        if (!stale) {
          setBusy(undefined);
        }
      }
    }
    void load();
    return () => {
      stale = true;
    };
  }, [run.id, run.project_id]);

  async function createReport(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("report");
    setError(undefined);
    try {
      const response = await createRunMethodologyReport(run.id, {
        configuration_version_id: text(form.get("configuration")),
        variant_key: safeVariantKey(text(form.get("variantKey"))),
        variant_label: text(form.get("variantLabel")),
        repetition_configuration: {
          repetition_count: Number(text(form.get("repetitionCount")) || "5"),
          base_seed: Number(text(form.get("baseSeed")) || "20260801"),
          stability_tolerance: Number(
            text(form.get("stabilityTolerance")) || "5",
          ),
        },
      });
      const identity = record(record(response.data.artifact).identity);
      if (
        text(response.data.run_id) !== run.id ||
        text(identity.run_id) !== run.id ||
        text(identity.report_id) !== text(response.data.report_id)
      ) {
        throw new Error("methodology report identity mismatch");
      }
      setReport(response.data);
    } catch (createError) {
      setError(message(createError));
    } finally {
      setBusy(undefined);
    }
  }

  async function exportReport(format: "json" | "csv"): Promise<void> {
    const reportId = text(report?.report_id);
    if (!reportId) {
      return;
    }
    setBusy(format);
    setError(undefined);
    try {
      const created = await createReportExport(reportId, {
        format,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      const exportId = text(created.data.export_id);
      if (!exportId || text(created.data.report_id) !== reportId) {
        throw new Error("report export identity mismatch");
      }
      const downloaded = await downloadReportExport(exportId);
      const url = URL.createObjectURL(downloaded.blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = downloaded.filename;
        anchor.rel = "noopener";
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (exportError) {
      setError(message(exportError));
    } finally {
      setBusy(undefined);
    }
  }

  const artifact = record(report?.artifact);
  const transparency = record(artifact.transparency);
  const repeated = record(artifact.repeated_simulation);

  return (
    <section className="panel form-stack" aria-labelledby="methodology-report">
      <p className="eyebrow">Durable experimental artifact</p>
      <h2 id="methodology-report">Methodology report</h2>
      <p className="field-note">
        Freeze this completed run into a reproducible report for compatible
        variant comparison. This remains synthetic diagnostic evidence and does
        not establish a winner or market lift.
      </p>
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      {busy === "load" ? (
        <p aria-live="polite">Loading methodology report state…</p>
      ) : null}
      {!report && busy !== "load" && configurations.length === 0 ? (
        <p>
          No frozen configuration exists.{" "}
          <Link href={`/projects/${run.project_id}/methodology`}>
            Open Methodology lab
          </Link>
          .
        </p>
      ) : null}
      {!report && busy !== "load" && configurations.length > 0 ? (
        <form className="form-stack" onSubmit={createReport}>
          <label htmlFor="methodology-report-configuration">
            Frozen configuration
          </label>
          <select
            id="methodology-report-configuration"
            name="configuration"
            required
          >
            <option value="">Select configuration</option>
            {configurations.map((configuration) => (
              <option
                key={text(configuration.configuration_version_id)}
                value={text(configuration.configuration_version_id)}
              >
                {text(configuration.name)} · v{String(configuration.version)}
              </option>
            ))}
          </select>
          <label htmlFor="methodology-report-variant-key">Variant key</label>
          <input
            defaultValue={safeVariantKey(defaultVariantKey)}
            id="methodology-report-variant-key"
            maxLength={64}
            name="variantKey"
            pattern="[a-z][a-z0-9_.]{0,63}"
            required
          />
          <label htmlFor="methodology-report-variant-label">
            Variant label
          </label>
          <input
            defaultValue="Completed run variant"
            id="methodology-report-variant-label"
            maxLength={120}
            minLength={2}
            name="variantLabel"
            required
          />
          <label htmlFor="methodology-report-repetition-count">
            Repeated seeded runs
          </label>
          <input
            defaultValue="5"
            id="methodology-report-repetition-count"
            max="10"
            min="3"
            name="repetitionCount"
            required
            type="number"
          />
          <label htmlFor="methodology-report-base-seed">Base seed</label>
          <input
            defaultValue="20260801"
            id="methodology-report-base-seed"
            name="baseSeed"
            required
            type="number"
          />
          <label htmlFor="methodology-report-stability-tolerance">
            Stability tolerance (component points)
          </label>
          <input
            defaultValue="5"
            id="methodology-report-stability-tolerance"
            max="100"
            min="1"
            name="stabilityTolerance"
            required
            step="1"
            type="number"
          />
          <button disabled={busy === "report"} type="submit">
            {busy === "report" ? "Creating report…" : "Create durable report"}
          </button>
        </form>
      ) : null}
      {report ? (
        <>
          <p className="methodology-warning">
            {text(artifact.experimental_notice)}
          </p>
          <dl className="methodology-stats">
            <div>
              <dt>Validation</dt>
              <dd>{text(transparency.validation_label)}</dd>
            </div>
            <div>
              <dt>Output kind</dt>
              <dd>{text(transparency.numerical_output_kind)}</dd>
            </div>
            <div>
              <dt>Repeat stability</dt>
              <dd>
                {repeated.repetition_count
                  ? `${String(repeated.repetition_count)} seeded runs · ${text(repeated.stability_label)}`
                  : "Not run"}
              </dd>
            </div>
            <div>
              <dt>Report checksum</dt>
              <dd>
                <code>{text(report.content_sha256)}</code>
              </dd>
            </div>
          </dl>
          <div>
            <button
              disabled={busy === "json" || busy === "csv"}
              onClick={() => void exportReport("json")}
              type="button"
            >
              {busy === "json" ? "Preparing JSON…" : "Download JSON"}
            </button>{" "}
            <button
              disabled={busy === "json" || busy === "csv"}
              onClick={() => void exportReport("csv")}
              type="button"
            >
              {busy === "csv" ? "Preparing CSV…" : "Download CSV"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
