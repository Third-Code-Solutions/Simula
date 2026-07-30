import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { ValidationError } from "class-validator";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  json,
  raw,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { AppModule } from "./app.module";
import {
  ASSET_MEDIA_TYPES,
  MAX_ASSET_BYTES,
} from "./assets/asset-object-store";
import type { RuntimeEnvironment } from "./config/redis-connection";
import { DOMAIN_RATE_LIMITER } from "./domain/domain.constants";
import { ProblemDetailsFilter, validationProblem } from "./domain/problem";
import { AppProblem } from "./domain/problem";
import { parseCorsOrigins } from "./domain/domain-runtime";
import { RequestDeadlineInterceptor } from "./http/request-deadline.interceptor";
import type { DomainRateLimiter } from "./rate-limits/domain-rate-limiter";

const CORRELATION_HEADER = "x-correlation-id";
const CORRELATION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-(0[01])$/;
const JSON_COMMAND_METHODS = new Set(["POST", "PATCH", "PUT"]);
const MAX_BODY_BYTES = 64 * 1024;
const ASSET_CONTENT_PATTERN =
  /^\/api\/v2\/stimulus-assets\/[0-9a-fA-F-]{36}\/content$/;
const CORS_ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "If-Match",
  "Traceparent",
  "X-Correlation-ID",
];
const CORS_EXPOSED_HEADERS = [
  "Content-Disposition",
  "Content-Length",
  "Content-Security-Policy",
  "ETag",
  "Idempotent-Replayed",
  "Retry-After",
  "Traceparent",
  "X-Content-Type-Options",
  "X-Correlation-ID",
];

interface BodyParserFailure {
  readonly type?: string;
}

interface RateLimitedRequest extends Request {
  simulaCorrelationId?: string;
  simulaPreAuthRateLimitIpHash?: string;
}

function nonzeroHex(bytes: number): string {
  for (;;) {
    const value = randomBytes(bytes).toString("hex");
    if (!/^0+$/.test(value)) {
      return value;
    }
  }
}

function traceparent(value: string | undefined): string {
  const match = TRACEPARENT_PATTERN.exec(value ?? "");
  const traceId =
    match?.[1] !== undefined && !/^0+$/.test(match[1])
      ? match[1]
      : nonzeroHex(16);
  const flags =
    match?.[2] !== undefined && !/^0+$/.test(match[2]) && match[3] !== undefined
      ? match[3]
      : "00";
  return `00-${traceId}-${nonzeroHex(8)}-${flags}`;
}

function correlationIdMiddleware(
  request: Request & {
    simulaCorrelationId?: string;
    simulaTraceparent?: string;
  },
  response: Response,
  next: NextFunction,
): void {
  const supplied = request.header(CORRELATION_HEADER);
  const correlationId =
    supplied !== undefined && CORRELATION_PATTERN.test(supplied)
      ? supplied.toLowerCase()
      : randomUUID();

  response.setHeader(CORRELATION_HEADER, correlationId);
  const requestTraceparent = traceparent(request.header("traceparent"));
  response.setHeader("traceparent", requestTraceparent);
  request.simulaCorrelationId = correlationId;
  request.simulaTraceparent = requestTraceparent;
  next();
}

function middlewareProblem(
  request: Request & { simulaCorrelationId?: string },
  response: Response,
  status: number,
  code: string,
  title: string,
  detail: string,
): void {
  response
    .status(status)
    .type("application/problem+json")
    .send({
      type: `https://simula.invalid/problems/${code.replaceAll("_", "-")}`,
      title,
      status,
      code,
      detail,
      instance: request.path,
      correlation_id: request.simulaCorrelationId ?? "unavailable",
    });
}

function preAuthRateLimitMiddleware(
  limiter: Pick<DomainRateLimiter, "requireUnauthenticated">,
) {
  return async (
    request: RateLimitedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (
      request.method === "OPTIONS" ||
      (request.path !== "/api/v2" && !request.path.startsWith("/api/v2/"))
    ) {
      next();
      return;
    }
    const peer = request.socket?.remoteAddress ?? "unknown";
    const ipHash = createHash("sha256").update(peer, "utf8").digest("hex");
    try {
      await limiter.requireUnauthenticated(ipHash);
      request.simulaPreAuthRateLimitIpHash = ipHash;
      next();
    } catch (error) {
      const problem =
        error instanceof AppProblem
          ? error
          : new AppProblem(
              503,
              "dependency_unavailable",
              "Service unavailable",
              "A required safety control is temporarily unavailable.",
              [],
              5,
            );
      if (problem.retryAfter !== undefined) {
        response.setHeader("Retry-After", String(problem.retryAfter));
      }
      middlewareProblem(
        request,
        response,
        problem.status,
        problem.code,
        problem.title,
        problem.detail,
      );
    }
  };
}

function jsonCommandMediaTypeMiddleware(
  request: Request & { simulaCorrelationId?: string },
  response: Response,
  next: NextFunction,
): void {
  if (
    !request.path.startsWith("/api/v2/") ||
    !JSON_COMMAND_METHODS.has(request.method)
  ) {
    next();
    return;
  }
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index];
    const value = request.rawHeaders[index + 1];
    if (name?.toLowerCase() === "content-type" && value !== undefined) {
      values.push(value);
    }
  }
  const mediaType = values[0]?.trim().toLowerCase();
  if (
    request.method === "PUT" &&
    ASSET_CONTENT_PATTERN.test(request.path) &&
    values.length === 1 &&
    ASSET_MEDIA_TYPES.includes(mediaType as (typeof ASSET_MEDIA_TYPES)[number])
  ) {
    next();
    return;
  }
  if (values.length === 1 && mediaType === "application/json") {
    next();
    return;
  }
  middlewareProblem(
    request,
    response,
    415,
    "unsupported_media_type",
    "Unsupported media type",
    ASSET_CONTENT_PATTERN.test(request.path)
      ? "SIMULA asset uploads require one exact supported binary media type."
      : "SIMULA command routes accept application/json only.",
  );
}

function bodyParserErrorMiddleware(
  error: unknown,
  request: Request & { simulaCorrelationId?: string },
  response: Response,
  next: NextFunction,
): void {
  const failure = error as BodyParserFailure;
  if (failure.type === "entity.too.large") {
    middlewareProblem(
      request,
      response,
      413,
      "request_too_large",
      "Request exceeds API limits",
      "Reduce the request size and retry.",
    );
    return;
  }
  if (
    failure.type === "entity.parse.failed" ||
    failure.type === "entity.verify.failed"
  ) {
    middlewareProblem(
      request,
      response,
      422,
      "validation_error",
      "Request validation failed",
      "The request body must be one strict JSON object.",
    );
    return;
  }
  if (
    failure.type === "request.aborted" ||
    failure.type === "request.size.invalid"
  ) {
    middlewareProblem(
      request,
      response,
      400,
      "invalid_request",
      "Request failed",
      "The request body could not be read safely.",
    );
    return;
  }
  next(error);
}

export async function createApplication(
  environment: RuntimeEnvironment = process.env,
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(environment), {
    bodyParser: false,
    logger: process.env.NODE_ENV === "test" ? false : ["error", "warn", "log"],
  });

  app.enableShutdownHooks();
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: "api/v",
    defaultVersion: "2",
  });
  app.enableCors({
    allowedHeaders: CORS_ALLOWED_HEADERS,
    credentials: false,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    maxAge: 600,
    methods: ["DELETE", "GET", "POST", "PATCH", "PUT", "OPTIONS"],
    origin: [...parseCorsOrigins(environment)],
  });
  app.use(correlationIdMiddleware);
  app.use(
    preAuthRateLimitMiddleware(app.get<DomainRateLimiter>(DOMAIN_RATE_LIMITER)),
  );
  app.use(jsonCommandMediaTypeMiddleware);
  app.use(
    raw({
      limit: MAX_ASSET_BYTES,
      type: [...ASSET_MEDIA_TYPES],
    }),
  );
  app.use(
    json({
      limit: MAX_BODY_BYTES,
      strict: true,
      type: "application/json",
    }),
  );
  app.use(bodyParserErrorMiddleware);
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new RequestDeadlineInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors: ValidationError[]) =>
        validationProblem(errors),
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );

  return app;
}
