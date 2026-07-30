import { CompositeDomainReadiness } from "./domain-readiness";

describe("CompositeDomainReadiness", () => {
  it.each([
    [true, true, true, true],
    [false, true, true, false],
    [true, false, true, false],
    [true, true, false, false],
    [false, false, false, false],
  ])(
    "requires PostgreSQL=%s Redis=%s and engine=%s readiness",
    async (databaseReady, redisReady, engineReady, expected) => {
      const readiness = new CompositeDomainReadiness(
        { isReady: jest.fn().mockResolvedValue(databaseReady) },
        { isReady: jest.fn().mockResolvedValue(redisReady) },
        { isReady: jest.fn().mockResolvedValue(engineReady) },
        { configured: false, isReady: jest.fn().mockResolvedValue(false) },
        { isReady: jest.fn().mockResolvedValue(true) },
      );

      await expect(readiness.isReady()).resolves.toBe(expected);
    },
  );

  it("requires storage readiness only when private asset storage is configured", async () => {
    const readiness = new CompositeDomainReadiness(
      { isReady: jest.fn().mockResolvedValue(true) },
      { isReady: jest.fn().mockResolvedValue(true) },
      { isReady: jest.fn().mockResolvedValue(true) },
      { configured: true, isReady: jest.fn().mockResolvedValue(false) },
      { isReady: jest.fn().mockResolvedValue(true) },
    );

    await expect(readiness.isReady()).resolves.toBe(false);
  });

  it("requires the admitted visual provider when visual profiling is enabled", async () => {
    const readiness = new CompositeDomainReadiness(
      { isReady: jest.fn().mockResolvedValue(true) },
      { isReady: jest.fn().mockResolvedValue(true) },
      { isReady: jest.fn().mockResolvedValue(true) },
      { configured: true, isReady: jest.fn().mockResolvedValue(true) },
      { isReady: jest.fn().mockResolvedValue(false) },
    );

    await expect(readiness.isReady()).resolves.toBe(false);
  });
});
