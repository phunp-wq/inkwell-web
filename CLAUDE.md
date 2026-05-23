# inkwell-web

Full-stack read-later web app. React (Vite) + Express + PostgreSQL. Deployed on Railway.

## Dev commands

```bash
npm run dev    # Vite dev server :5173 (hot reload)
node server.js # Express API :3777
npm run build  # production build → dist/
npm start      # serve dist/ via Express (Railway uses this)
```

Run Vite dev + Express together for local development.

## Architecture

- **Frontend**: `src/` — React, inline styles throughout, no CSS Modules/Tailwind
- **API**: `server.js` — Express, single file, all routes here
- **DB**: PostgreSQL via `pg`. `DATABASE_URL` env var must be the Railway public proxy URL (`*.proxy.rlwy.net`), NOT the internal hostname.

## Theme system

CSS custom properties in `src/assets/globals.css`:
- `:root` = dark defaults
- `[data-theme="light"]` = light overrides (design handoff spec)
- Semantic vars: `--bg-subtle`, `--bg-tag`, `--bg-kbd`, `--bg-card-alt`, `--bg-summary`, `--scrollbar`, `--scrollbar-hover`

`darkMode` state in `src/store/AppContext.tsx`:
- Persisted to `localStorage` under key `inkwell-theme`
- Effect sets `document.documentElement.setAttribute('data-theme', ...)`
- Exposed as `{ darkMode, toggleDark }` from `useApp()`

**Rule**: Use CSS vars (`var(--xxx)`) for ALL colors. Never add new hardcoded `rgba(255,255,255,...)` — those don't flip in light mode.

## State convention (AppContext)

- `articles` — filtered by current view/search (drives main list)
- `allArticles` — full library (drives Sidebar counts/categories/tags)
- Always read counts from `allArticles`, never `articles`
- `setFilterView` is wrapped to also clear `selectedArticle` — don't unwrap

## pg gotcha

`BIGINT` columns come back as JS **strings**. `saved_at` is BIGINT — use `Number(ts)` before passing to `new Date()`.

## Extraction pipeline

`POST /api/pipeline` — SSE stream. Primary extractor: Jina Reader (`https://r.jina.ai/{url}`). Only two headers: `Authorization` + `Accept: application/json`. Do NOT add other Jina headers — defaults produce cleaner output.

Fallbacks: Trafilatura (Python) → Readability.js.

Pipeline must delete its DB row on any error (no orphan `ai_processed=0` rows — they block re-saving the same URL).

## AI model

Nemotron 3 Nano via OpenRouter. Always append `/no_think` to the prompt. Model ID in `server.js` — verify before changing.

## Open work

- **Settings page** — `onClick={() => {}}` no-op in Sidebar, nothing built
- **RAG** — not started; ask user before designing (MiniSearch vs embeddings undecided)
