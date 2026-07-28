## What we're fixing

1. Logout doesn't actually log you out (token + refresh cookie survive)
2. Random "unauthorized" loops where neither the access token nor refresh works
3. Icon field in the General editor stores a bare image name instead of a full URL
4. No icon upload button in the "Create new post" dialog
5. Three feature cards at the bottom of the home page

---

## 1. Logout

Currently `logout()` only clears localStorage and does `window.location.href = "/login"` — the backend refresh cookie stays alive, so the next visit silently re-authenticates.

New flow in `src/lib/auth-context.tsx`:
- `POST /cms/auth/logout` with `credentials: "include"` and the current bearer token, ignoring failures (network/401 must not block sign-out)
- Clear the access token from localStorage and React state
- Clear the React Query cache so no protected data survives
- Navigate to `/login` via the router (no full page reload)

**What I need from your backend:** on `POST /cms/auth/logout`, invalidate the stored refresh token/stimulus for the user and return a `Set-Cookie` that expires the cookie with the *exact same* attributes it was set with (`path=/cms/auth/refresh`, `httpOnly`, `secure`, same `sameSite`, `maxAge=0`). A cookie deleted with a different path is ignored by the browser. Response body can be empty with `204`, or `{"success": true}` with `200` — I'll accept both.

## 2. The unauthorized / refresh-never-works root cause

Your cookie is set as:

```text
sameSite("Lax"), secure(true), path("/cms/auth/refresh")
```

Frontend runs on `:3000`, API on `:8080`. Different ports = **cross-site** for cookie purposes, and a `SameSite=Lax` cookie is **never sent on a cross-site `fetch()`**. So `POST /cms/auth/refresh` arrives with no cookie → 401 → the client wipes the token → every following request is unauthorized. That exactly matches "the token vanished from localStorage and refresh didn't work either".

**Backend change required (I can't fix this from the frontend):**
- `sameSite("None")` + `secure(true)` on the refresh cookie
- CORS: `allowCredentials(true)` and an explicit allowed origin list (no `*`), with `Authorization` in allowed headers and `OPTIONS` permitted

**Frontend changes I'll make to make the flow robust:**
- Proactively refresh when the access token is expired *or* within 30s of expiry, before firing the request — instead of waiting for a 401
- Keep single-flight refresh, but queue concurrent callers correctly (today a second caller can get a stale promise result)
- Only clear the token and force logout when the refresh endpoint returns a real 401/403. On a network error or 5xx, keep the token and surface the error — this is what wiped your session mid-testing
- Retry the original request exactly once after a successful refresh; if it 401s again, then log out
- Store the token under a versioned key and validate it parses as a JWT on load; a corrupt value gets dropped instead of being sent as a malformed bearer
- Add a dev-only console trace of the auth flow (request → 401 → refresh → retry) so any future breakage is visible

## 3. Images: always full URLs

`uploadImage` returns `{ imageName, url }`; the General tab stores `imageName`, the markdown editor stores the full URL. Unifying on full URL:
- `uploadImage` returns the absolute URL built from the configured API base + `/image/{imageName}`
- `IconInput` sets the full URL into the field on upload, so upload and paste-a-URL behave identically, and the value saved to the backend is the full URL
- `resolveImageSrc` stays as a safety net for existing posts that still hold a bare name

## 4. Icon upload in "Create new post"

Replace the plain `Input` for `icon` in `src/components/new-post-dialog.tsx` with the same `IconInput` component used in the General tab — thumbnail preview, upload button, and URL paste.

## 5. Home page

Remove the three feature cards (Markdown first / Fast dashboard / Image uploads), the `#features` section, the `FeatureCard` helper and its now-unused icon imports. The "Learn more" button that pointed at `#features` goes too, leaving a single primary CTA.

---

## Technical notes

Files touched: `src/lib/api-client.ts`, `src/lib/auth-context.tsx`, `src/lib/upload-image.ts`, `src/components/icon-input.tsx`, `src/components/new-post-dialog.tsx`, `src/routes/index.tsx`.

Your GitHub repo is synced into this project, so I'll build on whatever is currently on disk here — if a commit hasn't landed yet, say so before I start.

Two backend items are on you (frontend can't work around either): the `SameSite=None; Secure` refresh cookie with credentialed CORS, and the logout endpoint expiring the cookie on the same path.
