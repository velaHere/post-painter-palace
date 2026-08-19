import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
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
  /** Resolves to the server's `verified` answer for the submitted code. */
  verifyOtp: (code: string) => Promise<boolean>;
  resendOtp: () => Promise<void>;
  logout: () => Promise<void>;
}



const AuthContext = createContext<AuthState | null>(null);

/** Layout effect on the client, no-op during SSR (avoids the warning). */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Bumped whenever login/register/logout sets the session explicitly, so a
  // slow bootstrap refresh can never clobber a newer session.
  const sessionEpoch = useRef(0);

  // Synchronous hydration: if a usable token is already in storage, adopt it
  // *before* the browser paints so the UI never flashes a signed-out state.
  useIsomorphicLayoutEffect(() => {
    const existing = getAccessToken();
    if (existing && !isTokenStale(existing)) {
      setToken(existing);
      setVerified(getLastVerified());
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const epoch = sessionEpoch.current;

    const existing = getAccessToken();
    // Already adopted synchronously above — nothing to do.
    if (existing && !isTokenStale(existing)) return;

    // Never let a slow/unreachable backend hold the UI on "Loading…".
    const settle = setTimeout(() => {
      if (!cancelled && epoch === sessionEpoch.current) setIsLoading(false);
    }, 1_200);

    (async () => {
      const refreshed = await refreshToken();
      // A login/register/logout happened while we were waiting: its result wins.
      if (cancelled || epoch !== sessionEpoch.current) return;
      setToken(refreshed ?? getAccessToken());
      setVerified(getLastVerified());
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
      clearTimeout(settle);
    };
  }, []);

  // `verified` must always come from a server answer. If we're signed in but
  // the flag is still unknown, resolve it once through refresh so no route has
  // to guess (and /verify never shows its form on a hunch).
  const resolvingVerified = useRef(false);
  useEffect(() => {
    if (isLoading || !token || verified !== null) return;
    if (resolvingVerified.current) return;
    resolvingVerified.current = true;
    const epoch = sessionEpoch.current;
    (async () => {
      try {
        const fresh = await refreshToken();
        if (epoch !== sessionEpoch.current) return;
        if (fresh) setToken(fresh);
        setVerified(getLastVerified());
      } finally {
        resolvingVerified.current = false;
      }
    })();
  }, [token, verified, isLoading]);


  // One session socket per JWT: connect when we have a token, close when we
  // don't. A refresh initiated by the socket itself feeds the new token back.
  useEffect(() => {
    sessionSocket.setTokenListener((fresh) => {
      setToken(fresh);
      setVerified(getLastVerified());
    });
    return () => sessionSocket.setTokenListener(null);
  }, []);

  // An unverified session can't use the socket (the server rejects it), so
  // don't churn connections until the account is verified.
  useEffect(() => {
    if (isLoading) return;
    if (token && verified !== false) sessionSocket.connect(token);
    else sessionSocket.close();
  }, [token, verified, isLoading]);




  const applyToken = useCallback(
    (newToken: string | null, isVerified: boolean | null = null) => {
      sessionEpoch.current += 1;
      setIsLoading(false);
      setAccessToken(newToken);
      setLastVerified(isVerified);
      setToken(newToken);
      setVerified(isVerified);
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<AuthResponse>("/cms/auth/login", {
        method: "POST",
        body: { email, password },
      });
      applyToken(res.accessToken, !!res.verified);
      return !!res.verified;
    },
    [applyToken],
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const res = await api<AuthResponse>("/cms/auth/register", {
        method: "POST",
        body: { username, email, password },
      });
      applyToken(res.accessToken, !!res.verified);
      return !!res.verified;
    },
    [applyToken],
  );

  const verifyOtp = useCallback(async (code: string) => {
    const res = await api<{ verified?: boolean }>(
      `/cms/auth/verify/${encodeURIComponent(code)}`,
      { method: "POST", auth: true },
    );
    // The endpoint answers { verified } and never returns a token, so a wrong
    // code comes back as 200 + verified:false — that's a failed attempt.
    if (res?.verified === false) return false;

    setLastVerified(true);
    setVerified(true);
    // The current access token still carries pre-verification claims: refresh
    // so the next protected request isn't rejected (which used to look like a
    // surprise sign-out). A transient refresh failure keeps the session.
    const fresh = await refreshToken();
    if (fresh) {
      setToken(fresh);
      if (getLastVerified() === false) {
        // Server disagrees — trust it rather than our optimistic flag.
        setVerified(false);
        return false;
      }
      setLastVerified(true);
      setVerified(true);
    }
    return true;
  }, []);


  const resendOtp = useCallback(async () => {
    await api(`/cms/auth/resend`, { method: "GET", auth: true });
  }, []);

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

  // A 403 from the server's verification filter means "finish verifying",
  // not "your session died".
  useEffect(() => {
    registerVerificationRequiredHandler(() => {
      setVerified(false);
      navigate({ to: "/verify", replace: true });
    });
  }, [navigate]);


  const value = useMemo<AuthState>(
    () => ({
      token,
      username: getUsernameFromToken(token),
      isAuthenticated: !!token,
      verified,
      isLoading,
      login,
      register,
      verifyOtp,
      resendOtp,
      logout,
    }),
    [token, verified, isLoading, login, register, verifyOtp, resendOtp, logout],
  );


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
