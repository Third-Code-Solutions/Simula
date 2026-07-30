import type { RuntimeEnvironment } from "./redis-connection";

export const REQUIRED_DATABASE_MIGRATION_HEAD = "20260730230000";

export interface ProductionAdmission {
  readonly rolloutId: string;
  readonly provenanceUrl: string;
  readonly releaseBundleSha256: string;
  readonly sigstoreBundleSha256: string;
}

export interface DeploymentAdmission {
  readonly migrationHead: typeof REQUIRED_DATABASE_MIGRATION_HEAD;
  readonly productionAdmission?: ProductionAdmission;
}

type DeployedEnvironment = "preview" | "staging" | "production";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function required(
  environment: RuntimeEnvironment,
  name: string,
  configurationError: (message: string) => Error,
): string {
  const value = environment[name];
  if (value === undefined || value.trim() === "") {
    throw configurationError(`${name} is required.`);
  }
  return value.trim();
}

function provenanceUrl(
  rawValue: string,
  configurationError: (message: string) => Error,
): string {
  let value: URL;
  try {
    value = new URL(rawValue);
  } catch {
    throw configurationError(
      "SIMULA_RELEASE_PROVENANCE_URL must identify the SIMULA GitHub Actions run.",
    );
  }
  if (
    value.protocol !== "https:" ||
    value.hostname !== "github.com" ||
    value.port !== "" ||
    !/^\/Third-Code-Solutions\/Simula\/actions\/runs\/[0-9]+$/.test(
      value.pathname,
    ) ||
    value.username !== "" ||
    value.password !== "" ||
    value.search !== "" ||
    value.hash !== ""
  ) {
    throw configurationError(
      "SIMULA_RELEASE_PROVENANCE_URL must identify the SIMULA GitHub Actions run.",
    );
  }
  return value.href;
}

export function parseDeploymentAdmission(
  environment: RuntimeEnvironment,
  simulaEnvironment: "local" | "test" | DeployedEnvironment,
  configurationError: (message: string) => Error,
): DeploymentAdmission {
  if (simulaEnvironment === "local" || simulaEnvironment === "test") {
    return Object.freeze({
      migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
    });
  }

  const migrationHead = required(
    environment,
    "SIMULA_DATABASE_MIGRATION_HEAD",
    configurationError,
  );
  if (migrationHead !== REQUIRED_DATABASE_MIGRATION_HEAD) {
    throw configurationError(
      `SIMULA_DATABASE_MIGRATION_HEAD must equal ${REQUIRED_DATABASE_MIGRATION_HEAD}.`,
    );
  }
  if (simulaEnvironment !== "production") {
    return Object.freeze({
      migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
    });
  }

  if (
    required(
      environment,
      "SIMULA_PRODUCTION_ADMISSION_ENABLED",
      configurationError,
    ) !== "true"
  ) {
    throw configurationError(
      "SIMULA_PRODUCTION_ADMISSION_ENABLED must be true in production.",
    );
  }
  const rolloutId = required(
    environment,
    "SIMULA_PRODUCTION_ROLLOUT_ID",
    configurationError,
  );
  if (!UUID_V4.test(rolloutId)) {
    throw configurationError(
      "SIMULA_PRODUCTION_ROLLOUT_ID must be a lowercase UUIDv4.",
    );
  }
  const releaseBundleSha256 = required(
    environment,
    "SIMULA_RELEASE_BUNDLE_SHA256",
    configurationError,
  );
  if (!/^[0-9a-f]{64}$/.test(releaseBundleSha256)) {
    throw configurationError(
      "SIMULA_RELEASE_BUNDLE_SHA256 must be an exact lowercase SHA-256.",
    );
  }
  const sigstoreBundleSha256 = required(
    environment,
    "SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256",
    configurationError,
  );
  if (!/^[0-9a-f]{64}$/.test(sigstoreBundleSha256)) {
    throw configurationError(
      "SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256 must be an exact lowercase SHA-256.",
    );
  }

  return Object.freeze({
    migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
    productionAdmission: Object.freeze({
      rolloutId,
      provenanceUrl: provenanceUrl(
        required(
          environment,
          "SIMULA_RELEASE_PROVENANCE_URL",
          configurationError,
        ),
        configurationError,
      ),
      releaseBundleSha256,
      sigstoreBundleSha256,
    }),
  });
}
