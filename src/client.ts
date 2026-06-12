/**
 * Thin client over the Yandex DataLens public API (https://api.datalens.tech).
 *
 * The API is RPC-style: every operation is `POST /rpc/<method>` with a JSON body.
 *
 * Auth is a ready IAM token sent as `Authorization: Bearer <token>`. Yandex deprecated the
 * OAuth→IAM exchange for tokens issued after 2026-06-01, so this client does NOT attempt any
 * exchange — supply a short-lived IAM token (get one with `yc iam create-token`; it lives
 * ~12h, refresh it when it expires). On a 401/403 the error explains exactly that.
 *
 * Required headers per request:
 *   Authorization:    Bearer <IAM_TOKEN>
 *   x-dl-org-id:      <ORG_ID>          (mandatory for the cloud SaaS)
 *   x-dl-api-version: <version>
 */

const DEFAULT_TIMEOUT_MS = 60_000;

export interface ClientConfig {
  baseUrl: string;
  apiVersion: string;
  orgId: string;
  /** A ready-to-use IAM token. Short-lived (~12h); refresh via `yc iam create-token`. */
  iamToken: string;
  /** Per-request timeout in ms; aborts a hung DataLens call instead of blocking forever. */
  timeoutMs: number;
}

export class DataLensError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "DataLensError";
  }
}

export class DataLensClient {
  private cfg: ClientConfig;

  constructor(cfg: ClientConfig) {
    this.cfg = cfg;
  }

  static fromEnv(): DataLensClient {
    const iamToken = process.env.DATALENS_IAM_TOKEN?.trim();
    const orgId = process.env.DATALENS_ORG_ID?.trim();
    if (!iamToken) {
      throw new Error(
        "Set DATALENS_IAM_TOKEN to a ready IAM token. Get one with `yc iam create-token` " +
          "(it lives ~12h; refresh it when it expires). OAuth tokens are no longer supported.",
      );
    }
    if (!orgId) {
      throw new Error(
        "Set DATALENS_ORG_ID to your DataLens organization ID — it is sent as the required " +
          "x-dl-org-id header and every request fails without it.",
      );
    }
    const timeoutMs = Number(process.env.DATALENS_TIMEOUT_MS?.trim());
    return new DataLensClient({
      baseUrl: resolveBaseUrl(),
      apiVersion: process.env.DATALENS_API_VERSION?.trim() || "1",
      orgId,
      iamToken,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    });
  }

  /** Call an RPC method, e.g. rpc("getDashboard", { dashboardId }). */
  async rpc<T = unknown>(method: string, body: unknown = {}): Promise<T> {
    const url = `${this.cfg.baseUrl}/rpc/${method}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.cfg.iamToken}`,
          "x-dl-api-version": this.cfg.apiVersion,
          "x-dl-org-id": this.cfg.orgId,
        },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e?.name === "TimeoutError" || e?.name === "AbortError") {
        throw new DataLensError(`DataLens ${method} timed out after ${this.cfg.timeoutMs}ms`, 0, null);
      }
      throw new DataLensError(`DataLens ${method} request failed: ${e?.message ?? String(err)}`, 0, null);
    }

    const raw = await res.text();
    let parsed: unknown = raw ? safeJson(raw) : null;

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new DataLensError(
          `DataLens ${method}: HTTP ${res.status} — IAM token rejected (invalid or expired). ` +
            "Refresh it with `yc iam create-token`, update DATALENS_IAM_TOKEN, and restart the server.",
          res.status,
          parsed,
        );
      }
      throw new DataLensError(`DataLens ${method} failed: HTTP ${res.status}`, res.status, parsed);
    }
    return parsed as T;
  }
}

/** Parse JSON, falling back to the raw text for non-JSON bodies. */
function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Resolve and validate DATALENS_API_BASE. The org-wide IAM bearer token is attached to every request
 * to this base (see rpc()), so an unvalidated base = credential egress to wherever it points. Default
 * is the cloud SaaS over https. https is required, except for localhost or when DATALENS_ALLOW_INSECURE_BASE=1
 * (e.g. a self-hosted DataLens reachable only over http on an internal network). Credentials in the URL
 * (user:pass@host) are rejected outright.
 */
function resolveBaseUrl(): string {
  const raw = (process.env.DATALENS_API_BASE ?? "https://api.datalens.tech").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`DATALENS_API_BASE is not a valid URL: ${JSON.stringify(raw)}`);
  }
  if (url.username || url.password) {
    throw new Error("DATALENS_API_BASE must not contain credentials (user:pass@host).");
  }
  if (url.search || url.hash) {
    throw new Error("DATALENS_API_BASE must not contain a query string or fragment.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`DATALENS_API_BASE must be http(s); got ${url.protocol}`);
  }
  // WHATWG URL returns IPv6 hosts bracketed (new URL("http://[::1]").hostname === "[::1]").
  const isLocalhost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]";
  const allowInsecure =
    process.env.DATALENS_ALLOW_INSECURE_BASE === "1" || process.env.DATALENS_ALLOW_INSECURE_BASE === "true";
  if (url.protocol !== "https:" && !isLocalhost && !allowInsecure) {
    throw new Error(
      `DATALENS_API_BASE must use https (got ${url.protocol}//${url.host}). For a self-hosted DataLens ` +
        "over http, set DATALENS_ALLOW_INSECURE_BASE=1 to allow it.",
    );
  }
  return raw.replace(/\/+$/, "");
}
