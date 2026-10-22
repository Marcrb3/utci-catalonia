<script>
  import { onMount, tick } from "svelte";
  import * as maplibregl from "maplibre-gl";
  import { fromArrayBuffer } from "geotiff";
  import proj4 from "proj4";
  import { translations } from "./dictionary.js";
  import Timeline from "./lib/Timeline.svelte";
  import Legend from "./lib/Legend.svelte";
  import Sheet from "./lib/Sheet.svelte";
  import PointPanel from "./lib/PointPanel.svelte";
  import InfoPanel from "./lib/InfoPanel.svelte";
  import { classes, labelForClass, getClass } from "./lib/utci-classes.js";
  import {
    formatTime,
    formatWeekdayShort,
    formatDateShort,
    formatShortDateTime,
    relativeDayLabel,
    firstVisibleIndex,
  } from "./lib/time.js";

  proj4.defs(
    "EPSG:25831",
    "+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs +type=crs",
  );

  proj4.defs(
    "EPSG:3857",
    "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs",
  );

  let mapContainer, map, resizeObserver;
  let language = "ca";
  // In legacy Svelte reactivity, make the translator itself reactive.
  // This invalidates every {tr("...")} expression when language changes.
  $: tr = (key) => translations[language]?.[key] ?? translations.ca[key] ?? key;
  // Els texts de classe i els intervals viuen a src/lib/utci-classes.js
  // perquè la llegenda els pugui reutilitzar sense duplicar el mapeig.
  $: classLabel = (item) => labelForClass(item, language);
  let displayMode = "utci";
  let selectedHour = 0;
  let selectedPoint = null;
  let showMobileLegend = false;
  let showInfoSheet = false;
  let infoOpen = false;
  let legendButton;
  let selectedMarker = null;
  let geolocateControl = null;
  let geoError = "";
  //API Territorial
  let selectedMunicipality = "";
  let loadingMunicipality = false;
  let municipalityError = "";
  let municipalityRequestId = 0;

  let forecast = [];
  let loadingForecast = true;
  let loadingRaster = false;
  let loadingSeries = false;

  let initialMapLoading = true;
  let initialRasterReady = false;

  let errorMessage = "";
  let statusMessage = "Carregant forecast.json";

  let playTimer;
  let isPlaying = false;

  let rasterCache = new Map(); // TIFF llegits i descodificats
  let rasterImageCache = new Map(); // Imatges PNG ja preparades
  let rasterPreparationCache = new Map();

  let currentRaster = null;
  let displayedPrepared = null;
  let fadeRequestId = 0;
  let requestId = 0;
  let preloadPromise = null;
  let destroyed = false;

  const PRELOAD_CONCURRENCY = 2;
  const PLAYBACK_INTERVAL_MS = 900;
  const RASTER_OPACITY = 0.88;
  const RASTER_FADE_MS = 260;

  let seriesRequestId = 0;
  let seriesPointKey = null;
  let pointSeries = [];

  let forecastOutdated = false;

  $: if (language) {
    if (statusMessage === "Carregant forecast.json")
      statusMessage = tr("loadingManifest");
    else if (
      statusMessage === "Ràster carregat" ||
      statusMessage === "Raster loaded"
    )
      statusMessage = tr("rasterLoaded");
    else if (
      statusMessage === "Error de càrrega" ||
      statusMessage === "Loading error"
    )
      statusMessage = tr("loadError");
    else if (
      statusMessage === "Previsió no disponible" ||
      statusMessage === "Forecast unavailable"
    )
      statusMessage = tr("forecastUnavailable");
  }
  $: totalHours = Math.max(0, forecast.length - 1);
  $: activeForecast = forecast[Number(selectedHour)] ?? null;
  $: activeTime =
    activeForecast?.valid_time ?? activeForecast?.validTime ?? null;

  // Etiquetes del badge de data que surten sobre el mapa.
  $: badgeTime = formatTime(activeTime, language);
  $: badgeWeekday = formatWeekdayShort(activeTime, language);
  $: badgeDate = formatDateShort(activeTime, language);
  $: badgeRelative = relativeDayLabel(activeTime, language);

  // Les etiquetes dels controls de MapLibre segueixen l'idioma.
  $: if (map && language) updateControlLabels();

  $: selectedValue = (() => {
    language;
    return selectedPoint && currentRaster
      ? sampleAt(selectedPoint.lng, selectedPoint.lat, currentRaster)
      : null;
  })();

  // La sèrie temporal cobreix tota la previsió: es calcula una sola vegada
  // per punt (no a cada canvi de fotograma).
  $: if (selectedPoint && forecast.length && !loadingForecast) {
    language;
    updatePointSeries(selectedPoint);
  } else if (!selectedPoint) {
    seriesRequestId += 1;
    seriesPointKey = null;
    pointSeries = [];
    loadingSeries = false;
  }

  function hexRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  function rasterUrl(item) {
    const path = item.url || item.path || item.href || item.filename;

    if (!path) {
      throw new Error("Una entrada del manifest no té url/path/filename.");
    }

    return new URL(path, document.baseURI).href;
  }

  const TERRAIN_URL = "https://tiles.mapterhorn.com/tilejson.json";

  function afegirHillshade() {
    if (!map || !map.isStyleLoaded()) return;

    // Evitem afegir les fonts o la capa més d'una vegada.
    if (map.getLayer("terrain-hillshade")) return;

    if (!map.getSource("hillshadeSource")) {
      map.addSource("hillshadeSource", {
        type: "raster-dem",
        url: TERRAIN_URL,
        tileSize: 256,
      });
    }

    map.addLayer({
      id: "terrain-hillshade",
      type: "hillshade",
      source: "hillshadeSource",
      layout: {
        visibility: "visible",
      },
      paint: {
        "hillshade-exaggeration": 0.35,
        "hillshade-illumination-direction": 315,
        "hillshade-illumination-altitude": 45,
      },
    });

    ordenarCapes();
  }

  async function loadRaster(item) {
    const url = rasterUrl(item);

    if (rasterCache.has(url)) {
      return rasterCache.get(url);
    }

    const promise = (async () => {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `No s'ha pogut carregar el TIFF (${response.status}): ${url}`,
        );
      }

      const buffer = await response.arrayBuffer();
      const tiff = await fromArrayBuffer(buffer);
      const image = await tiff.getImage();
      const fileDirectory = image.getFileDirectory();
      const geoKeys = image.getGeoKeys();
      const epsg = Number(geoKeys?.ProjectedCSTypeGeoKey);
      console.log("TIFF georeferenciació:", {
        width: image.getWidth(),
        height: image.getHeight(),
        bbox: image.getBoundingBox(),
        origin: image.getOrigin(),
        resolution: image.getResolution(),
        geoKeys: image.getGeoKeys(),
        nodata: fileDirectory?.GDAL_NODATA,
        modelPixelScale: fileDirectory?.ModelPixelScale,
        modelTiepoint: fileDirectory?.ModelTiepoint,
        modelTransformation: fileDirectory?.ModelTransformation,
      });
      const bands = await image.readRasters({ interleave: false });
      const values = bands[0];
      const bbox = image.getBoundingBox();

      if (
        !bbox ||
        !values ||
        values.length !== image.getWidth() * image.getHeight()
      ) {
        throw new Error(
          "El TIFF no té una banda o una extensió geogràfica vàlida.",
        );
      }

      const tag = image.getFileDirectory()?.GDAL_NODATA;

      return {
        url,
        values,
        width: image.getWidth(),
        height: image.getHeight(),
        bbox,
        epsg,
        nodata: tag == null ? null : Number(String(tag).replace(/\0/g, "")),
      };
    })();

    rasterCache.set(url, promise);

    try {
      const raster = await promise;
      rasterCache.set(url, raster);
      return raster;
    } catch (error) {
      rasterCache.delete(url);
      throw error;
    }
  }

  function ordenarCapes() {
    if (!map) return;

    // Si l'estil encara no està preparat, esperar que MapLibre
    // hagi acabat de carregar-lo.
    if (!map.isStyleLoaded()) {
      map.once("idle", ordenarCapes);
      return;
    }

    const layers = map.getStyle()?.layers ?? [];

    const primeraCapaText = layers.find(
      (layer) =>
        layer.type === "symbol" && layer.layout?.["text-field"] != null,
    );

    if (primeraCapaText) {
      if (map.getLayer("terrain-hillshade")) {
        map.moveLayer("terrain-hillshade", primeraCapaText.id);
      }

      if (map.getLayer("utci-raster-layer")) {
        map.moveLayer("utci-raster-layer", primeraCapaText.id);
      }

      // La capa auxiliar queda a sobre: en fading deixa veure la nova.
      if (map.getLayer("utci-raster-prev-layer")) {
        map.moveLayer("utci-raster-prev-layer", primeraCapaText.id);
      }
    }
  }

  async function preloadAllRasters() {
    if (preloadPromise || !forecast.length) return preloadPromise;

    preloadPromise = (async () => {
      let nextIndex = 0;
      let completed = 0;
      let failed = 0;

      async function worker() {
        while (!destroyed) {
          const index = nextIndex++;

          if (index >= forecast.length) return;

          try {
            await prepareRaster(forecast[index]);
          } catch (error) {
            failed++;
            console.warn(
              `No s'ha pogut precarregar el ràster ${index + 1}:`,
              error,
            );
          }

          completed++;

          // No substituïm l'estat del fotograma que es veu al mapa.
          if (!destroyed) {
            console.info(`Precarrega UTCI: ${completed}/${forecast.length}`);
          }
        }
      }

      await Promise.all(
        Array.from(
          {
            length: Math.min(PRELOAD_CONCURRENCY, forecast.length),
          },
          () => worker(),
        ),
      );

      if (!destroyed) {
        console.info(
          `Precarrega finalitzada: ${completed - failed} correctes, ${failed} errors.`,
        );
      }
    })();

    return preloadPromise;
  }

  function rasterCoordinates(raster) {
    const [west, south, east, north] = raster.bbox;
    const sourceCrs = raster.epsg === 3857 ? "EPSG:3857" : "EPSG:25831";

    const toLngLat = (x, y) => proj4(sourceCrs, "EPSG:4326", [x, y]);

    return [
      toLngLat(west, north),
      toLngLat(east, north),
      toLngLat(east, south),
      toLngLat(west, south),
    ];
  }

  async function prepareRaster(item) {
    const url = rasterUrl(item);

    // Si ja tenim la imatge preparada, la reutilitzem.
    if (rasterImageCache.has(url)) {
      return rasterImageCache.get(url);
    }

    // Si ja s'està preparant, compartim la mateixa operació.
    if (rasterPreparationCache.has(url)) {
      return rasterPreparationCache.get(url);
    }

    const promise = (async () => {
      const raster = await loadRaster(item);

      const canvas = document.createElement("canvas");
      canvas.width = raster.width;
      canvas.height = raster.height;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("No s'ha pogut crear el canvas del ràster.");
      }

      const pixels = ctx.createImageData(canvas.width, canvas.height);

      for (let i = 0; i < raster.values.length; i++) {
        const v = Number(raster.values[i]);
        const p = i * 4;

        if (
          !Number.isFinite(v) ||
          (raster.nodata !== null && v === raster.nodata)
        ) {
          pixels.data[p + 3] = 0;
          continue;
        }

        const [r, g, b] = hexRgb(getClass(v).c);

        pixels.data[p] = r;
        pixels.data[p + 1] = g;
        pixels.data[p + 2] = b;
        pixels.data[p + 3] = 210;
      }

      ctx.putImageData(pixels, 0, 0);

      // PNG en format Blob: evita la cadena Base64 de toDataURL().
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("No s'ha pogut generar el PNG."));
        }, "image/png");
      });

      if (destroyed) {
        throw new Error("La preparació s'ha cancel·lat.");
      }

      const imageUrl = URL.createObjectURL(blob);

      const prepared = {
        url,
        imageUrl,
        coordinates: rasterCoordinates(raster),
        raster,
      };

      rasterImageCache.set(url, prepared);

      return prepared;
    })();

    rasterPreparationCache.set(url, promise);

    try {
      return await promise;
    } finally {
      rasterPreparationCache.delete(url);
    }
  }

  function ensureRasterLayer(prepared) {
    if (!map || destroyed) return;

    const source = map.getSource("utci-raster-source");

    if (source) {
      crossFadeRaster(prepared).catch((error) => {
        console.warn("No s'ha pogut fer el cross-fade del ràster:", error);
      });
    } else {
      map.addSource("utci-raster-source", {
        type: "image",
        url: prepared.imageUrl,
        coordinates: prepared.coordinates,
      });

      map.addLayer({
        id: "utci-raster-layer",
        type: "raster",
        source: "utci-raster-source",
        paint: {
          "raster-opacity": RASTER_OPACITY,
          "raster-resampling": "nearest",
        },
      });

      // Capa auxiliar buida: allotja la imatge anterior durant el cross-fade.
      map.addSource("utci-raster-prev-source", {
        type: "image",
        url: prepared.imageUrl,
        coordinates: prepared.coordinates,
      });

      map.addLayer({
        id: "utci-raster-prev-layer",
        type: "raster",
        source: "utci-raster-prev-source",
        paint: {
          "raster-opacity": 0,
          "raster-resampling": "nearest",
        },
      });

      ordenarCapes();
    }

    currentRaster = prepared.raster;
    displayedPrepared = prepared;
    statusMessage = tr("rasterLoaded");
    initialRasterReady = true;
  }

  // Espera que la font d'una imarga estigui carregada (amb límit de temps).
  function waitForSourceData(source, timeout = 400) {
    return new Promise((resolve) => {
      let settled = false;

      const finish = () => {
        if (settled) return;

        settled = true;
        clearTimeout(timer);
        source.off("data", finish);
        resolve();
      };

      const timer = setTimeout(finish, timeout);

      source.once("data", finish);
    });
  }

  // Cross-fade entre fotogrames.
  //
  // La imatge anterior viu en una capa auxiliar, per sobre de la capa
  // principal. Quan canvia el fotograma: la auxiliar carrega la imatge que
  // es veia, es torna a mostrar, la principal rep la nova per sota i,
  // quan la nova ja és carregada, la auxiliar s'apaga.
  async function crossFadeRaster(prepared) {
    const id = ++fadeRequestId;

    const source = map?.getSource("utci-raster-source");
    const previous = map?.getSource("utci-raster-prev-source");

    if (!source || !previous) return;

    const current = displayedPrepared;

    if (!current || current.url === prepared.url) {
      source.updateImage({
        url: prepared.imageUrl,
        coordinates: prepared.coordinates,
      });

      return;
    }

    // La capa auxiliar amaga de cop: si un cross-fade anterior s'ha
    // quedat a mitges, no deixem una imatge vella penjada.
    setPreviousRasterOpacity(0, 0);

    // 1) La capa auxiliar carrega la imatge que es mostra ara.
    previous.updateImage({
      url: current.imageUrl,
      coordinates: current.coordinates,
    });

    await waitForSourceData(previous);

    if (id !== fadeRequestId || destroyed) return;

    // 2) La imatge actualitzada es torna a veure: ara és la superior.
    setPreviousRasterOpacity(RASTER_OPACITY, 0);

    // 3) La nova entra per sota.
    source.updateImage({
      url: prepared.imageUrl,
      coordinates: prepared.coordinates,
    });

    await waitForSourceData(source);

    if (id !== fadeRequestId || destroyed) return;

    // 4) La vella es fon i deixa veure la nova.
    setPreviousRasterOpacity(0, RASTER_FADE_MS);
  }

  function setPreviousRasterOpacity(value, duration) {
    if (!map?.getLayer("utci-raster-prev-layer")) return;

    map.setPaintProperty("utci-raster-prev-layer", "raster-opacity-transition", {
      duration,
      delay: 0,
    });

    map.setPaintProperty("utci-raster-prev-layer", "raster-opacity", value);
  }

  function waitForInitialRasterRender() {
    if (!map || destroyed || !initialRasterReady) return;

    const checkRender = () => {
      if (destroyed || !map) return;

      if (
        map.getLayer("utci-raster-layer") &&
        map.getSource("utci-raster-source") &&
        map.isSourceLoaded("utci-raster-source")
      ) {
        initialMapLoading = false;
        map.off("render", checkRender);
      }
    };

    map.on("render", checkRender);
    checkRender();
  }

  async function showForecast() {
    if (!map || !activeForecast || destroyed) return;

    const id = ++requestId;

    loadingRaster = true;
    errorMessage = "";

    try {
      const prepared = await prepareRaster(activeForecast);

      // Si l'usuari ja ha triat un altre fotograma, no mostrem aquest.
      if (id !== requestId || destroyed) return;

      ensureRasterLayer(prepared);

      if (!initialMapLoading) {
        // El mapa ja havia completat la càrrega inicial.
      } else {
        waitForInitialRasterRender();
      }
    } catch (error) {
      if (id !== requestId || destroyed) return;

      console.error("Error preparant el ràster:", error);
      errorMessage = "rasterError";
      statusMessage = tr("loadError");
    } finally {
      if (id === requestId) loadingRaster = false;
    }
  }

  function sampleAt(lng, lat, raster = currentRaster) {
    if (!raster) return null;

    const sourceCrs = raster.epsg === 3857 ? "EPSG:3857" : "EPSG:25831";
    const [xMap, yMap] = proj4("EPSG:4326", sourceCrs, [lng, lat]);
    const [west, south, east, north] = raster.bbox;

    if (xMap < west || xMap > east || yMap < south || yMap > north) {
      return null;
    }

    const x = Math.max(
      0,
      Math.min(
        raster.width - 1,
        Math.floor(((xMap - west) / (east - west)) * raster.width),
      ),
    );

    const y = Math.max(
      0,
      Math.min(
        raster.height - 1,
        Math.floor(((north - yMap) / (north - south)) * raster.height),
      ),
    );

    const value = Number(raster.values[y * raster.width + x]);

    if (
      !Number.isFinite(value) ||
      (raster.nodata !== null && value === raster.nodata)
    ) {
      return null;
    }

    const category = getClass(value);

    return {
      value,
      label: classLabel(category),
      color: category.c,
      range: category.range,
    };
  }

  async function consultarMunicipi(point) {
    const id = ++municipalityRequestId;

    selectedMunicipality = "";
    municipalityError = "";
    loadingMunicipality = true;

    try {
      // El servei d'elements de l'API Territorial espera UTM 31N.
      const [x, y] = proj4("EPSG:4326", "EPSG:25831", [point.lng, point.lat]);

      const url =
        `https://api.icgc.cat/territorial/elements/municipis/` +
        `${x.toFixed(1)},${y.toFixed(1)}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error de l'API (${response.status})`);
      }

      const data = await response.json();

      // Evita que una resposta antiga sobreescrigui el darrer clic.
      if (id !== municipalityRequestId) return;

      // Accepta els formats habituals de resposta GeoJSON/API.
      const features = Array.isArray(data.features)
        ? data.features
        : Array.isArray(data)
          ? data
          : data.feature
            ? [data.feature]
            : [];

      const feature = features[0] ?? data;

      const properties = feature.properties ?? feature;

      const nameKeys = ["NOMMUNI", "NOM", "name", "NAME"];

      const nameKey = nameKeys.find(
        (key) =>
          typeof properties[key] === "string" &&
          properties[key].trim().length > 0,
      );

      if (nameKey) {
        selectedMunicipality = properties[nameKey].trim();
      } else {
        // Alguns serveis retornen directament les dades de la capa.
        const textValues = Object.values(properties).filter(
          (value) => typeof value === "string" && value.trim(),
        );

        selectedMunicipality = textValues[0] ?? "";
      }

      if (!selectedMunicipality) {
        municipalityError = "municipalityNotFound";
      }
    } catch (error) {
      console.error("Error consultant el municipi:", error);

      if (id === municipalityRequestId) {
        municipalityError = "municipalityError";
      }
    } finally {
      if (id === municipalityRequestId) {
        loadingMunicipality = false;
      }
    }
  }

  function pointKey(point) {
    return `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`;
  }

  // El punt seleccionat es dibuixa amb un marker HTML: permet una
  // animació de pols en CSS sense obligar el mapa a redibuixar-se.
  function updateMarker(point) {
    if (!map) return;

    if (!point) {
      selectedMarker?.remove();
      selectedMarker = null;
      return;
    }

    if (!selectedMarker) {
      const element = document.createElement("div");

      element.className = "selected-marker";
      element.innerHTML =
        '<span class="selected-marker__pulse"></span>' +
        '<span class="selected-marker__dot"></span>';

      selectedMarker = new maplibregl.Marker({
        element,
        anchor: "center",
      })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      return;
    }

    selectedMarker.setLngLat([point.lng, point.lat]);
  }

  function closePointPanel() {
    selectedPoint = null;
    updateMarker(null);
  }

  // Els controls de MapLibre són en anglès per defecte: en traduïm les
  // etiquetes quan canvia l'idioma de l'aplicació.
  function updateControlLabels() {
    if (!map) return;

    const container = map.getContainer();

    container
      .querySelector(".maplibregl-ctrl-zoom-in")
      ?.setAttribute("aria-label", tr("zoomIn"));

    container
      .querySelector(".maplibregl-ctrl-zoom-out")
      ?.setAttribute("aria-label", tr("zoomOut"));

    const geoButton = container.querySelector(".maplibregl-ctrl-geolocate");

    if (geoButton) {
      geoButton.title = tr("geolocate");
      geoButton.setAttribute("aria-label", tr("geolocate"));
    }
  }

  async function updatePointSeries(point) {
    if (!point || !forecast.length) {
      seriesRequestId += 1;
      pointSeries = [];
      loadingSeries = false;
      return;
    }

    // La clau no inclou el fotograma: la sèrie és la mateixa per a tota la
    // previsió i només cal recalcular-la si canvia el punt o l'idioma.
    const key = `${pointKey(point)}:${language}`;

    if (key === seriesPointKey) return;

    seriesPointKey = key;
    const id = ++seriesRequestId;

    loadingSeries = true;
    pointSeries = [];

    try {
      const results = [];

      for (let index = 0; index < forecast.length; index++) {
        if (id !== seriesRequestId) return;

        const item = forecast[index];
        const time = item.valid_time ?? item.validTime;

        try {
          const raster = await loadRaster(item);
          const sample = sampleAt(point.lng, point.lat, raster);

          results.push({
            index,
            time,
            label: formatShortDateTime(time, language),
            value: sample?.value ?? null,
            color: sample?.color ?? "#64748b",
          });
        } catch (error) {
          console.warn("No s'ha pogut consultar un ràster:", error);

          results.push({
            index,
            time,
            label: formatShortDateTime(time, language),
            value: null,
            color: "#64748b",
          });
        }

        if (id === seriesRequestId) {
          pointSeries = [...results];
        }
      }
    } finally {
      if (id === seriesRequestId) {
        loadingSeries = false;
      }
    }
  }

  function selectMode(mode) {
    displayMode = mode;
  }

  function changeHour(n) {
    selectedHour = Math.max(0, Math.min(totalHours, Number(selectedHour) + n));
  }

  // Full de la llegenda per a mòbil: el focus torna al botó que l'ha obert.
  async function openLegend() {
    showMobileLegend = true;
    await tick();
  }

  async function closeLegend() {
    if (!showMobileLegend) return;

    showMobileLegend = false;
    await tick();
    legendButton?.focus();
  }

  function handleKeydown(event) {
    if (event.key !== "Escape") return;

    // Els fulls tenen el seu propi Escape: no tanquem el panell del punt.
    if (showMobileLegend || showInfoSheet) return;

    closePointPanel();
  }

  function stopPlayback() {
    isPlaying = false;

    if (playTimer !== undefined) {
      clearTimeout(playTimer);
      playTimer = undefined;
    }
  }

  async function playbackStep() {
    if (!isPlaying || destroyed) return;

    if (Number(selectedHour) >= totalHours) {
      stopPlayback();
      return;
    }

    const nextIndex = Number(selectedHour) + 1;
    const nextItem = forecast[nextIndex];

    try {
      // No avancem fins que la imatge següent estigui preparada.
      await prepareRaster(nextItem);

      if (!isPlaying || destroyed) return;

      selectedHour = nextIndex;

      playTimer = setTimeout(playbackStep, PLAYBACK_INTERVAL_MS);
    } catch (error) {
      console.warn("Fotograma no disponible:", error);

      // No deixem el mapa en blanc. Intentem continuar amb el següent.
      if (nextIndex < totalHours) {
        selectedHour = nextIndex;
        playTimer = setTimeout(playbackStep, PLAYBACK_INTERVAL_MS);
      } else {
        stopPlayback();
      }
    }
  }

  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (forecast.length < 2) return;

    if (Number(selectedHour) >= totalHours) {
      selectedHour = 0;
    }

    isPlaying = true;
    playbackStep();
  }

  onMount(() => {
    // En pantalles petites cal un zoom més baix per veure Catalunya sencera.
    const isNarrow = window.innerWidth < 768;

    map = new maplibregl.Map({
      container: mapContainer,
      style: "https://geoserveis.icgc.cat/contextmaps/icgc_mapa_base_fosc.json",
      center: isNarrow ? [1.95, 41.72] : [1.7, 41.7],
      zoom: isNarrow ? 6.2 : 7.5,
      minZoom: 6,

      maxPitch: 85,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    const attribution = new maplibregl.AttributionControl({
      compact: true,
    });

    map.addControl(attribution, "bottom-right");
    attribution._container.classList.add("maplibregl-compact");
    attribution._container.classList.remove("maplibregl-compact-show");

    // Geolocalització: situa el mapa a la posició de l'usuari i obre el
    // panell de previsió per aquest punt.
    geolocateControl = new maplibregl.GeolocateControl({
      position: "top-left",
      trackUserLocation: false,
      showUserLocation: false,
      showAccuracyCircle: true,
      positionOptions: { enableHighAccuracy: true, timeout: 10000 },
    });

    map.addControl(geolocateControl);

    geolocateControl.on("geolocate", (event) => {
      geoError = "";

      const point = { lng: event.lngLat.lng, lat: event.lngLat.lat };

      selectedPoint = point;
      updateMarker(point);
      consultarMunicipi(point);

      map.easeTo({
        center: event.lngLat,
        zoom: Math.max(map.getZoom(), 9.5),
        duration: 700,
      });
    });

    geolocateControl.on("error", (event) => {
      console.warn("Error de geolocalització:", event.error);

      geoError = "geolocationError";
    });

    updateControlLabels();

    map.on("load", async () => {
      afegirHillshade();
      map.resize();

      try {
        const response = await fetch("./data/forecast.json", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            `No es pot llegir forecast.json (${response.status}).`,
          );
        }

        const json = await response.json();
        const entries = Array.isArray(json) ? json : json.files;

        if (!Array.isArray(entries) || !entries.length) {
          throw new Error("forecast.json no conté fitxers a «files».");
        }

        const sorted = entries
          .filter((x) => x && (x.url || x.path || x.href || x.filename))
          .sort(
            (a, b) =>
              new Date(a.valid_time || a.validTime || 0) -
              new Date(b.valid_time || b.validTime || 0),
          );

        // No es mostren previsions de dies anteriors: la llista comença
        // pel darrer pas anterior a «ara».
        const start = firstVisibleIndex(sorted, new Date());

        forecast = sorted.slice(start);

        if (!forecast.length) {
          throw new Error("No s'han trobat entrades de TIFF al manifest.");
        }

        // El manifest ja no cobreix el moment actual.
        const last = forecast[forecast.length - 1];
        const lastTime = new Date(last.valid_time || last.validTime || 0);

        forecastOutdated = lastTime.getTime() < Date.now();

        loadingForecast = false;
        preloadAllRasters();
      } catch (e) {
        console.error(e);
        loadingForecast = false;
        errorMessage = "forecastError";
        statusMessage = tr("forecastUnavailable");
      }
    });

    map.on("click", (e) => {
      const point = {
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      };

      selectedPoint = point;
      updateMarker(point);
      consultarMunicipi(point);
    });

    map.on("error", (e) => {
      if (e?.error) console.error("MapLibre:", e.error);
    });

    resizeObserver = new ResizeObserver(() => map?.resize());
    resizeObserver.observe(mapContainer);

    window.addEventListener("keydown", handleKeydown);

    return () => {
      destroyed = true;
      stopPlayback();

      requestId += 1;
      seriesRequestId += 1;
      municipalityRequestId += 1;

      resizeObserver?.disconnect();
      window.removeEventListener("keydown", handleKeydown);

      selectedMarker?.remove();
      selectedMarker = null;

      for (const prepared of rasterImageCache.values()) {
        URL.revokeObjectURL(prepared.imageUrl);
      }

      rasterImageCache.clear();
      rasterCache.clear();
      rasterPreparationCache.clear();

      map?.remove();
    };
  });

  $: if (map && activeForecast) showForecast();
</script>

<svelte:head>
  <title
    >{language === "ca"
      ? "UTCI Catalunya | Visor de confort tèrmic"
      : "UTCI Catalonia | Thermal comfort viewer"}</title
  >
  <meta
    name="description"
    content={language === "ca"
      ? "Visor de previsió d'estrès tèrmic a Catalunya."
      : "Thermal stress forecast viewer for Catalonia."}
  />
</svelte:head>

<div
  class="app-shell flex h-dvh min-h-0 flex-col overflow-hidden bg-[#0b1118] text-slate-100"
>
  <header
    class="z-10 flex h-[62px] shrink-0 items-center justify-between border-b border-white/10 bg-[#101821] px-4 sm:px-6"
  >
    <div>
      <h1 class="text-base font-semibold">
        UTCI <span class="font-normal text-slate-400"
          >/ {language === "ca" ? "Catalunya" : "Catalonia"}</span
        >
      </h1>
      <p class="text-[10px] uppercase tracking-[0.2em] text-slate-500">
        {tr("observatory")}
      </p>
    </div>

    <div class="flex items-center gap-3 text-xs text-slate-400">
      <div
        class="flex items-center rounded-lg border border-white/10 bg-[#0b1118] p-0.5"
        aria-label={language === "ca"
          ? "Selector d’idioma"
          : "Language selector"}
      >
        <button
          type="button"
          class={`rounded-md px-2 py-1 transition-colors duration-150 active:scale-[0.95] ${language === "ca" ? "bg-teal-300/15 text-teal-200" : "text-slate-400 hover:text-slate-200"}`}
          aria-pressed={language === "ca"}
          onclick={() => (language = "ca")}>CA</button
        >
        <button
          type="button"
          class={`rounded-md px-2 py-1 transition-colors duration-150 active:scale-[0.95] ${language === "en" ? "bg-teal-300/15 text-teal-200" : "text-slate-400 hover:text-slate-200"}`}
          aria-pressed={language === "en"}
          onclick={() => (language = "en")}>EN</button
        >
      </div>
      <span
        class={`h-2 w-2 rounded-full ${errorMessage ? "bg-red-400" : loadingForecast || loadingRaster ? "bg-amber-400" : "bg-emerald-400"}`}
      ></span>
      <span class="hidden sm:inline">{statusMessage}</span>
    </div>
  </header>

  <main
    class="grid min-h-0 min-w-0 flex-1 grid-cols-1
         grid-rows-[max-content_minmax(320px,55dvh)]
         overflow-x-hidden overflow-y-auto
         xl:grid-cols-[clamp(300px,23vw,390px)_minmax(0,1fr)]
         xl:grid-rows-1 xl:overflow-hidden"
  >
    <aside
      class="flex min-h-0 min-w-0 flex-col gap-4
         border-t border-white/10 bg-[#101821] p-3
         xl:overflow-y-auto xl:border-t-0 xl:border-r xl:p-4"
    >
      <section class="shrink-0">
        <Timeline
          {forecast}
          {language}
          selectedHour={Number(selectedHour)}
          {isPlaying}
          onPrev={() => changeHour(-1)}
          onNext={() => changeHour(1)}
          onTogglePlay={togglePlayback}
          onSelectHour={(index) => (selectedHour = index)}
        />

        {#if forecastOutdated}
          <p
            class="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 text-[11px] text-amber-200"
          >
            {tr("forecastOutdated")}
          </p>
        {/if}

        {#if errorMessage}
          <p
            class="mt-2 break-words rounded-lg border border-red-400/20 bg-red-400/5 p-2 text-[11px] text-red-200"
          >
            {tr(errorMessage)}
          </p>
        {/if}
      </section>

      <div class="h-px bg-white/10"></div>
      <section class="hidden xl:block">
        <h2
          class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400"
        >
          {displayMode === "utci" ? tr("utciLegend") : tr("stressCategories")}
        </h2>

        <Legend {classes} {language} {displayMode} />
      </section>

      <!-- Secció informativa: acordió a l'escriptori, full al mòbil. -->
      <section class="hidden xl:block">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-[#0b1118]
                 px-3 py-2.5 text-left text-xs font-medium text-slate-200
                 transition-colors hover:border-white/20 hover:bg-white/5"
          aria-expanded={infoOpen}
          onclick={() => (infoOpen = !infoOpen)}
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-300/10 text-teal-200"
            aria-hidden="true">ⓘ</span
          >

          <span class="min-w-0 flex-1 truncate">{tr("infoToggle")}</span>

          <span
            class="chevron shrink-0 text-slate-500 transition-transform duration-200 ease-out"
            class:rotate-180={infoOpen}
            aria-hidden="true">▾</span
          >
        </button>

        <div class="info-grid" class:is-open={infoOpen}>
          <div class="overflow-hidden">
            <div class="pt-2">
              <InfoPanel {language} />
            </div>
          </div>
        </div>
      </section>
    </aside>

    <section class="relative h-full min-h-0 min-w-0 bg-[#18232c]">
      <div
        bind:this={mapContainer}
        class="absolute inset-0 h-full w-full bg-[#18232c]"
      ></div>

      {#if initialMapLoading}
        <div
          class="absolute inset-0 z-30 flex flex-col items-center justify-center
           gap-4 bg-[#18232c] text-slate-300"
          role="status"
          aria-live="polite"
        >
          <div class="utci-spinner" aria-hidden="true"></div>

          <div class="text-center">
            <p class="text-sm font-medium text-teal-200">
              {tr("loadingGrid")}
            </p>
            <p class="mt-1 text-xs text-slate-400">
              {tr("preparingMap")}
            </p>
          </div>
        </div>
      {/if}

      <!-- Botons flotants: només en pantalles petites. -->
      <div
        class="absolute bottom-12 left-3 z-20 flex items-center gap-2 xl:hidden"
      >
        <button
          type="button"
          bind:this={legendButton}
          class="flex items-center gap-2 rounded-full border border-white/15
                 bg-[#101821]/95 px-3 py-2 text-[11px] font-medium text-slate-100
                 shadow-lg backdrop-blur transition-transform active:scale-[0.97]"
          aria-haspopup="dialog"
          aria-expanded={showMobileLegend}
          aria-label={tr("legendPanel")}
          onclick={openLegend}
        >
          <span
            class="flex h-3 w-4 overflow-hidden rounded-sm"
            aria-hidden="true"
          >
            {#each classes as item}
              <span class="flex-1" style={`background:${item.c}`}></span>
            {/each}
          </span>

          {tr("legendButton")}
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-full border border-white/15
                 bg-[#101821]/95 px-3 py-2 text-[11px] font-medium text-slate-100
                 shadow-lg backdrop-blur transition-transform active:scale-[0.97]"
          aria-haspopup="dialog"
          aria-expanded={showInfoSheet}
          aria-label={tr("infoPanel")}
          onclick={() => (showInfoSheet = true)}
        >
          <span aria-hidden="true">ⓘ</span>

          {tr("infoButton")}
        </button>
      </div>

      <!-- Suggeriment per invitar a clicar el mapa. -->
      {#if geoError}
        <div
          class="pointer-events-none absolute top-3 left-1/2 z-10 max-w-[85%]
                 -translate-x-1/2 rounded-lg border border-amber-400/25 bg-[#101821]/95
                 px-3 py-1.5 text-center text-[11px] text-amber-200 shadow-lg backdrop-blur"
          role="status"
        >
          {tr(geoError)}
        </div>
      {:else if !selectedPoint && !initialMapLoading}
        <div
          class="pointer-events-none absolute top-3 left-1/2 z-10
                 -translate-x-1/2 rounded-full border border-white/10
                 bg-[#101821]/90 px-3 py-1.5 text-[11px] text-slate-300 shadow-lg backdrop-blur"
        >
          {tr("clickMap")}
        </div>
      {/if}

      <!-- Data i hora del fotograma actual. A mòbil no cal: el panell
           temporal de dalt ja la mostra i es sobreposava amb els botons. -->
      <div
        class="pointer-events-none absolute bottom-4 left-1/2 z-10 hidden
         -translate-x-1/2 rounded-xl border border-white/10
         bg-[#101821]/95 px-4 py-2 shadow-lg backdrop-blur xl:flex"
      >
        <div class="flex items-center gap-3">
          <div class="text-left">
            <p
              class="whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-slate-500"
            >
              {badgeWeekday} {badgeDate}
            </p>
            <p class="mt-0.5 text-lg font-semibold leading-none text-teal-200">
              {badgeTime}
            </p>
          </div>

          {#if badgeRelative}
            <span
              class="rounded-full bg-teal-300/10 px-2 py-0.5 text-[10px] font-medium text-teal-200"
            >
              {badgeRelative}
            </span>
          {/if}
        </div>
      </div>

      <!-- Informació del punt: targeta flotant a l'escriptori, full al mòbil. -->
      <PointPanel
        open={!!selectedPoint}
        point={selectedPoint}
        municipality={selectedMunicipality}
        {loadingMunicipality}
        {municipalityError}
        value={selectedValue}
        series={pointSeries}
        selectedHour={Number(selectedHour)}
        {loadingSeries}
        {language}
        closeLabel={tr("close")}
        resizeLabel={tr("resizePanel")}
        onClose={closePointPanel}
        onSelectHour={(index) => (selectedHour = index)}
      />
    </section>

  </main>

  <!-- Full de la llegenda per a pantalles petites. -->
  <Sheet
    bind:open={showMobileLegend}
    title={displayMode === "utci" ? tr("utciLegend") : tr("stressCategories")}
    closeLabel={tr("close")}
    resizeLabel={tr("resizePanel")}
    onClose={closeLegend}
  >
    <Legend {classes} {language} {displayMode} />
  </Sheet>

  <!-- Full d'informació per a pantalles petites. -->
  <Sheet
    bind:open={showInfoSheet}
    title={tr("infoPanel")}
    closeLabel={tr("close")}
    resizeLabel={tr("resizePanel")}
    onClose={() => (showInfoSheet = false)}
  >
    <InfoPanel {language} />
  </Sheet>
</div>

<style>
  :global(html),
  :global(body),
  :global(#app) {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  :global(body) {
    overflow: hidden;
    background: #0b1118;
  }

  :global(*) {
    box-sizing: border-box;
  }

  /* Àrees segures de l'iPhone (notch i indicador d'inici): el contingut
     no ha de quedar sota la barra d'estat ni darrere de l'indicador.
     Amb `viewport-fit=cover` el navegador informa dels marges reals. */
  .app-shell {
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .utci-spinner {
    width: 42px;
    height: 42px;
    border: 3px solid rgb(255 255 255 / 14%);
    border-top-color: #67d9c1;
    border-right-color: #67d9c1;
    border-radius: 50%;
    animation: utci-spin 0.8s linear infinite;
  }

  @keyframes utci-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .utci-spinner {
      animation-duration: 2s;
    }
  }

  /* Acordió de la secció informativa: l'alçada s'anima amb
     grid-template-rows, que no necessita conèixer la mida del contingut. */
  .info-grid {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 220ms var(--ease-in-out);
  }

  .info-grid.is-open {
    grid-template-rows: 1fr;
  }

  .info-grid > div {
    overflow: hidden;
  }

  /* Punt seleccionat: un marker HTML permet la pols en CSS sense
     obligar el mapa a redibuixar-se en cada fotograma. */
  :global(.selected-marker) {
    position: relative;
    display: grid;
    width: 18px;
    height: 18px;
    place-items: center;
    pointer-events: none;
  }

  :global(.selected-marker__dot) {
    width: 12px;
    height: 12px;
    border: 2px solid #ffffff;
    border-radius: 999px;
    background: #ef4444;
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 35%),
      0 2px 6px rgb(0 0 0 / 45%);
  }

  :global(.selected-marker__pulse) {
    position: absolute;
    inset: 0;
    border: 2px solid rgb(239 68 68 / 70%);
    border-radius: 999px;
    animation: marker-pulse 2.4s ease-out infinite;
  }

  @keyframes marker-pulse {
    0% {
      transform: scale(0.6);
      opacity: 0.9;
    }

    70%,
    100% {
      transform: scale(2.2);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.selected-marker__pulse) {
      animation: none;
      opacity: 0.4;
    }

    .info-grid {
      transition: none;
    }
  }

  :global(.maplibregl-ctrl-group) {
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 12%) !important;
    border-radius: 10px !important;
    background: #101821 !important;
  }

  :global(.maplibregl-ctrl-group button) {
    background-color: #101821 !important;
  }

  :global(.maplibregl-ctrl-group button span) {
    filter: invert(1);
  }

  /* El control de geolocalització va fora d'un ctrl-group: l'alignem
     amb el tema fosc dels altres controls. */
  :global(.maplibregl-ctrl-geolocate) {
    width: 30px !important;
    height: 30px !important;
    border: 1px solid rgb(255 255 255 / 12%) !important;
    border-radius: 10px !important;
    background: #101821 !important;
  }

  :global(.maplibregl-ctrl-geolocate span) {
    filter: invert(1);
  }

  :global(.maplibregl-ctrl-geolocate.maplibregl-ctrl-geolocate-active) {
    background: #101821 !important;
  }

  :global(.maplibregl-ctrl-attrib) {
    background: rgb(16 24 33 / 85%) !important;
    color: #a7b4c4 !important;
  }

  :global(.maplibregl-ctrl-attrib a) {
    color: #67d9c1 !important;
  }
</style>
