import { toast } from "sonner";
import { getApiBaseUrl } from "./api-config";
import { forceLogout, getAccessToken, refreshToken } from "./api-client";

const DEBUG = import.meta.env.DEV;
function trace(...args: unknown[]) {
  if (DEBUG) console.debug("[ws]", ...args);
}

const MAX_BACKOFF_MS = 15_000;

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
  private closedByUs = false;
  private refreshing = false;
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
    this.bindWindowListeners();
    this.open();
  }

  close() {
    this.closedByUs = true;
    this.token = null;
    this.authenticated = false;
    this.attempts = 0;
    this.clearTimer();
    this.teardownSocket();
  }

  isAuthenticated() {
    return this.authenticated;
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
        return;

      case "AUTH_FAILED":
        trace("auth failed — trying refresh");
        await this.refreshAndReconnect();
        return;

      case "LOGOUT":
        trace("server LOGOUT");
        this.close();
        toast.error(msg.message || "Your session has expired.");
        forceLogout();
        return;

      default:
        // Unknown message types are ignored on purpose.
        trace("ignored message", msg.type);
    }
  }

  private async refreshAndReconnect() {
    if (this.refreshing) return;
    this.refreshing = true;
    this.teardownSocket();
    try {
      const fresh = await refreshToken();
      if (!fresh) {
        this.close();
        forceLogout();
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

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.token) return;
    const delay = Math.min(1000 * 2 ** this.attempts, MAX_BACKOFF_MS);
    this.attempts += 1;
    trace("reconnect in", delay, "ms");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closedByUs) return;
      this.open();
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
    this.clearTimer();
    this.open();
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
