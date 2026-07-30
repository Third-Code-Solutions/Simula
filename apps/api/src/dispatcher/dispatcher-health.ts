import { createServer, type Server } from "node:http";

export interface DispatcherHealthSnapshot {
  readonly live: boolean;
  readonly ready: boolean;
}

export class DispatcherHealthState {
  private live = true;
  private lastSuccessfulPassAt: number | null = null;

  constructor(private readonly maximumPassStalenessMs = 60_000) {
    if (
      !Number.isSafeInteger(maximumPassStalenessMs) ||
      maximumPassStalenessMs < 1_000
    ) {
      throw new Error(
        "dispatcher health staleness must be a positive integer of at least one second",
      );
    }
  }

  markReady(now = Date.now()): void {
    this.lastSuccessfulPassAt = now;
  }

  markPassSucceeded(now = Date.now()): void {
    this.lastSuccessfulPassAt = now;
  }

  markStopping(): void {
    this.live = false;
    this.lastSuccessfulPassAt = null;
  }

  snapshot(now = Date.now()): DispatcherHealthSnapshot {
    return Object.freeze({
      live: this.live,
      ready:
        this.live &&
        this.lastSuccessfulPassAt !== null &&
        now - this.lastSuccessfulPassAt <= this.maximumPassStalenessMs,
    });
  }
}

export class DispatcherHealthServer {
  private readonly server: Server;

  constructor(private readonly state: DispatcherHealthState) {
    this.server = createServer((request, response) => {
      const health = this.state.snapshot();
      const isLive = request.url === "/health/live";
      const isReady = request.url === "/health/ready";
      if (
        (request.method !== "GET" && request.method !== "HEAD") ||
        (!isLive && !isReady)
      ) {
        response.writeHead(404, {
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          request.method === "HEAD" ? undefined : '{"status":"not_found"}',
        );
        return;
      }
      const healthy = isLive ? health.live : health.ready;
      response.writeHead(healthy ? 200 : 503, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(
        request.method === "HEAD"
          ? undefined
          : JSON.stringify({
              status: isLive
                ? healthy
                  ? "live"
                  : "stopping"
                : healthy
                  ? "ready"
                  : "not_ready",
            }),
      );
    });
  }

  async listen(port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const onError = (error: Error): void => {
        this.server.removeListener("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        this.server.removeListener("error", onError);
        const address = this.server.address();
        if (address === null || typeof address === "string") {
          reject(new Error("dispatcher health server has no TCP address"));
          return;
        }
        resolve(address.port);
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(port, "0.0.0.0");
    });
  }

  async close(): Promise<void> {
    if (!this.server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error === undefined) {
          resolve();
          return;
        }
        reject(error);
      });
    });
  }
}
