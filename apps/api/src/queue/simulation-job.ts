import { plainToInstance } from "class-transformer";
import { Equals, IsInt, IsUUID, Max, Min, validate } from "class-validator";

import { SIMULATION_JOB_SCHEMA_VERSION } from "./queue.constants";

export interface SimulationJobData {
  readonly schema_version: typeof SIMULATION_JOB_SCHEMA_VERSION;
  readonly run_id: string;
  readonly dispatch_generation: number;
}

class SimulationJobDto {
  @Equals(SIMULATION_JOB_SCHEMA_VERSION)
  schema_version!: typeof SIMULATION_JOB_SCHEMA_VERSION;

  @IsUUID()
  run_id!: string;

  @IsInt()
  @Min(1)
  @Max(3)
  dispatch_generation!: number;
}

export class InvalidSimulationJobError extends Error {
  constructor() {
    super("Simulation job payload failed closed validation.");
    this.name = "InvalidSimulationJobError";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

export async function validateSimulationJob(
  value: unknown,
): Promise<SimulationJobData> {
  if (!isPlainRecord(value)) {
    throw new InvalidSimulationJobError();
  }

  const dto = plainToInstance(SimulationJobDto, value);
  const errors = await validate(dto, {
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: false,
    whitelist: true,
  });
  if (errors.length > 0) {
    throw new InvalidSimulationJobError();
  }

  return Object.freeze({
    dispatch_generation: dto.dispatch_generation,
    run_id: dto.run_id,
    schema_version: dto.schema_version,
  });
}

export function simulationJobId(job: SimulationJobData): string {
  return `run-${job.run_id}-generation-${job.dispatch_generation}`;
}
