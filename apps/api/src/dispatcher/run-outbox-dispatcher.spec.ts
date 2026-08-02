import {
  type RunDispatchClaim,
  RunOutboxDispatcher,
} from "./run-outbox-dispatcher";

const CLAIM: RunDispatchClaim = Object.freeze({
  outbox_id: "018f274b-3c77-7b22-b749-c9274230ef9a",
  run_id: "018f274b-3c77-7b22-b749-c9274230ef9b",
  dispatch_generation: 2,
  claim_token: "018f274b-3c77-7b22-b749-c9274230ef9c",
});

function database() {
  return {
    requireQueueTransport: jest.fn().mockResolvedValue(undefined),
    finalizeRequestedCancellations: jest.fn().mockResolvedValue(1),
    finalizePoisonedDispatches: jest.fn().mockResolvedValue(2),
    reconcileStaleDispatches: jest.fn().mockResolvedValue(3),
    claimDueDispatches: jest.fn().mockResolvedValue([CLAIM]),
    confirmDispatch: jest.fn().mockResolvedValue(true),
    failDispatch: jest.fn().mockResolvedValue(true),
  };
}

function queue() {
  return {
    publish: jest.fn().mockResolvedValue({
      job_id: `run-${CLAIM.run_id}-generation-2`,
    }),
    provesPublished: jest.fn().mockResolvedValue(true),
  };
}

describe("RunOutboxDispatcher", () => {
  it("fails before any durable mutation when BullMQ does not own the transport", async () => {
    const store = database();
    const transport = queue();
    store.requireQueueTransport.mockRejectedValueOnce(
      new Error("queue_transport_inactive"),
    );

    await expect(
      new RunOutboxDispatcher(store, transport).dispatchOnce(),
    ).rejects.toThrow("queue_transport_inactive");
    expect(store.finalizeRequestedCancellations).not.toHaveBeenCalled();
    expect(store.claimDueDispatches).not.toHaveBeenCalled();
    expect(transport.publish).not.toHaveBeenCalled();
  });

  it("confirms durable intent only after exact queue proof", async () => {
    const store = database();
    const transport = queue();
    const dispatcher = new RunOutboxDispatcher(store, transport, () => 1);

    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 1,
      poisoned: 2,
      recovered: 3,
      claimed: 1,
      confirmed: 1,
    });
    expect(transport.publish).toHaveBeenCalledWith({
      schema_version: 2,
      run_id: CLAIM.run_id,
      dispatch_generation: 2,
    });
    expect(transport.provesPublished).toHaveBeenCalledTimes(1);
    expect(store.confirmDispatch).toHaveBeenCalledWith(
      CLAIM.outbox_id,
      CLAIM.claim_token,
    );
    expect(store.failDispatch).not.toHaveBeenCalled();
  });

  it("leaves an unproven successful publish unconfirmed for lease recovery", async () => {
    const store = database();
    const transport = queue();
    transport.provesPublished.mockResolvedValueOnce(false);

    await expect(
      new RunOutboxDispatcher(store, transport).dispatchOnce(),
    ).resolves.toMatchObject({ claimed: 1, confirmed: 0 });
    expect(store.confirmDispatch).not.toHaveBeenCalled();
    expect(store.failDispatch).not.toHaveBeenCalled();
  });

  it("confirms an ambiguous publish only when a follow-up read proves it", async () => {
    const store = database();
    const transport = queue();
    transport.publish.mockRejectedValueOnce(new Error("timeout"));
    transport.provesPublished.mockResolvedValueOnce(true);

    await expect(
      new RunOutboxDispatcher(store, transport).dispatchOnce(),
    ).resolves.toMatchObject({ claimed: 1, confirmed: 1 });
    expect(store.confirmDispatch).toHaveBeenCalledTimes(1);
    expect(store.failDispatch).not.toHaveBeenCalled();
  });

  it("records a definite absent publish for bounded durable retry", async () => {
    const store = database();
    const transport = queue();
    transport.publish.mockRejectedValueOnce(new Error("connection refused"));
    transport.provesPublished.mockResolvedValueOnce(false);

    await expect(
      new RunOutboxDispatcher(store, transport).dispatchOnce(),
    ).resolves.toMatchObject({ claimed: 1, confirmed: 0 });
    expect(store.confirmDispatch).not.toHaveBeenCalled();
    expect(store.failDispatch).toHaveBeenCalledWith(
      CLAIM.outbox_id,
      CLAIM.claim_token,
      "dispatch_transport_failed",
    );
  });

  it("never converts an unavailable proof read into a definite failure", async () => {
    const store = database();
    const transport = queue();
    transport.publish.mockRejectedValueOnce(new Error("timeout"));
    transport.provesPublished.mockRejectedValueOnce(new Error("timeout"));

    await expect(
      new RunOutboxDispatcher(store, transport).dispatchOnce(),
    ).resolves.toMatchObject({ claimed: 1, confirmed: 0 });
    expect(store.confirmDispatch).not.toHaveBeenCalled();
    expect(store.failDispatch).not.toHaveBeenCalled();
  });

  it("runs stale recovery at most once per 30-second interval", async () => {
    const store = database();
    store.claimDueDispatches.mockResolvedValue([]);
    const times = [1, 2, 30_002];
    const dispatcher = new RunOutboxDispatcher(
      store,
      queue(),
      () => times.shift() ?? 30_002,
    );

    await dispatcher.dispatchOnce();
    await dispatcher.dispatchOnce();
    await dispatcher.dispatchOnce();

    expect(store.reconcileStaleDispatches).toHaveBeenCalledTimes(2);
  });
});
