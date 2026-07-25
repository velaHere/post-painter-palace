const STORAGE_KEY = "gramstore.apiBaseUrl";
const DEFAULT_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://127.0.0.1:8080";

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return DEFAULT_BASE_URL;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return (stored && stored.trim()) || DEFAULT_BASE_URL;
}

export function setApiBaseUrl(url: string) {
  if (typeof window === "undefined") return;
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, trimmed);
  }
}

export function getDefaultApiBaseUrl() {
  return DEFAULT_BASE_URL;
}
