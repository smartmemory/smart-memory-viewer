# SmartMemory Graph Viewer

Standalone knowledge graph viewer for SmartMemory. Visualize memories, entities, and their relationships in an interactive Cytoscape.js canvas.

## Features

- **Graph visualization** — Cytoscape.js canvas with 5 layout algorithms (force-directed, hierarchical, circle, concentric, grid)
- **Type filtering** — Toggle memory types and entity types with color-coded checkboxes
- **Search** — Fuzzy search across node labels with keyboard shortcut (Cmd/Ctrl+K)
- **Detail panel** — Click any node to see content, metadata, confidence, and timestamps
- **Path finder** — Select two nodes and find the shortest path between them
- **Export** — Download graph as PNG (2x resolution) or SVG
- **PWA** — Installable with offline caching via Workbox
- **SSO auth** — Authenticates via SmartMemory Web SSO or API key fallback

## Quick Start

```bash
# Prerequisites: Node.js 20.19+, smart-memory-sdk-js checked out alongside
npm install
npm run dev
```

Opens at [http://localhost:5177](http://localhost:5177).

## Environment

Copy `.env.example` to `.env` and configure:

```bash
VITE_API_URL=http://localhost:9001      # SmartMemory API
VITE_SSO_URL=http://localhost:5173      # SmartMemory Web (SSO redirect)
```

Production defaults to `https://api.smartmemory.ai` and `https://www.smartmemory.ai`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port 5177 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Architecture

```
src/
├── App.jsx                 # Auth flow + root
├── main.jsx                # React entry
├── index.css               # TailwindCSS v4
├── components/
│   ├── GraphExplorer.jsx   # Main layout orchestrator
│   ├── CytoscapeCanvas.jsx # Canvas wrapper
│   ├── Toolbar.jsx         # Layout, zoom, export controls
│   ├── FilterPanel.jsx     # Type filter sidebar
│   ├── DetailPanel.jsx     # Node detail sidebar
│   └── SearchBar.jsx       # Floating search
├── hooks/
│   ├── useCytoscape.js     # Cytoscape instance + API
│   ├── useGraphData.js     # Data fetching + transform
│   └── useGraphFilters.js  # Filter state management
└── lib/
    ├── api.js              # SmartMemory API client
    ├── graphColors.js      # Node colors from contracts
    ├── cytoscapeStyles.js  # Cytoscape stylesheet
    └── export.js           # PNG/SVG export
```

## Dependencies

- **@smartmemory/sdk-js** — Auth and API (linked via `file:../smart-memory-sdk-js`)
- **cytoscape** — Graph rendering engine
- **cytoscape-cose-bilkent** — Force-directed layout
- **cytoscape-dagre** — Hierarchical layout
- **tailwindcss v4** — Utility CSS
- **vite-plugin-pwa** — Service worker + manifest

## Related

- [Design doc](../smart-memory-docs/docs/plans/2026-02-14-vis-graph-1-design.md)
- [SmartMemory Roadmap](../smart-memory-docs/docs/ROADMAP.md) — VIS-GRAPH-1
- [Knowledge Graph API](../smart-memory-docs/docs/features/knowledge-graph.md)
- [Graph Colors Contract](../contracts/graph-colors.json)
