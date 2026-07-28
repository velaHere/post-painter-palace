
# Editor overhaul + dark theme

## 1. Global dark theme (shared with the post page)

- Force `.dark` on the `<html>` element in `src/routes/__root.tsx` (or the shell) so the whole site renders dark.
- Rewrite the token values in `src/styles.css` using the palette from your `styles.css` upload:
  - `--background` ≈ `#0b1220`, `--card` ≈ `#0f1a2e`, `--foreground` ≈ `#e6edf7`, `--muted-foreground` ≈ `#98a4b8`, `--primary` ≈ `#82bcff`, `--primary-foreground` on dark blue, `--border` ≈ `#1e2a44`, `--ring` = accent.
  - Update both `:root` and `.dark` to the same dark values (single theme, no toggle).
- Add a `md-preview` utility set (already partly there) tuned for this palette so `<h1/h2/h3>`, `code`, `pre`, `blockquote`, `table`, `img` all render the same way as your `post.html`.

## 2. New backend endpoint for body-only markdown

- Add a small note in the plan: switch the content fetch from `GET /{username}/post/{slug}` to `GET /cms/post/{slug}/description` (the new endpoint you're adding server-side). Response shape assumed: `{ description: string }` — confirm before build if it's different.
- Update `src/routes/_authenticated/editor.$slug.tsx` to use that new endpoint via `api()`.
- Because the body no longer contains YAML, remove any frontmatter-stripping logic — the editor value is just the body verbatim.
- `PUT /cms/post/updateContent/{slug}` keeps sending `{ content }` (unchanged).

## 3. Content editor — new component `src/components/content-editor.tsx`

Replaces `markdown-editor.tsx`. Same props (`value`, `onChange`, `onSave`, `saving`) so the parent doesn't change much.

### Toolbar (single row, wraps on narrow)

Grouped with dividers, using lucide icons + tooltips:

- **Core formatting:** Bold, Italic, Strikethrough, Inline code, H1, H2, H3
- **Lists & quotes:** Bulleted list, Numbered list, Task list, Blockquote, Horizontal rule
- **Links / images / code blocks:** Link, Image upload (file picker), Fenced code block, Table
- **HTML helpers:** `<div>` wrapper, `<details><summary>`, `<br>`
- **Right side:** Preview toggle, Save button

Each button wraps the current selection or inserts a stub at the caret (e.g. `**text**`, `# `, `- [ ] `, `\`\`\`lang\n…\n\`\`\``, `| col | col |\n|---|---|\n| … | … |`).

### Image insertion — three input paths, one upload flow

All three call `POST /image` (multipart, field name `file`) and get back `{ imageName }`. Inserted markdown = `![<originalName>](<baseUrl>/image/<imageName>)`:

1. **Toolbar Image button** — opens file picker.
2. **Clipboard paste** — `onPaste` on the textarea reads `event.clipboardData.items`, uploads any `image/*` blob, inserts at caret.
3. **Drag & drop** — `onDrop` on the textarea handles `dataTransfer.files`, uploads sequentially, inserts one after another at the drop position.

While an upload is in flight, insert a placeholder `![uploading…]()` at the caret and replace it with the real markdown on success (or remove it on failure with a toast).

### Preview

- Renders with `react-markdown` + `remark-gfm` (already in deps) — **plus** `rehype-raw` so inline HTML (`<div>`, `<details>`, `<br>`, etc.) is rendered instead of shown as text. New dep: `rehype-raw`.
- Preview container gets the `md-preview` utility so it matches the public post page.

## 4. Icon field — upload + URL

In `GeneralTab` inside `src/routes/_authenticated/editor.$slug.tsx`:

- Replace the single Icon `<Input>` with a horizontal group:
  - `<Input>` bound to `fm.icon` (image name or full URL)
  - `<Button>` "Upload" → file picker → `POST /image` → set `fm.icon` to the returned `imageName`
  - Small preview thumbnail on the right when `fm.icon` is set — if it looks like a bare name, render `<baseUrl>/image/<name>`, else use it verbatim.
- Same helper is reused inside the content editor's image-upload flow (extract into `src/lib/upload-image.ts`).

## 5. Unsaved-changes guard

- Track a `dirty` boolean per tab (General / Content) — `true` when the current value diverges from the last-loaded server value; reset on successful save and after a fresh fetch.
- Combine into `anyDirty = dirtyGeneral || dirtyContent`.
- Use TanStack Router's `useBlocker({ shouldBlockFn: () => anyDirty, enableBeforeUnload: anyDirty, withResolver: true })` inside `EditorPage`.
- Render a shadcn `AlertDialog` when `status === "blocked"` with **Discard & leave** (`proceed()`) and **Stay** (`reset()`).
- `enableBeforeUnload` handles the browser tab-close / hard-refresh prompt automatically.
- Also guard the in-tab switch (General ↔ Content) — if the leaving tab is dirty, show the same dialog before flipping.

## 6. File touch list

- New: `src/components/content-editor.tsx`, `src/lib/upload-image.ts`, `src/components/icon-input.tsx` (URL + upload combo).
- Edit: `src/routes/_authenticated/editor.$slug.tsx` (new endpoint, blocker, icon component, uses `ContentEditor`), `src/styles.css` (palette + preview utilities), `src/routes/__root.tsx` (force dark class).
- Delete: `src/components/markdown-editor.tsx` (superseded).
- Add dep: `rehype-raw`.

## Open questions

1. The new body endpoint — I'm assuming `GET /cms/post/{slug}/description` returns `{ "description": "…markdown…" }`. If it's a raw string or a different key, tell me and I'll match it.
2. `POST /image` — I'm reading `imageName` from the JSON response (matches your `ImageUploadResponse`). Confirmed?
3. For the icon preview thumbnail: if `fm.icon` doesn't look like a URL (no `://`), I'll treat it as an `imageName` and hit `<baseUrl>/image/<name>`. OK?
