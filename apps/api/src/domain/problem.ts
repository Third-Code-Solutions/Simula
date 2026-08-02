import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { ValidationError } from "class-validator";
import type { Request, Response } from "express";

export interface ProblemFieldError {
  readonly field: string;
  readonly code: string;
}

export class AppProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail: string,
    readonly errors: readonly ProblemFieldError[] = [],
    readonly retryAfter?: number,
  ) {
    super(code);
    this.name = "AppProblem";
  }
}

export function unauthenticated(): AppProblem {
  return new AppProblem(
    HttpStatus.UNAUTHORIZED,
    "unauthenticated",
    "Authentication required",
    "Sign in again and retry the request.",
  );
}

export function dependencyUnavailable(detail: string): AppProblem {
  return new AppProblem(
    HttpStatus.SERVICE_UNAVAILABLE,
    "dependency_unavailable",
    "Service unavailable",
    detail,
    [],
    5,
  );
}

function validationFields(
  errors: readonly ValidationError[],
  parent = "",
): ProblemFieldError[] {
  return errors.flatMap((error) => {
    const field =
      parent === "" ? error.property : `${parent}.${error.property}`;
    const own = Object.keys(error.constraints ?? {}).map((code) => ({
      field: field || "request",
      code,
    }));
    return [...own, ...validationFields(error.children ?? [], field)];
  });
}

export function validationProblem(
  errors: readonly ValidationError[],
): AppProblem {
  return new AppProblem(
    HttpStatus.UNPROCESSABLE_ENTITY,
    "validation_error",
    "Request validation failed",
    "One or more fields are invalid.",
    validationFields(errors),
  );
}

interface CorrelatedRequest extends Request {
  simulaCorrelationId?: string;
}

function fromHttpException(error: HttpException): AppProblem {
  if (error instanceof BadRequestException) {
    return new AppProblem(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "validation_error",
      "Request validation failed",
      "One or more fields are invalid.",
    );
  }
  if (error.getStatus() === HttpStatus.NOT_FOUND) {
    return new AppProblem(
      HttpStatus.NOT_FOUND,
      "not_found",
      "Resource not found",
      "The requested resource was not found.",
    );
  }
  if (error.getStatus() === HttpStatus.METHOD_NOT_ALLOWED) {
    return new AppProblem(
      HttpStatus.METHOD_NOT_ALLOWED,
      "method_not_allowed",
      "Method not allowed",
      "The requested method is not supported for this resource.",
    );
  }
  return new AppProblem(
    error.getStatus(),
    "invalid_request",
    "Request failed",
    "The request could not be completed.",
  );
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<CorrelatedRequest>();
    const response = context.getResponse<Response>();
    const problem =
      error instanceof AppProblem
        ? error
        : error instanceof HttpException
          ? fromHttpException(error)
          : new AppProblem(
              HttpStatus.INTERNAL_SERVER_ERROR,
              "internal_error",
              "Internal server error",
              "The request could not be completed. Use the correlation ID for support.",
            );

    if (problem.status === HttpStatus.UNAUTHORIZED) {
      response.setHeader("WWW-Authenticate", "Bearer");
    }
    if (problem.retryAfter !== undefined) {
      response.setHeader("Retry-After", String(problem.retryAfter));
    }
    response
      .status(problem.status)
      .type("application/problem+json")
      .send({
        type: `https://simula.invalid/problems/${problem.code.replaceAll("_", "-")}`,
        title: problem.title,
        status: problem.status,
        code: problem.code,
        detail: problem.detail,
        instance: request.path,
        correlation_id: request.simulaCorrelationId ?? "unavailable",
        ...(problem.errors.length > 0 ? { errors: problem.errors } : {}),
      });
  }
}
