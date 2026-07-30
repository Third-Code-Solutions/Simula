import { Injectable } from "@nestjs/common";

import { dependencyUnavailable } from "../domain/problem";
import type { IdentityVerifier, VerifiedIdentity } from "./identity";

@Injectable()
export class UnavailableIdentityVerifier implements IdentityVerifier {
  async verify(_token: string): Promise<VerifiedIdentity> {
    throw dependencyUnavailable(
      "The authenticated NestJS migration surface is disabled.",
    );
  }
}
