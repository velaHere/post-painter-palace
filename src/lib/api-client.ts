import { getApiBaseUrl } from "./api-config";
import { isTokenExpired, decodeToken } from "./jwt";

const TOKEN_KEY = "gramstore.accessToken.v2";
const LEGACY_TOKEN_KEY = "gramstore.accessToken";
const VERIFIED_KEY = "gramstore.verified.v1";

/** Refresh a bit before actual expiry so in-flight requests never arrive stale. */
const EXPIRY_SKEW_MS = 30_000;

const DEBUG = import.meta.env.DEV;
function trace(...args: unknown[]) {
  if (DEBUG) console.debug("[auth]", ...args);
}

let refreshPromise: Promise<string | null> | null = null;
let logoutHandler: (() => void) | null = null;
let verificationHandler: (() => void) | null = null;

/** Last `verified` flag seen from the server (login/register/refresh/verify). */
let lastVerified: boolean | null = null;

function readStoredVerified(): boolean | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(VERIFIED_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

// Start from the last server answer so a reload doesn't begin at "unknown".
if (typeof window !== "undefined") lastVerified = readStoredVerified();

export function getLastVerified(): boolean | null {
  return lastVerified;
}

export function setLastVerified(value: boolean | null) {
  lastVerified = value;
  if (typeof window === "undefined") return;
  if (value === null) window.localStorage.removeItem(VERIFIED_KEY);
  else window.localStorage.setItem(VERIFIED_KEY, String(value));
}


export function registerLogoutHandler(handler: () => void) {
  logoutHandler = handler;
}

/** Called when the backend refuses a request because the email isn't verified. */
export function registerVerificationRequiredHandler(handler: () => void) {
  verificationHandler = handler;
}

/** Force the shared logout teardown (used by the session socket on LOGOUT). */
export function forceLogout() {
  setAccessToken(null);
  lastVerified = null;
  logoutHandler?.();
}


function looksLikeJwt(token: string | null): boolean {
  return !!token && token.split(".").length === 3 && !!decodeToken(token);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  // one-time migration off the legacy key
  const legacy = window.localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    if (looksLikeJwt(legacy)) window.localStorage.setItem(TOKEN_KEY, legacy);
  }
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token && !looksLikeJwt(token)) {
    trace("dropping malformed stored token");
    window.localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token;
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

/** True when the token is missing, unparsable, or expiring within the skew window. */
export function isTokenStale(token: string | null): boolean {
  if (!token || !looksLikeJwt(token)) return true;
  const payload = decodeToken(token);
  if (!payload?.exp) return isTokenExpired(token);
  return payload.exp * 1000 - EXPIRY_SKEW_MS < Date.now();
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
  raw?: boolean; // if true, body is passed through (FormData)
  skipRefresh?: boolean;
}

async function doFetch(path: string, opts: ApiOptions): Promise<Response> {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;
  const headers = new Headers(opts.headers as HeadersInit | undefined);

  if (opts.auth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (opts.raw) {
      body = opts.body as BodyInit;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(opts.body);
    }
  }

  return fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body,
    credentials: "include",
    signal: opts.signal ?? null,
  });
}

/** Refresh must never hang the boot sequence. */
const REFRESH_TIMEOUT_MS = 6_000;

/**
 * Single-flight refresh.
 * Only a real 401/403 clears the session — network errors, timeouts and 5xx keep
 * the existing token so a flaky connection can't silently sign the user out.
 */
async function refreshToken(): Promise<string | null> {
  if (refreshPromise) {
    trace("joining in-flight refresh");
    return refreshPromise;
  }

  const run = (async (): Promise<string | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      trace("refresh →");
      // The backend maps refresh as POST only. Never retry with another verb:
      // it just produces 405 noise in the server log.
      const res = await doFetch("/cms/auth/refresh", {
        method: "POST",
        skipRefresh: true,
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {

        trace("refresh rejected", res.status, "— clearing session");
        setAccessToken(null);
        lastVerified = null;
        return null;
      }

      if (!res.ok) {
        trace("refresh failed transiently", res.status, "— keeping token");
        return getAccessToken();
      }

      const data = (await res.json().catch(() => null)) as {
        accessToken?: string;
        verified?: boolean;
      } | null;

      if (!data?.accessToken || !looksLikeJwt(data.accessToken)) {
        trace("refresh returned no usable token — clearing session");
        setAccessToken(null);
        lastVerified = null;
        return null;
      }

      setAccessToken(data.accessToken);
      if (typeof data.verified === "boolean") lastVerified = data.verified;
      trace("refresh ok, verified =", lastVerified);
      return data.accessToken;

    } catch (err) {
      // network / CORS / timeout failure: do NOT destroy the session
      trace("refresh network error — keeping token", err);
      return getAccessToken();
    } finally {
      clearTimeout(timer);
    }
  })();

  refreshPromise = run;
  try {
    return await run;
  } finally {
    refreshPromise = null;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  // Proactive refresh: don't send a token we already know is expiring.
  if (opts.auth && !opts.skipRefresh && isTokenStale(getAccessToken())) {
    trace("token stale before", path);
    const token = await refreshToken();
    if (!token) {
      logoutHandler?.();
      throw new ApiError(401, "Session expired. Please sign in again.");
    }
  }

  let res = await doFetch(path, opts);

  if (res.status === 401 && opts.auth && !opts.skipRefresh) {
    trace("401 on", path, "— attempting refresh");
    const token = await refreshToken();

    if (token) {
      res = await doFetch(path, { ...opts, skipRefresh: true });
      if (res.status === 401) {
        trace("still 401 after refresh — logging out");
        setAccessToken(null);
        logoutHandler?.();
      }
    } else {
      logoutHandler?.();
    }
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    if (
      isJson &&
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      (payload as { message?: unknown }).message
    ) {
      message = String((payload as { message?: unknown }).message);
    } else if (typeof payload === "string" && payload) {
      message = payload;
    }
    // The backend's EmailVerificationFilter answers 403 with an
    // "Email verification required" body — that's not a dead session.
    if (res.status === 403 && /verification/i.test(message)) {
      trace("email verification required for", path);
      lastVerified = false;
      verificationHandler?.();
    }
    throw new ApiError(res.status, message, payload);

  }

  return payload as T;
}

/** Best-effort server-side logout: expires the refresh cookie. Never throws. */
export async function serverLogout(): Promise<void> {
  try {
    await doFetch("/cms/auth/logout", { method: "POST", auth: true });
    trace("server logout done");
  } catch (err) {
    trace("server logout failed (ignored)", err);
  }
}

export { refreshToken };
