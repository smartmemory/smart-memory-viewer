import { createFetchAdapter } from '@smartmemory/graph';
import '@smartmemory/graph/src/graph.css';
import GraphWithAsk from './components/GraphWithAsk';

// No auth in local mode — token and teamId are empty strings.
// createFetchAdapter expects { apiUrl, getToken, getTeamId } (fetchAdapter.js:17-22).
//
// URLs are derived from window.location at RUNTIME, not baked in. Hardcoding
// `localhost` (the old vite.config.local.js define) breaks any non-localhost
// host: macOS resolves localhost→::1 while the servers bind IPv4 only, and
// serving the viewer from 127.0.0.1 made its own localhost fetch cross-origin
// → CORS block. Empty apiUrl = same-origin (matches EmbeddedApp.jsx SM_API
// pattern → no CORS regardless of localhost vs 127.0.0.1).
//
// Streaming: GraphExplorer/useGraphStream migrated WS→SSE. The deprecated
// `wsUrl` prop is now dead (never read) and passing only it left sseEnabled
// false → no live updates. The lite daemon serves the SSE stream same-origin
// at /memory/progress/stream; sseBaseUrl must be truthy to arm streaming, so
// pass the runtime origin (same-origin → no CORS, IPv4-safe like apiUrl).
const SSE_BASE_URL = window.location.origin;
const localAdapter = createFetchAdapter({
  apiUrl: '',
  getToken: () => '',
  getTeamId: () => '',
});

// NOTE: GraphExplorer has no readOnly prop — delete controls are always rendered.
// Option B (405 endpoints in local_api.py) is required to prevent data mutations.
// See Task 4.3 in DIST-LITE-4 plan.

// DIST-LITE-9: the ask panel sits beside the graph. The lite daemon serves
// POST /memory/ask at the same origin, so localAdapter reaches it unchanged.
export default function LocalApp() {
  return (
    <GraphWithAsk
      adapter={localAdapter}
      explorerProps={{ sseBaseUrl: SSE_BASE_URL, hideSelectionToolbar: true }}
    />
  );
}
