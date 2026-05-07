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
