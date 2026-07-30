import type { ProjectDetail, SimulationRun, StimulusVersion } from "@/lib/api";

export type BehavioralRefinementApi = Readonly<{
  appendStimulusVersion: (
    stimulusId: string,
    content: string,
    idempotencyKey: string,
  ) => Promise<StimulusVersion>;
  createBehavioralDemoRun: (
    projectId: string,
    stimulusVersionId: string,
    variantKey: string,
    idempotencyKey: string,
  ) => Promise<SimulationRun>;
  getProject: (projectId: string) => Promise<ProjectDetail>;
}>;

type RefinementStep = {
  readonly appendKey: string;
  readonly runKey: string;
  stimulusVersionId?: string;
};

export class BehavioralRefinementCoordinator {
  private readonly inFlight = new Map<string, Promise<SimulationRun>>();
  private readonly progress = new Map<string, RefinementStep>();

  public constructor(
    private readonly api: BehavioralRefinementApi,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  public refine(
    sourceRun: SimulationRun,
    content: string,
    variantKey: string,
  ): Promise<SimulationRun> {
    if (
      sourceRun.schema_version !== 2 ||
      sourceRun.state !== "succeeded" ||
      content.length < 1 ||
      content.length > 5_000 ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(variantKey)
    ) {
      return Promise.reject(new Error("invalid behavioral refinement"));
    }
    const operationKey = `${sourceRun.id}\u0000${variantKey}\u0000${content}`;
    const current = this.inFlight.get(operationKey);
    if (current !== undefined) {
      return current;
    }
    const step =
      this.progress.get(operationKey) ??
      ({
        appendKey: this.createId(),
        runKey: this.createId(),
      } satisfies RefinementStep);
    this.progress.set(operationKey, step);
    const operation = this.execute(
      operationKey,
      step,
      sourceRun,
      content,
      variantKey,
    );
    this.inFlight.set(operationKey, operation);
    void operation.then(
      () => this.inFlight.delete(operationKey),
      () => this.inFlight.delete(operationKey),
    );
    return operation;
  }

  private async execute(
    operationKey: string,
    step: RefinementStep,
    sourceRun: SimulationRun,
    content: string,
    variantKey: string,
  ): Promise<SimulationRun> {
    if (step.stimulusVersionId === undefined) {
      const project = await this.api.getProject(sourceRun.project_id);
      if (project.id !== sourceRun.project_id) {
        throw new Error("refinement project identity mismatch");
      }
      const matches = project.stimuli.filter((stimulus) =>
        stimulus.versions.some(
          (version) => version.id === sourceRun.stimulus_version_id,
        ),
      );
      if (matches.length !== 1) {
        throw new Error("refinement source stimulus is unavailable");
      }
      const sourceStimulus = matches[0];
      if (sourceStimulus === undefined) {
        throw new Error("refinement source stimulus is unavailable");
      }
      const version = await this.api.appendStimulusVersion(
        sourceStimulus.id,
        content,
        step.appendKey,
      );
      if (version.stimulus_id !== sourceStimulus.id) {
        throw new Error("refinement version identity mismatch");
      }
      step.stimulusVersionId = version.id;
    }

    const created = await this.api.createBehavioralDemoRun(
      sourceRun.project_id,
      step.stimulusVersionId,
      variantKey,
      step.runKey,
    );
    if (
      created.schema_version !== 2 ||
      created.project_id !== sourceRun.project_id ||
      created.stimulus_version_id !== step.stimulusVersionId
    ) {
      throw new Error("refinement run identity mismatch");
    }
    this.progress.delete(operationKey);
    return created;
  }
}
