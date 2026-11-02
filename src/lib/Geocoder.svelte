<script>
  import { onDestroy } from "svelte";
  import { translate } from "../dictionary.js";

  let {
    language = "ca",
    // Centre del mapa actual: prioritza els resultats propers sense que el
    // component hagi de dependre de la reactivitat del mapa.
    getFocus = () => null,
    onSelect = () => {},
  } = $props();

  // Geocodificador ICGC (GeoJSON): https://eines.icgc.cat/geocodificador/api-docs/
  const ENDPOINT = "https://eines.icgc.cat/geocodificador/autocompletar";
  const MIN_QUERY_LENGTH = 2;
  const DEBOUNCE_MS = 250;
  const RESULT_SIZE = 5;

  let inputEl = $state(null);
  let listEl = $state(null);
  let query = $state("");
  let results = $state([]);
  let open = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let activeIndex = $state(-1);

  let searchId = 0;
  let searchedText = "";
  let debounceTimer;
  let controller = null;
  // El blur del camp no ha de tancar la llista si el punter hi és a dins:
  // el clic de selecció arriba després del blur del camp.
  let pointerInsideList = false;

  onDestroy(() => {
    clearTimeout(debounceTimer);
    searchId += 1;
    controller?.abort();
  });

  function trimmed(value = query) {
    return value.trim();
  }

  function closeList() {
    open = false;
    activeIndex = -1;
  }

  function resetSearch() {
    searchId += 1;
    controller?.abort();
    controller = null;
    clearTimeout(debounceTimer);
    results = [];
    failed = false;
    loading = false;
    closeList();
  }

  async function runSearch(text) {
    const id = ++searchId;
    searchedText = text;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    loading = true;
    failed = false;

    try {
      const params = new URLSearchParams({ text, size: String(RESULT_SIZE) });
      const focus = getFocus();

      if (focus && Number.isFinite(focus.lat) && Number.isFinite(focus.lng)) {
        params.set("focus.point.lat", String(focus.lat));
        params.set("focus.point.lon", String(focus.lng));
      }

      const response = await fetch(`${ENDPOINT}?${params}`, {
        signal: current.signal,
      });

      if (!response.ok) {
        throw new Error(`Geocodificador (${response.status})`);
      }

      const data = await response.json();

      // Una resposta antiga no ha de substituir una de més recent.
      if (id !== searchId) return;

      results = (Array.isArray(data?.features) ? data.features : [])
        .map((feature) => {
          const coordinates = feature?.geometry?.coordinates;
          const properties = feature?.properties;

          if (!Array.isArray(coordinates) || !properties) return null;

          const [lng, lat] = coordinates;
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

          const title = properties.nom || properties.etiqueta;
          if (!title) return null;

          const place = [properties.municipi, properties.comarca]
            .filter(Boolean)
            .join(", ");

          return {
            lng,
            lat,
            layer: properties.layer ?? "",
            title,
            subtitle: place || properties.etiqueta || "",
          };
        })
        .filter(Boolean);

      loading = false;

      // No s'obre la llista si el camp ha perdut el focus (la resposta
      // arriba quan l'usuari ja ha marxat); es reobrirà en tornar-hi.
      if (document.activeElement === inputEl || pointerInsideList) {
        open = true;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (id !== searchId) return;

      results = [];
      failed = true;
      loading = false;
      searchedText = "";
      open = document.activeElement === inputEl;
    }
  }

  function handleInput(event) {
    const text = trimmed(event.currentTarget.value);

    if (text.length < MIN_QUERY_LENGTH) {
      resetSearch();
      return;
    }

    clearTimeout(debounceTimer);
    loading = true;
    debounceTimer = setTimeout(() => runSearch(text), DEBOUNCE_MS);
  }

  function handleFocus() {
    if (trimmed().length >= MIN_QUERY_LENGTH && (results.length || failed)) {
      open = true;
    }
  }

  function handleBlur() {
    if (pointerInsideList) return;
    closeList();
  }

  function handleKeydown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // Sense llista oberta les fletxes mouen el cursor del text.
      if (!open || !results.length) return;

      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      let next = activeIndex + delta;

      if (next < 0) next = results.length - 1;
      if (next >= results.length) next = 0;

      activeIndex = next;
      ensureVisible(next);
      return;
    }

    if (event.key === "Enter") {
      const text = trimmed(event.currentTarget.value);

      if (open && results.length) {
        event.preventDefault();
        selectResult(results[activeIndex >= 0 ? activeIndex : 0]);
        return;
      }

      // Sense llista: força la cerca pendent (el debounce encara no ha
      // disparat) sense reconsultar si ja tenim resultat per a aquest text.
      if (text.length >= MIN_QUERY_LENGTH && text !== searchedText) {
        event.preventDefault();
        clearTimeout(debounceTimer);
        runSearch(text);
      }
      return;
    }

    if (event.key === "Escape") {
      if (!open) return; // Deixa que l'Escape global tanqui el panell del punt.

      event.preventDefault();
      // No propaguem: amb la llista oberta l'Escape només la tanca.
      event.stopPropagation();
      closeList();
    }
  }

  function selectResult(result) {
    clearTimeout(debounceTimer);
    searchId += 1;
    controller?.abort();
    loading = false;
    failed = false;
    results = [];
    query = result.title;
    closeList();
    // Tanca el teclat virtual al mòbil: el panell del punt queda a la vista.
    inputEl?.blur();
    onSelect(result);
  }

  function ensureVisible(index) {
    const list = listEl;
    const option = list?.children[index];

    if (!list || !option) return;

    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;

    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }

  function handleListPointerEnter() {
    pointerInsideList = true;
  }

  function handleListPointerLeave() {
    pointerInsideList = false;
    // Si el camp ja no té el focus i el punter marxa, tanquem la llista.
    if (document.activeElement !== inputEl) closeList();
  }
</script>

<div class="relative">
  <span
    class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500"
    aria-hidden="true"
  >
    {#if loading}
      <span
        class="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-teal-300 motion-reduce:animate-none"
      ></span>
    {:else}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    {/if}
  </span>

  <input
    bind:this={inputEl}
    bind:value={query}
    type="search"
    role="combobox"
    aria-expanded={open}
    aria-controls="geocoder-listbox"
    aria-activedescendant={activeIndex >= 0
      ? `geocoder-option-${activeIndex}`
      : null}
    aria-autocomplete="list"
    aria-label={translate("searchPlaceholder", language)}
    placeholder={translate("searchPlaceholder", language)}
    autocomplete="off"
    autocorrect="off"
    spellcheck="false"
    enterkeyhint="search"
    class="h-10 w-full rounded-lg border border-white/10 bg-[#0b1118] pl-9 pr-3 text-base text-slate-100 outline-none transition-colors duration-150 placeholder:text-slate-500 hover:border-white/20 focus:border-teal-300/40 focus:ring-2 focus:ring-teal-300/20"
    oninput={handleInput}
    onkeydown={handleKeydown}
    onfocus={handleFocus}
    onblur={handleBlur}
  />

  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <ul
      bind:this={listEl}
      id="geocoder-listbox"
      role="listbox"
      aria-label={translate("searchPlaceholder", language)}
      class="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[#101821] py-1 shadow-xl shadow-black/40"
      onpointerenter={handleListPointerEnter}
      onpointerleave={handleListPointerLeave}
    >
      {#if !results.length}
        <li
          role="option"
          aria-selected="false"
          aria-disabled="true"
          class="px-3 py-2 text-sm text-slate-500"
        >
          {failed
            ? translate("searchError", language)
            : loading
              ? translate("searchLoading", language)
              : translate("searchNoResults", language)}
        </li>
      {:else}
        {#each results as result, index (index)}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- El teclat es maneja al camp (patró combobox: fletxes i Enter
               amb aria-activedescendant); les opcions només es clicen. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            id={`geocoder-option-${index}`}
            role="option"
            aria-selected={activeIndex === index}
            class={`cursor-pointer px-3 py-2 transition-colors duration-100 ${
              activeIndex === index
                ? "bg-teal-300/10 text-teal-100"
                : "text-slate-200 hover:bg-white/5"
            }`}
            onmousedown={(event) => event.preventDefault()}
            onpointerenter={() => (activeIndex = index)}
            onclick={() => selectResult(result)}
          >
            <span class="block truncate text-sm font-medium"
              >{result.title}</span
            >
            {#if result.subtitle}
              <span class="block truncate text-xs text-slate-500"
                >{result.subtitle}</span
              >
            {/if}
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
