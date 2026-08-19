# Fix the verification/session state bugs

## What the backend contract gives us

- `POST /cms/auth/verify/{code}` returns `{ "verified": true|false }` and **401** when the bearer is missing/unusable. It does **not** return a new access token.
- `POST /cms/auth/refresh` returns `{ accessToken, verified }` — this is the only endpoint that hands back both a fresh token and the authoritative `verified` flag.
- Confirmed in your log: the `/verify` page was reachable and interactive for an already-verified account, which is what let it fire verify/resend requests it should never have sent. The WebSocket also connects and disconnects every ~5–25 s for the whole session, i.e. it never stays authenticated.

Because verify returns no token, the old token keeps its pre-verification claims. That is the core of the "verified, then bounced to /login" bug: the next protected call goes out with a stale token, gets rejected, and the generic rejection path clears the session and sends the user to `/login` — while the refresh cookie is still valid, which is exactly why a manual reload then lands you on the dashboard.

## The state problems in the frontend

1. **`verified` is module-level memory, not derived truth.** `lastVerified` lives in `api-client.ts` and resets to `null` on every page load. `null` means "unknown", but `/verify` renders its form whenever `verified !== true`, so a verified user who types `/verify` gets a live OTP form. `_authenticated` has the mirror-image hole: it admits a possibly-unverified user while `verified` is `null`.
2. **Nothing re-syncs the session after verification** — see the token/claims gap above.
3. **Every hard bounce goes to `/login`,** so an unverified or merely stale session is indistinguishable from a dead one.

## The fix

**Single source of truth for `verified`**
- `verified` stays a three-state value (`true` / `false` / `null` = unknown) and is only ever written from a server answer: login, register, refresh, verify.
- On boot, resolve the session through refresh and keep `isLoading` true until `verified` is known (existing 1.2 s safety timeout stays, so the UI can never hang).
- Persist the last known `verified` alongside the token so a reload starts from the previous answer instead of `null`, then confirm it with refresh.

**`/verify` becomes strictly conditional**
- The OTP form renders only when `isAuthenticated && verified === false`. `null`, `true`, and signed-out states render the resolving/redirecting placeholder — no inputs, no resend button, so zero requests can leave the page.
- If `verified` is `null` on entry, the page waits for the refresh answer before deciding, instead of assuming "unverified".
- Submit and resend are additionally guarded in their handlers, so a stale click can't fire after the state flips.

**Post-verification handoff (given the `{verified}`-only response)**
1. `POST /cms/auth/verify/{code}` → read `verified` from the body; treat `verified === false` as a failed attempt (decrement attempts, stay on the page).
2. On `verified === true`: set local state, then **await a refresh** so the access token carries verified claims and the server-reported `verified` is adopted.
3. Only after that refresh resolves, navigate to `/dashboard`. If the refresh fails transiently, keep the session and the verified state and still navigate — the dashboard's own retry path handles it — but never sign out.
4. A 401 from verify means the bearer was unusable: refresh once and retry the code once, and only surface a session error if that also fails.
5. A 5xx from verify shows a clear server-side error and keeps the user on `/verify` with the code cleared.

**Never sign out on a recoverable rejection**
- Only a refresh that is itself rejected (401/403 on `/cms/auth/refresh`) or a server `LOGOUT` frame ends the session. Everything else keeps the token.
- Two distinct destinations: session dead → `/login`; session alive but unverified → `/verify`.


**Never sign out on a recoverable rejection**
- A 401 that a refresh can recover from must not clear the session. Only a refresh that is explicitly rejected (401/403 on refresh itself) or a server `LOGOUT` ends the session.
- When the session does end, send the user to `/login`; when the session is alive but unverified, send them to `/verify`. Those two paths stay separate so an unverified user can never be dumped on the login screen.

**Socket churn**
- Stop reconnecting on a loop when the server keeps closing the socket: connect only once the session is resolved and verified, treat repeated `AUTH_FAILED`/immediate closes as "socket unavailable" and stay quiet (REST session untouched), and keep the ping under the server's idle window so the connection is not closed as idle.

**Guard sweep**
- Consistent rules across `/`, `/login`, `/verify`, `_authenticated/*`: unresolved → placeholder; signed out → `/login`; signed in + unverified → `/verify`; signed in + verified → `/dashboard`. No route both renders content and navigates away in the same pass.

## Verification

- Playwright run over the whole flow: fresh load while signed in (no login flash), signed-in visit to `/verify` (redirects, sends zero requests — checked against the network log), login → unverified → `/verify`, verify → dashboard, logout → `/login`, plus a reload on each state.
- Typecheck.

## Technical notes

- Files: `src/lib/api-client.ts`, `src/lib/auth-context.tsx`, `src/lib/session-socket.ts`, `src/routes/verify.tsx`, `src/routes/login.tsx`, `src/routes/_authenticated/route.tsx`, `src/routes/index.tsx`, `src/components/nav-bar.tsx`.
- No backend changes here. `UserService.markVerified` must be fixed on your side (null user passed to the cache-evict key) before verification can ever return 200.
