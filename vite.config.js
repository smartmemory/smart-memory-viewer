import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { smThemeHead } from '@smartmemory/design-system/theme/init'

export default defineConfig(({ mode }) => ({
  plugins: [
    // No-flash colour-mode script in <head> (UI-LIGHT-MODE-LM10-1); one source with every other app.
    smThemeHead(),
    react(),
    tailwindcss(),
    // PWA only in production — in dev, the SW fights with Vite HMR causing infinite reloads
    ...(mode === 'production' ? [VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SmartMemory Graph Viewer',
        short_name: 'Graph Viewer',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // UI-LIGHT-MODE-LM10-1: main chunk measured 2,161 kB at the tip (2,064 kB base) vs the 2 MiB workbox default; 3 MiB leaves headroom.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.smartmemory\.ai\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'smartmemory-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    })] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@contracts': path.resolve(__dirname, '../contracts'),
    },
    // The design-system shell is a symlinked sibling checkout with no node_modules: dedupe makes its bare imports resolve from here.
    dedupe: ['react', 'react-dom', 'cytoscape', '@radix-ui/react-dropdown-menu', 'lucide-react'],
    preserveSymlinks: false,
  },
  optimizeDeps: {
    include: ['cytoscape', 'cytoscape-cose-bilkent', 'cytoscape-dagre'],
    exclude: ['@smartmemory/graph', '@smartmemory/sdk-js'],
  },
  build: {
    rollupOptions: {
      output: {
        // UI-LIGHT-MODE-LM10-1: keep the theme kit (design-system, radix, lucide) out of the main chunk.
        manualChunks(id) {
          if (/smart-memory-design-system|@radix-ui|lucide-react/.test(id)) return 'theme-kit'
        },
      },
    },
  },
  server: {
    port: 5178,
  },
}))
