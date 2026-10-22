# Visor UTCI — Cartografia de l'estrès tèrmic

Aplicació web interactiva per visualitzar dades de l'índex **Universal Thermal Climate Index (UTCI)** sobre un mapa, amb l'objectiu de facilitar l'exploració espacial i temporal de les condicions d'estrès tèrmic ambiental a Catalunya.

**Demostració:** <https://marcrb3.github.io/utci-catalonia/>

És una **PWA instal·lable**: es pot afegir a la pantalla d'inici del navegador i funciona (amb les dades que ja has consultat) sense connexió.

---

## Característiques

### Mapa i representació

- **Mapa interactiu** amb MapLibre GL JS i l'estil base fosc de l'ICGC.
- **Capa ràster UTCI** classificada per categories d'estrès tèrmic, amb transparència per deixar veure el relleu.
- **Ombrejat del relleu** (hillshade) calculat a partir del DEM de Mapterhorn.
- **Animació entre fotogrames**: en canviar d'hora, la imatge anterior es fon amb la nova.
- **Punt seleccionat** amb marca pulsant, geolocalització i consulta del municipi.
- **Zoom inicial adaptat** a la mida de la pantalla (a mòbil s'ha de veure Catalunya sencera).

### Control temporal

- **Llista de previsió** de 3 hores amb data, hora i dia de la setmana en català («22 d’octubre»).
- **Tira de dies** clicable: salta a la primera hora del dia i marca el dia actiu.
- **Indicador lliscant** que es mou amb el fotograma seleccionat.
- **Reprodució automàtica** de la previsió fotograma a fotograma.
- **Filtratge del passat**: només es mostren previsions del dia d’avui en endavant. El primer fotograma és l’últim pas anterior a «ara», de manera que sempre hi ha una referència recent.
- **Versió comprimida a mòbil**, amb la capçalera en una sola línia, per deixar més espai al mapa.

### Llegenda

- **Escala de classes UTCI** amb els intervals de temperatura (de «menys de −40 °C» a «més de 46 °C»).
- Present al panell lateral a l’escriptori i en un **full inferior** arrosegable a mòbil.

### Consulta de punts

- En clicar el mapa s’obre un **panell ancorat** (escriptori: a la cantonada superior dreta del mapa, sota la navbar, amb alçada variable segons el contingut i l’estil del panell esquerre) o un **full inferior** (mòbil) amb:
  - el **municipi** (API Territorial de l’ICGC),
  - les **coordenades**,
  - el **valor d’UTCI** i la seva categoria d’estrès,
  - la **gràfica d’evolució** de tot el període de previsió.
- **Punts sense dades**: si es clica fora de la malla de dades (mar, fora de Catalunya) o l’API no torna un municipi vàlid, el panell indica «No hi ha dades per a aquest punt» en lloc de mostrar text sense sentit.
- **Gràfica de tota la previsió**: línia colorejada segons la classe UTCI de cada tram, àrea ombrada, separadors de dia i cursor al fotograma seleccionat. Es pot **clicar o recórrer amb el teclat** per canviar el fotograma.

### Altres

- **Geolocalització**: situa el mapa a la posició de l’usuari i obre el panell de previsió d’aquest punt.
- **Informació sobre l’UTCI** (quin factors la determinen i què significa) en un acordió.
- **Interfície bilingüe** (català / anglès), amb totes les traduccions al diccionari.
- **Disseny adaptable**: panell lateral ample a l’escriptori, disposició en columna a mòbil.
- **Animacions i transicions** amb respecte per `prefers-reduced-motion`.

---

## Tecnologies

- [Svelte 5](https://svelte.dev/) — interfície reactiva (components propis amb runes).
- [Vite](https://vite.dev/) — servidor de desenvolupament i compilació.
- [Tailwind CSS 4](https://tailwindcss.com/) — estilos.
- [MapLibre GL JS](https://maplibre.org/) — mapa interactiu.
- [GeoTIFF.js](https://geotiffjs.github.io/) — lectura de dades GeoTIFF.
- [Proj4js](https://proj4js.org/) — transformació de sistemes de coordenades.
- [GitHub Pages](https://pages.github.com/) — allotjament de la versió publicada.

---

## Requisits

- Node.js 22 o superior i npm.
- Per la geolocalització cal que el visor se serveixi per **HTTPS** (o en `localhost`).

## Instal·lació i execució local

Clona el repositori:

```bash
git clone https://github.com/marcrb3/utci-catalonia.git
cd utci-catalonia
```

Instal·la les dependències (el `package-lock.json` està versionat: fes servir `npm ci`):

```bash
npm ci
```

Inicia el servidor de desenvolupament:

```bash
npm run dev
```

Vite mostrarà l’adreça local on es pot obrir l’aplicació al navegador.

## Compilació

Per generar la versió estàtica de producció:

```bash
npm run build
```

Els fitxers resultants es generen al directori `dist/`. Per provar localment la versió compilada:

```bash
npm run preview
```

El `build` també genera `dist/sw.js`, el **service worker**, amb la llista real de recursos compilats (vegeu la secció [PWA](#pwa)).

---

## Estructura del projecte

```
public/
  data/                   manifest + ràsters GeoTIFF (no es toquen)
  favicon.svg             logotip (origen dels icones de la PWA)
  icon-*.png              icones de la PWA (192, 512 i maskable)
  manifest.webmanifest    manifest de l'aplicació web
src/
  App.svelte              mapa, estat global i layout
  main.js                 muntatge de l'app i registre del service worker
  app.css                 tokens globals (corbes d'animació) i Tailwind
  dictionary.js           traduccions (ca/en) + interpolate()
  lib/
    Timeline.svelte       control temporal (slider, tira de dies, reproducció)
    Legend.svelte         llegenda de l'escala UTCI
    Chart.svelte          gràfica de tota la previsió
    PointPanel.svelte     informació del punt (calaix flotant / full inferior)
    InfoPanel.svelte      contingut informatiu sobre l'UTCI
    Sheet.svelte          full inferior reutilitzable (redimensionable)
    resize.js             acció d'arrossegar per redimensionar un panell
    time.js               formatació de dates (Europe/Madrid) i filtratge
    utci-classes.js       escala de classes UTCI i ajudants
build/
  service-worker.js       plantilla del service worker (la genera Vite)
tools/
  generate-favicon.mjs    construeix public/favicon.svg (geometria calculada)
  generate-icons.mjs      genera els icones PNG a partir del favicon SVG
  check-icons.mjs         verifica que els icones no tinguin el dibuix tallat
```

`App.svelte` és Svelte 5 en **mode legacy**; els components de `src/lib/` usen runes. No es barregen els dos estilos en un mateix fitxer.

---

## Dades: el contracte del manifest

El visor utilitza un manifest de previsions, `public/data/forecast.json`, i els fitxers GeoTIFF que hi referencien.

```json
{
  "generated_at": "2026-10-22T05:42:50Z",
  "count": 29,
  "files": [
    {
      "filename": "utci_2026-10-22T06-00-00.000000000.tif",
      "url": "./data/utci_2026-10-22T06-00-00.000000000.tif",
      "valid_time": "2026-10-22T06:00:00.000000000Z"
    }
  ]
}
```

Regles que cal respectar:

- `url` ha de ser **relatiu** (`./data/...`): es resol amb `new URL(path, document.baseURI)`. Rutes absolutes trenquen el subdirectori de GitHub Pages.
- L’aplicació accepta `path`, `href` i `filename` com a alternatives a `url`, i ordena les entrades per `valid_time`.
- `forecast.json` es demana amb `cache: "no-store"`; el service worker el serveix de la memòria cau si no hi ha connexió.
- Els fitxers de dades **no es toquen** des del codi: es generen amb un script extern.

### Passos de previsió

- Pas de **3 hores**, amb un horitzó d’uns **4 dies**.
- En obrir l’aplicació només es mostren els passos del dia d’avui en endavant; el primer és l’últim pas anterior a l’hora actual.
- Si el manifest ja no cobreix el moment actual, el visor ho avisa.

## Sistemes de coordenades

- Els ràsters són en **EPSG:25831** (ETRS89 / UTM zona 31N) i es transformen a **EPSG:4326** per representar-los sobre el mapa. També se suporta EPSG:3857, triat a partir de la `ProjectedCSTypeGeoKey` del GeoTIFF.
- L’API de municipis de l’ICGC espera coordenades **UTM 31N** (`x,y` amb un decimal), no latitud/longitud.

---

## PWA

L’aplicació és instal·lable i funciona sense connexió.

- **Manifest** (`public/manifest.webmanifest`): nom, icones (192, 512 i *maskable*), `start_url` i `scope` relatius, colors i mode `standalone`. Els ics es resolen relatius al manifest, de manera que funciona en qualsevol subdirectori.
- **Service worker** (`dist/sw.js`, generat per `build/service-worker.js` amb el plugin de `vite.config.js`):
  - **precàrrega** de l’aplicació (HTML, JS, CSS, icones) en la instal·lació;
  - **xarxa primer** per a la navegació i per a `forecast.json`, amb còpia local de reserva;
  - **memòria cau primer** per als ràsters `.tif`, que són immutables (el nom hi porta la marca de temps). Se’n conserven els 12 darrers;
  - **cap memòria cau** per als recursos de tercers (estil base de l’ICGC, relleu, API): no es redistribueixen dades d’altres.
- El registre només es fa en producció (`import.meta.env.PROD`), per no interferir amb el recàrrega en calent de Vite.
- La versió de la memòria cau és un hash dels noms de fitxer: en publicar una versió nova, la memòria cau antiga s'esborra sola.

### Favicon i icones

El favicon es **construeix** amb `node tools/generate-favicon.mjs`: la geometria (els 8 raigs del sol, repartits regularment al voltant del disc) es calcula, no es dibuixa a mà. Els paràmetres (radi del disc, longitud i gruix dels raigs, colors) són constants a la capeta del script.

Després, els icones PNG es generen a partir del SVG amb `node tools/generate-icons.mjs` (requereix Chrome):

| Fitxer | Ús | Notes |
|---|---|---|
| `icon-192.png`, `icon-512.png` | icones «any» | fons opac que ocupa tot el llenç |
| `icon-maskable-512.png` | icona «maskable» (Android) | el dibuix va escalat al 72 % i centrat a la **zona segura**; el sistema el pot retallar sense tallar el termòmetre |
| `apple-touch-icon.png` | iOS | quadrat opac: iOS aplica la seva pròpia màscara arrodonida |

### iOS i les àrees segures

En mode standalone a l'iPhone, la web view pot quedar sota el notch o darrere de l'indicador d'inici. Per això:

- `viewport-fit=cover` fa que el navegador informi dels marges reals, i `.app-shell` (el contenidor raíz) aplica `padding-top: env(safe-area-inset-top)` i `padding-bottom: env(safe-area-inset-bottom)`.
- La barra d'estat del sistema s'ha de deixar en modo **`default`** (no `black-translucent`): així la web view comença **sota** la barra d'estat i la capçalera de l'app no queda tallada.

Per instal·lar-la: obre el visor al navegador → menú del navegador → «Instal·la l’aplicació» (o «Afegeix a la pantalla d’inici» a iOS).

Si canvies el logotip o els colors, regenera-ho tot:

```bash
node tools/generate-favicon.mjs   # construeix public/favicon.svg
node tools/generate-icons.mjs     # genera els PNG a partir del SVG
node tools/check-icons.mjs        # verifica que no hi hagi dibuix tallat
```

---

## Publicació

El projecte es publica amb GitHub Pages mitjançant GitHub Actions (`.github/workflows/deploy.yml`): Node 22 → `npm ci` → `npm run build` → desplegament a `dist/`.

La ruta base de Vite és `/utci-catalonia/`, necessària perquè els recursos es carreguin des del subdirectori del repositori. Si el projecte es publica en un repositori d’usuari (`USUARI.github.io`), cal canviar `base` a `/` i actualitzar els enllaços de `index.html`.

---

## Comprovació manual

Hi ha dues eines de comprovació amb Chrome headless (CDP, sense dependències addicionals). No formen part del `build`.

```bash
npm run dev      # en una terminal
node e2e.mjs     # en una altra: comprova els fulls i el redimensionat
```

```bash
npm run preview  # en una terminal
node pwa-check.mjs  # en una altra: comprova la PWA i el mode sense connexió
```

---

## Dades i atribció

- **Procedència de les dades UTCI:** ECMWF
- **Cobertura geogràfica:** Catalunya
- **Període temporal i freqüència de les previsions:** 3-4 dies
- **Estil base cartogràfic:** Institut Cartogràfic i Geogràfic de Catalunya (ICGC)
- **Relleu (DEM):** Mapterhorn
- **Municipis:** API Territorial de l’ICGC

Abans de redistribuir les dades o publicar el visor, cal comprovar les condicions de reutilització i atribució de cada font.

---

## Estat del projecte

Versió publicada i estable. El visor es publica automàticament a cada `push` a `main`.
