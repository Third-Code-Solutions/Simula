export type RuntimeMetadata = Readonly<{
  environment: string;
  releaseSha: string;
  service: "web";
}>;

export function runtimeMetadata(): RuntimeMetadata {
  return {
    environment: process.env.SIMULA_ENVIRONMENT ?? "local",
    releaseSha:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.SIMULA_RELEASE_SHA ??
      "dev",
    service: "web",
  };
}

/** Server-owned emergency rollback switch for the Phase 2 result presentation. */
export function resultExperienceEnabled(): boolean {
  return process.env.SIMULA_RESULT_EXPERIENCE_ENABLED !== "false";
}

/** Server-owned admission switch for the experimental NestJS behavioral path. */
export function behavioralDemoEnabled(): boolean {
  return (
    process.env.SIMULA_BEHAVIORAL_DEMO_ENABLED === "true" &&
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION === "v2"
  );
}

/** Server-owned admission switch for governed private stimulus files. */
export function privateAssetWorkflowEnabled(): boolean {
  return (
    process.env.SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED === "true" &&
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION === "v2"
  );
}

/** Server-owned admission switch for measured technical image profiling. */
export function technicalVisualProfileEnabled(): boolean {
  return (
    privateAssetWorkflowEnabled() &&
    process.env.SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED === "true"
  );
}
