import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  getAccessToken,
  setAccessToken,
  refreshToken,
  registerLogoutHandler,
  serverLogout,
  isTokenStale,
} from "./api-client";
import { getUsernameFromToken } from "./jwt";

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
  logout: () => Promise<void>;
}


const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = getAccessToken();
      if (existing && !isTokenStale(existing)) {
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

  const logout = useCallback(async () => {
    // Tell the server first (needs the bearer + cookie), then clear locally.
    await serverLogout();
    applyToken(null);
    await queryClient.cancelQueries();
    queryClient.clear();
    navigate({ to: "/login", replace: true });
  }, [applyToken, navigate, queryClient]);

  useEffect(() => {
    registerLogoutHandler(() => {
      // Session already invalid — skip the server call, just clear and bounce.
      applyToken(null);
      queryClient.clear();
      navigate({ to: "/login", replace: true });
    });
  }, [applyToken, navigate, queryClient]);



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
