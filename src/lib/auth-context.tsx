import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  getAccessToken,
  setAccessToken,
  refreshToken,
} from "./api-client";
import { getUsernameFromToken, isTokenExpired } from "./jwt";

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = getAccessToken();
      if (existing && !isTokenExpired(existing)) {
        if (!cancelled) setToken(existing);
      } else {
        const refreshed = await refreshToken();
        if (!cancelled) setToken(refreshed);
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyToken = useCallback((newToken: string | null) => {
    setAccessToken(newToken);
    setToken(newToken);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ accessToken: string }>("/cms/auth/login", {
        method: "POST",
        body: { email, password },
      });
      applyToken(res.accessToken);
    },
    [applyToken],
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const res = await api<{ accessToken: string }>("/cms/auth/register", {
        method: "POST",
        body: { username, email, password },
      });
      applyToken(res.accessToken);
    },
    [applyToken],
  );

  const logout = useCallback(() => {
    applyToken(null);
  }, [applyToken]);

  const value = useMemo<AuthState>(
    () => ({
      token,
      username: getUsernameFromToken(token),
      isAuthenticated: !!token,
      isLoading,
      login,
      register,
      logout,
    }),
    [token, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
