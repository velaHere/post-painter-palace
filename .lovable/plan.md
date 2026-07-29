## 1. Fix the "logged out → flash → logged in" glitch

**Confirmed cause (from reading the code):** `AuthProvider` (`src/lib/auth-context.tsx`) always starts with `token = null`, `isLoading = true`, and only resolves the session inside a `useEffect`. Nothing that renders during that window looks at `isLoading`:

- `NavBar` reads only `isAuthenticated`, so it paints the **Login** button first, then swaps to Dashboard + avatar.
- `src/routes/index.tsx` picks its CTA target from `isAuthenticated`, so the button briefly points at `/login`.
- The login route redirects to `/dashboard` once the session resolves — that's the "instantly redirects me to the dashboard" part.

**Changes:**

1. **Hydrate synchronously when possible** — in `AuthProvider`, initialise state from `getAccessToken()` in the `useState` initialiser (client-side only). If a stored token exists and is not stale, start as authenticated with `isLoading = false`; no network round-trip, no flash. Only fall into the async `refreshToken()` path when there is no usable stored token.
2. **Add a resolving state to the nav** — while `isLoading` is true, `NavBar` renders a neutral placeholder (a small skeleton where the account control goes) instead of the Login button, so the signed-out state is never shown to a signed-in user.
3. **Home page CTA** — render the button in a disabled/neutral state while `isLoading`, then settle into "Go to dashboard" or "Get started". Avoids the flicker and the wrong link target if clicked fast.
4. **Login route** — wait for `isLoading` to finish before deciding to redirect, so a signed-in user landing on `/login` goes straight through without rendering the form first.
5. **Smoother transitions** — subtle fade/opacity transition on the nav auth area so any remaining resolve step (cold load with no stored token) reads as intentional rather than a glitch.

Net effect: signed-in users with a valid stored token see the correct header on first paint; users needing a refresh see a stable placeholder instead of a wrong state.

## 2. YouTube "Video unavailable"

Your ChatGPT write-up has one invalid data point: the **standalone HTML opened from disk (`file://`) is expected to fail**. YouTube's embed rejects a `null` origin, and it fails with exactly "Video unavailable / Watch on YouTube". So that test does not prove the problem is outside the app — it proves nothing either way.

Real remaining suspects, in order:
- Edge **Tracking Prevention (Balanced/Strict)** blocking storage for youtube.com — this *does* produce "Video unavailable" for embeds while youtube.com itself works. The console message you saw is the tell.
- Network/DNS filtering that allows youtube.com but blocks the embed endpoints.
- The app's own CSP header — `vite.config.ts` currently sets `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com`. That allows the frame, but the embed player also needs its own subresources; worth confirming no `Permissions-Policy` or referrer stripping is in play.

**What I'll do in the code:**

1. **Verify it in a clean browser** — drive a headless Chromium against the preview with the iframe rendered, capture console + network for the embed, and screenshot the player. That tells us definitively whether the app serves a working embed or whether it's your Edge profile/network.
2. **Harden the preview renderer** (`src/components/content-editor.tsx` and the published post preview): add a `components` override for `iframe` in ReactMarkdown that
   - normalises `youtube.com/watch?v=` and `youtu.be` URLs to `/embed/`,
   - sets `referrerPolicy="strict-origin-when-cross-origin"`, `loading="lazy"`, `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"`, `allowFullScreen`,
   - wraps it in a responsive 16:9 container so embeds scale on mobile instead of overflowing at a fixed 560×315.
3. **Confirm the CSP** in `vite.config.ts` covers both youtube hosts (it does) and note if anything else needs adding once the headless test reports back.

If the headless test plays the video fine, the fix on your side is Edge settings (turn Tracking Prevention off for the site, or allow third-party cookies for youtube.com) — I'll report exactly what I observed rather than guessing.

## Technical notes

- Files touched: `src/lib/auth-context.tsx`, `src/components/nav-bar.tsx`, `src/routes/index.tsx`, `src/routes/login.tsx`, `src/components/content-editor.tsx`, possibly `src/styles.css` (responsive embed wrapper) and `vite.config.ts` (CSP only if the test shows it's needed).
- No backend or API-contract changes; the token storage key and refresh flow stay as-is.
- The `_authenticated` layout already gates on `isLoading`, so protected routes need no change.
