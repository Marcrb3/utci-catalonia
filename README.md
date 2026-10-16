# Visor UTCI — Cartografia de l'estrès tèrmic

Aplicació web interactiva per visualitzar dades de l'índex **Universal Thermal Climate Index (UTCI)** sobre un mapa, amb l'objectiu de facilitar l'exploració espacial i temporal de les condicions d'estrès tèrmic ambiental.

## Característiques

- **Mapa interactiu** amb MapLibre GL JS.
- **Visualització de dades ràster** UTCI a partir de fitxers GeoTIFF.
- **Consulta de diferents previsions** mitjançant un manifest de dades.
- **Representació cartogràfica per classes** de valors UTCI.
- **Ombrejat del relleu** per facilitar la interpretació del territori.
- **Reprojectació de coordenades** entre EPSG:25831 (ETRS89 / UTM zona 31N) i EPSG:4326 (WGS 84).

## Tecnologies

- [Svelte](https://svelte.dev/) — interfície reactiva.
- [Vite](https://vite.dev/) — servidor de desenvolupament i compilació.
- [MapLibre GL JS](https://maplibre.org/) — mapa interactiu.
- [GeoTIFF.js](https://geotiffjs.github.io/) — lectura de dades GeoTIFF.
- [Proj4js](https://proj4js.org/) — transformació de sistemes de coordenades.
- [GitHub Pages](https://pages.github.com/) — allotjament de la versió publicada.

## Requisits

- Node.js i npm.
- Les dades geogràfiques necessàries per al funcionament del visor.

## Instal·lació i execució local

Clona el repositori:

```bash
git clone https://github.com/USUARI/NOM-REPOSITORI.git
cd NOM-REPOSITORI
```

Instal·la les dependències:

```bash
npm ci
```

Inicia el servidor de desenvolupament:

```bash
npm run dev
```

Vite mostrarà l'adreça local on es pot obrir l'aplicació al navegador.

## Compilació

Per generar la versió estàtica de producció:

```bash
npm run build
```

Els fitxers resultants es generen al directori `dist/`.

Per provar localment la versió compilada:

```bash
npm run preview
```

## Estructura de les dades

El visor utilitza un manifest de previsions, `forecast.json`, i els fitxers de dades geogràfiques que s'hi referencien.

Cal mantenir les rutes i els noms dels fitxers coherents amb els que utilitza l'aplicació. Si es modifica l'estructura de directoris, també s'han d'actualitzar les referències corresponents.

**Sistema de coordenades:** les dades del projecte es tracten en EPSG:25831 i es transformen a EPSG:4326 quan cal representar-les sobre el mapa.

## Publicació

El projecte es pot publicar amb GitHub Pages mitjançant GitHub Actions. El flux de publicació compila l'aplicació i desplega els fitxers generats al directori `dist/`.

Per publicar-lo en un repositori que no sigui el repositori d'usuari `USUARI.github.io`, cal configurar correctament la ruta base de Vite perquè els recursos es carreguin des del subdirectori del repositori.

## Dades i atribució

- **Procedència de les dades UTCI:** ECMWF
- **Cobertura geogràfica:** Catalunya
- **Període temporal i freqüència de les previsions:** 3-4 dies

- **Fonts cartogràfiques i del relleu:** Estil base de l'ICGC i relleu de maplibre.

Abans de redistribuir les dades o publicar el visor, cal comprovar les condicions de reutilització i atribució de cada font.

## Estat del projecte

Projecte en desenvolupament.

