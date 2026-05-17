# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
