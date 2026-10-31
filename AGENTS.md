# AGENTS.md

Visor web del **UTCI** (Universal Thermal Climate Index) per a Catalunya: mapa MapLibre + ràsters GeoTIFF.
Readme en català a `README.md` — el codi i els comentaris estan en català.

## Comandes

```bash
npm ci          # el lockfile està commitejat; no uses npm install
npm run dev     # servidor Vite
npm run build   # única verificació real del projecte (escripta a dist/, gitignorat)
npm run preview # serveix el build
```

**No hi ha tests, lint ni typecheck.** No `svelte-check`, no ESLint, no framework de test. `npm run build` és l'única comprovació disponible: falla si hi ha errors de compilació de Svelte o imports trencats. `jsconfig.json` és només per a l'editor (`checkJs: false`).

## Flux de treball i publicació

- Fer push a `main` **publica el lloc** (`.github/workflows/deploy.yml`: Node 22 → `npm ci` → `npm run build` → GitHub Pages a `https://marcrb3.github.io/utci-catalonia/`).
- **No facis push.** Deixa els commits i el push a l'usuari. Els missatges de commit són en anglès, curts i en minúscules (`add state`, `update 2210`).

## Rutes base (no les canviis)

- `vite.config.js` fixa `base: '/utci-catalonia/'`. `index.html` referencixa a mà `/utci-catalonia/favicon.svg` i les URL de Open Graph. Canviar la base trencarà els assets a GitHub Pages (subdirectori del repo).

## Arquitectura

App Svelte/Vite d'una sola pàgina. **Pràcticament tota la lògic viu a `src/App.svelte`** (~1600 línies): mapa MapLibre, càrrega de GeoTIFF, classificació de classes, gràfic temporal i tota la UI. No hi ha router ni state management.

- `src/main.js` — munta l'app, importa el CSS de MapLibre, crida `setWorkerUrl()` amb un import `?worker&url` i **registra el service worker** (només en producció). **Cal mantenir-ho** o el worker de MapLibre no es resol a Vite.
- `src/dictionary.js` — totes les traduccions de la UI + `translate(key, language)` i `interpolate(template, vars)` (substitueix `{nom}`).
- `src/lib/Timeline.svelte` — control temporal (capçalera de data, slider, tira de dies amb indicador lliscant). Component **presentacional**: rep `forecast`, `selectedHour`, `isPlaying` i callbacks (`onPrev`, `onNext`, `onTogglePlay`, `onSelectHour`). Té un **mode compact** propi (matchQuery `(max-width: 1279px)`) que comprimeix la capçalera i els controls per deixar més mapa a les pantalles petites.
- `src/lib/Legend.svelte` — llegenda de l'escala UTCI, reutilitzada al panell lateral i als fulls mòbils. Tres branques: classes (`utci`), rampa contínua (`continuous`) i una branca morta (`{:else}`) que es manté intacta. El títol el posa el pare.
- `src/lib/Sheet.svelte` — full inferior reutilitzable (backdrop, tirador, focus, Esc, animació d'entrada i sortida, redimensionat arrossegeant la maneta).
- `src/lib/PointPanel.svelte` — informació del punt + gràfica. Targeta flotant sobre el mapa a l'escriptori i full inferior al mòbil (el mateix component, dos posicionaments).
- `src/lib/Chart.svelte` — gràfica de tota la previsió: línia colorejada segons el mode de representació (`displayMode`), àrea, separadors de dia, cursor del fotograma seleccionat. És un `role="slider"`: clic, ratolí i fletxes canvien el fotograma.
- `src/lib/InfoPanel.svelte` — contingut informatiu sobre l'UTCI (acordió a l'escriptori, full al mòbil).
- `src/lib/resize.js` — acció `verticalResize`: arrossegar verticalment un panell inferior amb el punter (captura el punter, `touch-action: none` a la maneta).
- `src/lib/utci-classes.js` — `classes` (amb `min`/`max`/`c`/`label`/`range`), `classLabels`, `rangeKeys`, `getClass(value)`, `colorForValue(value, displayMode)` (classe o rampa) i els ajudants `labelForClass(item, language)` / `rangeForClass(item, language)`. La rampa contínua (`rampStops`, `rampTicks`, `rampTickPercent()`, `rampColorForValue()`, `rampGradientCss()`) s'interpola linealment entre els punts mitjans de cada classe, amb domini clampat a [−40, 46].
- `src/lib/time.js` — formatació de dates en `Europe/Madrid`: `formatWeekdayLong/Short`, `formatDayMonth`, `formatDateShort`, `formatTime`, `formatShortDateTime`, `formatFullDate`, `dayKey`, `relativeDayLabel`, `hoursBetween` i `firstVisibleIndex(items, now)`.
- `src/lib/Counter.svelte`, `src/assets/svelte.svg`, `public/vite.svg` — residus del scaffold, no s'usen.

## Dades (no les toques)

`public/data/forecast.json` + `public/data/utci_<ISO>.tif` (pas de 3 h) són les úniques dades en runtime i estan commitejades al repo (~72 MB). Les genera un script **extern**: no les editis, no les regeneris, no n'afegeixis ni en eliminis.

Si cal afegir dades, el contracte és:

- Manifest: `{ generated_at, count, files: [{ filename, url, valid_time }] }`. `url` és **relatiu** (`./data/...`) i es resol amb `new URL(path, document.baseURI)`; rutes absolutes trenquen el subdirectori de Pages. `App.svelte` accepta `path`/`href`/`filename` com a fallbacks i ordena per `valid_time`.
- `forecast.json` es demana amb `cache: "no-store"`.

## Sistemes de coordenades

- CRS de origen dels ràsters: **EPSG:25831** (ETRS89 / UTM 31N), registrat amb `proj4.defs` a l'inici de `App.svelte`. També se suporta EPSG:3857, escollit a partir del `ProjectedCSTypeGeoKey` del GeoTIFF.
- `rasterCoordinates()` reprojecta les cantonades a EPSG:4326 per al source `image` de MapLibre; `sampleAt()` fa la transformació inversa per consultar un punt. **Si afegeix un CRS nou, registra'l amb proj4 i actualitza les dues funcions.**
- L'API de municipis de l'ICGC espera UTM 31N `x,y` (un decimal), no lat/lng.

## Pipeline de ràsters (no el reordenis sense entendre'l)

Tres caches indexades per URL: `rasterCache` (valors decodificats), `rasterImageCache` (object URLs de PNG), `rasterPreparationCache` (promeses en curs).

TIFF → valors → classificació per píxel → canvas → `toBlob` PNG → `URL.createObjectURL` → `source.updateImage()`. El nodata prové de l'etiqueta `GDAL_NODATA`; els píxels nodata es deixen amb alfa 0.

- La precàrrega usa `PRELOAD_CONCURRENCY = 2`.
- La reproducció (900 ms per fotograma) **espera `prepareRaster()` abans d'avançar** perquè el mapa no quedi en blanc.
- Els object URLs es revoquen al `cleanup` de `onMount`; si afegeix una cache nova, cleans-la allà mateix.
- Cada càrrega de TIFF fa `console.log` de la georeferenciació completa: és soroll esperat, no un error.

## Guards de cursa (async)

Tota càrrega async usa un id incremental (`requestId`, `seriesRequestId`, `municipalityRequestId`, `fadeRequestId`) comprovat després de cada `await`, perquè una resposta obsoleta no sobreescrigui una selecció més nova. Segueix el mateix patró en qualsevol crida async nova.

## Previsió: què es mostra

Després d'ordenar el manifest, `firstVisibleIndex(items, now)` (`src/lib/time.js`) decideix el primer pas visible: el **darrer pas anterior a «ara»** i tot el següent. Si aquell pas caigués en un dia anterior, es fa servir el primer pas del dia d'avui: **mai es mostren previsions de dies passats**. El filtrat es fa **abans de `preloadAllRasters()`**, així que només es descarreguen els TIFF visibles.

Si el darrer pas visible ja és passat, es mostra un avís (`forecastOutdated`).

## Capes del mapa

Ids de source/layer: `utci-raster-source`, `utci-raster-layer`, `utci-raster-prev-source`, `utci-raster-prev-layer`, `hillshadeSource`, `terrain-hillshade`.

`ordenarCapes()` reordena sota l'estil base de l'ICGC: hillshade i ràster UTCI queden per sota de la primera capa de text. Espera l'event `idle` si l'estil no està carregat. Crida-la després d'afegir capes.

- **Cross-fade**: hi ha una capa auxiliar (`utci-raster-prev-layer`) **per sobre** de la principal. `crossFadeRaster()` fa: la auxiliar carrega la imatge visible → es torna a mostrar → la principal rep la nova per sota → quan la font ha carregat (`waitForSourceData`, que espera l'event `data` amb límit de 400 ms) la auxiliar s'apaga amb `raster-opacity-transition`. La textura es puja de forma asíncrona: si no s'espera, es veu un fotograma vell parpellejant.
- El punt seleccionat **ja no és una capa**: és un `maplibregl.Marker` HTML (`.selected-marker`) per poder fer la pols en CSS sense redibuixar el mapa.

## API Territorial (municipi)

- L'API (`https://api.icgc.cat/territorial/elements/municipis/<x>,<y>`, en **UTM 31N**) retorna un `FeatureCollection` amb `timeStamp` i `type` a l'objecte arrel. **Mai s'ha de llegir el nom del municipi de l'objecte arrel**: en punts sense municipi retornaria la marca de temps o el text «FeatureCollection».
- El nom es llegeix **només de `features[0].properties`** (clau `NOMMUNI`, o `CAPMUNI`/`NOM`/`name` com a alternatives) i es valida amb `isPlausibleMunicipality()`: rebutja dates, marques de temps, valors sense lletres i els tipus de GeoJSON.
- Si no hi ha cap feature, l'API respon **HTTP 4xx** o una col·lecció buida: en tots dos casos el punt no té dades i es mostra `pointNoData` («No hi ha dades per a aquest punt»), que es mostra també al bloc del valor d'UTCI.

## Controls del mapa i geolocalització

- El zoom inicial depèn de l'amplada: `zoom 6.2` i centre `[1.95, 41.72]` per sota de 768 px (per veure Catalunya sencera), `zoom 7.5` i `[1.7, 41.7]` a partir d'aquí.
- El control de geolocalització (`maplibregl.GeolocateControl`) obre el panell del punt en prémer el botó (event `geolocate` + `easeTo`); l'event `error` mostra `geoError`.
- Les etiquetes dels controls de MapLibre són en anglès per defecte: `updateControlLabels()` les tradueix i es crida en canviar l'idioma.
- Els controls (zoom, geolocalització i atribució) són a la **cantonada inferior dreta** del mapa, perquè el panell del punt (superior dreta) no els tapi. A les cantonades inferiors MapLibre insereix cada control al **principi** del contenidor: l'ordre de les crides a `addControl` queda invertit, així que cal afegir l'atribució primer (perquè quedi a sota) i el zoom el darrer.
- El `GeolocateControl` **ignora** l'opció `position` del constructor: la posició s'ha de passar a `map.addControl(control, "bottom-right")`.

## Layout

- El panell esquerre a l'escriptori és `clamp(300px, 23vw, 390px)`: creix amb la pantalla sense fer-ne massa, i en pantalles petites no es fa estreit.
- El panell dret ja no existeix com a columna: la informació del punt és un **panell ancorat** a la cantonada superior dreta del mapa (`PointPanel.svelte`), amb alçada variable segons el contingut i l'estil del panell esquerre (recte, amb vora a l'esquerra). Els controls de MapLibre són a la cantonada inferior dreta, per sota del panell.
- L'etiqueta de data sobre el mapa només apareix a partir de `xl`: a les pantalles petites el panell temporal de dalt ja la mostra i es sobreposava amb els botons de llegenda i info.

## i18n

- Tots els textos visibles són claus de `src/dictionary.js` (`translations.ca` i `translations.en`). **Els dos idiomes han de tenir el mateix conjunt de claus.**
- `tr(key)` a `App.svelte` és una funció reactiva `$:` a propòsit (comentari al codi) perquè `{tr(...)}` es torni a renderitzar en canviar d'idioma. No la converteixis en una `const` normal.
- L'array `classes` (a `src/lib/utci-classes.js`) conté els `label`/`range` en català; `classLabels` i `rangeKeys` els mapejen a claus del diccionari. Canviar un label implica tocar `classLabels` + `rangeKeys` + `dictionary.js`. Els límites numèrics són `min`/`max`; el text `label`/`range` és només de display.
- Els components de `src/lib/` tradueixen amb `translate(key, language)` de `dictionary.js` (no tenen `tr()` reactiu; re-renderitzen quan canvia la prop `language`).

## Svelte

- `App.svelte` és Svelte 5 però en **mode legacy** (`$:` i `let`): no hi pots usar runes. Els components nous sí que usen runes (`$props()`, `$derived()`), com `src/lib/Timeline.svelte` i `src/lib/Legend.svelte`. No barregis els dos estilos en un mateix fitxer.
- Els handlers usen la sintaxi nova d'atributs (`onclick={...}`), no `on:click`.
- La gràfica (`src/lib/Chart.svelte`) cobreix **tota** la previsió, no una finestra de 24 h, i és un `role="slider"`: es pot recórrer amb clic, ratolí i fletxes.
- `seriesPointKey` **no** inclou `selectedHour`: la sèrie es calcula una sola vegada per punt i canviar de fotograma no la torna a demanar.
- Els fulls (`Sheet.svelte`) es renderitzen a l'arrel del template, fora de `main`, perquè el `position: fixed` no quedi tallat pel `overflow` del contenidor. `PointPanel.svelte` sí que viu dins de la secció del mapa: al mòbil és `fixed` i a l'escriptori `absolute`.

## Animacions

- Les corbes són tokens globals a `src/app.css`: `--ease-out` i `--ease-in-out`. No inventisis corbes noves.
- Les animacions són CSS (transicions o `@keyframes`), no JS: el compositor les fa Fora del fil principal.
- `prefers-reduced-motion` és obligatori: es conserva el canvi de color/opacitat i es elimina el desplaçament.
- Els hover s'activen amb el `hover:` de Tailwind (ja va condicionat a `@media (hover: hover)`).
- **Les transicions de Svelte s'han d'importar**: `import { fade, fly } from "svelte/transition";`. Si falta l'import, `npm run build` **no** dona error: peta en runtime i el full es queda obert sense poder-se tancar. Quan afegeixis `transition:xxx`, comprova que l'import hi és.

## Comprovació manual (opcional)

`e2e.mjs` obre Chrome headless (CDP, sense dependències) i comprova l'obertura i el tancament dels fulls, el redimensionat arrossegeant la maneta i que no hi hagi errors de consola. Cal el servidor de desenvolupament en marxa:

```bash
npm run dev      # en una terminal
node e2e.mjs     # en una altra
```

`pwa-check.mjs` comprova la PWA (registre del service worker, manifest, icones i **mode sense connexió**) amb el servidor de *preview*:

```bash
npm run preview  # en una terminal
node pwa-check.mjs  # en una altra
```

Cap dels dos forma part de `npm run build` i no s'executen automàticament.

## PWA

- `public/manifest.webmanifest` — manifest de l'aplicació. **Totes les rutes són relatives** (`start_url: "."`, `scope: "."`, icones sense `base`): si no, es trenquen en el subdirectori de GitHub Pages.
- `build/service-worker.js` — plantilla del service worker. El plugin de `vite.config.js` hi injecta la llista de recursos compilats i la versió (hash dels noms), i genera `dist/sw.js`. **No escriguis el `sw.js` a mà**: el fitxer de `dist/` es regenera a cada build.
- El service worker es registra a `src/main.js` **només en producció**: en desenvolupament interfereix amb el recàrrega en calent de Vite.
- `public/favicon.svg` **es construeix**, no es dibuixa a mà: `node tools/generate-favicon.mjs` calcula la geometria (els 8 raigs del sol, repartits regularment al voltant del disc). Si cal canviar colors o proporcions, edita les constants de la capeta del script i torna a executar-lo.
- Els icones PNG es generen amb `node tools/generate-icons.mjs` a partir del SVG (requereix Chrome; els PNG ja estan versionats, així que la compilació no en depèn). L'eina genera tres variants: quadrada (fons opac ple), *maskable* (el dibuix escalat al 72 % a la zona segura) i `apple-touch-icon`.
- `node tools/check-icons.mjs` verifica que els PNG no tenen el dibuix tallat i que el fons és opac.
- **No es posen a la memòria cau els recursos de tercers** (estil base de l'ICGC, relleu, API): no es redistribueixen dades d'altres. Els ràsters `.tif` sí (són immutables) i se'n conserven els 12 darrers.

## iOS: àrees segures

- `index.html` fa servir `apple-mobile-web-app-status-bar-style: default`. **No ho canvïs a `black-translucent`**: la web view s'estendria sota la barra d'estat i la capçalera quedaria tallada.
- Amb `viewport-fit=cover`, el contenidor arrel (`.app-shell`, a `App.svelte`) aplica `padding-top: env(safe-area-inset-top)` i `padding-bottom: env(safe-area-inset-bottom)`. El `box-sizing: border-box` global fa que el padding vagi dins de l'alçada `100dvh` i no hi hagi desbordament.
- `pwa-check.mjs` ho comprova simulant les àrees segures de l'iPhone (notch 47 px + indicador 34 px).

## Rutes base (no les canviis)

- `vite.config.js` fixa `base: '/utci-catalonia/'`. `index.html` referencixa a mà `/utci-catalonia/favicon.svg`, `/utci-catalonia/manifest.webmanifest` i `/utci-catalonia/apple-touch-icon.png`. Canviar la base trencarà els assets a GitHub Pages (subdirectori del repo).
- `src/main.js` registra el service worker amb `import.meta.env.BASE_URL` → el scope és el subdirectori correcte sense tocar res.

## Estils

- Tailwind v4 via `@tailwindcss/vite` i `@import "tailwindcss"` a `src/app.css`. **No hi ha `tailwind.config.js`** i no cal crear-ne un: la configuració v4 viu al CSS.
- El CSS dels controls de MapLibre i del spinner viu al bloc `<style>` de `App.svelte` amb `:global(...)`.
- Els estils `.time-slider` viuen al bloc `<style>` de `src/lib/Timeline.svelte` (el slider hi viu; els estils d'`App.svelte` són scoped).

## Dependències externes (el dev en necessita)

- Estil base ICGC: `https://geoserveis.icgc.cat/contextmaps/icgc_mapa_base_fosc.json`
- DEM Mapterhorn per al relleu/ombrejat: `https://tiles.mapterhorn.com/tilejson.json`
- API Territorial ICGC per consultar el municipi.
- Beacon de Cloudflare Web Analytics a `index.html`.

## Atribució de les dades

Dades UTCI: **ECMWF**. Base cartogràfica i relleu: **ICGC**. Comprova les condicions de reutilització i atribució de cada font abans d'afegir o redistribuir dades.
