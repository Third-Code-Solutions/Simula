import { createHash } from "node:crypto";
import type { Request } from "express";

import { AppProblem } from "../domain/problem";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[ -~]{16,128}$/;
const ETAG_PATTERN = /^"([1-9][0-9]*)"$/;

function validation(detail: string, field: string, code: string): AppProblem {
  return new AppProblem(
    422,
    "validation_error",
    "Request validation failed",
    detail,
    [{ field, code }],
  );
}

export function exactRawHeader(request: Request, name: string): string | null {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const rawName = request.rawHeaders[index];
    const value = request.rawHeaders[index + 1];
    if (rawName?.toLowerCase() === name && value !== undefined) {
      values.push(value);
    }
  }
  if (values.length === 0) {
    return null;
  }
  if (values.length !== 1) {
    throw validation(`Provide exactly one ${name} header.`, name, "duplicate");
  }
  return values[0] ?? null;
}

export function idempotencyKey(request: Request): string {
  const value = exactRawHeader(request, "idempotency-key");
  if (value === null || !IDEMPOTENCY_PATTERN.test(value)) {
    throw validation(
      "Provide a 16-128 character printable ASCII idempotency key.",
      "idempotency-key",
      "required",
    );
  }
  return value;
}

export function expectedVersion(request: Request): number {
  const value = exactRawHeader(request, "if-match");
  const match = ETAG_PATTERN.exec(value ?? "");
  if (match?.[1] === undefined) {
    throw validation(
      "Provide the current quoted project version in If-Match.",
      "if-match",
      "required",
    );
  }
  const version = Number(match[1]);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw validation(
      "Provide the current quoted project version in If-Match.",
      "if-match",
      "invalid",
    );
  }
  return version;
}

export function resourceId(value: string, field: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw validation("One or more fields are invalid.", field, "isUuid");
  }
  return value.toLowerCase();
}

export function requestCorrelationId(
  request: Request & { simulaCorrelationId?: string },
): string {
  if (
    request.simulaCorrelationId === undefined ||
    !UUID_PATTERN.test(request.simulaCorrelationId)
  ) {
    throw new Error("correlation middleware did not install a UUID");
  }
  return request.simulaCorrelationId.toLowerCase();
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortedJson(child)]),
    );
  }
  return value;
}

export function canonicalRequestSha256(value: unknown): string {
  const encoded = JSON.stringify(sortedJson(value));
  if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > 262_144) {
    throw validation(
      "The command body is outside the canonical JSON budget.",
      "request",
      "invalid_json",
    );
  }
  return createHash("sha256").update(encoded, "utf8").digest("hex");
}

export function contentSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
