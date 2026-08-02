export const SIMULATION_QUEUE_NAME = "simula-behavioral-runs-v2";
export const SIMULATION_JOB_NAME = "execute-behavioral-run-v2";
export const SIMULATION_JOB_SCHEMA_VERSION = 2 as const;
export const SIMULATION_QUEUE_PORT = Symbol("SIMULATION_QUEUE_PORT");

export const SIMULATION_JOB_OPTIONS = Object.freeze({
  attempts: 1,
  removeOnComplete: {
    age: 3_600,
    count: 1_000,
  },
  removeOnFail: {
    age: 86_400,
    count: 5_000,
  },
});
