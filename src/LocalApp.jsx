import { GraphExplorer, createFetchAdapter } from '@smartmemory/graph';
import '@smartmemory/graph/src/graph.css';

// No auth in local mode — token and teamId are empty strings.
// createFetchAdapter expects { apiUrl, getToken, getTeamId } (fetchAdapter.js:17-22).
// VITE_API_URL and VITE_WS_URL are baked in at build time by vite.config.local.js.
const localAdapter = createFetchAdapter({
  apiUrl: import.meta.env.VITE_API_URL,
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
      wsUrl={import.meta.env.VITE_WS_URL}
      hideSelectionToolbar
      className="h-screen w-screen"
    />
  );
}
