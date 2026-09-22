import { Pool } from "pg";

import { guardPoolErrors } from "./pool-error-guard";

describe("guardPoolErrors", () => {
  it("keeps an unattended pool from turning a dropped connection into a crash", () => {
    const logger = { error: jest.fn() };
    const pool = guardPoolErrors(new Pool({ max: 1 }), logger);

    try {
      // An `error` event with no listener is rethrown by EventEmitter and would
      // escape as an uncaught exception, which is what killed the dispatcher.
      expect(() =>
        pool.emit("error", new Error("Connection terminated unexpectedly")),
      ).not.toThrow();
      expect(logger.error).toHaveBeenCalledTimes(1);
    } finally {
      void pool.end();
    }
  });

  it("reports the error class without exposing dependency detail", () => {
    const logger = { error: jest.fn() };
    const pool = guardPoolErrors(new Pool({ max: 1 }), logger);

    try {
      const failure = new Error("password authentication failed for simula");
      failure.name = "DatabaseError";
      pool.emit("error", failure);

      expect(logger.error).toHaveBeenCalledWith({
        event: "database_pool_error",
        error_class: "Error",
      });
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
        "password authentication failed",
      );
    } finally {
      void pool.end();
    }
  });

  it("returns the guarded pool so factories can return it directly", () => {
    const pool = new Pool({ max: 1 });

    try {
      expect(guardPoolErrors(pool, { error: jest.fn() })).toBe(pool);
      expect(pool.listenerCount("error")).toBe(1);
    } finally {
      void pool.end();
    }
  });
});
