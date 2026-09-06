import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
      },
      manifest: {
        name: 'RoadSoS',
        short_name: 'RoadSoS',
        description: 'Road Emergency Response and First Aid Application',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: '/icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: '/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  // Server secrets (GEMINI_API_KEY, GOOGLE_MAPS_PLATFORM_KEY, GEOAPIFY_API_KEY) are never mapped into the
  // client bundle. Only VITE_* variables reach the browser (VITE_PICOVOICE_ACCESS_KEY, VITE_SAFETY_KEYWORD_PATH).
  build: {
    chunkSizeWarningLimit: 2000,
  }
})
