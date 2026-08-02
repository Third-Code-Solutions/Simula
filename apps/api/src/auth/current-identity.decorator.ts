import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import { unauthenticated } from "../domain/problem";
import type { AuthenticatedRequest } from "./supabase-auth.guard";

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const identity = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().simulaIdentity;
    if (identity === undefined) {
      throw unauthenticated();
    }
    return identity;
  },
);
