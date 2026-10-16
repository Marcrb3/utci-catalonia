<script>
  import { onMount } from "svelte";
  import * as maplibregl from "maplibre-gl";
  import { fromArrayBuffer } from "geotiff";
  import proj4 from "proj4";

  proj4.defs(
    "EPSG:25831",
    "+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs +type=crs",
  );

  let mapContainer, map, resizeObserver;
  let displayMode = "utci";
  let selectedHour = 0;
  let selectedPoint = null;

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
  let requestId = 0;
  let preloadPromise = null;
  let destroyed = false;

  const PRELOAD_CONCURRENCY = 2;
  const PLAYBACK_INTERVAL_MS = 900;

  let seriesRequestId = 0;
  let seriesPointKey = null;
  let pointSeries = [];

  const HOURS_IN_CHART = 24;
  const FORECAST_INTERVAL_HOURS = 3;
  const CHART_POINTS = HOURS_IN_CHART / FORECAST_INTERVAL_HOURS + 1;

  const classes = [
    {
      c: "#542788",
      label: "Fred extrem",
      range: "< −40 °C",
      min: -Infinity,
      max: -40,
    },
    {
      c: "#4169b1",
      label: "Fred molt fort",
      range: "−40 a −27 °C",
      min: -40,
      max: -27,
    },
    {
      c: "#56b9ce",
      label: "Fred fort",
      range: "−27 a −13 °C",
      min: -27,
      max: -13,
    },
    {
      c: "#8dd3c7",
      label: "Fred moderat",
      range: "−13 a 0 °C",
      min: -13,
      max: 0,
    },
    { c: "#b7d85b", label: "Fred lleu", range: "0 a 9 °C", min: 0, max: 9 },
    {
      c: "#62b77a",
      label: "Sense estrès tèrmic",
      range: "9 a 26 °C",
      min: 9,
      max: 26,
    },
    {
      c: "#f1d34f",
      label: "Calor moderada",
      range: "26 a 32 °C",
      min: 26,
      max: 32,
    },
    {
      c: "#ec8744",
      label: "Calor forta",
      range: "32 a 38 °C",
      min: 32,
      max: 38,
    },
    {
      c: "#d94d4d",
      label: "Calor molt forta",
      range: "38 a 46 °C",
      min: 38,
      max: 46,
    },
    {
      c: "#8d202b",
      label: "Calor extrema",
      range: "> 46 °C",
      min: 46,
      max: Infinity,
    },
  ];

  $: totalHours = Math.max(0, forecast.length - 1);
  $: activeForecast = forecast[Number(selectedHour)] ?? null;
  $: hourLabel = formatDate(
    activeForecast?.valid_time ?? activeForecast?.validTime,
  );

  $: selectedValue =
    selectedPoint && currentRaster
      ? sampleAt(selectedPoint.lng, selectedPoint.lat, currentRaster)
      : null;

  // Finestra temporal de 24 hores a partir de l'hora seleccionada.
  $: chartSeries = pointSeries;
  $: chartRange = getChartRange(chartSeries);

  $: chartRange = getChartRange(chartSeries);
  $: if (selectedPoint && forecast.length && !loadingForecast) {
    selectedHour;
    updatePointSeries(selectedPoint);
  } else if (!selectedPoint) {
    seriesRequestId += 1;
    seriesPointKey = null;
    pointSeries = [];
    loadingSeries = false;
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);

    return Number.isNaN(d.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("ca-ES", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        }).format(d);
  }

  function shortTime(value) {
    if (!value) return "—";
    const d = new Date(value);

    return Number.isNaN(d.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("ca-ES", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        }).format(d);
  }

  function getClass(value) {
    return (
      classes.find(
        (item, i) =>
          value >= item.min && (value < item.max || i === classes.length - 1),
      ) ?? classes[0]
    );
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
    }

    if (map.getLayer("selected-point-layer")) {
      map.moveLayer("selected-point-layer");
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
    const toLngLat = (x, y) => proj4("EPSG:25831", "EPSG:4326", [x, y]);

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
      source.updateImage({
        url: prepared.imageUrl,
        coordinates: prepared.coordinates,
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
          "raster-opacity": 0.88,
          "raster-resampling": "nearest",
        },
      });

      ordenarCapes();
    }

    currentRaster = prepared.raster;
    statusMessage = "Ràster carregat";
    initialRasterReady = true;
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
      errorMessage = error?.message || "Error carregant el ràster.";
      statusMessage = "Error de càrrega";
    } finally {
      if (id === requestId) loadingRaster = false;
    }
  }

  function sampleAt(lng, lat, raster = currentRaster) {
    if (!raster) return null;

    const [xMap, yMap] = proj4("EPSG:4326", "EPSG:25831", [lng, lat]);
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
      label: category.label,
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
        municipalityError =
          "No s'ha pogut identificar el municipi d'aquest punt.";
      }
    } catch (error) {
      console.error("Error consultant el municipi:", error);

      if (id === municipalityRequestId) {
        municipalityError = "No s'ha pogut consultar el municipi.";
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

  async function updatePointSeries(point) {
    if (!point || !forecast.length) {
      seriesRequestId += 1;
      pointSeries = [];
      loadingSeries = false;
      return;
    }

    const key = `${pointKey(point)}:${selectedHour}`;

    if (key === seriesPointKey) return;

    seriesPointKey = key;
    const id = ++seriesRequestId;
    const start = Number(selectedHour);
    const end = Math.min(start + CHART_POINTS, forecast.length);

    loadingSeries = true;
    pointSeries = [];

    try {
      const results = [];

      for (let index = start; index < end; index++) {
        if (id !== seriesRequestId) return;

        const item = forecast[index];
        const time = item.valid_time ?? item.validTime;

        try {
          const raster = await loadRaster(item);
          const sample = sampleAt(point.lng, point.lat, raster);

          results.push({
            index,
            time,
            label: shortTime(time),
            value: sample?.value ?? null,
            color: sample?.color ?? "#64748b",
          });
        } catch (error) {
          console.warn("No s'ha pogut consultar un ràster:", error);

          results.push({
            index,
            time,
            label: shortTime(time),
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

  function getChartRange(series) {
    const valid = series.map((p) => p.value).filter((v) => Number.isFinite(v));

    if (!valid.length) {
      return { min: 0, max: 40, ticks: [0, 10, 20, 30, 40] };
    }

    let min = Math.floor(Math.min(...valid) / 5) * 5;
    let max = Math.ceil(Math.max(...valid) / 5) * 5;

    if (min === max) {
      min -= 5;
      max += 5;
    }

    const step = Math.max(5, Math.ceil((max - min) / 4 / 5) * 5);
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;

    const ticks = [];
    for (let v = min; v <= max; v += step) ticks.push(v);

    return { min, max, ticks };
  }

  function chartX(index) {
    const left = 36;
    const right = 286;
    const start = Number(selectedHour);
    const end = Math.min(start + CHART_POINTS - 1, forecast.length - 1);

    if (end <= start) return (left + right) / 2;

    return left + ((index - start) / (end - start)) * (right - left);
  }

  function chartY(value) {
    const { min, max } = chartRange;
    const top = 20;
    const bottom = 108;

    return bottom - ((value - min) / (max - min || 1)) * (bottom - top);
  }

  function chartLineSegments() {
    const validPoints = chartSeries
      .map((p, i) => ({
        x: chartX(i),
        y: chartY(p.value),
        value: p.value,
      }))
      .filter((p) => Number.isFinite(p.value));

    if (validPoints.length < 2) return [];

    return [validPoints.map((p) => `${p.x},${p.y}`).join(" ")];
  }

  function selectMode(mode) {
    displayMode = mode;
  }

  function changeHour(n) {
    selectedHour = Math.max(0, Math.min(totalHours, Number(selectedHour) + n));
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
    map = new maplibregl.Map({
      container: mapContainer,
      style: "https://geoserveis.icgc.cat/contextmaps/icgc_mapa_base_fosc.json",
      center: [1.7, 41.7],
      zoom: 7.5,
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

    map.on("load", async () => {
      afegirHillshade();
      map.resize();

      // Punt de selecció: independent de la capa UTCI.
      map.addSource("selected-point-source", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "selected-point-layer",
        type: "circle",
        source: "selected-point-source",
        paint: {
          "circle-radius": 6,
          "circle-color": "red",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

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

        forecast = entries
          .filter((x) => x && (x.url || x.path || x.href || x.filename))
          .sort(
            (a, b) =>
              new Date(a.valid_time || a.validTime || 0) -
              new Date(b.valid_time || b.validTime || 0),
          );

        if (!forecast.length) {
          throw new Error("No s'han trobat entrades de TIFF al manifest.");
        }

        loadingForecast = false;
        preloadAllRasters();
      } catch (e) {
        console.error(e);
        loadingForecast = false;
        errorMessage = e?.message || "Error llegint la previsió.";
        statusMessage = "Previsió no disponible";
      }
    });

    map.on("click", (e) => {
      const point = {
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      };

      selectedPoint = point;

      map.getSource("selected-point-source")?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [point.lng, point.lat],
            },
            properties: {},
          },
        ],
      });
      ordenarCapes();
      consultarMunicipi(point);
    });

    map.on("error", (e) => {
      if (e?.error) console.error("MapLibre:", e.error);
    });

    resizeObserver = new ResizeObserver(() => map?.resize());
    resizeObserver.observe(mapContainer);

    return () => {
      destroyed = true;
      stopPlayback();

      requestId += 1;
      seriesRequestId += 1;
      municipalityRequestId += 1;

      resizeObserver?.disconnect();

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
  <title>UTCI Catalunya | Visor de confort tèrmic</title>
  <meta
    name="description"
    content="Visor de previsió d'estrès tèrmic a Catalunya."
  />
</svelte:head>

<div
  class="flex h-screen min-h-[560px] flex-col overflow-hidden bg-[#0b1118] text-slate-100"
>
  <header
    class="z-10 flex h-[62px] shrink-0 items-center justify-between border-b border-white/10 bg-[#101821] px-4 sm:px-6"
  >
    <div>
      <h1 class="text-base font-semibold">
        UTCI <span class="font-normal text-slate-400">/ Catalunya</span>
      </h1>
      <p class="text-[10px] uppercase tracking-[0.2em] text-slate-500">
        Thermal stress observatory
      </p>
    </div>

    <div class="flex items-center gap-2 text-xs text-slate-400">
      <span
        class={`h-2 w-2 rounded-full ${errorMessage ? "bg-red-400" : loadingForecast || loadingRaster ? "bg-amber-400" : "bg-emerald-400"}`}
      ></span>
      <span class="hidden sm:inline">{statusMessage}</span>
    </div>
  </header>

  <main
    class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[310px_minmax(0,1fr)_400px] lg:grid-rows-1 lg:overflow-hidden"
  >
    <aside
      class="flex flex-col gap-4 border-b border-white/10 bg-[#101821] p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r"
    >
      <section>
        <div class="mb-2 flex items-center justify-between">
          <h2
            class="text-[11px] font-semibold uppercase tracking-widest text-slate-400"
          >
            Temps de previsió
          </h2>
          <span class="text-[10px] text-slate-500">
            {forecast.length
              ? `${Number(selectedHour) + 1}/${forecast.length}`
              : "—"}
          </span>
        </div>

        <div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
          <div class="mb-2 flex justify-between gap-2">
            <span class="text-[11px] text-slate-500">Hora local</span>
            <span class="text-right text-sm font-semibold text-teal-200"
              >{hourLabel}</span
            >
          </div>

          <input
            type="range"
            min="0"
            max={totalHours}
            step="1"
            bind:value={selectedHour}
            disabled={!forecast.length}
            aria-label="Hora de previsió"
            class="time-slider w-full"
          />

          <div class="mt-3 flex items-center gap-2">
            <button
              class="h-8 w-8 rounded-lg border border-white/10 disabled:opacity-40"
              onclick={() => changeHour(-1)}
              disabled={!forecast.length || Number(selectedHour) === 0}
              aria-label="Hora anterior">‹</button
            >

            <button
              class="h-8 flex-1 rounded-lg border border-teal-300/20 bg-teal-300/10 text-xs text-teal-200 disabled:opacity-40"
              onclick={togglePlayback}
              disabled={forecast.length < 2}
              >{isPlaying ? "Pausa" : "▶ Reproduir"}</button
            >

            <button
              class="h-8 w-8 rounded-lg border border-white/10 disabled:opacity-40"
              onclick={() => changeHour(1)}
              disabled={!forecast.length || Number(selectedHour) >= totalHours}
              aria-label="Hora següent">›</button
            >
          </div>
        </div>

        {#if errorMessage}
          <p
            class="mt-2 break-words rounded-lg border border-red-400/20 bg-red-400/5 p-2 text-[11px] text-red-200"
          >
            {errorMessage}
          </p>
        {/if}
      </section>

      <div class="h-px bg-white/10"></div>
      <section>
        <h2
          class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400"
        >
          {displayMode === "utci"
            ? "Llegenda UTCI (°C)"
            : "Categories d’estrès"}
        </h2>

        {#if displayMode === "utci"}
          <div class="mb-2 flex h-2 overflow-hidden rounded-full">
            {#each classes as item}
              <div class="flex-1" style={`background:${item.c}`}></div>
            {/each}
          </div>

          <div class="space-y-1.5">
            {#each classes as item}
              <div class="flex items-center gap-2">
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={`background:${item.c}`}
                ></span>
                <span class="min-w-0 flex-1 text-sm text-slate-200">
                  {item.label}
                </span>
                <span class="shrink-0 text-[10px] text-slate-500"
                  >{item.range}</span
                >
              </div>
            {/each}
          </div>
        {:else}
          <div class="space-y-2">
            {#each classes as item}
              <div class="flex items-center gap-2">
                <span
                  class="h-3 w-3 shrink-0 rounded-sm"
                  style={`background:${item.c}`}
                ></span>
                <span class="text-[11px] text-slate-300">{item.label}</span>
              </div>
            {/each}
          </div>

          <p class="mt-2 text-[10px] text-slate-600">
            Classificació derivada del valor UTCI; la capa d’origen és la
            mateixa.
          </p>
        {/if}
      </section>
    </aside>

    <section
      class="relative h-full min-h-[420px] min-w-0 bg-[#18232c] lg:min-h-0"
    >
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
              Carregant malla UTCI
            </p>
            <p class="mt-1 text-xs text-slate-400">
              Preparant les dades i renderitzant el mapa…
            </p>
          </div>
        </div>
      {/if}
      <div
        class="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/10 bg-[#101821]/90 px-3 py-2"
      >
        <p class="text-[10px] uppercase tracking-widest text-slate-500">
          Capa activa
        </p>
        <p class="mt-1 text-sm">UTCI</p>
        <p class="mt-1 text-[10px] text-slate-400">{hourLabel}</p>
      </div>
      <div
        class="pointer-events-none absolute bottom-4 left-1/2 z-10
         -translate-x-1/2 rounded-lg border border-white/10
         bg-[#101821]/95 px-4 py-2 text-center shadow-lg"
      >
        <p class="mt-0.5 whitespace-nowrap text-sm font-semibold text-teal-200">
          {hourLabel}
        </p>
      </div>
    </section>

    <aside
      class="flex flex-col gap-4 border-t border-white/10 bg-[#101821] p-4 lg:overflow-y-auto lg:border-l lg:border-t-0"
    >
      <section>
        {#if selectedPoint}
          <div class="mb-2 rounded-xl border border-white/10 bg-[#0b1118] p-3">
            <p class="text-[10px] uppercase tracking-widest text-slate-500">
              Municipi
            </p>

            {#if loadingMunicipality}
              <p class="mt-1 text-sm text-slate-400">Consultant municipi…</p>
            {:else if selectedMunicipality}
              <p class="mt-1 text-sm font-semibold text-teal-200">
                {selectedMunicipality}
              </p>
            {:else if municipalityError}
              <p class="mt-1 text-xs text-amber-300">
                {municipalityError}
              </p>
            {:else}
              <p class="mt-1 text-sm text-slate-400">—</p>
            {/if}
          </div>
          <div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <p class="text-[10px] text-slate-500">Latitud</p>
                <p class="mt-1 font-mono text-xs">
                  {selectedPoint.lat.toFixed(5)}°
                </p>
              </div>
              <div>
                <p class="text-[10px] text-slate-500">Longitud</p>
                <p class="mt-1 font-mono text-xs">
                  {selectedPoint.lng.toFixed(5)}°
                </p>
              </div>
            </div>
          </div>

          <div class="mt-2 rounded-xl border border-white/10 bg-[#0b1118] p-3">
            <p class="text-[10px] uppercase tracking-widest text-slate-500">
              Valor UTCI
            </p>
            <p
              class="mt-1 text-2xl font-semibold"
              style={`color: ${selectedValue?.color ?? "#94a3b8"}`}
            >
              {selectedValue ? `${selectedValue.value.toFixed(1)} °C` : "—"}
            </p>
            <p class="mt-1 text-xs text-slate-400">
              {selectedValue?.label ?? "Sense valor al ràster en aquest punt"}
            </p>
          </div>
        {:else}
          <div
            class="rounded-xl border border-dashed border-white/10 p-5 text-center"
          >
            <p class="text-sm text-slate-300">Cap punt seleccionat</p>
            <p class="mt-1 text-xs text-slate-500">
              Fes clic al mapa per consultar el valor UTCI.
            </p>
          </div>
        {/if}
      </section>

      <!--  <div class="h-px bg-white/10"></div> -->
      {#if Number(selectedHour) === 0}
        <section>
          <div class="mb-2 flex items-center justify-between">
            <h2
              class="text-[11px] font-semibold uppercase tracking-widest text-slate-400"
            >
              Evolució UTCI · 24 h
            </h2>
            {#if loadingSeries}
              <span class="text-[10px] text-amber-300">Calculant…</span>
            {/if}
          </div>

          {#if !selectedPoint}
            <div
              class="rounded-xl border border-dashed border-white/10 p-4 text-center"
            >
              <p class="text-xs text-slate-400">
                Selecciona un punt al mapa per veure'n l'evolució temporal.
              </p>
            </div>
          {:else if chartSeries.length}
            <div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
              <p class="mb-2 text-[10px] text-slate-500">
                UTCI (°C) · Hora local
              </p>

              <svg
                viewBox="0 0 300 148"
                class="w-full"
                role="img"
                aria-label="Evolució de l'UTCI durant les pròximes 24 hores"
              >
                {#each chartRange.ticks as tick}
                  <line
                    x1="36"
                    y1={chartY(tick)}
                    x2="286"
                    y2={chartY(tick)}
                    stroke="#64748b"
                    stroke-opacity="0.22"
                    stroke-dasharray="3 3"
                  />
                  <text
                    x="36"
                    y={chartY(tick) + 4}
                    fill="#94a3b8"
                    font-size="11"
                    text-anchor="end">{tick}°</text
                  >
                {/each}

                {#each chartLineSegments() as segment}
                  <polyline
                    points={segment}
                    fill="none"
                    stroke="#cbd5e1"
                    stroke-width="2.5"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                {/each}

                {#each chartSeries as p, i}
                  {#if Number.isFinite(p.value)}
                    <circle
                      cx={chartX(i)}
                      cy={chartY(p.value)}
                      r={i === 0 ? 4.5 : 3}
                      fill={p.color}
                      stroke={i === 0 ? "#ffffff" : "#0b1118"}
                      stroke-width={i === 0 ? 1.5 : 0.7}
                    >
                      <title>{`${p.label}: ${p.value.toFixed(1)} °C`}</title>
                    </circle>
                  {/if}
                {/each}

                {#each [0, Math.floor((chartSeries.length - 1) / 2), chartSeries.length - 1] as i}
                  {#if chartSeries[i]}
                    <text
                      x={chartX(i)}
                      y="140"
                      fill="#94a3b8"
                      font-size="9"
                      text-anchor={i === 0
                        ? "start"
                        : i === chartSeries.length - 1
                          ? "end"
                          : "middle"}>{chartSeries[i].label}</text
                    >
                  {/if}
                {/each}
              </svg>

              <p class="mt-2 text-[10px] text-slate-500">
                Cada punt representa un instant de previsió separat per 3 hores.
              </p>
            </div>
          {:else}
            <div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
              <p class="text-xs text-slate-400">
                {loadingSeries
                  ? "Preparant la sèrie temporal…"
                  : "No hi ha dades disponibles per a aquest punt."}
              </p>
            </div>
          {/if}
        </section>

        <div class="h-px bg-white/10"></div>
      {/if}
      <div class="h-px bg-white/10"></div>

      <section class="pb-2">
        <h2
          class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400"
        >
          Què determina l'estrès tèrmic?
        </h2>

        <div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
          <p class="text-xs leading-relaxed text-slate-300">
            La sensació de calor o fred no depèn només de la temperatura de
            l'aire. L'UTCI combina diversos factors ambientals per estimar com
            respon el cos humà.
          </p>

          <div class="mt-3 space-y-3">
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-400/10 text-orange-300"
              >
                <span aria-hidden="true">🌡</span>
              </div>
              <div>
                <p class="text-xs font-medium text-slate-200">
                  Temperatura de l'aire
                </p>
                <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
                  És el punt de partida: quan l'aire és més calent o més fred
                  que el cos, augmenta l'intercanvi de calor amb l'entorn.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-sky-300"
              >
                <span aria-hidden="true">💧</span>
              </div>
              <div>
                <p class="text-xs font-medium text-slate-200">
                  Humitat de l'aire
                </p>
                <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Amb molta humitat, la suor s'evapora amb més dificultat i el
                  cos té més problemes per refredar-se quan fa calor.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300"
              >
                <span aria-hidden="true">〰</span>
              </div>
              <div>
                <p class="text-xs font-medium text-slate-200">Vent</p>
                <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Afavoreix l'intercanvi de calor entre la pell i l'aire i pot
                  ajudar a refredar el cos. Amb fred, però, també pot
                  incrementar la pèrdua de calor.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10 text-yellow-300"
              >
                <span aria-hidden="true">☀</span>
              </div>
              <div>
                <p class="text-xs font-medium text-slate-200">
                  Radiació solar i tèrmica
                </p>
                <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
                  El sol directe pot escalfar molt més el cos que no pas estar a
                  l'ombra. També hi influeix la calor radiada pel terra, les
                  parets i altres superfícies.
                </p>
              </div>
            </div>
          </div>

          <div
            class="mt-4 rounded-lg border border-teal-300/10 bg-teal-300/5 p-3"
          >
            <p class="text-xs font-medium text-teal-200">
              I què ens indica l'UTCI?
            </p>
            <p class="mt-1 text-[11px] leading-relaxed text-slate-300">
              Resumeix l'efecte conjunt d'aquestes condicions en una temperatura
              equivalent, expressada en °C. No és necessàriament la temperatura
              que marca un termòmetre: dues situacions amb la mateixa
              temperatura de l'aire poden produir un estrès tèrmic molt
              diferent.
            </p>
          </div>

          <p class="mt-3 text-[10px] leading-relaxed text-slate-500">
            L'UTCI és un índex de referència. L'experiència individual també
            depèn de l'activitat física, la roba, l'aclimatació i altres factors
            personals.
          </p>
        </div>
      </section>
    </aside>
  </main>
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

  .time-slider {
    appearance: none;
    -webkit-appearance: none;
    height: 5px;
    border-radius: 999px;
    background: #344250;
    accent-color: #67d9c1;
  }

  .time-slider::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #67d9c1;
    border: 3px solid #17332f;
  }

  .time-slider::-moz-range-thumb {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #67d9c1;
    border: 2px solid #17332f;
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

  :global(.maplibregl-ctrl-attrib) {
    background: rgb(16 24 33 / 85%) !important;
    color: #a7b4c4 !important;
  }

  :global(.maplibregl-ctrl-attrib a) {
    color: #67d9c1 !important;
  }
</style>
