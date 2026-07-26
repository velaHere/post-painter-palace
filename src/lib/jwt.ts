import { jwtDecode } from "jwt-decode";

export interface JwtPayload {
  sub?: string;
  username?: string;
  email?: string;
  exp?: number;
  [k: string]: unknown;
}

export function decodeToken(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    return jwtDecode<JwtPayload>(token);
  } catch {
    return null;
  }
}

export function getUsernameFromToken(token: string | null): string | null {
  const payload = decodeToken(token);
  if (!payload) return null;
  return (payload.username as string) ?? payload.sub ?? null;
}

export function isTokenExpired(token: string | null): boolean {
  const payload = decodeToken(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 < Date.now();
}
