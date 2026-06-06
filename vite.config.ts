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
  define: {
    'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(process.env.GOOGLE_MAPS_PLATFORM_KEY),
    'import.meta.env.VITE_GEOAPIFY_API_KEY': JSON.stringify(process.env.VITE_GEOAPIFY_API_KEY),
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
  },
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  build: {
    chunkSizeWarningLimit: 2000,
  }
})
