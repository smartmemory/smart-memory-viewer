import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Standalone local-build config — does NOT use mergeConfig because vite.config.js
// exports a callback-form defineConfig(({ mode }) => ...) which mergeConfig cannot accept.
// Settings from vite.config.js:55-66 are copied inline to preserve correct module resolution
// for file:-based deps (@smartmemory/graph, @smartmemory/sdk-js).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@contracts': path.resolve(__dirname, '../contracts'),
    },
    // Dedupe prevents duplicate React/Cytoscape instances when resolving through symlinks.
    dedupe: ['react', 'react-dom', 'cytoscape'],
    preserveSymlinks: false,
  },
  optimizeDeps: {
    // Pre-bundle heavy Cytoscape deps; exclude file:-linked packages (vite.config.js:65).
    include: ['cytoscape', 'cytoscape-cose-bilkent', 'cytoscape-dagre'],
    exclude: ['@smartmemory/graph', '@smartmemory/sdk-js'],
  },
  build: {
    outDir: 'dist-local',
    rollupOptions: {
      // HTML entry — Vite emits local.html with hashed script tags injected.
      // Makefile renames it to index.html after build so StaticFiles(html=True) can serve it.
      input: 'local.html',
    },
  },
  define: {
    // Bake URLs into bundle at build time — no runtime config file needed.
    // PLAT-PUSH-SSE-1: VITE_WS_URL (ws://localhost:9015) is gone. No source
    // read it — the graph package moved to SSE — and the lite daemon no longer
    // runs a WebSocket server. Real-time updates come from
    // GET /memory/progress/stream on the API port below.
    'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:9014'),
  },
});
