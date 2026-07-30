import { runDispatcherService } from "./dispatcher-service";

function logger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
  };
}

describe("runDispatcherService", () => {
  it("fails before polling unless both worker-only dependencies are ready", async () => {
    const dispatcher = { dispatchOnce: jest.fn() };

    await expect(
      runDispatcherService(
        dispatcher,
        {
          isReady: jest.fn().mockResolvedValue(false),
          evaluateRunCreationControl: jest.fn(),
          updateBullMqRunPressure: jest.fn(),
        },
        {
          isReady: jest.fn().mockResolvedValue(true),
          snapshot: jest.fn(),
        },
        new AbortController().signal,
        logger(),
      ),
    ).rejects.toThrow("dependencies are not ready");
    expect(dispatcher.dispatchOnce).not.toHaveBeenCalled();
  });

  it("runs one bounded pass and stops cleanly on abort", async () => {
    const abort = new AbortController();
    const log = logger();
    const result = {
      canceled: 1,
      poisoned: 2,
      recovered: 0,
      claimed: 1,
      confirmed: 1,
    };
    const dispatcher = {
      dispatchOnce: jest.fn().mockImplementation(async () => {
        abort.abort();
        return result;
      }),
    };
    const evaluateRunCreationControl = jest.fn().mockResolvedValue(undefined);
    const updateBullMqRunPressure = jest.fn().mockResolvedValue(undefined);
    const health = {
      markReady: jest.fn(),
      markPassSucceeded: jest.fn(),
      markStopping: jest.fn(),
    };

    await runDispatcherService(
      dispatcher,
      {
        isReady: jest.fn().mockResolvedValue(true),
        evaluateRunCreationControl,
        updateBullMqRunPressure,
      },
      {
        isReady: jest.fn().mockResolvedValue(true),
        snapshot: jest.fn().mockResolvedValue({
          depth: 7,
          memoryPercent: 25,
          oldestReadyAgeSeconds: 12.5,
        }),
      },
      abort.signal,
      log,
      undefined,
      health,
    );

    expect(dispatcher.dispatchOnce).toHaveBeenCalledWith(10);
    expect(updateBullMqRunPressure).toHaveBeenCalledWith(7, 12.5, 25);
    expect(evaluateRunCreationControl.mock.calls).toEqual([
      [25, 0],
      [25, 2],
    ]);
    expect(log.info).toHaveBeenNthCalledWith(1, {
      event: "dispatcher_started",
    });
    expect(log.info).toHaveBeenNthCalledWith(2, {
      event: "dispatcher_pass",
      ...result,
    });
    expect(log.info).toHaveBeenNthCalledWith(3, {
      event: "dispatcher_stopped",
    });
    expect(log.error).not.toHaveBeenCalled();
    expect(health.markReady).toHaveBeenCalledTimes(1);
    expect(health.markPassSucceeded).toHaveBeenCalledTimes(1);
    expect(health.markStopping).toHaveBeenCalledTimes(1);
  });

  it("logs only the failure class from a failed pass", async () => {
    const abort = new AbortController();
    const log = logger();
    const dispatcher = {
      dispatchOnce: jest.fn().mockImplementation(async () => {
        abort.abort();
        throw new TypeError("sensitive failure detail");
      }),
    };

    await runDispatcherService(
      dispatcher,
      {
        isReady: jest.fn().mockResolvedValue(true),
        evaluateRunCreationControl: jest.fn().mockResolvedValue(undefined),
        updateBullMqRunPressure: jest.fn().mockResolvedValue(undefined),
      },
      {
        isReady: jest.fn().mockResolvedValue(true),
        snapshot: jest.fn().mockResolvedValue({
          depth: 0,
          memoryPercent: 25,
          oldestReadyAgeSeconds: 0,
        }),
      },
      abort.signal,
      log,
    );

    expect(log.error).toHaveBeenCalledWith({
      event: "dispatcher_pass_failed",
      error_class: "TypeError",
    });
    expect(
      JSON.stringify([log.info.mock.calls, log.error.mock.calls]),
    ).not.toContain("sensitive failure detail");
  });

  it("runs and reports durable organization deletion reconciliation", async () => {
    const abort = new AbortController();
    const log = logger();
    const deletion = {
      reconcileIfDue: jest.fn().mockResolvedValue({
        claimed: 2,
        completed: 2,
        released: 0,
        finalized: 1,
      }),
    };

    await runDispatcherService(
      {
        dispatchOnce: jest.fn().mockImplementation(async () => {
          abort.abort();
          return {
            canceled: 0,
            poisoned: 0,
            recovered: 0,
            claimed: 0,
            confirmed: 0,
          };
        }),
      },
      {
        isReady: jest.fn().mockResolvedValue(true),
        evaluateRunCreationControl: jest.fn().mockResolvedValue(undefined),
        updateBullMqRunPressure: jest.fn().mockResolvedValue(undefined),
      },
      {
        isReady: jest.fn().mockResolvedValue(true),
        snapshot: jest.fn().mockResolvedValue({
          depth: 0,
          memoryPercent: 1,
          oldestReadyAgeSeconds: 0,
        }),
      },
      abort.signal,
      log,
      deletion,
    );

    expect(deletion.reconcileIfDue).toHaveBeenCalledWith(10);
    expect(log.info).toHaveBeenCalledWith({
      event: "organization_deletion_reconciliation_pass",
      claimed: 2,
      completed: 2,
      released: 0,
      finalized: 1,
    });
  });
});
