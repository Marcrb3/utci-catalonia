<script>
  import { translate } from "../dictionary.js";

  // Contingut informatiu sobre què determina l'estrès tèrmic.
  let { language = "ca" } = $props();

  const factors = [
    { icon: "🌡", tint: "bg-orange-400/10 text-orange-300", key: "airTemperature", text: "airTemperatureText" },
    { icon: "💧", tint: "bg-sky-400/10 text-sky-300", key: "humidity", text: "humidityText" },
    { icon: "〰", tint: "bg-cyan-400/10 text-cyan-300", key: "wind", text: "windText" },
    { icon: "☀", tint: "bg-yellow-400/10 text-yellow-300", key: "radiation", text: "radiationText" },
  ];
</script>

<div class="rounded-xl border border-white/10 bg-[#0b1118] p-3">
  <p class="text-xs leading-relaxed text-slate-300">
    {translate("factorsIntro", language)}
  </p>

  <div class="mt-3 space-y-3">
    {#each factors as factor}
      <div class="flex items-start gap-3">
        <div
          class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${factor.tint}`}
        >
          <span aria-hidden="true">{factor.icon}</span>
        </div>

        <div>
          <p class="text-xs font-medium text-slate-200">
            {translate(factor.key, language)}
          </p>
          <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
            {translate(factor.text, language)}
          </p>
        </div>
      </div>
    {/each}
  </div>

  <div class="mt-4 rounded-lg border border-teal-300/10 bg-teal-300/5 p-3">
    <p class="text-xs font-medium text-teal-200">
      {translate("utciMeaning", language)}
    </p>
    <p class="mt-1 text-[11px] leading-relaxed text-slate-300">
      {translate("utciMeaningText", language)}
    </p>
  </div>

  <p class="mt-3 text-[10px] leading-relaxed text-slate-500">
    {translate("referenceIndex", language)}
  </p>
</div>
