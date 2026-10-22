
import { mount } from 'svelte'
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

import App from './App.svelte'
import './app.css'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(workerUrl)

const app = mount(App, {
  target: document.getElementById('app')
})

// Service worker (només en producció: en desenvolupament interfereix
// amb el recàrrega en calent de Vite).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch((error) => {
        console.warn('No s\'ha pogut registrar el service worker:', error)
      })
  })
}

export default app
