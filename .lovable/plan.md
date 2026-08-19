# Fix the verification/session state bugs

## What is confirmed from your backend log

- Every `POST /cms/auth/verify/{code}` in the log ends in a **500** inside `AuthService.verify` (line 168) → `UserService.markVerified`: `EL1007E: Property or field 'username' cannot be found on null`. That is a backend cache-key bug (`@CacheEvict(key = "#user.username")` with a null user). The frontend cannot make a 500 succeed — you need to fix that method, otherwise verification will keep failing server-side even after the UI is correct.
- The log also shows the WebSocket connecting and disconnecting every ~5–25 seconds all session long, i.e. the socket never stays authenticated. That churn is a real frontend/transport problem worth fixing in the same pass.
- The verify/resend requests in the log were sent by an already-verified account, which confirms the `/verify` page is reachable and interactive when it should not be.

The exact cause of "verify succeeds then I land on /login" is **not** confirmed yet (the log only shows 500s, not a success path). The plan therefore starts by reproducing it with tracing, then applies the state fixes below.

## The state problems in the frontend

1. **`verified` is module-level memory, not derived truth.** `lastVerified` lives in `api-client.ts` and resets to `null` on every page load. `null` means "unknown", but `/verify` renders its form for `verified !== true`, so a fully verified user who opens `/verify` gets a working OTP form and can fire verify/resend requests. Same weakness the other way: `_authenticated` lets a possibly-unverified user through while `verified` is `null`.
2. **Nothing re-syncs the session after verification.** `verifyOtp` only flips local state; the access token still carries the pre-verification claims, so the next protected request can be rejected and bounce the user.
3. **Any hard bounce goes to `/login`.** Both the logout handler and the socket `LOGOUT` path clear the token and navigate to `/login`, so a single transient rejection right after verifying looks exactly like "I verified and got logged out" — while the refresh cookie is still valid, which is why a manual reload then drops you on the dashboard.

## The fix

**Single source of truth for `verified`**
- Treat `verified` as a three-state value that is only ever set from a server answer (login, register, refresh, verify) and re-fetch it on boot instead of assuming.
- On app boot, always resolve the session through refresh before deciding anything, and keep `isLoading` true until `verified` is known (with the existing 1.2 s safety timeout so the UI can never hang).

**`/verify` becomes strictly conditional**
- Render the OTP form only when `verified === false`. `null`/`true`/unauthenticated states render the resolving/redirecting placeholder, never inputs and never buttons that can fire requests.
- Disable submit and resend while the session state is unresolved, so no request can leave the page before the app knows the user is unverified.

**Post-verification handoff without a bounce**
- After a successful verify: mark verified, refresh the access token so the new token carries verified claims, then navigate to `/dashboard`.
- If verify returns a 5xx (your current backend bug), show a clear "verification failed on the server" error and keep the user on `/verify` with the code cleared — never navigate, never sign out.

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
