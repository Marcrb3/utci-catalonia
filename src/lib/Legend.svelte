<script>
  import { translate } from "../dictionary.js";
  import { labelForClass, rangeForClass } from "./utci-classes.js";

  // Llegenda de l'escala UTCI. El títol el posa el pare: així la mateixa
  // llegenda es pot reutilitzar al panell lateral i al full mòbil.
  let { classes = [], language = "ca", displayMode = "utci" } = $props();

  const isUtci = $derived(displayMode === "utci");
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
