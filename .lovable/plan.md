## Goal

Align the frontend with the latest backend: `POST /cms/auth/refresh`, `verified` flag on every auth response, and a full email-verification (OTP) flow with the 403 "Email verification required" guard.

## What changes

### 1. API client back to POST refresh
`src/lib/api-client.ts` currently calls `GET /cms/auth/refresh`; the controller is `@PostMapping`. Switch back to POST (no body, cookie sent via `credentials: "include"`). Keep the single-flight logic, 30s skew, and the rule that only 401/403 clears the session while network/5xx keeps the token.

Also:
- Parse the full `AuthResponse` (`accessToken`, `verified`) instead of only the token, and expose `verified` to callers of `refreshToken()`.
- Add a shared handler for `403` responses whose body says email verification is required, so any protected call that hits the `EmailVerificationFilter` routes the user to the verification screen instead of logging them out.

### 2. Verification state in auth context
`src/lib/auth-context.tsx`:
- Track `verified: boolean | null` alongside the token; set it from `login`, `register`, and `refresh` responses.
- Expose `verified`, plus `verifyOtp(code)` and `resendOtp()` actions that call `POST /cms/auth/verify/{code}` and `GET /cms/auth/resend`.
- On successful verification, flip `verified` to true locally (no refetch needed) and let the caller navigate onward.
- The session WebSocket keeps connecting on token, unchanged.

### 3. New `/verify` route
New `src/routes/verify.tsx`: a signed-in-only screen with a 6-digit OTP input, "Verify" button, and a "Resend code" button with a cooldown (the backend rate-limits resends and returns 429 → show a friendly "wait a moment" toast).
- Error mapping: expired OTP → prompt to resend; invalid code → inline error; too many attempts/requests → 429 message.
- On success: toast + redirect to `/dashboard`.
- Own `head()` metadata (title/description/og).

### 4. Gating
- `src/routes/_authenticated/route.tsx`: after the existing auth check, if `verified === false`, redirect to `/verify` instead of rendering the app. Keeps the current no-flash loading behaviour.
- `src/routes/verify.tsx` bounces to `/dashboard` when already verified, and to `/login` when not signed in.
- `src/routes/login.tsx`: after login/register, go to `/verify` when the response says `verified: false`, otherwise `/dashboard`. Register always lands on `/verify` since the backend just emailed the OTP.
- `src/components/nav-bar.tsx`: while signed in but unverified, show a subtle "Verify email" action instead of the Dashboard link.

## Technical notes
- Files touched: `src/lib/api-client.ts`, `src/lib/auth-context.tsx`, `src/routes/_authenticated/route.tsx`, `src/routes/login.tsx`, `src/components/nav-bar.tsx`; new `src/routes/verify.tsx`.
- Assumption: OTP is a 6-character code entered as text/digits; adjust if your generator differs.
- The verify/resend endpoints require the bearer token but are exempt from the verification filter, so they work while unverified.
- No backend changes needed; the refresh cookie path stays `/cms/auth/refresh`.
