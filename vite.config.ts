/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'
import { VitePWA } from 'vite-plugin-pwa'

// Read from package.json directly: the Dockerfile runs `vite build` without npm, so
// npm_package_version would be empty there.
const APP_VERSION = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version

// The live-update version of a native bundle (scripts/native-bundle.mjs sets it). Website builds and
// `vite` dev get a stamp-less placeholder, which every published bundle counts as newer than.
const BUNDLE_VERSION = process.env.BUNDLE_VERSION ?? `${APP_VERSION}-dev`

/**
 * /cdn-proxy/<path> → the CDN's <path>: saving a file the CDN serves without CORS headers (.mov, .m4a, .pdf;
 * see src/lib/saveMedia.ts). docker/nginx.conf does the same in production.
 */
function cdnProxy(mode: string) {
  const raw = loadEnv(mode, process.cwd(), 'VITE_').VITE_BUNNY_CDN_URL
  if (!raw) return undefined
  const target = new URL(raw.includes('://') ? raw : `https://${raw}`).origin
  return {
    '/cdn-proxy/': { target, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/cdn-proxy/, '') },
  }
}

export default defineConfig(({ mode }) => ({
  // Vitest applies these too, so components that read them work in unit tests.
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __BUNDLE_VERSION__: JSON.stringify(BUNDLE_VERSION),
  },
  // The iOS app (`--mode native`) gets its own output folder, which Capacitor copies into the app.
  build: mode === 'native' ? { outDir: 'dist-native' } : undefined,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // No service worker in the iOS app: the updater owns its files, and a worker would serve stale ones.
      disable: mode === 'native',
      registerType: 'autoUpdate',
      // Include all assets that should be precached
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png'],
      manifest: {
        name: 'XIV Tools',
        short_name: 'XIV',
        description: 'FF14 team chat and tools',
        theme_color: '#5865F2',
        background_color: '#1e1f22',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Use network-first for Supabase API and auth calls
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Klipy GIF search
            urlPattern: /^https:\/\/.*klipy\.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'klipy-api',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour for GIF results
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache GIF/image media files longer (they don't change)
            urlPattern: /\.(gif|webp|png|jpg|jpeg|svg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-assets',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: { proxy: cdnProxy(mode) },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    restoreMocks: true,
  },
}))
