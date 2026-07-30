import { DynamicModule, Module, type Provider } from "@nestjs/common";

import {
  S3AssetObjectStore,
  UnavailableAssetObjectStore,
} from "../assets/s3-asset-object-store";
import { StimulusAssetsController } from "../assets/stimulus-assets.controller";
import { StimulusVisualProfilesController } from "../assets/stimulus-visual-profiles.controller";
import {
  PrivateVisualProfileEngine,
  UnavailableVisualProfileEngine,
} from "../assets/visual-profile-engine";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { SupabaseTokenVerifier } from "../auth/supabase-token-verifier";
import { UnavailableIdentityVerifier } from "../auth/unavailable-identity-verifier";
import type { RuntimeEnvironment } from "../config/redis-connection";
import { IdentityController } from "../identity/identity.controller";
import { AuthEventsController } from "../identity/auth-events.controller";
import { AudiencesController } from "../audiences/audiences.controller";
import { CursorCodec } from "../organizations/cursor-codec";
import { OrganizationsController } from "../organizations/organizations.controller";
import { ProjectsController } from "../projects/projects.controller";
import {
  createDomainPool,
  PgOrganizationGateway,
} from "../organizations/pg-organization-gateway";
import { UnavailableOrganizationGateway } from "../organizations/unavailable-organization-gateway";
import {
  createDomainRedis,
  RedisDomainRateLimiter,
  UnavailableDomainRateLimiter,
} from "../rate-limits/domain-rate-limiter";
import { StimuliController } from "../stimuli/stimuli.controller";
import { RunsController } from "../runs/runs.controller";
import {
  PrivateMethodologyEngine,
  UnavailableMethodologyEngine,
} from "../methodology/methodology-engine";
import { MethodologyController } from "../methodology/methodology.controller";
import { OptimizationController } from "../methodology/optimization.controller";
import {
  ASSET_OBJECT_STORE,
  DOMAIN_DATABASE_POOL,
  DOMAIN_HTTP_FETCHER,
  DOMAIN_IDENTITY_VERIFIER,
  DOMAIN_RATE_LIMITER,
  DOMAIN_READINESS,
  DOMAIN_REDIS_CLIENT,
  DOMAIN_RUNTIME_CONFIG,
  METHODOLOGY_ENGINE,
  ORGANIZATION_GATEWAY,
  VISUAL_PROFILE_ENGINE,
} from "./domain.constants";
import { CompositeDomainReadiness } from "./domain-readiness";
import { parseDomainRuntime } from "./domain-runtime";

@Module({})
export class DomainModule {
  static register(
    environment: RuntimeEnvironment = process.env,
  ): DynamicModule {
    const runtime = parseDomainRuntime(environment);
    const identityProvider = runtime.enabled
      ? SupabaseTokenVerifier
      : UnavailableIdentityVerifier;
    const organizationProvider = runtime.enabled
      ? PgOrganizationGateway
      : UnavailableOrganizationGateway;
    const rateLimiterProvider = runtime.enabled
      ? RedisDomainRateLimiter
      : UnavailableDomainRateLimiter;
    const methodologyEngineProvider = runtime.enabled
      ? PrivateMethodologyEngine
      : UnavailableMethodologyEngine;
    const assetObjectStoreProvider =
      runtime.enabled && runtime.assetStorage !== undefined
        ? S3AssetObjectStore
        : UnavailableAssetObjectStore;
    const visualProfileEngineProvider =
      runtime.enabled && runtime.visualProfileEnabled === true
        ? PrivateVisualProfileEngine
        : UnavailableVisualProfileEngine;
    const providers: Provider[] = [
      {
        provide: DOMAIN_RUNTIME_CONFIG,
        useValue: runtime,
      },
      {
        provide: DOMAIN_IDENTITY_VERIFIER,
        useClass: identityProvider,
      },
      {
        provide: DOMAIN_HTTP_FETCHER,
        useValue: globalThis.fetch.bind(globalThis),
      },
      {
        provide: ORGANIZATION_GATEWAY,
        useClass: organizationProvider,
      },
      {
        provide: DOMAIN_RATE_LIMITER,
        useClass: rateLimiterProvider,
      },
      {
        provide: METHODOLOGY_ENGINE,
        useClass: methodologyEngineProvider,
      },
      {
        provide: ASSET_OBJECT_STORE,
        useClass: assetObjectStoreProvider,
      },
      {
        provide: VISUAL_PROFILE_ENGINE,
        useClass: visualProfileEngineProvider,
      },
      {
        provide: DOMAIN_READINESS,
        useClass: CompositeDomainReadiness,
      },
      CursorCodec,
      SupabaseAuthGuard,
    ];
    if (runtime.enabled) {
      providers.push(
        {
          provide: DOMAIN_DATABASE_POOL,
          useFactory: createDomainPool,
          inject: [DOMAIN_RUNTIME_CONFIG],
        },
        {
          provide: DOMAIN_REDIS_CLIENT,
          useFactory: createDomainRedis,
          inject: [DOMAIN_RUNTIME_CONFIG],
        },
      );
    }

    return {
      global: true,
      module: DomainModule,
      controllers: [
        AudiencesController,
        AuthEventsController,
        IdentityController,
        MethodologyController,
        OptimizationController,
        OrganizationsController,
        ProjectsController,
        RunsController,
        StimulusAssetsController,
        StimulusVisualProfilesController,
        StimuliController,
      ],
      providers,
      exports: [
        DOMAIN_RATE_LIMITER,
        DOMAIN_READINESS,
        DOMAIN_RUNTIME_CONFIG,
        ASSET_OBJECT_STORE,
        VISUAL_PROFILE_ENGINE,
        METHODOLOGY_ENGINE,
        ORGANIZATION_GATEWAY,
      ],
    };
  }
}
