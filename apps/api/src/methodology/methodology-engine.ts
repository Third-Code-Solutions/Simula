import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

import {
  DOMAIN_HTTP_FETCHER,
  DOMAIN_RUNTIME_CONFIG,
} from "../domain/domain.constants";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { AppProblem, dependencyUnavailable } from "../domain/problem";
import type {
  MethodologyPreviewCommand,
  ReportExportRenderCommand,
  ReportExportRendered,
  VariantComparisonCommand,
} from "../organizations/organization-gateway.port";

const EXECUTION_PATH = "/internal/v1/methodology-previews:execute";
const COMPARISON_PATH = "/internal/v1/methodology-reports:compare";
const EXPORT_PATH = "/internal/v1/report-exports:render";
const MAX_COMMAND_BYTES = 2_000_000;
const MAX_COMPARISON_COMMAND_BYTES = 9_000_000;
const MAX_RESULT_BYTES = 2_000_000;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const FILENAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,119}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type DomainHttpFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface MethodologyEngine {
  execute(
    command: MethodologyPreviewCommand,
  ): Promise<Readonly<Record<string, unknown>>>;
  compare(
    command: VariantComparisonCommand,
  ): Promise<readonly Readonly<Record<string, unknown>>[]>;
  renderExport(
    command: ReportExportRenderCommand,
  ): Promise<ReportExportRendered>;
  isReady(): Promise<boolean>;
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`private methodology engine returned invalid ${name}`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`private methodology engine returned invalid ${name}`);
  }
  return value;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`private methodology engine returned invalid ${name}`);
  }
  return value;
}

@Injectable()
export class PrivateMethodologyEngine implements MethodologyEngine {
  constructor(
    @Inject(DOMAIN_RUNTIME_CONFIG)
    private readonly config: EnabledDomainRuntime,
    @Inject(DOMAIN_HTTP_FETCHER)
    private readonly fetcher: DomainHttpFetcher,
  ) {}

  async isReady(): Promise<boolean> {
    try {
      const response = await this.fetcher(
        `${this.config.behavioralEngineUrl}/health/ready`,
        {
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(1_500),
        },
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async execute(
    command: MethodologyPreviewCommand,
  ): Promise<Readonly<Record<string, unknown>>> {
    const data = await this.postJson(
      EXECUTION_PATH,
      command,
      "Methodology preview rejected",
      "The frozen methodology command was rejected.",
    );
    try {
      const result = object(data.methodology_result, "methodology result");
      const report = object(data.report, "methodology report");
      const identity = object(report.identity, "report identity");
      const transparency = object(report.transparency, "report transparency");
      if (
        result.schema_version !== 2 ||
        result.run_id !== command.run_id ||
        result.validation_label !== "experimental" ||
        report.schema_version !== "2.0.0" ||
        identity.report_id !== command.report.report_id ||
        identity.run_id !== command.run_id ||
        identity.project_id !== command.report.project_id ||
        identity.stimulus_version_id !== command.report.stimulus_version_id ||
        transparency.validation_label !== "experimental" ||
        transparency.numerical_output_kind !== "heuristic_score" ||
        data.replayed !== false
      ) {
        throw new Error("methodology response binding mismatch");
      }
      return Object.freeze(data);
    } catch {
      throw dependencyUnavailable(
        "The private methodology engine returned an invalid result.",
      );
    }
  }

  async compare(
    command: VariantComparisonCommand,
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const data = await this.postJson(
      COMPARISON_PATH,
      command,
      "Variant comparison rejected",
      "The report set does not match the comparison contract.",
    );
    try {
      const reports = command.reports;
      if (reports.length < 2 || reports.length > 8) {
        throw new Error("invalid comparison command cardinality");
      }
      const baselineIdentity = object(
        reports[0]!.artifact.identity,
        "baseline report identity",
      );
      const items = array(data.items, "comparison items");
      if (items.length !== reports.length - 1) {
        throw new Error("comparison cardinality mismatch");
      }
      return Object.freeze(
        items.map((value, index) => {
          const item = object(value, "comparison item");
          const comparison = object(item.comparison, "comparison");
          const candidateIdentity = object(
            reports[index + 1]!.artifact.identity,
            "candidate report identity",
          );
          if (
            item.baseline_variant_key !== reports[0]!.variant_key ||
            item.candidate_variant_key !== reports[index + 1]!.variant_key ||
            comparison.schema_version !== "1.0.0" ||
            comparison.compatibility !== "compatible" ||
            comparison.baseline_report_id !== baselineIdentity.report_id ||
            comparison.candidate_report_id !== candidateIdentity.report_id
          ) {
            throw new Error("comparison response binding mismatch");
          }
          return Object.freeze(item);
        }),
      );
    } catch {
      throw dependencyUnavailable(
        "The private methodology engine returned an invalid comparison.",
      );
    }
  }

  async renderExport(
    command: ReportExportRenderCommand,
  ): Promise<ReportExportRendered> {
    const data = await this.postJson(
      EXPORT_PATH,
      command,
      "Report export rejected",
      "The report does not match the export contract.",
    );
    try {
      const format = string(data.format, "export format");
      const mediaType = string(data.media_type, "export media type");
      const filename = string(data.filename, "export filename");
      const encoded = string(data.content_base64, "export content");
      const contentSha256 = string(data.content_sha256, "export checksum");
      const expectedMediaType =
        command.format === "json"
          ? "application/json"
          : "text/csv; charset=utf-8";
      if (
        format !== command.format ||
        mediaType !== expectedMediaType ||
        !FILENAME_PATTERN.test(filename) ||
        !SHA256_PATTERN.test(contentSha256) ||
        !BASE64_PATTERN.test(encoded)
      ) {
        throw new Error("export response binding mismatch");
      }
      const content = Buffer.from(encoded, "base64");
      if (
        content.length < 1 ||
        content.length > MAX_RESULT_BYTES ||
        content.toString("base64") !== encoded ||
        createHash("sha256").update(content).digest("hex") !== contentSha256
      ) {
        throw new Error("export content binding mismatch");
      }
      return Object.freeze({
        format: command.format,
        media_type: expectedMediaType,
        filename,
        content,
        content_sha256: contentSha256,
      });
    } catch {
      throw dependencyUnavailable(
        "The private methodology engine returned an invalid export.",
      );
    }
  }

  private async postJson(
    path: string,
    command:
      | MethodologyPreviewCommand
      | VariantComparisonCommand
      | ReportExportRenderCommand,
    rejectedTitle: string,
    rejectedDetail: string,
  ): Promise<Record<string, unknown>> {
    const encoded = JSON.stringify(command);
    const commandByteLimit =
      path === COMPARISON_PATH
        ? MAX_COMPARISON_COMMAND_BYTES
        : MAX_COMMAND_BYTES;
    if (Buffer.byteLength(encoded, "utf8") > commandByteLimit) {
      throw new AppProblem(
        422,
        "validation_error",
        rejectedTitle,
        "The frozen private command exceeds its service limit.",
      );
    }
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.config.behavioralEngineUrl}${path}`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.config.behavioralEngineToken}`,
            "Content-Type": "application/json",
          },
          body: encoded,
          redirect: "manual",
          signal: AbortSignal.timeout(7_500),
        },
      );
    } catch {
      throw dependencyUnavailable(
        "The private methodology engine is temporarily unavailable.",
      );
    }
    if (response.status === 422) {
      throw new AppProblem(
        422,
        "validation_error",
        rejectedTitle,
        rejectedDetail,
      );
    }
    if (response.status === 409) {
      throw new AppProblem(
        409,
        "version_conflict",
        "Variant configurations differ",
        "All compared reports must use the same frozen methodology configuration.",
      );
    }
    if (response.status !== 200) {
      throw dependencyUnavailable(
        "The private methodology engine is temporarily unavailable.",
      );
    }
    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.toLowerCase();
    const rawLength = response.headers.get("content-length");
    if (
      mediaType !== "application/json" ||
      response.headers.get("content-encoding") !== null ||
      (rawLength !== null &&
        (!/^[0-9]+$/.test(rawLength) || Number(rawLength) > MAX_RESULT_BYTES))
    ) {
      throw dependencyUnavailable(
        "The private methodology engine returned an unsafe response.",
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESULT_BYTES) {
      throw dependencyUnavailable(
        "The private methodology engine returned an unsafe response.",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
      return object(parsed, "response");
    } catch {
      throw dependencyUnavailable(
        "The private methodology engine returned an invalid result.",
      );
    }
  }
}

@Injectable()
export class UnavailableMethodologyEngine implements MethodologyEngine {
  async isReady(): Promise<boolean> {
    return true;
  }

  async execute(
    _command: MethodologyPreviewCommand,
  ): Promise<Readonly<Record<string, unknown>>> {
    throw dependencyUnavailable(
      "The authenticated NestJS migration surface is disabled.",
    );
  }

  async compare(
    _command: VariantComparisonCommand,
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    throw dependencyUnavailable(
      "The authenticated NestJS migration surface is disabled.",
    );
  }

  async renderExport(
    _command: ReportExportRenderCommand,
  ): Promise<ReportExportRendered> {
    throw dependencyUnavailable(
      "The authenticated NestJS migration surface is disabled.",
    );
  }
}
