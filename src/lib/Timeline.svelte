<script>
  import { translate, interpolate } from "../dictionary.js";
  import {
    formatWeekdayLong,
    formatWeekdayShort,
    formatDayMonth,
    formatDateShort,
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
  const DAY_GAP = 2;
  let stripWidth = $state(0);
  let stripScroll = $state(null);
  let dayButtons = $state([]);

  // En mòbil es mostren només uns quants dies per evitar que s'apretin.
  let mobile = $state(
    typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches,
  );

  $effect(() => {
    const query = window.matchMedia("(max-width: 639px)");

    mobile = query.matches;

    const onChange = () => (mobile = query.matches);

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
  const dateShort = $derived(formatDateShort(currentTime, language));
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

  // En mòbil només es mostren 3 dies alhora: la finestra avança amb
  // el dia seleccionat perquè les etiquetes no s'apretin.
  const visibleDays = $derived.by(() => {
    if (!mobile || days.length <= 3) return days;

    let index = days.findIndex((day) => day.key === currentDayKey);

    if (index < 0) index = 0;

    const windowSize = 3;
    let start = index - 1;
    let end = start + windowSize;

    if (start < 0) {
      start = 0;
      end = windowSize;
    }

    if (end > days.length) {
      end = days.length;
      start = Math.max(0, end - windowSize);
    }

    return days.slice(start, end);
  });

  // Manté el dia actiu visible quan la tira és scrollable.
  $effect(() => {
    const key = currentDayKey;
    const index = visibleDays.findIndex((day) => day.key === key);

    if (index < 0 || !stripScroll || !dayButtons[index]) return;

    const button = dayButtons[index];
    const container = stripScroll;
    const left = button.offsetLeft - container.clientWidth / 2 + button.clientWidth / 2;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    container.scrollTo({
      left: Math.max(0, left),
      behavior: reduced ? "auto" : "smooth",
    });
  });

  // Posició i amplada de la píldora indicadora dins de la tira de dies.
  const indicator = $derived.by(() => {
    const visible = visibleDays;
    const count = visible.length;

    if (!count || !stripWidth) return { x: 0, width: 0 };

    const total = visible.reduce((sum, day) => sum + day.count, 0) || 1;
    const usable = Math.max(0, stripWidth - (count - 1) * DAY_GAP);

    let index = visible.findIndex((day) => day.key === currentDayKey);

    if (index < 0) index = 0;

    let x = 0;

    for (let i = 0; i < index; i++) {
      x += (visible[i].count / total) * usable + DAY_GAP;
    }

    return { x, width: (visible[index].count / total) * usable };
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
        dayMonth: formatDayMonth(stamp, lang),
        dayNumber: key ? key.slice(8, 10) : "—",
        monthNumber: key ? key.slice(5, 7) : "",
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

<div class="timeline-bar">
  <!-- Lectura centrada a tota l'amplada de la pantalla -->
  <div class="flex w-full basis-full items-center justify-center gap-2 pb-1.5 pt-0.5 text-center">
    <p class="text-base font-semibold leading-none tabular-nums text-teal-200 sm:text-lg">
      {time}
    </p>
    <p class="text-[11px] text-slate-300">
      <span class="capitalize text-slate-400">{weekdayLong}</span>
      <span>{dateShort}</span>
    </p>
    {#if relative}
      <span class="rounded-full bg-teal-300/12 px-1.5 py-px text-[10px] font-medium text-teal-200">
        {relative}
      </span>
    {/if}
  </div>

  <!-- Controls de reproducció -->
  <div class="order-3 flex w-full shrink-0 items-center justify-center gap-3 pb-1 sm:order-none sm:w-auto sm:justify-start sm:gap-1.5 sm:pb-0">
    <button
      type="button"
      class="timeline-btn"
      onclick={() => onPrev()}
      disabled={!forecast.length || Number(selectedHour) === 0}
      aria-label={translate("previousHour", language)}>‹</button
    >

    <button
      type="button"
      class="timeline-btn timeline-btn--play"
      onclick={() => onTogglePlay()}
      disabled={forecast.length < 2}
      aria-label={isPlaying
        ? translate("pause", language)
        : translate("play", language)}
    >
      {#if isPlaying}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="5" y="4" width="4" height="16" rx="1"></rect>
          <rect x="15" y="4" width="4" height="16" rx="1"></rect>
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 4.5v15l12-7.5z"></path>
        </svg>
      {/if}
    </button>

    <button
      type="button"
      class="timeline-btn"
      onclick={() => onNext()}
      disabled={!forecast.length || Number(selectedHour) >= totalHours}
      aria-label={translate("nextHour", language)}>›</button
    >
  </div>

  <!-- Pista temporal: dies + slider -->
  <div class="order-2 min-w-0 w-full sm:order-none sm:w-auto sm:flex-1">

    <div
      bind:this={stripScroll}
      class="strip-scroll"
      role="group"
      aria-label={translate("dayStripLabel", language)}
    >
      <div
        bind:clientWidth={stripWidth}
        class="relative flex min-w-full"
        style={`gap:${DAY_GAP}px`}
      >
        <!-- Píldora indicadora: llisca cap al dia actiu. -->
        <span
          class="pointer-events-none absolute inset-y-0 rounded-md border border-teal-300/35 bg-teal-300/8 transition-[transform,width] duration-200 ease-out"
          style={`transform: translateX(${indicator.x}px); width: ${indicator.width}px`}
          aria-hidden="true"
        ></span>

        {#each visibleDays as day, i (day.key)}
          <button
            bind:this={dayButtons[i]}
            type="button"
            class="day-chip relative z-10 flex min-w-[3.25rem] flex-col items-center justify-center rounded-md px-0.5 py-1 text-center transition-colors hover:bg-white/5 sm:min-w-0"
            style={`flex:${day.count} 1 0`}
            aria-label={interpolate(translate("selectDay", language), {
              day: `${day.weekday} ${day.dayNumber}`,
            })}
            aria-current={day.key === currentDayKey ? "true" : undefined}
            onclick={() => onSelectHour(day.startIndex)}
          >
            <span class="flex w-full items-center justify-center gap-1 overflow-hidden">
              <span
                class={`truncate text-[10px] font-medium uppercase tracking-wide ${
                  day.key === currentDayKey ? "text-teal-200" : "text-slate-400"
                }`}
              >
                {day.weekday}
              </span>
              <span
                class={`shrink-0 text-[11px] font-semibold tabular-nums ${
                  day.key === currentDayKey ? "text-slate-100" : "text-slate-300"
                }`}
              >
                {day.dayNumber}
              </span>
            </span>

            <span class="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-white/8">
              <span
                class="block h-full rounded-full bg-teal-300/90 transition-[width] duration-200"
                style={`width:${day.key === currentDayKey ? dayProgress(day) : 0}%`}
              ></span>
            </span>
          </button>

          {#if i < visibleDays.length - 1}
            <span class="pointer-events-none self-stretch my-1 w-px shrink-0 bg-white/10" aria-hidden="true"></span>
          {/if}
        {/each}
      </div>
    </div>

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
      class="time-slider mt-1 w-full"
      style={`--progress:${progress}%`}
    />
  </div>
</div>

<style>
  .timeline-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid rgb(255 255 255 / 0.08);
    background: linear-gradient(180deg, rgb(16 24 33 / 0.94), rgb(11 17 24 / 0.98));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  @media (min-width: 640px) {
    .timeline-bar {
      gap: 1rem;
      padding: 0.625rem 1rem calc(0.625rem + env(safe-area-inset-bottom, 0px));
    }
  }

  .timeline-btn {
    display: inline-flex;
    height: 2.25rem;
    width: 2.25rem;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: #cbd5e1;
    font-size: 1.25rem;
    line-height: 1;
    transition:
      background-color 150ms var(--ease-out),
      border-color 150ms var(--ease-out),
      color 150ms var(--ease-out),
      transform 150ms var(--ease-out);
  }

  .timeline-btn:hover:not(:disabled) {
    border-color: rgb(255 255 255 / 0.1);
    background: rgb(255 255 255 / 0.05);
    color: #f1f5f9;
  }

  .timeline-btn:active:not(:disabled) {
    transform: scale(0.94);
  }

  .timeline-btn:disabled {
    opacity: 0.3;
  }

  .timeline-btn--play {
    height: 2.75rem;
    width: 2.75rem;
    border-color: rgb(103 217 193 / 0.3);
    background: rgb(103 217 193 / 0.14);
    color: #99f6e4;
  }

  .timeline-btn--play:hover:not(:disabled) {
    border-color: rgb(103 217 193 / 0.5);
    background: rgb(103 217 193 / 0.22);
  }

  .strip-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .strip-scroll::-webkit-scrollbar {
    display: none;
  }

  .day-chip {
    min-width: 0;
  }

  .time-slider {
    appearance: none;
    -webkit-appearance: none;
    display: block;
    width: 100%;
    height: 18px;
    background: linear-gradient(
        to right,
        #67d9c1 0%,
        #67d9c1 var(--progress),
        #344250 var(--progress),
        #344250 100%
      )
      center / 100% 4px no-repeat;
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
    border-radius: 4px;
  }

  .time-slider::-webkit-slider-runnable-track {
    height: 4px;
    background: transparent;
  }

  .time-slider::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    margin-top: -5px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #67d9c1;
    border: 2px solid #17332f;
    box-shadow: 0 0 0 1px rgb(103 217 193 / 35%);
    cursor: pointer;
  }

  .time-slider::-moz-range-track {
    height: 4px;
    background: transparent;
    border: none;
  }

  .time-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #67d9c1;
    border: 2px solid #17332f;
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    .timeline-bar,
    .timeline-btn,
    .day-chip span {
      transition: none;
    }

    .strip-scroll {
      scroll-behavior: auto;
    }
  }
</style>