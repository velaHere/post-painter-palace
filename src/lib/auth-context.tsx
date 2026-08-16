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
  registerVerificationRequiredHandler,
  serverLogout,
  isTokenStale,
  getLastVerified,
  setLastVerified,
} from "./api-client";
import { sessionSocket } from "./session-socket";
import { getUsernameFromToken } from "./jwt";

interface AuthResponse {
  accessToken: string;
  verified: boolean;
}

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  /** null while unknown (e.g. hydrated from storage before the first refresh). */
  verified: boolean | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<boolean>;
  verifyOtp: (code: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  logout: () => Promise<void>;
}



const AuthContext = createContext<AuthState | null>(null);

/** Layout effect on the client, no-op during SSR (avoids the warning). */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Synchronous hydration: if a usable token is already in storage, adopt it
  // *before* the browser paints so the UI never flashes a signed-out state.
  useIsomorphicLayoutEffect(() => {
    const existing = getAccessToken();
    if (existing && !isTokenStale(existing)) {
      setToken(existing);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = getAccessToken();
      // Already adopted synchronously above — nothing to do.
      if (existing && !isTokenStale(existing)) return;
      const refreshed = await refreshToken();
      if (!cancelled) {
        setToken(refreshed);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One session socket per JWT: connect when we have a token, close when we
  // don't. A refresh initiated by the socket itself feeds the new token back.
  useEffect(() => {
    sessionSocket.setTokenListener((fresh) => setToken(fresh));
    return () => sessionSocket.setTokenListener(null);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (token) sessionSocket.connect(token);
    else sessionSocket.close();
  }, [token, isLoading]);


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
    sessionSocket.close();
    applyToken(null);
    await queryClient.cancelQueries();
    queryClient.clear();
    navigate({ to: "/login", replace: true });
  }, [applyToken, navigate, queryClient]);

  useEffect(() => {
    registerLogoutHandler(() => {
      // Session already invalid — skip the server call, just clear and bounce.
      sessionSocket.close();
      applyToken(null);
      void queryClient.cancelQueries();
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
