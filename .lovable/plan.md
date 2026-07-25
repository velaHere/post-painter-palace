
# Plan: GramStore CMS frontend rebuild

Building fresh in this Lovable workspace against your Spring backend. Nothing from the old GitHub repo is imported.

## 1. Backend base URL (configurable, one place)

- Add `VITE_API_BASE_URL` (default `http://127.0.0.1:8080`) read in a single `src/lib/api-config.ts`.
- Also expose a small **Settings** dialog (gear icon in navbar) that lets you override the base URL at runtime; the override is stored in `localStorage` and takes precedence over the env default. Change it once, works everywhere.
- Heads-up: the published Lovable preview is HTTPS, so a browser call to `http://127.0.0.1:8080` from the hosted preview will be blocked by mixed-content. Local `bun dev` works fine. Not something I can fix from the frontend — just noting it.

## 2. Routes (TanStack file-based routing)

```text
src/routes/
  __root.tsx            navbar + <Outlet/>, auth context, react-query provider
  index.tsx             public welcome page (hero + CTA to Login / Dashboard)
  login.tsx             login form with "Sign up" toggle inside the same page
  _authenticated/
    route.tsx           gate: redirect to /login if no token
    dashboard.tsx       sidebar of sections (only "Posts" active), post cards grid
    editor.$slug.tsx    two-tab editor: General | Content
```

Deleting the placeholder in `src/routes/index.tsx` and replacing with a real welcome page.

## 3. Top navbar (replaces the "current" left sidebar)

- Sticky top bar, brand on the left, right side:
  - Logged out → **Login** link
  - Logged in → **Dashboard** link + avatar/username dropdown with **Profile** and **Logout**
- Settings (gear) button to change backend URL.
- Driven by auth context so it updates immediately on login/logout.

## 4. Auth

- `POST /cms/auth/login` and `POST /cms/auth/register` → `{ accessToken }` stored in memory + `localStorage`.
- Refresh cookie is HttpOnly and handled by the browser; on 401 we call `POST /cms/auth/refresh` once and retry.
- `GET /cms/auth/check` used on app boot to validate the token silently.
- All authed fetches send `Authorization: Bearer <accessToken>` and `credentials: 'include'` (for the refresh cookie).
- A tiny `apiClient` in `src/lib/api-client.ts` centralizes base URL + auth header + refresh-retry.

## 5. Dashboard (`/dashboard`)

- Layout: left column = list of sections (only **Posts** for now, clearly extensible), right column = content pane.
- Posts pane:
  - Header shows **"You have N posts"** (count from the list response).
  - Grid of post cards. Each card = icon (from backend `icon` field) + title. Card click → `/editor/<slug>`.
- Data source: `GET /{username}/post` (username from the decoded JWT `sub` or `/cms/auth/check` — I'll decode from the JWT client-side, standard for a Spring auth flow).
- A **New Post** button opens a small dialog (title/description/slug/category/postType/icon/published) → `POST /cms/post/create`, then redirect to the new post's editor.

## 6. Editor (`/editor/$slug`)

Two-tab left sidebar inside the editor route (this is the "left sidebar for the editor" you asked for — separate from the global navbar):

- **General tab** — form with all 9 frontmatter fields from `PostFrontMatterRequest`:
  `title, description, slug, category, postType, icon, actionLabel, actionLink, published (checkbox)`.
  Save button → `PUT /cms/post/updateFrontMatter/{slug}`.
- **Content tab** — markdown editor + Preview toggle. `react-markdown` + `remark-gfm` for preview; textarea (with monospace + tab handling) for input. Save button → `PUT /cms/post/updateContent/{slug}`. Loads current markdown via `GET /{username}/post/{slug}` (`PostResponse.markdown`).
- Delete button in editor header → `DELETE /cms/post/delete/{slug}` with confirm dialog, then back to dashboard.
- Image upload helper in the content toolbar → `POST /image` (multipart), inserts `![](<baseUrl>/image/<imageName>)` at the cursor.

The General and Content tabs are fully separated screens (as you asked) — General is NOT rendered inside the Content view.

## 7. Welcome page (`/`)

Simple hero: product name, one-line tagline, two buttons — **Get started** (→ `/login` or `/dashboard` depending on session) and **Learn more** (scrolls to a short features section). No dashboard leakage on the public page.

## 8. UI / styling

- shadcn components already installed: `button`, `input`, `card`, `dialog`, `tabs`, `dropdown-menu`, `avatar`, `checkbox`, `label`, `textarea`, `sonner` (toasts).
- Tailwind v4 tokens already in `src/styles.css`; using semantic tokens only (`bg-background`, `text-foreground`, `bg-primary`, etc.).
- Data fetching via TanStack Query (already in the template).

## Technical details

- New/edited files:
  - `src/lib/api-config.ts`, `src/lib/api-client.ts`, `src/lib/auth-context.tsx`, `src/lib/jwt.ts`
  - `src/components/nav-bar.tsx`, `src/components/settings-dialog.tsx`, `src/components/post-card.tsx`, `src/components/new-post-dialog.tsx`, `src/components/markdown-editor.tsx`
  - `src/routes/index.tsx` (rewrite), `src/routes/login.tsx`, `src/routes/_authenticated/route.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/editor.$slug.tsx`
  - `src/routes/__root.tsx` (add navbar + AuthProvider + QueryClientProvider already present)
- Deps to add: `react-markdown`, `remark-gfm`, `jwt-decode`.
- Auth state flows through router context so `beforeLoad` in `_authenticated/route.tsx` can redirect synchronously.

## What I'm not doing (out of scope for this pass)

- No profile edit page beyond a placeholder (backend has no update-profile endpoint shown).
- No server-side rendering of authenticated routes — dashboard/editor are client-only (`ssr: false` on the `_authenticated` layout) since your backend uses cookie+bearer auth.
