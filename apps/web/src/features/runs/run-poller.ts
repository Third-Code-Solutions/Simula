import { ApiProblem, getSimulationRun } from "@/lib/api";

import { type SimulationRun, isTerminalRunState } from "./result-contract";

export type RunPollSnapshot = Readonly<{
  error?: ApiProblem;
  isSlow: boolean;
  isStopped: boolean;
  run?: SimulationRun;
  stopReason?: "authorization" | "not_found" | "terminal" | "timed_out";
}>;

type Listener = (snapshot: RunPollSnapshot) => void;
type FetchRun = (runId: string) => Promise<SimulationRun>;

export type PollerClock = Readonly<{
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  now: () => number;
  random: () => number;
  setTimeout: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
}>;

const defaultClock: PollerClock = {
  clearTimeout,
  now: Date.now,
  random: Math.random,
  setTimeout,
};

const BASE_DELAYS = [1_000, 1_500, 2_250, 3_500, 5_000, 10_000] as const;
const SLOW_AFTER_MS = 5 * 60_000;
const STOP_AFTER_MS = 30 * 60_000;

function isStopError(
  error: ApiProblem,
): "authorization" | "not_found" | undefined {
  if (error.status === 401 || error.status === 403) {
    return "authorization";
  }
  if (error.status === 404) {
    return "not_found";
  }
  return undefined;
}

class SharedRunPoller {
  private attempt = 0;
  private readonly listeners = new Set<Listener>();
  private readonly startedAt: number;
  private inFlight = false;
  private snapshot: RunPollSnapshot = { isSlow: false, isStopped: false };
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly runId: string,
    private readonly fetchRun: FetchRun,
    private readonly clock: PollerClock,
    private readonly onEmpty: () => void,
  ) {
    this.startedAt = clock.now();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    if (this.listeners.size === 1 && !this.snapshot.isStopped) {
      void this.poll();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
        this.onEmpty();
      }
    };
  }

  public refresh(): void {
    if (this.listeners.size === 0) {
      return;
    }
    if (this.timer) {
      this.clock.clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.snapshot = {
      ...this.snapshot,
      error: undefined,
      isStopped: false,
      stopReason: undefined,
    };
    void this.poll();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  private schedule(): void {
    const elapsed = this.clock.now() - this.startedAt;
    if (elapsed >= STOP_AFTER_MS) {
      this.snapshot = {
        ...this.snapshot,
        isSlow: true,
        isStopped: true,
        stopReason: "timed_out",
      };
      this.emit();
      return;
    }
    const base =
      elapsed >= SLOW_AFTER_MS
        ? 30_000
        : (BASE_DELAYS[Math.min(this.attempt, 5)] ?? 10_000);
    const jitter = 0.8 + this.clock.random() * 0.4;
    this.attempt += 1;
    this.timer = this.clock.setTimeout(
      () => {
        this.timer = undefined;
        void this.poll();
      },
      Math.round(base * jitter),
    );
  }

  private async poll(): Promise<void> {
    if (this.inFlight) {
      return;
    }
    this.inFlight = true;
    try {
      const run = await this.fetchRun(this.runId);
      const terminal = isTerminalRunState(run.state);
      this.snapshot = {
        isSlow: this.clock.now() - this.startedAt >= SLOW_AFTER_MS,
        isStopped: terminal,
        run,
        stopReason: terminal ? "terminal" : undefined,
      };
      this.emit();
      if (!terminal && this.listeners.size > 0) {
        this.schedule();
      }
    } catch (error) {
      const problem =
        error instanceof ApiProblem
          ? error
          : new ApiProblem(
              503,
              "api_unavailable",
              "SIMULA is temporarily unavailable. Retry shortly.",
            );
      const stopReason = isStopError(problem);
      this.snapshot = {
        ...this.snapshot,
        error: problem,
        isSlow: this.clock.now() - this.startedAt >= SLOW_AFTER_MS,
        isStopped: stopReason !== undefined,
        stopReason,
      };
      this.emit();
      if (!stopReason && this.listeners.size > 0) {
        this.schedule();
      }
    } finally {
      this.inFlight = false;
    }
  }

  private stop(): void {
    if (this.timer) {
      this.clock.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}

export class RunPollerRegistry {
  private readonly pollers = new Map<string, SharedRunPoller>();

  public constructor(
    private readonly fetchRun: FetchRun,
    private readonly clock: PollerClock = defaultClock,
  ) {}

  public subscribe(
    runId: string,
    listener: Listener,
  ): Readonly<{ refresh: () => void; unsubscribe: () => void }> {
    let poller = this.pollers.get(runId);
    if (!poller) {
      poller = new SharedRunPoller(runId, this.fetchRun, this.clock, () => {
        this.pollers.delete(runId);
      });
      this.pollers.set(runId, poller);
    }
    return {
      refresh: () => poller.refresh(),
      unsubscribe: poller.subscribe(listener),
    };
  }
}

export const runPollers = new RunPollerRegistry(getSimulationRun);
