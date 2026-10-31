<script>
  import { translate } from "../dictionary.js";
  import {
    labelForClass,
    rangeForClass,
    rampGradientCss,
    rampTicks,
    rampTickPercent,
  } from "./utci-classes.js";

  // Llegenda de l'escala UTCI. El títol el posa el pare: així la mateixa
  // llegenda es pot reutilitzar al panell lateral i al full mòbil.
  let { classes = [], language = "ca", displayMode = "utci" } = $props();

  const isUtci = $derived(displayMode === "utci");
  const isContinuous = $derived(displayMode === "continuous");

  // Els nombres negatius es mostren amb el signe menys tipogràfic (−),
  // igual que la resta de la interfície.
  function formatTick(value) {
    return String(value).replace("-", "−");
  }
</script>

{#if isUtci}
  <div
    class="mb-2 flex h-2 overflow-hidden rounded-full"
    role="img"
    aria-label={translate("utciLegend", language)}
  >
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
        <span class="min-w-0 flex-1 text-xs text-slate-200">
          {labelForClass(item, language)}
        </span>
        <span class="shrink-0 text-[10px] text-slate-500">
          {rangeForClass(item, language)}
        </span>
      </div>
    {/each}
  </div>
{:else if isContinuous}
  <div
    class="h-2 rounded-full"
    style={`background:${rampGradientCss()}`}
    role="img"
    aria-label={translate("continuousLegend", language)}
  ></div>

  <!-- Marques de temperatura sota la rampa. -->
  <div class="relative mt-1 h-4">
    {#each rampTicks as tick (tick)}
      <span
        class="absolute top-0 text-[10px] text-slate-500"
        style={`left:${rampTickPercent(tick)}%; transform:translateX(${
          tick === rampTicks[0]
            ? "0%"
            : tick === rampTicks[rampTicks.length - 1]
              ? "-100%"
              : "-50%"
        })`}>{formatTick(tick)}</span
      >
    {/each}
  </div>

  <p class="mt-2 text-[10px] text-slate-500">
    {translate("continuousNote", language)}
  </p>
{:else}
  <div class="space-y-2">
    {#each classes as item}
      <div class="flex items-center gap-2">
        <span
          class="h-3 w-3 shrink-0 rounded-sm"
          style={`background:${item.c}`}
        ></span>
        <span class="text-[11px] text-slate-300">
          {labelForClass(item, language)}
        </span>
      </div>
    {/each}
  </div>

  <p class="mt-2 text-[10px] text-slate-500">
    {translate("classificationNote", language)}
  </p>
{/if}
