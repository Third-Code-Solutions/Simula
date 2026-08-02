import { Inject, Injectable } from "@nestjs/common";

import type { AssetObjectStore } from "../assets/asset-object-store";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import type { MethodologyEngine } from "../methodology/methodology-engine";
import type { VisualProfileEngine } from "../assets/visual-profile-engine";
import {
  ASSET_OBJECT_STORE,
  DOMAIN_RATE_LIMITER,
  METHODOLOGY_ENGINE,
  ORGANIZATION_GATEWAY,
  VISUAL_PROFILE_ENGINE,
} from "./domain.constants";

export interface DomainReadiness {
  isReady(): Promise<boolean>;
}

@Injectable()
export class CompositeDomainReadiness implements DomainReadiness {
  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly organizations: Pick<OrganizationGateway, "isReady">,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: Pick<DomainRateLimiter, "isReady">,
    @Inject(METHODOLOGY_ENGINE)
    private readonly methodologyEngine: Pick<MethodologyEngine, "isReady">,
    @Inject(ASSET_OBJECT_STORE)
    private readonly assetObjectStore: Pick<
      AssetObjectStore,
      "configured" | "isReady"
    >,
    @Inject(VISUAL_PROFILE_ENGINE)
    private readonly visualProfileEngine: Pick<VisualProfileEngine, "isReady">,
  ) {}

  async isReady(): Promise<boolean> {
    const [
      databaseReady,
      rateLimiterReady,
      methodologyEngineReady,
      assetStorageReady,
      visualProfileEngineReady,
    ] = await Promise.all([
      this.organizations.isReady(),
      this.rateLimiter.isReady(),
      this.methodologyEngine.isReady(),
      this.assetObjectStore.configured
        ? this.assetObjectStore.isReady()
        : Promise.resolve(true),
      this.visualProfileEngine.isReady(),
    ]);
    return (
      databaseReady &&
      rateLimiterReady &&
      methodologyEngineReady &&
      assetStorageReady &&
      visualProfileEngineReady
    );
  }
}
