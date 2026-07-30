import { afterEach, describe, expect, it } from "vitest";

import {
  behavioralDemoEnabled,
  privateAssetWorkflowEnabled,
  resultExperienceEnabled,
  technicalVisualProfileEnabled,
} from "./runtime";

const initialValue = process.env.SIMULA_RESULT_EXPERIENCE_ENABLED;
const initialBehavioralValue = process.env.SIMULA_BEHAVIORAL_DEMO_ENABLED;
const initialAssetValue = process.env.SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED;
const initialVisualValue = process.env.SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED;
const initialApiVersion = process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION;

afterEach(() => {
  if (initialValue === undefined) {
    delete process.env.SIMULA_RESULT_EXPERIENCE_ENABLED;
  } else {
    process.env.SIMULA_RESULT_EXPERIENCE_ENABLED = initialValue;
  }
  if (initialBehavioralValue === undefined) {
    delete process.env.SIMULA_BEHAVIORAL_DEMO_ENABLED;
  } else {
    process.env.SIMULA_BEHAVIORAL_DEMO_ENABLED = initialBehavioralValue;
  }
  if (initialAssetValue === undefined) {
    delete process.env.SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED;
  } else {
    process.env.SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED = initialAssetValue;
  }
  if (initialVisualValue === undefined) {
    delete process.env.SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED;
  } else {
    process.env.SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED = initialVisualValue;
  }
  if (initialApiVersion === undefined) {
    delete process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION;
  } else {
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = initialApiVersion;
  }
});

describe("resultExperienceEnabled", () => {
  it("defaults on and allows the server to hide the result experience", () => {
    delete process.env.SIMULA_RESULT_EXPERIENCE_ENABLED;
    expect(resultExperienceEnabled()).toBe(true);

    process.env.SIMULA_RESULT_EXPERIENCE_ENABLED = "false";
    expect(resultExperienceEnabled()).toBe(false);
  });
});

describe("behavioralDemoEnabled", () => {
  it("fails closed unless both the explicit switch and v2 control plane agree", () => {
    delete process.env.SIMULA_BEHAVIORAL_DEMO_ENABLED;
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v2";
    expect(behavioralDemoEnabled()).toBe(false);

    process.env.SIMULA_BEHAVIORAL_DEMO_ENABLED = "true";
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v1";
    expect(behavioralDemoEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v2";
    expect(behavioralDemoEnabled()).toBe(true);
  });
});

describe("privateAssetWorkflowEnabled", () => {
  it("fails closed unless both the explicit switch and v2 control plane agree", () => {
    delete process.env.SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED;
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v2";
    expect(privateAssetWorkflowEnabled()).toBe(false);

    process.env.SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED = "true";
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v1";
    expect(privateAssetWorkflowEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v2";
    expect(privateAssetWorkflowEnabled()).toBe(true);
  });
});

describe("technicalVisualProfileEnabled", () => {
  it("requires the visual, private-asset, and v2 switches together", () => {
    process.env.SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED = "true";
    process.env.SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED = "false";
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v2";
    expect(technicalVisualProfileEnabled()).toBe(false);

    process.env.SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED = "true";
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v1";
    expect(technicalVisualProfileEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v2";
    expect(technicalVisualProfileEnabled()).toBe(true);
  });
});
