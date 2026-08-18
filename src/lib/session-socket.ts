import { toast } from "sonner";
import { getApiBaseUrl } from "./api-config";
import {
  forceLogout,
  getAccessToken,
  isTokenStale,
  refreshToken,
} from "./api-client";

const DEBUG = import.meta.env.DEV;
function trace(...args: unknown[]) {
  if (DEBUG) console.debug("[ws]", ...args);
}

const MAX_BACKOFF_MS = 15_000;
/** Give up quietly after this many consecutive failures. */
const MAX_ATTEMPTS = 6;
/** The server closes unauthenticated/idle sockets, so keep it warm. */
const PING_INTERVAL_MS = 25_000;

function getSocketUrl(): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const wsBase = base
    .replace(/^https:\/\//i, "wss://")
    .replace(/^http:\/\//i, "ws://");
  return `${wsBase}/ws`;
}

type ServerMessage = { type?: string; message?: string };

class SessionSocket {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private authenticated = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUs = false;
  private refreshing = false;
  /** Only one refresh-driven reconnect per session; after that we back off. */
  private refreshedForAuthFailure = false;
  private listenersBound = false;
  private onToken: ((token: string) => void) | null = null;

  /** Called with a fresh JWT when the socket's own refresh succeeds. */
  setTokenListener(cb: ((token: string) => void) | null) {
    this.onToken = cb;
  }

  connect(token: string | null) {
    if (typeof window === "undefined") return;
    if (!token) return;

    // Same token and socket already alive → nothing to do.
    if (
      this.token === token &&
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.token = token;
    this.teardownSocket();
    this.clearTimer();
    this.closedByUs = false;
    this.attempts = 0;
    this.refreshedForAuthFailure = false;
    this.bindWindowListeners();
    void this.openFresh();
  }

  close() {
    this.closedByUs = true;
    this.token = null;
    this.authenticated = false;
    this.attempts = 0;
    this.refreshedForAuthFailure = false;
    this.clearTimer();
    this.stopPing();
    this.teardownSocket();
  }

  isAuthenticated() {
    return this.authenticated;
  }

  /**
   * Never hand the server a token it will reject: refresh first when the stored
   * token is inside the expiry window.
   */
  private async openFresh() {
    if (this.closedByUs) return;
    if (isTokenStale(this.token)) {
      trace("token stale before connect — refreshing first");
      const fresh = await refreshToken();
      if (this.closedByUs) return;
      if (fresh && fresh !== this.token) {
        this.token = fresh;
        this.onToken?.(fresh);
      } else if (!fresh) {
        // REST layer already cleared the session; nothing to connect with.
        trace("no token after refresh — not connecting");
        return;
      }
    }
    this.open();
  }

  private open() {
    const token = this.token;
    if (!token) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(getSocketUrl());
    } catch (err) {
      trace("construct failed", err);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      trace("open → AUTH");
      try {
        socket.send(JSON.stringify({ type: "AUTH", token }));
      } catch (err) {
        trace("AUTH send failed", err);
      }
    };

    socket.onmessage = (event) => {
      let msg: ServerMessage | null = null;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        trace("non-JSON message ignored");
        return;
      }
      void this.handleMessage(msg);
    };

    socket.onerror = () => trace("socket error");

    socket.onclose = () => {
      trace("closed");
      this.authenticated = false;
      this.stopPing();
      if (this.socket === socket) this.socket = null;
      if (this.closedByUs || this.refreshing) return;
      this.scheduleReconnect();
    };
  }

  private async handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "AUTH_SUCCESS":
        trace("authenticated");
        this.authenticated = true;
        this.attempts = 0;
        this.refreshedForAuthFailure = false;
        this.startPing();
        return;

      case "PONG":
        trace("pong");
        return;

      case "AUTH_FAILED":
        // A socket auth failure is a transport problem, never a session verdict:
        // the REST session stays intact and the user is never signed out here.
        if (this.refreshedForAuthFailure) {
          trace("auth failed again — backing off, keeping REST session");
          this.scheduleReconnect();
          return;
        }
        this.refreshedForAuthFailure = true;
        await this.refreshAndReconnect();
        return;

      case "LOGOUT":
        // Only an explicit server LOGOUT ends the session.
        trace("server LOGOUT");
        this.close();
        toast.error(msg.message || "Your session has expired.");
        forceLogout();
        return;

      default:
        trace("ignored message", msg.type);
    }
  }

  private async refreshAndReconnect() {
    if (this.refreshing) return;
    this.refreshing = true;
    const stale = this.token;
    this.teardownSocket();
    try {
      const fresh = await refreshToken();
      if (this.closedByUs) return;
      if (!fresh || fresh === stale) {
        // Don't kill the session — just retry later with backoff.
        trace("refresh gave no new token — backing off");
        this.scheduleReconnect();
        return;
      }
      this.token = fresh;
      this.onToken?.(fresh);
      this.closedByUs = false;
      this.open();
    } finally {
      this.refreshing = false;
    }
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ type: "PING" }));
      } catch {
        /* ignore */
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.token) return;
    if (this.attempts >= MAX_ATTEMPTS) {
      trace("giving up on socket after", this.attempts, "attempts");
      return;
    }
    const delay = Math.min(1000 * 2 ** this.attempts, MAX_BACKOFF_MS);
    this.attempts += 1;
    trace("reconnect in", delay, "ms");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closedByUs) return;
      void this.openFresh();
    }, delay);
  }

  private reconnectNow = () => {
    if (this.closedByUs || this.refreshing) return;
    const token = this.token ?? getAccessToken();
    if (!token) return;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.token = token;
    this.attempts = 0;
    this.refreshedForAuthFailure = false;
    this.clearTimer();
    void this.openFresh();
  };

  private bindWindowListeners() {
    if (this.listenersBound || typeof window === "undefined") return;
    this.listenersBound = true;
    window.addEventListener("online", this.reconnectNow);
    window.addEventListener("focus", this.reconnectNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.reconnectNow();
    });
  }

  private clearTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket() {
    const socket = this.socket;
    this.socket = null;
    this.authenticated = false;
    this.stopPing();
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  }
}

export const sessionSocket = new SessionSocket();
