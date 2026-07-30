import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import jwt from "jsonwebtoken";

const BUCKET = "simula-private-assets";
const KEY_ID = "simula-database-http-integration";
const MAX_BODY_BYTES = 16 * 1024 * 1024;

type StoredObject = Readonly<{
  cacheControl: string;
  content: Buffer;
  contentDisposition: string;
  contentSha256: string;
  contentType: string;
}>;

type AuthFixtureUser = Readonly<{
  email: string;
  password: string;
  userId: string;
}>;

type VerifiedAuthToken = Readonly<{
  sub: string;
}>;

const CORS_HEADERS = {
  "access-control-allow-headers":
    "apikey, authorization, content-type, x-client-info, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, HEAD, OPTIONS",
  "access-control-allow-origin": "*",
} as const;

function responseHeaders(stored: StoredObject): Record<string, string> {
  return {
    "accept-ranges": "bytes",
    "cache-control": stored.cacheControl,
    "content-disposition": stored.contentDisposition,
    "content-length": String(stored.content.length),
    "content-type": stored.contentType,
    etag: `"${createHash("md5").update(stored.content).digest("hex")}"`,
    "x-amz-meta-simula-content-sha256": stored.contentSha256,
    "x-amz-request-id": "simula-database-http-integration",
  };
}

function end(
  response: ServerResponse,
  status: number,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    ...CORS_HEADERS,
    "x-amz-request-id": "simula-database-http-integration",
    ...headers,
  });
  response.end();
}

async function requestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let byteSize = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteSize += bytes.length;
    if (byteSize > MAX_BODY_BYTES) {
      throw new Error("loopback object exceeded the bounded test envelope");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function stringField(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : "";
}

export class LoopbackAuthS3 {
  private readonly authUsersByEmail = new Map<string, AuthFixtureUser>();
  private readonly authUsersById = new Map<string, AuthFixtureUser>();
  private readonly objects = new Map<string, StoredObject>();
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly publicJwk: JsonWebKey;
  private readonly refreshTokens = new Map<string, string>();
  private readonly server: Server;
  private baseOrigin = "";
  private deleteRetentions = 0;
  private getRequests = 0;

  constructor() {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
    this.publicJwk = pair.publicKey.export({ format: "jwk" });
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch(() => {
        if (!response.headersSent) {
          end(response, 500);
        } else {
          response.destroy();
        }
      });
    });
  }

  get origin(): string {
    if (this.baseOrigin === "") {
      throw new Error("loopback boundary is not started");
    }
    return this.baseOrigin;
  }

  get issuer(): string {
    return `${this.origin}/auth/v1`;
  }

  get objectCount(): number {
    return this.objects.size;
  }

  get objectGetRequests(): number {
    return this.getRequests;
  }

  retainNextDelete(): void {
    this.deleteRetentions += 1;
  }

  registerAuthUser(user: AuthFixtureUser): void {
    const normalizedEmail = user.email.trim().toLowerCase();
    if (
      normalizedEmail === "" ||
      user.password === "" ||
      this.authUsersByEmail.has(normalizedEmail) ||
      this.authUsersById.has(user.userId)
    ) {
      throw new Error("loopback Auth user is invalid or duplicated");
    }
    const registered = Object.freeze({ ...user, email: normalizedEmail });
    this.authUsersByEmail.set(normalizedEmail, registered);
    this.authUsersById.set(user.userId, registered);
  }

  token(userId: string): string {
    const user = this.authUsersById.get(userId);
    return jwt.sign(
      {
        aal: "aal1",
        amr: [
          { method: "password", timestamp: Math.floor(Date.now() / 1_000) },
        ],
        app_metadata: { provider: "email", providers: ["email"] },
        email: user?.email,
        role: "authenticated",
        session_id: randomUUID(),
        user_metadata: {},
      },
      this.privateKey,
      {
        algorithm: "RS256",
        audience: "authenticated",
        expiresIn: "1h",
        issuer: this.issuer,
        keyid: KEY_ID,
        subject: userId,
      },
    );
  }

  async start(port = 0): Promise<void> {
    if (this.baseOrigin !== "") {
      throw new Error("loopback boundary already started");
    }
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, "127.0.0.1", () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    const address = this.server.address() as AddressInfo | null;
    if (address === null || address.address !== "127.0.0.1") {
      throw new Error("loopback boundary did not bind safely");
    }
    this.baseOrigin = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    this.refreshTokens.clear();
    this.objects.clear();
    if (!this.server.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private jwks(response: ServerResponse): void {
    const body = Buffer.from(
      JSON.stringify({
        keys: [
          {
            ...this.publicJwk,
            alg: "RS256",
            key_ops: ["verify"],
            kid: KEY_ID,
            use: "sig",
          },
        ],
      }),
      "utf8",
    );
    response.writeHead(200, {
      ...CORS_HEADERS,
      "cache-control": "no-store",
      "content-length": String(body.length),
      "content-type": "application/json",
    });
    response.end(body);
  }

  private authUser(user: AuthFixtureUser): Record<string, unknown> {
    const timestamp = "2026-07-30T00:00:00.000Z";
    return {
      app_metadata: { provider: "email", providers: ["email"] },
      aud: "authenticated",
      confirmed_at: timestamp,
      created_at: timestamp,
      email: user.email,
      email_confirmed_at: timestamp,
      id: user.userId,
      identities: [],
      is_anonymous: false,
      last_sign_in_at: timestamp,
      phone: "",
      role: "authenticated",
      updated_at: timestamp,
      user_metadata: {},
    };
  }

  private authSession(user: AuthFixtureUser): Record<string, unknown> {
    const expiresIn = 3_600;
    const refreshToken = randomBytes(32).toString("hex");
    this.refreshTokens.set(refreshToken, user.userId);
    return {
      access_token: this.token(user.userId),
      expires_at: Math.floor(Date.now() / 1_000) + expiresIn,
      expires_in: expiresIn,
      refresh_token: refreshToken,
      token_type: "bearer",
      user: this.authUser(user),
    };
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    const body = Buffer.from(JSON.stringify(value), "utf8");
    response.writeHead(status, {
      ...CORS_HEADERS,
      "cache-control": "no-store",
      "content-length": String(body.length),
      "content-type": "application/json",
    });
    response.end(body);
  }

  private verifiedUser(request: IncomingMessage): AuthFixtureUser | undefined {
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== "string" ||
      !authorization.startsWith("Bearer ")
    ) {
      return undefined;
    }
    try {
      const verified = jwt.verify(
        authorization.slice("Bearer ".length),
        this.publicKey,
        {
          algorithms: ["RS256"],
          audience: "authenticated",
          issuer: this.issuer,
        },
      ) as VerifiedAuthToken;
      return this.authUsersById.get(verified.sub);
    } catch {
      return undefined;
    }
  }

  private async auth(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    if (request.method === "OPTIONS" && url.pathname.startsWith("/auth/v1/")) {
      end(response, 204);
      return true;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "password"
    ) {
      let credentials: unknown;
      try {
        credentials = JSON.parse((await requestBody(request)).toString("utf8"));
      } catch {
        credentials = undefined;
      }
      const email = stringField(credentials, "email").trim().toLowerCase();
      const password = stringField(credentials, "password");
      const user = this.authUsersByEmail.get(email);
      if (user === undefined || user.password !== password) {
        this.json(response, 400, {
          code: "invalid_credentials",
          message: "Invalid login credentials",
        });
      } else {
        this.json(response, 200, this.authSession(user));
      }
      return true;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "refresh_token"
    ) {
      let payload: unknown;
      try {
        payload = JSON.parse((await requestBody(request)).toString("utf8"));
      } catch {
        payload = undefined;
      }
      const refreshToken = stringField(payload, "refresh_token");
      const userId = this.refreshTokens.get(refreshToken);
      const user =
        userId === undefined ? undefined : this.authUsersById.get(userId);
      if (user === undefined) {
        this.json(response, 400, {
          code: "refresh_token_not_found",
          message: "Invalid Refresh Token",
        });
      } else {
        this.refreshTokens.delete(refreshToken);
        this.json(response, 200, this.authSession(user));
      }
      return true;
    }
    if (request.method === "GET" && url.pathname === "/auth/v1/user") {
      const user = this.verifiedUser(request);
      if (user === undefined) {
        this.json(response, 401, {
          code: "bad_jwt",
          message: "Invalid JWT",
        });
      } else {
        this.json(response, 200, this.authUser(user));
      }
      return true;
    }
    if (request.method === "POST" && url.pathname === "/auth/v1/logout") {
      end(response, 204);
      return true;
    }
    return false;
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", this.origin);
    if (await this.auth(request, response, url)) {
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/auth/v1/.well-known/jwks.json"
    ) {
      this.jwks(response);
      return;
    }

    const bucketPath = `/storage/v1/s3/${BUCKET}`;
    if (
      request.method === "HEAD" &&
      (url.pathname === bucketPath || url.pathname === `${bucketPath}/`)
    ) {
      end(response, 200);
      return;
    }
    if (!url.pathname.startsWith(`${bucketPath}/`)) {
      end(response, 404);
      return;
    }

    const objectName = decodeURIComponent(
      url.pathname.slice(`${bucketPath}/`.length),
    );
    if (objectName === "" || objectName.includes("..")) {
      end(response, 400);
      return;
    }
    const stored = this.objects.get(objectName);

    if (request.method === "PUT") {
      const content = await requestBody(request);
      const contentSha256 = request.headers["x-amz-meta-simula-content-sha256"];
      if (
        typeof contentSha256 !== "string" ||
        createHash("sha256").update(content).digest("hex") !== contentSha256
      ) {
        end(response, 400);
        return;
      }
      this.objects.set(
        objectName,
        Object.freeze({
          cacheControl:
            typeof request.headers["cache-control"] === "string"
              ? request.headers["cache-control"]
              : "private, no-store",
          content,
          contentDisposition:
            typeof request.headers["content-disposition"] === "string"
              ? request.headers["content-disposition"]
              : "inline",
          contentSha256,
          contentType:
            typeof request.headers["content-type"] === "string"
              ? request.headers["content-type"]
              : "application/octet-stream",
        }),
      );
      end(response, 200, {
        etag: `"${createHash("md5").update(content).digest("hex")}"`,
      });
      return;
    }

    if (request.method === "HEAD") {
      if (stored === undefined) {
        end(response, 404);
        return;
      }
      end(response, 200, responseHeaders(stored));
      return;
    }

    if (request.method === "GET") {
      this.getRequests += 1;
      if (stored === undefined) {
        end(response, 404);
        return;
      }
      response.writeHead(200, responseHeaders(stored));
      response.end(stored.content);
      return;
    }

    if (request.method === "DELETE") {
      if (this.deleteRetentions > 0) {
        this.deleteRetentions -= 1;
      } else {
        this.objects.delete(objectName);
      }
      end(response, 204);
      return;
    }

    end(response, 405);
  }
}
