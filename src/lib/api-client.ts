import { getApiBaseUrl } from "./api-config";

const TOKEN_KEY = "gramstore.accessToken";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
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
  });
}

async function refreshToken(): Promise<string | null> {
  try {
    const res = await doFetch("/cms/auth/refresh", {
      method: "POST",
      skipRefresh: true,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string };
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  let res = await doFetch(path, opts);

  if (res.status === 401 && opts.auth && !opts.skipRefresh) {
    const newToken = await refreshToken();
    if (newToken) {
      res = await doFetch(path, { ...opts, skipRefresh: true });
    }
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (!res.ok) {
    const message =
      (isJson && payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : null) ??
      (typeof payload === "string" && payload) ??
      `Request failed: ${res.status}`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}

export { refreshToken };
