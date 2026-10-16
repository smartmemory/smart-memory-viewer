# SmartMemory Graph Viewer

**Version:** 0.1.0

Standalone knowledge graph viewer for SmartMemory. Thin auth shell that delegates all graph visualization to `@smartmemory/graph`.

## Features

- **Graph visualization** — Cytoscape.js canvas with 5 layout algorithms (force-directed, hierarchical, circle, concentric, grid)
- **Type filtering** — Toggle memory types and entity types with color-coded checkboxes
- **Search** — Fuzzy search across node labels with keyboard shortcut (Cmd/Ctrl+K)
- **Detail panel** — Click any node to see content, metadata, confidence, and timestamps
- **Entity corrections** — Rename entities, retype, ground to Wikipedia
- **Path finder** — Select two nodes and find the shortest path between them
- **Real-time streaming** — WebSocket events with drip-feed animation
- **Export** — Download graph as PNG (2x resolution) or SVG
- **PWA** — Installable with offline caching via Workbox

## Quick Start

```bash
# Prerequisites: Node.js 20.19+
npm install
npm run dev
```

Opens at [http://localhost:5178](http://localhost:5178).

## Environment

Copy `.env.example` to `.env` and configure:

```bash
VITE_API_URL=http://localhost:9001      # SmartMemory API
VITE_WS_URL=ws://localhost:9003/events  # Insights WebSocket for streaming
```

Production defaults to `https://api.smartmemory.ai` and `wss://api.insights.smartmemory.ai/events`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port 5178 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Sanctuary deployment

Run `npm run deploy:sanctuary` to build `dist-sanctuary/` and publish
`sanctuary.smartmemory.ai` to us1 (`root@40.160.38.143`). The deployment requires
local Node.js, Python 3.9+, rsync, shasum, Git, and SSH access. The host needs
Python 3, rsync, Linux atomic directory exchange support, and an existing real
directory at `/var/www/sanctuary`.

The script inspects the built artifact with `scripts/assert-prod-bundle.mjs`
before any upload, including the foreign PostHog token guard. It uploads to a
unique `/var/www/.stage-sanctuary-<UTC timestamp>-<run id>` directory and verifies
the stage with a checksum comparison. The host helper exchanges stage and live
atomically, so the live path stays present. It retains the previous tree as
`/var/www/sanctuary.bak-<commit>-<UTC timestamp>-<run id>` and prints that rollback
path. It refuses to run from a dirty working tree (the tag names `HEAD`), and after
a successful swap it keeps the newest 5 rollback copies and prunes older ones
(`scripts/prune_sanctuary_backups.py`; a prune failure only warns). On a stage
mismatch it prints the first 20 itemized differences.

The swap helper is vendored from `smart-memory-infra` with its source revision
recorded in [scripts/static_ui_swap.py](scripts/static_ui_swap.py). Failed swaps
attempt to restore the previous tree. If recovery fails, the command exits
nonzero and reports the state file and paths for manual recovery. A subsequent
deploy also checks for interrupted swaps before promotion.

To check syntax without building, uploading, or contacting the host:

```bash
bash -n scripts/deploy-sanctuary.sh
node -e 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8"))'
python3 -B -c 'import ast, pathlib; ast.parse(pathlib.Path("scripts/static_ui_swap.py").read_text())'
```

## Architecture

```
src/
├── App.jsx       # Auth flow + GraphExplorer with adapter
├── main.jsx      # React entry
└── index.css     # TailwindCSS v4
```

All graph visualization code lives in `@smartmemory/graph` (see `../smart-memory-graph/`). The viewer creates a `fetchAdapter` with auth credentials and passes it to `<GraphExplorer>`.

## Dependencies

- **@smartmemory/graph** — Shared graph package (linked via `file:../smart-memory-graph`)
- **cytoscape** — Graph rendering engine (also in graph package, deduped)
- **tailwindcss v4** — Utility CSS
- **vite-plugin-pwa** — Service worker + manifest

## Related

- [Graph Package README](../smart-memory-graph/README.md)
- [VIS-GRAPH-4 Design](../smart-memory-docs/docs/features/VIS-GRAPH-4/design.md)
- [SmartMemory Roadmap](../smart-memory-docs/docs/ROADMAP.md)
- [Knowledge Graph API](../smart-memory-docs/docs/features/knowledge-graph.md)
- [Graph Colors Contract](../contracts/graph-colors.json)

## Documentation

Full SmartMemory documentation: https://docs.smartmemory.ai
