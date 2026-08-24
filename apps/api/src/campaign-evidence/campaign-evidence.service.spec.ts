import type { Pool } from "pg";

import type { VerifiedIdentity } from "../auth/identity";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { AppProblem } from "../domain/problem";
import { CampaignEvidenceService } from "./campaign-evidence.service";

const IDENTITY: VerifiedIdentity = {
  userId: "66000000-0000-4000-8000-000000000001",
  issuer: "https://auth.simula.invalid",
  expiresAt: 4_102_444_800,
  sessionId: "66000000-0000-4000-8000-000000000002",
};

describe("CampaignEvidenceService immutable evidence admission", () => {
  it.each([
    [
      "survey_calibration" as const,
      {
        source_version_id: "66000000-0000-4000-8000-000000000003",
        synthetic_observations: [{ variant_key: "control" }],
        survey: {
          provenance: { checksum_sha256: "a".repeat(64) },
          observations: [{ variant_key: "substituted" }],
        },
      },
    ],
    [
      "historical_backtest" as const,
      {
        outcome_set_id: "66000000-0000-4000-8000-000000000004",
        protocol: {},
        prediction_set: {},
        outcomes: {
          provenance: { checksum_sha256: "b".repeat(64) },
          outcomes: [{ campaign_key: "substituted" }],
        },
      },
    ],
  ])(
    "fails closed for unbound %s payloads before database access",
    async (kind, input) => {
      const connect = jest.fn(() => {
        throw new Error("unbound evidence reached database admission");
      });
      const service = new CampaignEvidenceService(
        { enabled: true, environment: "production" } as EnabledDomainRuntime,
        { connect } as unknown as Pool,
      );

      let failure: unknown;
      try {
        await service.create(
          IDENTITY,
          "66000000-0000-4000-8000-000000000005",
          "66000000-0000-4000-8000-000000000006",
          kind,
          input,
          "campaign-evidence-0001",
          "c".repeat(64),
          "66000000-0000-4000-8000-000000000007",
        );
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(AppProblem);
      expect(failure).toMatchObject({
        code: "version_conflict",
        status: 409,
      });
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it("retires local creation at the same boundary as the database command", async () => {
    const connect = jest.fn(() => {
      throw new Error("retired evidence creation reached database admission");
    });
    const service = new CampaignEvidenceService(
      { enabled: true, environment: "local" } as EnabledDomainRuntime,
      { connect } as unknown as Pool,
    );

    await expect(
      service.create(
        IDENTITY,
        "66000000-0000-4000-8000-000000000005",
        "66000000-0000-4000-8000-000000000006",
        "survey_calibration",
        {
          source_version_id: "66000000-0000-4000-8000-000000000003",
          synthetic_observations: [{ variant_key: "control" }],
          survey: { observations: [] },
        },
        "campaign-evidence-0002",
        "d".repeat(64),
        "66000000-0000-4000-8000-000000000007",
      ),
    ).rejects.toMatchObject({
      code: "version_conflict",
      status: 409,
    });
    expect(connect).not.toHaveBeenCalled();
  });
});
