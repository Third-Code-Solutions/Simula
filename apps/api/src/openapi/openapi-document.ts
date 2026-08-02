import type { INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from "@nestjs/swagger";

const STABLE_PROBLEM_CODES = Object.freeze([
  "dependency_unavailable",
  "forbidden",
  "idempotency_key_reused",
  "internal_error",
  "invalid_request",
  "method_not_allowed",
  "not_found",
  "queue_backpressure",
  "quota_exceeded",
  "rate_limited",
  "request_deadline_exceeded",
  "request_too_large",
  "run_not_cancelable",
  "unauthenticated",
  "unsupported_media_type",
  "unsupported_scope",
  "validation_error",
  "version_conflict",
] as const);

interface MutableObjectSchema {
  type?: string;
  properties?: Readonly<Record<string, unknown>>;
  additionalProperties?: boolean;
  $ref?: string;
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle("SIMULA Control Plane")
    .setDescription(
      "Migration-safe SIMULA control-plane contract. Behavioral outputs remain experimental until independently validated.",
    )
    .setVersion("2.0.0")
    .addBearerAuth(
      {
        bearerFormat: "JWT",
        scheme: "bearer",
        type: "http",
      },
      "supabase",
    )
    .build();

  const document = SwaggerModule.createDocument(app, configuration, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey}_${methodKey}`,
  });
  for (const schema of Object.values(
    document.components?.schemas ?? {},
  ) as MutableObjectSchema[]) {
    if (
      !("$ref" in schema) &&
      schema.type === "object" &&
      schema.properties !== undefined &&
      schema.additionalProperties === undefined
    ) {
      schema.additionalProperties = false;
    }
  }

  const extendedDocument = {
    ...document,
    openapi: "3.1.0",
    "x-simula-stable-problem-codes": STABLE_PROBLEM_CODES,
  };
  return extendedDocument;
}
