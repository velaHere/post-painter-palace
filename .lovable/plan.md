# Fix the login bounce, the 405 spam, and the slow session check

## What's actually going wrong

All three symptoms come from one chain, in this order:

1. The WebSocket connects, the backend rejects the AUTH message, and the client
   receives `AUTH_FAILED`.
2. On `AUTH_FAILED` the client calls the refresh endpoint. If that first call is
   answered with "method not allowed" it retries with the other HTTP verb — this
   is the `Request method 'GET' is not supported` warning in your backend log,
   one per socket attempt (matching the connect / warn / disconnect triplets).
3. Refresh comes back with the same token the socket just rejected, so the client
   treats the session as dead and force-logs-out. That is the "peek at the
   dashboard, then thrown back to login" and the "Welcome back, still on login"
   loop — the REST session is fine; the socket is killing it.

Separately, first load feels slow because the app waits for a full refresh
round-trip before it decides whether you are signed in.

## The fix

**1. Socket problems must never sign you out.**
`AUTH_FAILED` will be treated as a transport problem, not a session verdict:
retry with capped backoff, give up quietly after a few tries, and never call
force-logout. Only an explicit `LOGOUT` message from the server ends the
session. This alone stops both the login bounce and the dashboard peek.

**2. One verb for refresh, no fallback.**
The refresh call will use `POST /cms/auth/refresh` only. The "retry with GET"
fallback is removed, so the backend stops logging unsupported-method warnings.

**3. Fast, non-blocking session resolution.**
- A valid stored token is adopted before first paint (already the case) and the
  app renders signed-in immediately, with no waiting refresh.
- Bootstrap refresh only runs when there is no usable token, and it gets a short
  timeout; on timeout or network error the app resolves to signed-out instead of
  hanging on "Loading…".
- The socket connects after the session resolves and never gates the UI.

**4. Cleaner login handoff.**
After a successful login/register the redirect happens once, from the login
route, using the freshly returned `verified` flag — no second redirect from the
protected layout while state is still settling.

## Files touched

- `src/lib/session-socket.ts` — remove force-logout on `AUTH_FAILED`, retry with
  backoff and an attempt cap, keep `LOGOUT` authoritative.
- `src/lib/api-client.ts` — refresh is POST-only; drop the 405/GET fallback; add
  a timeout to the refresh request.
- `src/lib/auth-context.tsx` — resolve loading state without blocking on
  refresh; connect the socket only after resolution.
- `src/routes/_authenticated/route.tsx`, `src/routes/login.tsx` — single-owner
  redirect so no route bounces the user mid-transition.

## Why the socket rejects the token

Your handler expects exactly `{"type":"AUTH","token":"<jwt>"}`, which is what the
client already sends — so the frame shape is fine. `AUTH_FAILED` therefore comes
from `isTokenExpiredOrInvalid`, i.e. the client opened the socket with a token
that was already stale (typical during first load, before/while the bootstrap
refresh runs). Two client-side changes address it:

- **Never open the socket with a stale token.** Refresh first if the stored token
  is inside the expiry window, and connect only with a token that just passed the
  freshness check.
- **Refresh before reconnecting, once.** On `AUTH_FAILED` the client refreshes and
  reconnects a single time; if the socket still fails it backs off quietly and
  leaves the REST session untouched.

Also, since your handler closes unauthenticated sockets after 5 seconds, the
client will send `{"type":"PING"}` on an interval and treat `PONG` as liveness, so
idle sockets stay healthy instead of silently dying and reconnecting.
