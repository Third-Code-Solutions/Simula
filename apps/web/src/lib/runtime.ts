export type RuntimeMetadata = Readonly<{
  environment: string;
  releaseSha: string;
  service: "web";
}>;

export function runtimeMetadata(): RuntimeMetadata {
  return {
    environment: process.env.SIMULA_ENVIRONMENT ?? "local",
    releaseSha: process.env.SIMULA_RELEASE_SHA ?? "dev",
    service: "web",
  };
}

/** Server-owned emergency rollback switch for the Phase 2 result presentation. */
export function resultExperienceEnabled(): boolean {
  return process.env.SIMULA_RESULT_EXPERIENCE_ENABLED !== "false";
}
