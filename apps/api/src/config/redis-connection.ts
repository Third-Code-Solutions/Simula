export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface RedisConnectionOptions {
  readonly db: number;
  readonly enableOfflineQueue: false;
  readonly host: string;
  readonly maxRetriesPerRequest: 1;
  readonly password?: string;
  readonly port: number;
  readonly tls?: {
    readonly servername: string;
  };
  readonly username?: string;
}

function decodeCredential(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("SIMULA_REDIS_URL contains an invalid encoded credential.");
  }
}

function readDatabase(pathname: string): number {
  if (pathname === "" || pathname === "/") {
    return 0;
  }

  const value = pathname.slice(1);
  if (!/^\d+$/.test(value)) {
    throw new Error(
      "SIMULA_REDIS_URL database must be a non-negative integer.",
    );
  }

  const database = Number(value);
  if (!Number.isSafeInteger(database) || database > 15) {
    throw new Error("SIMULA_REDIS_URL database must be from 0 through 15.");
  }

  return database;
}

export function parseRedisConnection(
  environment: RuntimeEnvironment = process.env,
): RedisConnectionOptions | null {
  const rawUrl = environment.SIMULA_REDIS_URL;
  if (rawUrl === undefined || rawUrl.trim() === "") {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("SIMULA_REDIS_URL must be a valid Redis URL.");
  }

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("SIMULA_REDIS_URL must use redis:// or rediss://.");
  }
  if (url.hostname === "") {
    throw new Error("SIMULA_REDIS_URL must include a hostname.");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error(
      "SIMULA_REDIS_URL must not contain query or fragment data.",
    );
  }
  if (
    environment.SIMULA_ENVIRONMENT === "production" &&
    url.protocol !== "rediss:" &&
    !url.hostname.endsWith(".railway.internal")
  ) {
    throw new Error(
      "Production Redis requires rediss:// or Railway private networking.",
    );
  }

  const port =
    url.port === ""
      ? url.protocol === "rediss:"
        ? 6380
        : 6379
      : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SIMULA_REDIS_URL contains an invalid port.");
  }

  const connection: {
    db: number;
    enableOfflineQueue: false;
    host: string;
    maxRetriesPerRequest: 1;
    password?: string;
    port: number;
    tls?: { servername: string };
    username?: string;
  } = {
    db: readDatabase(url.pathname),
    enableOfflineQueue: false,
    host: url.hostname,
    maxRetriesPerRequest: 1,
    port,
  };

  if (url.username !== "") {
    connection.username = decodeCredential(url.username);
  }
  if (url.password !== "") {
    connection.password = decodeCredential(url.password);
  }
  if (url.protocol === "rediss:") {
    connection.tls = {
      servername: url.hostname,
    };
  }

  return connection;
}
