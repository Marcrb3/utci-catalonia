<script>
  import { translate } from "../dictionary.js";
  import Chart from "./Chart.svelte";
  import Legend from "./Legend.svelte";
  import Geocoder from "./Geocoder.svelte";
  import {
    classes,
    colorForValue,
    getClass,
    labelForClass,
  } from "./utci-classes.js";
  import { computeStressPeriods } from "./stress.js";
  import { formatShortDateTime } from "./time.js";
  import { referenceCities } from "./cities.js";
  import {
    ORIGINAL_ROWS,
    USED_ROWS,
    formatVariable,
    formatDifference,
    airTemperatureDifference,
    utciAirTemperatureDifference,
  } from "./variables.js";

  // Pàgina de detall de la previsió sobre un punt concret: sense mapa.
  // Reutilitza el geocoder, la gràfica i la llegenda del projecte, i hi
  // afegeix el resum dels períodes d'estrès i les variables del diagnòstic.
  let {
    language = "ca",
    displayMode = "utci",
    point = null,
    toponym = "",
    municipality = "",
    value = null,
    series = [],
    selectedHour = 0,
    loadingSeries = false,
    variables = null,
    loadingVariables = false,
    variablesAvailable = false,
    onSelectHour = () => {},
    onClose = () => {},
    onCitySelect = () => {},
    onGeocodeSelect = () => {},
    getFocus = () => null,
  } = $props();

  const stressPeriods = $derived(computeStressPeriods(series));

  // Acordió de "Com s'obté l'UTCI": plegat per defecte.
  let calculationOpen = $state(false);

  const tempDifference = $derived(airTemperatureDifference(variables));
  const utciTempDifference = $derived(
    utciAirTemperatureDifference(value, variables),
  );

  function periodRange(run) {
    const from = series[run.from];
    const to = series[run.to];
    const fromTime = from?.time ?? null;
    const toTime = to?.time ?? null;

    return {
      fromLabel: fromTime ? formatShortDateTime(fromTime, language) : "—",
      toLabel: toTime ? formatShortDateTime(toTime, language) : "—",
      peak: run.peak,
      peakIsHeat: run.peakIsHeat,
    };
  }
</script>

<div class="flex h-full min-h-0 min-w-0 flex-col bg-[#0b1118] text-slate-100">
  <div class="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-[#101821] px-4 py-3">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold">{translate("detailTitle", language)}</h2>
      <p class="mt-0.5 truncate text-base font-semibold text-teal-200">
        {toponym || municipality || (point ? `${point.lat.toFixed(4)}°, ${point.lng.toFixed(4)}°` : "")}
      </p>
    </div>

    <button
      type="button"
      onclick={onClose}
      class="shrink-0 rounded-lg border border-white/10 bg-[#0b1118] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/20 hover:bg-white/5"
    >
      {translate("backToMap", language)}
    </button>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="p-4">
      <!-- En pantalles petites ja hi ha el cercador de la navbar, així que
           el de la vista de detall només es mostra a partir de lg. -->
      <div class="hidden lg:block">
        <Geocoder {language} {getFocus} onSelect={onGeocodeSelect} />
      </div>

      <div class="mt-4">
        <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {translate("cityList", language)}
        </h3>

        <div class="flex flex-wrap gap-2">
          {#each referenceCities as city (city.nom)}
            <button
              type="button"
              onclick={() => onCitySelect(city)}
              class="rounded-full border border-white/10 bg-[#0b1118] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-teal-300/40 hover:text-teal-100 active:scale-[0.97]"
            >
              {city.nom}
            </button>
          {/each}
        </div>
      </div>

      {#if !point}
        <p class="mt-6 text-center text-xs text-slate-400">
          {translate("choosePlace", language)}
        </p>
      {/if}

      {#if point}
        <!-- Gràfica i informació del punt: la gràfica ocupa uns 50% del width
             i la resta de la informació es posa a la dreta. -->
        <div class="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
          <!-- Evolució de tota la previsió amb els períodes d'estrès remarcats. -->
          <div class="min-w-0 rounded-xl border border-white/10 bg-[#0b1118] p-3">
            <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              {translate("chartTitle", language)}
            </h3>

            <div class="min-w-0">
              <Chart
                {series}
                selectedHour={Number(selectedHour)}
                {language}
                {displayMode}
                loading={loadingSeries}
                onSelectHour={onSelectHour}
              />
            </div>
          </div>

          <div class="flex min-w-0 flex-col gap-4">
            <!-- Valor UTCI del fotograma seleccionat. -->
            <div class="rounded-xl border border-white/10 bg-[#101821] p-3">
              <p class="text-[10px] uppercase tracking-widest text-slate-500">
                {translate("utciValue", language)}
              </p>

              {#if value}
                <p class="mt-1 text-3xl font-semibold leading-none" style={`color: ${value.color}`}>
                  {value.value.toFixed(1)} °C
                </p>
                <p class="mt-1 text-xs text-slate-400">{value.label}</p>
              {:else}
                <p class="mt-1 text-3xl font-semibold leading-none text-slate-500">—</p>
                <p class="mt-1 text-xs text-amber-200">{translate("noDataPoint", language)}</p>
              {/if}
            </div>

            <!-- Resum dels períodes amb estrès tèrmic. -->
            <div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
              <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                {translate("stressPeriods", language)}
              </h3>

              {#if stressPeriods.length}
                <ul class="space-y-1">
                  {#each stressPeriods as run (run.from)}
                    {@const period = periodRange(run)}
                    <li
                      class="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 pb-1 text-xs text-slate-300 last:border-0 last:pb-0"
                    >
                      <span>{period.fromLabel} → {period.toLabel}</span>
                      <span class="font-medium" style={`color: ${colorForValue(run.peak, displayMode)}`}>
                        {run.peak.toFixed(1)} °C · {labelForClass(getClass(run.peak), language)}
                      </span>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="text-xs text-slate-400">{translate("noStressPeriods", language)}</p>
              {/if}
            </div>

            <!-- Llegenda reutilitzable: es posa al costat del gràfic. -->
            <div class="mt-4 rounded-xl border border-white/10 bg-[#0b1118] p-3">
              <Legend {classes} {language} {displayMode} />
            </div>
          </div>
        </div>

        <!-- D'on surt el valor UTCI: variables del diagnòstic, plegables. -->
        {#if variablesAvailable}
          <div class="mt-4 rounded-xl border border-white/10 bg-[#0b1118] p-3">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={calculationOpen}
              onclick={() => (calculationOpen = !calculationOpen)}
            >
              <h3
                class="text-[11px] font-semibold uppercase tracking-widest text-slate-400"
              >
                {translate("calculationTitle", language)}
              </h3>

              <span class="flex shrink-0 items-center gap-2">
                {#if loadingVariables}
                  <span class="text-[10px] text-amber-300">
                    {translate("calculating", language)}
                  </span>
                {/if}

                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                  class={`text-slate-500 motion-safe:transition-transform motion-safe:duration-200 ${calculationOpen ? "rotate-180" : ""}`}
                >
                  <path
                    d="M2.5 4.5 6 8l3.5-3.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
            </button>

            {#if calculationOpen}
              <div class="mt-2">
                <p class="text-[11px] leading-relaxed text-slate-400">
                  {translate("calculationIntro", language)}
                </p>

                <div class="mt-3 space-y-3">
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
                          {formatDifference(tempDifference)}
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
                            {formatDifference(utciTempDifference)}
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
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
