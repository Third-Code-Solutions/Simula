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
