import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import {
  catchError,
  type Observable,
  throwError,
  timeout,
  TimeoutError,
} from "rxjs";

import { AppProblem } from "../domain/problem";

const RUN_CREATE_PATTERN = /^\/api\/v2\/projects\/[0-9a-fA-F-]{36}\/runs$/;
const ASSET_UPLOAD_PATTERN =
  /^\/api\/v2\/stimulus-assets\/[0-9a-fA-F-]{36}\/content$/;

@Injectable()
export class RequestDeadlineInterceptor implements NestInterceptor {
  constructor(
    private readonly defaultMilliseconds = 10_000,
    private readonly runCreateMilliseconds = 5_000,
    private readonly assetUploadMilliseconds = 30_000,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path !== "/api/v2" && !request.path.startsWith("/api/v2/")) {
      return next.handle();
    }
    const milliseconds =
      request.method === "POST" && RUN_CREATE_PATTERN.test(request.path)
        ? this.runCreateMilliseconds
        : request.method === "PUT" && ASSET_UPLOAD_PATTERN.test(request.path)
          ? this.assetUploadMilliseconds
          : this.defaultMilliseconds;

    return next.handle().pipe(
      timeout(milliseconds),
      catchError((error: unknown) =>
        error instanceof TimeoutError
          ? throwError(
              () =>
                new AppProblem(
                  503,
                  "request_deadline_exceeded",
                  "Request deadline exceeded",
                  "The request exceeded its bounded processing time. Retry shortly.",
                  [],
                  5,
                ),
            )
          : throwError(() => error),
      ),
    );
  }
}
