# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (2026-09-04) — ask panel beside the graph (DIST-LITE-9)

- `GraphWithAsk` puts `AskPanel` from `@smartmemory/graph` in a side pane next to
  `GraphExplorer`, in both the Clerk build and the lite build. Ask a question, read the
  answer, and see the memories and relations it was grounded in.
- Clicking an evidence or relation row focuses that element in the graph. `GraphExplorer`
  exposes no focus prop, so this writes `#selected=<id>` and remounts the explorer to
  replay its hash-restore effect. Two consequences worth knowing: the graph refetches on
  each click, and a relation focuses its SOURCE entity rather than the edge, because the
  restore path feeds whatever the hash names into the node-click handler. A
  `focusElementId` prop on `GraphExplorer` fixes both and is the filed follow-up; it was
  not added here because PLAT-PUSH-SSE-1 was editing that file at the same time.

### Fixed (2026-08-13) — sanctuary shipped developer-local config

- **`sanctuary.smartmemory.ai` was serving the Clerk *dev* publishable key.**
  `.env.sanctuary` pinned only the two Discord Activity flags, so every other
  `VITE_*` value fell through to whatever the building machine had. The
  PLAT-CLERK-PROD-1 rotation to `pk_live_*` reached the five UIs that deploy
  through GitHub Actions and missed this one, which deploys by local `rsync`.
  Since svc-api stopped accepting the dev issuer (PLAT-CLERK-PROD-1 Phase D),
  the non-embedded fallback branch of `src/main.jsx` could not authenticate at
  all. `.env.sanctuary` now pins the production API URL, the `pk_live_*` Clerk
  key, and the PostHog project 277617 key.
- **Pinning alone was not enough.** Vite ranks the process environment above
  every `.env` file, and the local docker-compose flow exports
  `VITE_CLERK_PUBLISHABLE_KEY=pk_test_*` into the shell — so the file said one
  thing and the shell silently won. `build:sanctuary` now runs vite under
  `env -u` for each pinned variable, making the build hermetic.
- Sanctuary deploys now inspect the freshly built bundle before `rsync` and
  refuse to publish it (`scripts/assert-prod-bundle.mjs`) if a Clerk `pk_test_`
  key or the foreign ScaleMate PostHog token is present, or if any value pinned
  in `.env.sanctuary` failed to reach the bundle. The last check is the one that
  catches an environment leak: "localhost" cannot be blacklisted, because the
  Discord SDK and posthog-js both legitimately contain it.

### Added (2026-07-22) — PLAT-ANALYTICS-1 product analytics

- Viewer's PostHog provider now uses the shared `createAnalyticsConfig({ app: 'viewer' })`:
  autocapture off, session replay on but fully masked. The existing missing-key passthrough and
  Discord bypass are preserved.
- Viewer deliberately stays **anonymous** — no identity call and no reset. It is a share-link
  surface whose visitors are frequently not authenticated users, so binding an identity would
  attribute a public viewer to whoever last signed in.

### Fixed
- `LocalApp.jsx` now passes `sseBaseUrl={window.location.origin}` instead of
  the deprecated, now-dead `wsUrl` prop. `GraphExplorer`/`useGraphStream`
  migrated WS→SSE; passing only `wsUrl` left `sseEnabled` false so the graph
  never connected ("Not connected to event stream", 0 nodes). Same-origin
  base → no CORS, IPv4-safe (matches `apiUrl:''`). Requires the lite daemon's
  new `GET /memory/progress/stream` (smartmemory CHANGELOG, DEMO-WALKTHROUGH-1).

### Added
- One-click share-replay button in the viewer toolbar — surfaces after a run
  completes (graph has elements + quiet period), copies `<origin>/?run=<uuid>`
  to clipboard with a transient "Link copied" confirmation, and falls back to
  a manual select-text input (with `console.warn`) when `navigator.clipboard`
  is unavailable. Wave 1 Stream C.
- Local build entry for pip-bundled loginless viewer (DIST-LITE-4)
- Two-phase Clerk auth + wsToken for WebSocket
- Discord Activity boot path — sanctuary / discord-bot (FEAT-6)
- Sanctuary mode — bake `VITE_ALLOW_EMBEDDED=true` at build time
- Shareable replay URL + SSE transport in viewer (T017)
- Graph viewer doubles as Activity router for `/lens` (FEAT-34)
- App-specific favicon

### Fixed
- Login loop; SDK/graph Tailwind source scanning
- PLAT-SSO-CLEAN-1 Batch 2 — migrate viewer to SDK auth (GAP-1, P1)
- Local viewer ports 9005→9014, 9004→9015
- Add entry point with `createRoot` + Tailwind CSS import
- Embedded mode: hide selection toolbar in Discord Activity view (cramped + Delete risky)
- Embedded auth flow: drop redirect_uri from authorize, exchange code via backend, send `channel_id` in claim body, drop `/sm` prefix

### Changed
- Send `X-Workspace-Id: sanctuary-default` (embedded)
- Rename `X-Team-Id` to `X-Workspace-Id` (SCOPE-WS-1)
