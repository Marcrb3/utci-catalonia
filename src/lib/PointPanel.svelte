<script>
  import { translate } from "../dictionary.js";
  import Chart from "./Chart.svelte";
  import { verticalResize } from "./resize.js";

  // Informació del punt seleccionat: municipi, coordenades, valor UTCI
  // i l'evolució temporal de tot el període de previsió.
  let {
    open = false,
    point = null,
    toponym = "",
    municipality = "",
    loadingMunicipality = false,
    municipalityError = "",
    value = null,
    series = [],
    selectedHour = 0,
    loadingSeries = false,
    variables = null,
    loadingVariables = false,
    variablesAvailable = false,
    language = "ca",
    displayMode = "utci",
    closeLabel = "Close",
    resizeLabel = "Resize panel",
    onClose = () => {},
    onSelectHour = () => {},
  } = $props();

  const MIN_HEIGHT = 200;

  // Variables que arriben com a objecte {nom_de_banda: valor} des
  // d'App.svelte. Les agrupem segons el paper que tenen en el procés per
  // fer més llegible d'on surt el valor UTCI final.
  const ORIGINAL_ROWS = [
    { key: "t2m_raw", labelKey: "varT2mRaw", digits: 1, unit: "°C" },
    {
      key: "corr_total",
      labelKey: "varCorrTotal",
      digits: 1,
      unit: "°C",
      signed: true,
    },
  ];

  const USED_ROWS = [
    { key: "t2m_used", labelKey: "varT2mUsed", digits: 1, unit: "°C" },
    { key: "wind", labelKey: "varWind", digits: 1, unit: "m/s" },
    { key: "rh", labelKey: "varRh", digits: 0, unit: "%" },
    { key: "mrt", labelKey: "varMrt", digits: 1, unit: "°C" },
    { key: "shadow", labelKey: "varShadow", percent: true },
  ];

  function formatVariable(row, raw) {
    // null vol dir "banda sense valor" (fora del domini o pendent).
    if (raw == null) return "—";

    const value = Number(raw);

    if (!Number.isFinite(value)) return "—";

    // L'ombra es publica com a fracció del píxel amb ombra.
    if (row.percent) return `${Math.round(value * 100)} %`;

    let sign = "";

    if (row.signed && value > 0) sign = "+";
    else if (value < 0) sign = "−";

    return `${sign}${Math.abs(value).toFixed(row.digits)} ${row.unit}`;
  }

  function formatDifference(raw) {
    if (raw == null || !Number.isFinite(Number(raw))) return "—";

    const value = Number(raw);
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";

    return `${sign}${Math.abs(value).toFixed(1)} °C`;
  }

  function numericValue(raw) {
    if (raw == null || !Number.isFinite(Number(raw))) return null;

    return Number(raw);
  }

  // Són diferències descriptives entre valors observats. No són una
  // descomposició causal de l'UTCI, que es calcula amb una funció no lineal.
  const airTemperatureDifference = $derived(
    numericValue(variables?.t2m_used) !== null &&
      numericValue(variables?.t2m_raw) !== null
      ? numericValue(variables.t2m_used) - numericValue(variables.t2m_raw)
      : null,
  );

  const utciAirTemperatureDifference = $derived(
    value?.value != null && numericValue(variables?.t2m_used) !== null
      ? Number(value.value) - numericValue(variables.t2m_used)
      : null,
  );

  let panelElement = $state(null);
  let sheetHeight = $state(null);
  let currentHeight = $state(0);
  let expanded = $state(false);
  let dragged = false;
  let startHeight = 0;

  function maxHeight() {
    if (typeof window === "undefined") return 800;

    return Math.round(window.innerHeight * 0.88);
  }

  function setHeight(value) {
    sheetHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight(), value));
    currentHeight = sheetHeight;
  }

  const dragOptions = {
    onStart: () => {
      dragged = false;
      startHeight = panelElement?.getBoundingClientRect().height ?? 0;
      currentHeight = startHeight;
    },
    onDelta: (delta) => {
      if (!startHeight) return;

      if (Math.abs(delta) > 4) dragged = true;

      setHeight(startHeight + delta);
    },
  };

  // Un toc al tirador desplega o recull el panell.
  function toggleExpanded() {
    if (dragged) {
      dragged = false;
      return;
    }

    if (expanded) {
      expanded = false;
      sheetHeight = null;
      return;
    }

    expanded = true;
    setHeight(maxHeight());
  }

  // En obrir el panell es torna a l'alçada natural.
  $effect(() => {
    if (open) {
      sheetHeight = null;
      expanded = false;
    }
  });
</script>

<button
  type="button"
  tabindex="-1"
  class="point-panel-backdrop"
  class:is-open={open}
  aria-label={closeLabel}
  onclick={onClose}
></button>

<div
  bind:this={panelElement}
  class="point-panel"
  class:is-open={open}
  inert={!open}
  style={sheetHeight ? `--sheet-height:${sheetHeight}px` : ""}
  role="dialog"
  aria-modal="true"
  aria-label={translate("pointPanel", language)}
>
  <!-- Maneta: arrossegar per ampliar o reduir el panell. -->
  <button
    type="button"
    class="flex w-full shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing xl:hidden"
    aria-label={resizeLabel}
    aria-expanded={expanded}
    onclick={toggleExpanded}
    use:verticalResize={dragOptions}
  >
    <span class="h-1 w-10 rounded-full bg-white/25"></span>
  </button>

  <div class="flex items-start justify-between gap-3 px-4 pt-3 xl:pt-4">
    <div class="min-w-0">
      {#if toponym}
        <p class="text-[10px] uppercase tracking-widest text-slate-500">
          {translate("toponym", language)}
        </p>
        <p class="mt-1 truncate text-sm font-semibold text-teal-200">
          {toponym}
        </p>
      {/if}

      <div class:mt-2={!!toponym}>
        <p class="text-[10px] uppercase tracking-widest text-slate-500">
          {translate("municipality", language)}
        </p>

        {#if loadingMunicipality}
          <p class="mt-1 text-sm text-slate-400">
            {translate("queryingPlace", language)}
          </p>
        {:else if municipality}
          <p class="mt-1 truncate text-xs font-medium text-slate-300">
            {municipality}
          </p>
        {:else if municipalityError}
          <p class="mt-1 text-xs text-amber-300">
            {translate(municipalityError, language)}
          </p>
        {:else}
          <p class="mt-1 text-sm text-slate-400">—</p>
        {/if}
      </div>
    </div>

    <button
      type="button"
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:text-slate-100"
      aria-label={closeLabel}
      onclick={onClose}
    >
      ✕
    </button>
  </div>

  {#if point}
    <div class="mt-2 px-4">
      <div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="text-[10px] uppercase tracking-widest text-slate-500">
              {translate("utciValue", language)}
            </p>

            {#if value}
              <p
                class="mt-1 text-2xl font-semibold leading-none"
                style={`color: ${value.color}`}
              >
                {value.value.toFixed(1)} °C
              </p>

              <p class="mt-1 text-xs text-slate-400">{value.label}</p>
            {:else}
              <p class="mt-1 text-2xl font-semibold leading-none text-slate-500">
                —
              </p>

              <p class="mt-1 text-xs text-amber-200">
                {translate("pointNoData", language)}
              </p>
            {/if}
          </div>

          <dl class="text-right font-mono text-[10px] text-slate-400">
            <dt class="text-slate-500">{translate("latitude", language)}</dt>
            <dd>{point.lat.toFixed(5)}°</dd>

            <dt class="mt-1 text-slate-500">{translate("longitude", language)}</dt>
            <dd>{point.lng.toFixed(5)}°</dd>
          </dl>
        </div>
      </div>
    </div>

    <!-- Evolució temporal: és la primera lectura després de la ubicació. -->
    <div class="mt-2 px-4">
      <div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3
            class="text-[11px] font-semibold uppercase tracking-widest text-slate-400"
          >
            {translate("chartTitle", language)}
          </h3>

          {#if loadingSeries && series.length}
            <span class="text-[10px] text-amber-300">
              {translate("calculating", language)}
            </span>
          {/if}
        </div>

        <Chart
          {series}
          {selectedHour}
          {language}
          {displayMode}
          loading={loadingSeries}
          {onSelectHour}
        />
      </div>
    </div>

    <!-- Variables que entren al càlcul, per al fotograma visible. -->
    {#if variablesAvailable}
      <div class="mt-2 px-4 pb-4">
        <div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h3
              class="text-[11px] font-semibold uppercase tracking-widest text-slate-400"
            >
              {translate("calculationTitle", language)}
            </h3>

            {#if loadingVariables}
              <span class="text-[10px] text-amber-300">
                {translate("calculating", language)}
              </span>
            {/if}
          </div>

          <p class="mb-3 text-[11px] leading-relaxed text-slate-400">
            {translate("calculationIntro", language)}
          </p>

          <div class="space-y-3">
            <section>
              <h4
                class="mb-1 text-[10px] font-semibold uppercase tracking-widest text-teal-200/80"
              >
                {translate("originalData", language)}
              </h4>

              <dl class="space-y-1">
                {#each ORIGINAL_ROWS as row (row.key)}
                  <div
                    class="flex items-baseline justify-between gap-3 border-b border-white/5 pb-1 last:border-0 last:pb-0"
                  >
                    <dt class="text-[11px] leading-tight text-slate-400">
                      {translate(row.labelKey, language)}
                    </dt>

                    <dd
                      class="shrink-0 font-mono text-[11px] tabular-nums text-slate-200"
                    >
                      {formatVariable(row, variables?.[row.key])}
                    </dd>
                  </div>
                {/each}
              </dl>
            </section>

            <section>
              <h4
                class="mb-1 text-[10px] font-semibold uppercase tracking-widest text-teal-200/80"
              >
                {translate("usedData", language)}
              </h4>

              <dl class="space-y-1">
                {#each USED_ROWS as row (row.key)}
                  <div
                    class="flex items-baseline justify-between gap-3 border-b border-white/5 pb-1 last:border-0 last:pb-0"
                  >
                    <dt class="text-[11px] leading-tight text-slate-400">
                      {translate(row.labelKey, language)}
                    </dt>

                    <dd
                      class="shrink-0 font-mono text-[11px] tabular-nums text-slate-200"
                    >
                      {formatVariable(row, variables?.[row.key])}
                    </dd>
                  </div>
                {/each}
              </dl>
            </section>

            <section class="border-t border-white/10 pt-2">
              <h4
                class="mb-1 text-[10px] font-semibold uppercase tracking-widest text-teal-200/80"
              >
                {translate("comparisonsTitle", language)}
              </h4>

              <dl class="space-y-1">
                <div class="flex items-baseline justify-between gap-3">
                  <dt class="text-[11px] leading-tight text-slate-400">
                    {translate("airTemperatureDifference", language)}
                  </dt>
                  <dd
                    class="shrink-0 font-mono text-[11px] tabular-nums text-slate-200"
                  >
                    {formatDifference(airTemperatureDifference)}
                  </dd>
                </div>

                {#if value}
                  <div class="flex items-baseline justify-between gap-3">
                    <dt class="text-[11px] leading-tight text-slate-400">
                      {translate("utciAirTemperatureDifference", language)}
                    </dt>
                    <dd
                      class="shrink-0 font-mono text-[11px] tabular-nums text-slate-200"
                    >
                      {formatDifference(utciAirTemperatureDifference)}
                    </dd>
                  </div>
                {/if}
              </dl>

              <p class="mt-2 text-[10px] leading-relaxed text-slate-500">
                {translate("calculationNote", language)}
              </p>
            </section>
          </div>
        </div>
      </div>
    {/if}

  {/if}
</div>

<style>
  .point-panel-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    border: 0;
    background: rgb(0 0 0 / 0.55);
    cursor: default;
    opacity: 0;
    pointer-events: none;
    transition: opacity 200ms var(--ease-out);
  }

  .point-panel {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 50;
    height: var(--sheet-height, auto);
    max-height: 88dvh;
    overflow-y: auto;
    border-top: 1px solid rgb(255 255 255 / 0.15);
    border-radius: 1rem 1rem 0 0;
    background: #101821;
    box-shadow: 0 -10px 40px rgb(0 0 0 / 0.55);
    transform: translateY(100%);
    transition: transform 250ms var(--ease-out);
  }

  .point-panel.is-open {
    transform: translateY(0);
  }

  .point-panel-backdrop.is-open {
    opacity: 1;
    pointer-events: auto;
  }

  @media (min-width: 1280px) {
    .point-panel-backdrop {
      display: none;
    }

    /* A l'escriptori el panell s'ancora a la cantonada superior dreta del
       mapa (just a sota de la navbar), amb alçada variable segons el
       contingut i l'estil del panell esquerre: recte, sense ombra flotant
       i amb una vora a l'esquerra que el separa del mapa. Els controls
       de MapLibre són a la cantonada inferior dreta i no hi haurien
       solapament. */
    .point-panel {
      position: absolute;
      top: 0;
      right: 0;
      bottom: auto;
      left: auto;
      width: 340px;
      height: auto;
      max-height: calc(100% - 7rem);
      overflow-y: auto;
      border: 0;
      border-left: 1px solid rgb(255 255 255 / 0.1);
      border-radius: 0;
      background: #101821;
      box-shadow: -10px 0 30px rgb(0 0 0 / 0.45);
      transform: translateX(100%);
      transition: transform 250ms var(--ease-out);
    }

    .point-panel.is-open {
      transform: translateX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .point-panel {
      transition: opacity 160ms var(--ease-out);
      transform: none;
    }

    .point-panel.is-open {
      transform: none;
    }
  }
</style>
