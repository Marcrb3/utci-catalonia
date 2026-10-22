<script>
  import { translate } from "../dictionary.js";
  import Chart from "./Chart.svelte";

  // Informació del punt seleccionat: municipi, coordenades, valor UTCI
  // i l'evolució temporal de tot el període de previsió.
  let {
    open = false,
    point = null,
    municipality = "",
    loadingMunicipality = false,
    municipalityError = "",
    value = null,
    series = [],
    selectedHour = 0,
    loadingSeries = false,
    language = "ca",
    closeLabel = "Close",
    onClose = () => {},
    onSelectHour = () => {},
  } = $props();
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
  class="point-panel"
  class:is-open={open}
  inert={!open}
  role="dialog"
  aria-modal="true"
  aria-label={translate("pointPanel", language)}
>
  <div class="flex justify-center pt-2 xl:hidden">
    <span class="h-1 w-10 rounded-full bg-white/20"></span>
  </div>

  <div class="flex items-start justify-between gap-3 px-4 pt-3">
    <div class="min-w-0">
      <p class="text-[10px] uppercase tracking-widest text-slate-500">
        {translate("municipality", language)}
      </p>

      {#if loadingMunicipality}
        <p class="mt-1 text-sm text-slate-400">
          {translate("queryingMunicipality", language)}
        </p>
      {:else if municipality}
        <p class="mt-1 truncate text-sm font-semibold text-teal-200">
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

            <p
              class="mt-1 text-2xl font-semibold leading-none"
              style={`color: ${value?.color ?? "#94a3b8"}`}
            >
              {value ? `${value.value.toFixed(1)} °C` : "—"}
            </p>

            <p class="mt-1 text-xs text-slate-400">
              {value?.label ?? translate("noRasterValue", language)}
            </p>
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

    <div class="mt-2 px-4 pb-4">
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
          loading={loadingSeries}
          {onSelectHour}
        />
      </div>
    </div>
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
    max-height: 78dvh;
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

    .point-panel {
      position: absolute;
      inset: 5rem 0.75rem 2rem auto;
      width: 340px;
      max-height: none;
      border: 1px solid rgb(255 255 255 / 0.1);
      border-radius: 0.75rem;
      background: rgb(16 24 33 / 0.97);
      box-shadow: 0 18px 50px rgb(0 0 0 / 0.55);
      transform: translateX(calc(100% + 0.75rem));
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
