import {
  parseDeploymentAdmission,
  REQUIRED_DATABASE_MIGRATION_HEAD,
} from "./production-admission";

const failure = (message: string): Error => new Error(message);

const PRODUCTION = Object.freeze({
  SIMULA_DATABASE_MIGRATION_HEAD: REQUIRED_DATABASE_MIGRATION_HEAD,
  SIMULA_PRODUCTION_ADMISSION_ENABLED: "true",
  SIMULA_PRODUCTION_ROLLOUT_ID: "018f274b-3c77-4b22-b749-c9274230ef9a",
  SIMULA_RELEASE_PROVENANCE_URL:
    "https://github.com/Third-Code-Solutions/Simula/actions/runs/12345678",
  SIMULA_RELEASE_BUNDLE_SHA256: "a".repeat(64),
  SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256: "b".repeat(64),
});

describe("parseDeploymentAdmission", () => {
  it("binds local/test to the compiled migration head", () => {
    expect(parseDeploymentAdmission({}, "test", failure)).toEqual({
      migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
    });
  });

  it("requires the exact migration head in every deployed environment", () => {
    expect(
      parseDeploymentAdmission(
        {
          SIMULA_DATABASE_MIGRATION_HEAD: REQUIRED_DATABASE_MIGRATION_HEAD,
        },
        "staging",
        failure,
      ),
    ).toEqual({ migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD });
    expect(() =>
      parseDeploymentAdmission(
        { SIMULA_DATABASE_MIGRATION_HEAD: "20260730220000" },
        "staging",
        failure,
      ),
    ).toThrow(`must equal ${REQUIRED_DATABASE_MIGRATION_HEAD}`);
  });

  it("admits production only with bound rollout and signed provenance", () => {
    expect(parseDeploymentAdmission(PRODUCTION, "production", failure)).toEqual(
      {
        migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
        productionAdmission: {
          rolloutId: PRODUCTION.SIMULA_PRODUCTION_ROLLOUT_ID,
          provenanceUrl: PRODUCTION.SIMULA_RELEASE_PROVENANCE_URL,
          releaseBundleSha256: PRODUCTION.SIMULA_RELEASE_BUNDLE_SHA256,
          sigstoreBundleSha256:
            PRODUCTION.SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256,
        },
      },
    );
  });

  it.each([
    ["SIMULA_PRODUCTION_ADMISSION_ENABLED", undefined],
    ["SIMULA_PRODUCTION_ADMISSION_ENABLED", "false"],
    ["SIMULA_PRODUCTION_ROLLOUT_ID", "not-a-uuid"],
    ["SIMULA_RELEASE_BUNDLE_SHA256", "a".repeat(63)],
    ["SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256", "a".repeat(63)],
    [
      "SIMULA_RELEASE_PROVENANCE_URL",
      "https://github.com/attacker/repository/actions/runs/12345678",
    ],
    [
      "SIMULA_RELEASE_PROVENANCE_URL",
      "https://github.com:444/Third-Code-Solutions/Simula/actions/runs/12345678",
    ],
    [
      "SIMULA_RELEASE_PROVENANCE_URL",
      "https://github.com:invalid/Third-Code-Solutions/Simula/actions/runs/12345678",
    ],
  ])("rejects unsafe production %s", (name, value) => {
    expect(() =>
      parseDeploymentAdmission(
        { ...PRODUCTION, [name]: value },
        "production",
        failure,
      ),
    ).toThrow();
  });
});
