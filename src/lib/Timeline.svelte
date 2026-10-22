<script>
  import { translate, interpolate } from "../dictionary.js";
  import {
    formatWeekdayLong,
    formatWeekdayShort,
    formatDayMonth,
    formatDateShort,
    formatYear,
    formatTime,
    formatFullDate,
    dayKey,
    relativeDayLabel,
    hoursBetween,
  } from "./time.js";

  // Control temporal. El component és presentacional: el pare li passa
  // l'estat actual i rep les accions mitjançant callbacks.
  let {
    forecast = [],
    language = "ca",
    selectedHour = 0,
    isPlaying = false,
    onPrev = () => {},
    onNext = () => {},
    onTogglePlay = () => {},
    onSelectHour = () => {},
  } = $props();

  const totalHours = $derived(Math.max(0, forecast.length - 1));

  const DAY_GAP = 4;
  let stripWidth = $state(0);

  // En pantalles petites el control es comprimeix per deixar més mapa.
  let compact = $state(
    typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1279px)").matches,
  );

  $effect(() => {
    const query = window.matchMedia("(max-width: 1279px)");

    compact = query.matches;

    const onChange = () => (compact = query.matches);

    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
  });

  const current = $derived(forecast[Number(selectedHour)] ?? null);
  const currentTime = $derived(
    current?.valid_time ?? current?.validTime ?? null,
  );
  const firstTime = $derived(
    forecast[0]?.valid_time ?? forecast[0]?.validTime ?? null,
  );

  const weekdayLong = $derived(formatWeekdayLong(currentTime, language));
  const weekdayShort = $derived(formatWeekdayShort(currentTime, language));
  const dayMonth = $derived(formatDayMonth(currentTime, language));
  const dateShort = $derived(formatDateShort(currentTime, language));
  const year = $derived(formatYear(currentTime, language));
  const time = $derived(formatTime(currentTime, language));
  const relative = $derived(relativeDayLabel(currentTime, language));
  const fullLabel = $derived(formatFullDate(currentTime, language));
  const offsetHours = $derived(hoursBetween(firstTime, currentTime));

  const progress = $derived(
    totalHours > 0 ? (Number(selectedHour) / totalHours) * 100 : 0,
  );

  // Un segment per dia natural. L'amplada és proporcional al nombre de
  // passos del dia (el primer i l'últim poden ser parcials).
  const days = $derived(buildDays(forecast, language));
  const currentDayKey = $derived(dayKey(currentTime));

  // Posició i amplada de la píldora indicadora dins de la tira de dies.
  const indicator = $derived.by(() => {
    const count = days.length;

    if (!count || !stripWidth) return { x: 0, width: 0 };

    const total = days.reduce((sum, day) => sum + day.count, 0) || 1;
    const usable = Math.max(0, stripWidth - (count - 1) * DAY_GAP);

    let index = days.findIndex((day) => day.key === currentDayKey);

    if (index < 0) index = 0;

    let x = 0;

    for (let i = 0; i < index; i++) {
      x += (days[i].count / total) * usable + DAY_GAP;
    }

    return { x, width: (days[index].count / total) * usable };
  });

  function buildDays(items, lang) {
    const groups = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const stamp = item?.valid_time ?? item?.validTime;
      const key = dayKey(stamp);
      const last = groups[groups.length - 1];

      if (last && last.key === key) {
        last.count += 1;
        last.endIndex = index;
        continue;
      }

      groups.push({
        key,
        startIndex: index,
        endIndex: index,
        count: 1,
        weekday: formatWeekdayShort(stamp, lang),
        dayNumber: key ? key.slice(8, 10) : "—",
        relative: relativeDayLabel(stamp, lang),
      });
    }

    return groups;
  }

  // Posició dins del dia actiu (0-100 %).
  function dayProgress(day) {
    if (!day?.count) return 0;

    const position = Number(selectedHour) - day.startIndex + 1;

    return Math.max(0, Math.min(100, (position / day.count) * 100));
  }
</script>

<div class="mb-2 flex items-center justify-between gap-2">
  <h2 class="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
    {translate("forecastTime", language)}
  </h2>

  <span class="text-[10px] text-slate-500">
    {forecast.length
      ? interpolate(translate("stepCounter", language), {
          n: Number(selectedHour) + 1,
          total: forecast.length,
        })
      : "—"}
  </span>
</div>

<div class="rounded-xl border border-white/10 bg-[#0b1118] p-2.5 xl:p-3">
  {#if compact}
    <!-- Capçalera comprimida: tot en una línia. -->
    <div class="flex items-center justify-between gap-2">
      <p class="flex min-w-0 items-baseline gap-1.5">
        <span class="text-[10px] uppercase tracking-wide text-slate-500">
          {weekdayShort}
        </span>

        <span class="truncate text-sm font-semibold text-slate-100">
          {dateShort}
        </span>

        <span class="text-sm font-semibold text-teal-200">{time}</span>
      </p>

      {#if relative}
        <span
          class="shrink-0 rounded-full bg-teal-300/10 px-1.5 py-px text-[10px] font-medium text-teal-200"
        >
          {relative}
        </span>
      {/if}
    </div>
  {:else}
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">
          {weekdayLong}
        </p>

        <p class="mt-0.5 text-base font-semibold leading-tight text-slate-100">
          {dayMonth}
          <span class="text-xs font-normal text-slate-500">{year}</span>
        </p>

        <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          {#if relative}
            <span
              class="rounded-full bg-teal-300/10 px-1.5 py-px font-medium text-teal-200"
            >
              {relative}
            </span>
          {/if}

          {#if offsetHours}
            <span class="text-slate-500">
              {interpolate(translate("offsetLabel", language), { h: offsetHours })}
            </span>
          {/if}
        </p>
      </div>

      <div class="shrink-0 text-right">
        <p class="text-2xl font-semibold leading-none text-teal-200">{time}</p>

        <p class="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
          {translate("localTime", language)}
        </p>
      </div>
    </div>
  {/if}

  <input
    type="range"
    min="0"
    max={totalHours}
    step="1"
    value={Number(selectedHour)}
    oninput={(event) => onSelectHour(Number(event.currentTarget.value))}
    disabled={!forecast.length}
    aria-label={translate("forecastHour", language)}
    aria-valuetext={fullLabel}
    class="time-slider mt-2 w-full xl:mt-3"
    style={`--progress:${progress}%`}
  />

  <div
    bind:clientWidth={stripWidth}
    class="relative mt-2 flex gap-1 xl:mt-2.5"
    role="group"
    aria-label={translate("dayStripLabel", language)}
  >
    <!-- Píldora indicadora: llisca cap al dia actiu. -->
    <span
      class="pointer-events-none absolute inset-y-0 rounded-lg border border-teal-300/50 bg-teal-300/10 transition-[transform,width] duration-200 ease-out"
      style={`transform: translateX(${indicator.x}px); width: ${indicator.width}px`}
      aria-hidden="true"
    ></span>

    {#each days as day (day.key)}
      <button
        type="button"
        class="day-chip relative z-10 flex min-w-0 flex-col items-center gap-0.5 rounded-lg border border-transparent px-1 py-1 text-center transition-colors hover:bg-white/5"
        style={`flex:${day.count} 1 0`}
        aria-label={interpolate(translate("selectDay", language), {
          day: `${day.weekday} ${day.dayNumber}`,
        })}
        aria-current={day.key === currentDayKey ? "true" : undefined}
        onclick={() => onSelectHour(day.startIndex)}
      >
        <span class="flex items-baseline gap-1">
          <span
            class={`text-[9px] uppercase tracking-wide ${
              day.key === currentDayKey ? "text-teal-200" : "text-slate-500"
            }`}
          >
            {day.weekday}
          </span>

          <span
            class={`text-xs font-semibold ${
              day.key === currentDayKey ? "text-slate-100" : "text-slate-400"
            }`}
          >
            {day.dayNumber}
          </span>
        </span>

        <span
          class={`text-[9px] leading-none ${
            day.relative ? "text-teal-300" : "text-transparent"
          } ${compact ? "hidden" : ""}`}
        >
          {day.relative ?? "·"}
        </span>

        <span class="mt-0.5 block h-0.5 w-full overflow-hidden rounded-full bg-white/10">
          <span
            class="block h-full rounded-full bg-teal-300 transition-[width] duration-200"
            style={`width:${
              day.key === currentDayKey ? dayProgress(day) : 0
            }%`}
          ></span>
        </span>
      </button>
    {/each}
  </div>

  <div class="mt-2 flex items-center gap-2 xl:mt-3">
    <button
      type="button"
      class="h-8 w-8 shrink-0 rounded-lg border border-white/10 text-slate-200 transition-colors
             duration-150 hover:border-white/25 hover:bg-white/5 active:scale-[0.95]
             disabled:opacity-40 disabled:hover:bg-transparent"
      onclick={() => onPrev()}
      disabled={!forecast.length || Number(selectedHour) === 0}
      aria-label={translate("previousHour", language)}>‹</button
    >

    <button
      type="button"
      class={`h-8 rounded-lg border border-teal-300/20 bg-teal-300/10 text-teal-200
              transition-colors duration-150 hover:border-teal-300/40 hover:bg-teal-300/20
              active:scale-[0.98] disabled:opacity-40
              ${compact ? "w-8 shrink-0" : "flex-1"}`}
      onclick={() => onTogglePlay()}
      disabled={forecast.length < 2}
      aria-label={isPlaying
        ? translate("pause", language)
        : translate("play", language)}
    >
      {compact
        ? isPlaying
          ? "⏸"
          : "▶"
        : isPlaying
          ? translate("pause", language)
          : translate("play", language)}
    </button>

    <button
      type="button"
      class="h-8 w-8 shrink-0 rounded-lg border border-white/10 text-slate-200 transition-colors
             duration-150 hover:border-white/25 hover:bg-white/5 active:scale-[0.95]
             disabled:opacity-40 disabled:hover:bg-transparent"
      onclick={() => onNext()}
      disabled={!forecast.length || Number(selectedHour) >= totalHours}
      aria-label={translate("nextHour", language)}>›</button
    >
  </div>
</div>

<style>
  .time-slider {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 20px;
    background: linear-gradient(
        to right,
        #67d9c1 0%,
        #67d9c1 var(--progress),
        #344250 var(--progress),
        #344250 100%
      )
      center / 100% 6px no-repeat;
    accent-color: #67d9c1;
    cursor: pointer;
  }

  .time-slider:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .time-slider:focus-visible {
    outline: 2px solid #67d9c1;
    outline-offset: 2px;
  }

  .time-slider::-webkit-slider-runnable-track {
    height: 6px;
    background: transparent;
  }

  .time-slider::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    margin-top: -6px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #67d9c1;
    border: 3px solid #17332f;
    box-shadow: 0 0 0 1px rgb(103 217 193 / 35%);
    cursor: pointer;
  }

  .time-slider::-moz-range-track {
    height: 6px;
    background: transparent;
    border: none;
  }

  .time-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #67d9c1;
    border: 2px solid #17332f;
    cursor: pointer;
  }
</style>
