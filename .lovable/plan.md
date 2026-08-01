## What changes

### 1. Fix the refresh call to match the backend
`src/lib/api-client.ts` currently calls `POST /cms/auth/refresh`. The spec says `GET /cms/auth/refresh` (no body, cookie `stimulus` sent automatically). Switch the method to GET, keep `credentials: "include"`, keep the existing single-flight + skew logic (30s proactive refresh, 401/403 clears session, network/5xx keeps token).

Everything else in the REST flow already matches the spec: bearer header on protected calls, 401 → refresh → retry → logout on failure, `POST /cms/auth/logout` with bearer.

### 2. New WebSocket session client
New file `src/lib/session-socket.ts` — a small singleton managing one socket:

- URL derived from the configured API base URL (`src/lib/api-config.ts`): `http://` → `ws://`, `https://` → `wss://`, path `/ws`. No new config surface.
- `connect(token)` opens the socket and, in `onopen`, immediately sends `{"type":"AUTH","token":"<JWT>"}` (well inside the server's 5s window).
- Message handling:
  - `AUTH_SUCCESS` → mark authenticated, reset backoff.
  - `AUTH_FAILED` → do **not** log out. Call the shared refresh once; on success store new JWT and reconnect + re-AUTH; on failure clear JWT and go to login.
  - `LOGOUT` → close socket, clear JWT/auth state, clear query cache, redirect to `/login`, and **no** refresh attempt. Show the server's message as a toast ("Your session has expired." / logged in elsewhere).
  - Unknown types → ignored, never throw.
- Unexpected close (network drop, not LOGOUT and not an in-progress auth-failure retry) → reconnect with exponential backoff (1s → 2s → 4s → 8s, capped ~15s) plus a reconnect when the tab regains focus/online.
- Guard against duplicate sockets (React strict-mode double effects, repeated logins).

### 3. Wire it into auth state
`src/lib/auth-context.tsx`:
- After the token resolves (synchronous hydration path or refresh path) and after `login`/`register`, call `sessionSocket.connect(token)`.
- On `logout` (and on the forced-logout handler), `sessionSocket.close()` before clearing local state.
- If no token exists on startup, do not connect.
- When a refresh produces a new JWT (either from REST or from the socket path), the socket reconnects with the new token.
- Expose the forced-logout path so the socket's `LOGOUT` handler reuses the exact same teardown as the existing `registerLogoutHandler` (cancel queries → clear cache → clear token → navigate `/login` replace). No second, divergent logout implementation.

This keeps the flash-free hydration behaviour already in place; the socket connects after paint and never gates rendering.

## Technical notes
- Files touched: `src/lib/api-client.ts` (GET refresh + export a reusable refresh for the socket), `src/lib/auth-context.tsx` (lifecycle wiring), new `src/lib/session-socket.ts`.
- Refresh is shared: the socket calls the same single-flight `refreshToken()`, so a REST 401 and a WS `AUTH_FAILED` at the same moment produce exactly one refresh request.
- No UI changes beyond a toast on forced logout.
- Local dev caveat: `ws://127.0.0.1:8080/ws` works from the preview over http; if the preview is served over https, the backend must be reachable over `wss://` or the browser will block the socket. Worth confirming your dev setup once wired.
