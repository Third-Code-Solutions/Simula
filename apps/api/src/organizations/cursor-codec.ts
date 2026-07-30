import { createHmac, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { isUUID } from "class-validator";

import { DOMAIN_RUNTIME_CONFIG } from "../domain/domain.constants";
import type { DomainRuntime } from "../domain/domain-runtime";
import { AppProblem } from "../domain/problem";

const MAX_CURSOR_LENGTH = 1_024;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export interface CursorPosition {
  readonly createdAt: string;
  readonly resourceId: string;
}

function invalidCursor(): AppProblem {
  return new AppProblem(
    422,
    "validation_error",
    "Invalid cursor",
    "The pagination cursor is invalid or no longer applies.",
    [{ field: "cursor", code: "invalid" }],
  );
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidCursor();
  }
  const decoded = Buffer.from(value, "base64url");
  if (encode(decoded) !== value) {
    throw invalidCursor();
  }
  return decoded;
}

function exactDocument(value: unknown): {
  created_at: string;
  id: string;
  scope: string;
  v: number;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidCursor();
  }
  const document = value as Record<string, unknown>;
  if (
    Object.keys(document).sort().join(",") !== "created_at,id,scope,v" ||
    typeof document.created_at !== "string" ||
    typeof document.id !== "string" ||
    typeof document.scope !== "string" ||
    document.v !== 1
  ) {
    throw invalidCursor();
  }
  return document as {
    created_at: string;
    id: string;
    scope: string;
    v: number;
  };
}

@Injectable()
export class CursorCodec {
  private readonly secret: Buffer | null;

  constructor(
    @Inject(DOMAIN_RUNTIME_CONFIG)
    runtime: DomainRuntime,
  ) {
    this.secret = runtime.enabled
      ? Buffer.from(runtime.cursorSecret, "utf8")
      : null;
  }

  encode(scope: string, position: CursorPosition): string {
    if (this.secret === null) {
      throw invalidCursor();
    }
    const payload = Buffer.from(
      JSON.stringify({
        created_at: position.createdAt,
        id: position.resourceId,
        scope,
        v: 1,
      }),
      "utf8",
    );
    const signature = createHmac("sha256", this.secret)
      .update(payload)
      .digest();
    return `${encode(payload)}.${encode(signature)}`;
  }

  decode(value: string | undefined, scope: string): CursorPosition | null {
    if (value === undefined) {
      return null;
    }
    if (
      this.secret === null ||
      value === "" ||
      value.length > MAX_CURSOR_LENGTH ||
      value.split(".").length !== 2
    ) {
      throw invalidCursor();
    }
    const [payloadPart, signaturePart] = value.split(".");
    if (payloadPart === undefined || signaturePart === undefined) {
      throw invalidCursor();
    }
    const payload = decode(payloadPart);
    const signature = decode(signaturePart);
    const expected = createHmac("sha256", this.secret).update(payload).digest();
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(signature, expected)
    ) {
      throw invalidCursor();
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(payload.toString("utf8")) as unknown;
    } catch {
      throw invalidCursor();
    }
    const document = exactDocument(decoded);
    if (
      document.scope !== scope ||
      !TIMESTAMP_PATTERN.test(document.created_at) ||
      Number.isNaN(Date.parse(document.created_at)) ||
      !isUUID(document.id) ||
      document.id !== document.id.toLowerCase()
    ) {
      throw invalidCursor();
    }
    return Object.freeze({
      createdAt: document.created_at,
      resourceId: document.id,
    });
  }
}
