import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { delay } from "rxjs/operators";

import { AppProblem } from "../domain/problem";
import { RequestDeadlineInterceptor } from "./request-deadline.interceptor";

function context(path: string, method = "GET"): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path, method }),
    }),
  } as unknown as ExecutionContext;
}

describe("RequestDeadlineInterceptor", () => {
  it("uses the shorter run-create budget and returns a retryable problem", async () => {
    const interceptor = new RequestDeadlineInterceptor(50, 5);
    const next: CallHandler = { handle: () => of("late").pipe(delay(20)) };

    await expect(
      firstValueFrom(
        interceptor.intercept(
          context(
            "/api/v2/projects/00000000-0000-4000-8000-000000000001/runs",
            "POST",
          ),
          next,
        ),
      ),
    ).rejects.toMatchObject<Partial<AppProblem>>({
      status: 503,
      code: "request_deadline_exceeded",
      retryAfter: 5,
    });
  });

  it("does not apply the domain budget to health routes", async () => {
    const interceptor = new RequestDeadlineInterceptor(1, 1);
    const next: CallHandler = { handle: () => of("ok").pipe(delay(5)) };

    await expect(
      firstValueFrom(interceptor.intercept(context("/health/live"), next)),
    ).resolves.toBe("ok");
  });
});
