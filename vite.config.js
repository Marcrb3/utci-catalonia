import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import { serviceWorkerSource } from './build/service-worker.js'

// Subdirectori on es publica el projecte (GitHub Pages). No el canviïs
// sense actualitzar també el workflow de desplegament.
const base = '/utci-catalonia/'

// Fitxers de public/ que es precarreguen al service worker.
const PRECACHE_PUBLIC = [
  'favicon.svg',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
]

// Genera dist/sw.js amb la llista real de recursos compilats, de manera
// que l'aplicació es pugui obrir sense connexió.
function serviceWorker() {
  return {
    name: 'utci-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((name) => /\.(js|css)$/.test(name) && !name.endsWith('sw.js'))
        .map((name) => base + name)

      const precache = [
        base,
        ...assets,
        ...PRECACHE_PUBLIC.map((name) => base + name),
      ]

      // La versió és un hash dels noms: canvia quan canvia el codi.
      const version = createHash('sha256')
        .update(precache.join('|'))
        .digest('hex')
        .slice(0, 12)

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource({ precache, version }),
      })
    },
  }
}

export default defineConfig({
  plugins: [svelte(), tailwindcss(), serviceWorker()],
  base,
})
