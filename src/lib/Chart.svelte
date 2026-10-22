<script>
  import { translate } from "../dictionary.js";
  import { colorForValue } from "./utci-classes.js";
  import { dayKey, formatDateShort, formatShortDateTime, formatTime } from "./time.js";

  // Gràfica de l'evolució de l'UTCI en un punt durant tota la previsió.
  // Cada tram del traç pren el color de la classe del valor, de manera que
  // el gradient tèrmic es llegeix d'un cop d'ull.
  let {
    series = [],
    selectedHour = 0,
    language = "ca",
    loading = false,
    onSelectHour = () => {},
  } = $props();

  const WIDTH = 320;
  const HEIGHT = 168;
  const PAD = { top: 14, right: 10, bottom: 26, left: 34 };

  const PLOT_LEFT = PAD.left;
  const PLOT_RIGHT = WIDTH - PAD.right;
  const PLOT_TOP = PAD.top;
  const PLOT_BOTTOM = HEIGHT - PAD.bottom;

  const points = $derived(
    series.map((item) => ({ ...item, x: 0, y: 0 })).filter((item) => Number.isFinite(item.value)),
  );

  const range = $derived.by(() => {
    const valid = points.map((point) => point.value);

    if (!valid.length) {
      return { min: 0, max: 40, ticks: [0, 10, 20, 30, 40] };
    }

    let min = Math.floor(Math.min(...valid) / 5) * 5;
    let max = Math.ceil(Math.max(...valid) / 5) * 5;

    if (min === max) {
      min -= 5;
      max += 5;
    }

    const step = Math.max(5, (Math.ceil((max - min) / 4 / 5) * 5));
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;

    const ticks = [];
    for (let value = min; value <= max; value += step) ticks.push(value);

    return { min, max, ticks };
  });

  // Escala horitzontal: un pas de previsió per increment.
  const scaleX = $derived.by(() => {
    const count = series.length;

    if (count <= 1) return () => (PLOT_LEFT + PLOT_RIGHT) / 2;

    return (index) =>
      PLOT_LEFT + (index / (count - 1)) * (PLOT_RIGHT - PLOT_LEFT);
  });

  const scaleY = $derived.by(() => {
    const { min, max } = range;
    const span = max - min || 1;

    return (value) =>
      PLOT_BOTTOM - ((value - min) / span) * (PLOT_BOTTOM - PLOT_TOP);
  });

  // Punts amb les coordenades ja calculades.
  const plotted = $derived(
    series.map((item, index) => ({
      ...item,
      index,
      x: scaleX(index),
      y: Number.isFinite(item.value) ? scaleY(item.value) : null,
    })),
  );

  const validPlotted = $derived(plotted.filter((point) => point.y !== null));

  // Trams de la línia: un per cada punt, amb el color de la classe.
  const segments = $derived.by(() => {
    const result = [];

    for (let i = 0; i < validPlotted.length - 1; i++) {
      const from = validPlotted[i];
      const to = validPlotted[i + 1];
      const middle = (from.value + to.value) / 2;

      result.push({
        key: `${from.index}-${to.index}`,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        color: colorForValue(middle),
      });
    }

    return result;
  });

  // Àrea sota la línia.
  const areaPath = $derived.by(() => {
    if (validPlotted.length < 2) return "";

    const head = validPlotted
      .map((point, i) => `${i === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" ");

    const last = validPlotted[validPlotted.length - 1];
    const first = validPlotted[0];

    return `${head} L${last.x},${PLOT_BOTTOM} L${first.x},${PLOT_BOTTOM} Z`;
  });

  // Marques de dia a l'eix horitzontal.
  const dayMarks = $derived.by(() => {
    const marks = [];
    let lastKey = null;

    for (const point of plotted) {
      const key = dayKey(point.time);

      if (!key || key === lastKey) continue;

      marks.push({
        key,
        x: point.x,
        label: formatDateShort(point.time, language),
      });

      lastKey = key;
    }

    return marks;
  });

  const selected = $derived(
    plotted.find((point) => point.index === Number(selectedHour)) ?? null,
  );

  // Text que anuncia el valor actual del selector.
  const selectedLabel = $derived.by(() => {
    if (!selected) return translate("chartTitle", language);

    const value = Number.isFinite(selected.value)
      ? `${selected.value.toFixed(1)} °C`
      : "—";

    return `${formatShortDateTime(selected.time, language)}: ${value}`;
  });

  let hovered = $state(null);
  let svgElement = $state(null);

  const hoverPoint = $derived(
    hovered === null ? null : (plotted[hovered] ?? null),
  );

  function indexFromEvent(event) {
    if (!svgElement || !series.length) return null;

    const rect = svgElement.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const x = ratio * WIDTH;

    let best = null;
    let bestDistance = Infinity;

    for (const point of plotted) {
      const distance = Math.abs(point.x - x);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = point.index;
      }
    }

    return best;
  }

  function handlePointerMove(event) {
    const index = indexFromEvent(event);

    hovered = index;
  }

  function handleClick(event) {
    const index = indexFromEvent(event);

    if (index !== null) onSelectHour(index);
  }

  // La gràfica és un selector de temps: es pot recorreig amb el teclat.
  function handleKeydown(event) {
    const count = series.length;

    if (!count) return;

    let next = Number(selectedHour);

    if (event.key === "ArrowRight" || event.key === "ArrowUp") next += 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else return;

    event.preventDefault();

    onSelectHour(Math.max(0, Math.min(count - 1, next)));
  }
</script>

<div class="relative">
  {#if loading && !validPlotted.length}
    <!-- Esquel de càrrega. -->
    <div class="skeleton h-[168px] w-full rounded-lg" aria-hidden="true"></div>
  {:else if !validPlotted.length}
    <p class="py-6 text-center text-xs text-slate-400">
      {translate("noDataPoint", language)}
    </p>
  {:else}
    <svg
      bind:this={svgElement}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      class="w-full touch-pan-y select-none"
      role="slider"
      tabindex="0"
      aria-label={translate("chartTitle", language)}
      aria-valuemin="0"
      aria-valuemax={Math.max(0, series.length - 1)}
      aria-valuenow={Number(selectedHour)}
      aria-valuetext={selectedLabel}
      onpointermove={handlePointerMove}
      onpointerleave={() => (hovered = null)}
      onclick={handleClick}
      onkeydown={handleKeydown}
    >
      <defs>
        <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#67d9c1" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#67d9c1" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Línies de referència i escala vertical. -->
      {#each range.ticks as tick}
        <line
          x1={PLOT_LEFT}
          y1={scaleY(tick)}
          x2={PLOT_RIGHT}
          y2={scaleY(tick)}
          stroke="#64748b"
          stroke-opacity="0.22"
          stroke-dasharray="3 3"
        />
        <text
          x={PLOT_LEFT - 6}
          y={scaleY(tick) + 4}
          fill="#94a3b8"
          font-size="10"
          text-anchor="end">{tick}°</text
        >
      {/each}

      <!-- Separadors de dia. -->
      {#each dayMarks as mark}
        <line
          x1={mark.x}
          y1={PLOT_TOP}
          x2={mark.x}
          y2={PLOT_BOTTOM}
          stroke="#94a3b8"
          stroke-opacity="0.18"
          stroke-dasharray="2 4"
        />
        <text
          x={mark.x + 3}
          y={HEIGHT - 8}
          fill="#94a3b8"
          font-size="9">{mark.label}</text
        >
      {/each}

      <!-- Àrea sota la línia. -->
      {#if areaPath}
        <path d={areaPath} fill="url(#chart-area)" />
      {/if}

      <!-- Trams colorejats per classe UTCI. -->
      {#each segments as segment}
        <line
          x1={segment.x1}
          y1={segment.y1}
          x2={segment.x2}
          y2={segment.y2}
          stroke={segment.color}
          stroke-width="2.5"
          stroke-linecap="round"
        />
      {/each}

      <!-- Cursor del fotograma seleccionat. -->
      {#if selected}
        <line
          x1={selected.x}
          y1={PLOT_TOP}
          x2={selected.x}
          y2={PLOT_BOTTOM}
          stroke="#67d9c1"
          stroke-opacity="0.75"
          stroke-width="1.5"
        />
      {/if}

      <!-- Punts. -->
      {#each validPlotted as point (point.index)}
        <circle
          cx={point.x}
          cy={point.y}
          r={point.index === Number(selectedHour) ? 4.5 : 2.6}
          fill={point.color}
          stroke={point.index === Number(selectedHour) ? "#ffffff" : "#0b1118"}
          stroke-width={point.index === Number(selectedHour) ? 1.5 : 0.7}
        >
          <title>{`${point.label}: ${point.value.toFixed(1)} °C`}</title>
        </circle>
      {/each}

      <!-- Etiqueta del punt que es mou amb el ratolí. -->
      {#if hoverPoint && hoverPoint.y !== null}
        <g class="pointer-events-none">
          <circle
            cx={hoverPoint.x}
            cy={hoverPoint.y}
            r="4"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.8"
            stroke-width="1.5"
          />
          <text
            x={Math.min(Math.max(hoverPoint.x, PLOT_LEFT + 30), PLOT_RIGHT - 30)}
            y={Math.max(hoverPoint.y - 10, 10)}
            fill="#e2e8f0"
            font-size="10"
            text-anchor="middle">{hoverPoint.value.toFixed(1)}°</text
          >
        </g>
      {/if}
    </svg>
  {/if}

  <div class="mt-1.5 flex items-center justify-between gap-2">
    <p class="text-[10px] text-slate-500">{translate("chartHint", language)}</p>

    {#if selected}
      <p class="whitespace-nowrap text-[10px] font-medium text-teal-200">
        {formatTime(selected.time, language)}
      </p>
    {/if}
  </div>
</div>

<style>
  .skeleton {
    background-image: linear-gradient(
      100deg,
      rgb(255 255 255 / 4%) 20%,
      rgb(255 255 255 / 10%) 40%,
      rgb(255 255 255 / 4%) 60%
    );
    background-size: 200% 100%;
    animation: chart-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes chart-shimmer {
    from {
      background-position: 180% 0;
    }

    to {
      background-position: -20% 0;
    }
  }
</style>
