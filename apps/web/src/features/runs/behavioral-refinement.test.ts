import { describe, expect, it, vi } from "vitest";

import type { ProjectDetail, SimulationRun, StimulusVersion } from "@/lib/api";

import {
  BehavioralRefinementCoordinator,
  type BehavioralRefinementApi,
} from "./behavioral-refinement";

const SOURCE_RUN = {
  id: "018f274b-3c77-7b22-b749-c9274230ef90",
  organization_id: "018f274b-3c77-7b22-b749-c9274230ef91",
  project_id: "018f274b-3c77-7b22-b749-c9274230ef92",
  stimulus_version_id: "018f274b-3c77-7b22-b749-c9274230ef93",
  audience_version_id: "018f274b-3c77-7b22-b749-c9274230ef94",
  state: "succeeded",
  schema_version: 2,
  dispatch_generation: 1,
  job_id: "run-018f274b-3c77-7b22-b749-c9274230ef90-generation-1",
  version: 4,
  created_at: "2026-07-29T06:00:00.123456Z",
  failure: null,
} as const satisfies SimulationRun;

const REFINED_VERSION = {
  id: "018f274b-3c77-7b22-b749-c9274230ef95",
  organization_id: SOURCE_RUN.organization_id,
  stimulus_id: "018f274b-3c77-7b22-b749-c9274230ef96",
  version: 2,
  content: "Refined message.",
  content_sha256: "a".repeat(64),
  created_at: "2026-07-29T06:05:00.123456Z",
} satisfies StimulusVersion;

const PROJECT = {
  id: SOURCE_RUN.project_id,
  organization_id: SOURCE_RUN.organization_id,
  name: "Campaign",
  objective: "Inspect a message.",
  market: "philippines",
  language: "en",
  category: "campaign_message",
  status: "active",
  version: 1,
  created_at: "2026-07-29T05:00:00.123456Z",
  updated_at: "2026-07-29T05:00:00.123456Z",
  stimuli: [
    {
      id: REFINED_VERSION.stimulus_id,
      organization_id: SOURCE_RUN.organization_id,
      project_id: SOURCE_RUN.project_id,
      name: "Message",
      status: "active",
      created_at: "2026-07-29T05:00:00.123456Z",
      versions: [
        {
          ...REFINED_VERSION,
          id: SOURCE_RUN.stimulus_version_id,
          version: 1,
          content: "Original message.",
        },
      ],
    },
  ],
} as const satisfies ProjectDetail;

describe("BehavioralRefinementCoordinator", () => {
  it("reuses the immutable revision and both idempotency keys after an ambiguous run failure", async () => {
    const getProject = vi.fn().mockResolvedValue(PROJECT);
    const appendStimulusVersion = vi.fn().mockResolvedValue(REFINED_VERSION);
    const refinedRun = {
      ...SOURCE_RUN,
      id: "018f274b-3c77-7b22-b749-c9274230ef97",
      stimulus_version_id: REFINED_VERSION.id,
      state: "queued",
      version: 1,
      job_id: "run-018f274b-3c77-7b22-b749-c9274230ef97-generation-1",
    } satisfies SimulationRun;
    const createBehavioralDemoRun = vi
      .fn()
      .mockRejectedValueOnce(new Error("ambiguous network failure"))
      .mockResolvedValueOnce(refinedRun);
    const ids = [
      "append-idempotency-key-000000000001",
      "run-idempotency-key-000000000000001",
    ];
    const coordinator = new BehavioralRefinementCoordinator(
      {
        appendStimulusVersion,
        createBehavioralDemoRun,
        getProject,
      } satisfies BehavioralRefinementApi,
      () => ids.shift() ?? "unexpected-key",
    );

    await expect(
      coordinator.refine(SOURCE_RUN, "Refined message.", "baseline_refined"),
    ).rejects.toThrow("ambiguous network failure");
    await expect(
      coordinator.refine(SOURCE_RUN, "Refined message.", "baseline_refined"),
    ).resolves.toEqual(refinedRun);

    expect(getProject).toHaveBeenCalledTimes(1);
    expect(appendStimulusVersion).toHaveBeenCalledTimes(1);
    expect(appendStimulusVersion).toHaveBeenCalledWith(
      REFINED_VERSION.stimulus_id,
      "Refined message.",
      "append-idempotency-key-000000000001",
    );
    expect(createBehavioralDemoRun).toHaveBeenCalledTimes(2);
    expect(createBehavioralDemoRun).toHaveBeenNthCalledWith(
      2,
      SOURCE_RUN.project_id,
      REFINED_VERSION.id,
      "baseline_refined",
      "run-idempotency-key-000000000000001",
    );
  });

  it("fails before mutation when the immutable source cannot be resolved", async () => {
    const api = {
      getProject: vi.fn().mockResolvedValue({ ...PROJECT, stimuli: [] }),
      appendStimulusVersion: vi.fn(),
      createBehavioralDemoRun: vi.fn(),
    } satisfies BehavioralRefinementApi;
    const coordinator = new BehavioralRefinementCoordinator(api);

    await expect(
      coordinator.refine(SOURCE_RUN, "Refined message.", "refined"),
    ).rejects.toThrow("refinement source stimulus is unavailable");
    expect(api.appendStimulusVersion).not.toHaveBeenCalled();
    expect(api.createBehavioralDemoRun).not.toHaveBeenCalled();
  });
});
