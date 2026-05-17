import { GraphExplorer, createFetchAdapter } from '@smartmemory/graph';
import '@smartmemory/graph/src/graph.css';

// No auth in local mode — token and teamId are empty strings.
// createFetchAdapter expects { apiUrl, getToken, getTeamId } (fetchAdapter.js:17-22).
//
// URLs are derived from window.location at RUNTIME, not baked in. Hardcoding
// `localhost` (the old vite.config.local.js define) breaks any non-localhost
// host: macOS resolves localhost→::1 while the servers bind IPv4 only, and
// serving the viewer from 127.0.0.1 made its own localhost fetch cross-origin
// → CORS block. Empty apiUrl = same-origin (matches EmbeddedApp.jsx SM_API
// pattern → no CORS regardless of localhost vs 127.0.0.1). The events WS is on
// a different port so it can't be relative — match the current hostname.
const WS_SCHEME = window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_URL = `${WS_SCHEME}://${window.location.hostname}:9015`;
const localAdapter = createFetchAdapter({
  apiUrl: '',
  getToken: () => '',
  getTeamId: () => '',
});

// NOTE: GraphExplorer has no readOnly prop — delete controls are always rendered.
// Option B (405 endpoints in local_api.py) is required to prevent data mutations.
// See Task 4.3 in DIST-LITE-4 plan.

export default function LocalApp() {
  return (
    <GraphExplorer
      adapter={localAdapter}
      wsUrl={WS_URL}
      hideSelectionToolbar
      className="h-screen w-screen"
    />
  );
}
