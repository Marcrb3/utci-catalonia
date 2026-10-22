<script>
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { verticalResize } from "./resize.js";

  // Full inferior per a pantalles petites. El contingut el posa el pare
  // (children); el títol serveix de capçalera visible i d'aria-label.
  let {
    open = $bindable(false),
    title = "",
    closeLabel = "Close",
    resizeLabel = "Resize panel",
    onClose = () => {},
    children,
  } = $props();

  const MIN_HEIGHT = 160;
  const MAX_HEIGHT = 88; // dvh

  let closeButton = $state(null);
  let panelElement = $state(null);
  let reducedMotion = $state(false);

  // Alçada del full: null = la que doni el contingut.
  let sheetHeight = $state(null);
  let currentHeight = $state(0);
  let expanded = $state(false);
  let dragged = false;
  let startHeight = 0;

  $effect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    reducedMotion = query.matches;

    const onChange = () => (reducedMotion = query.matches);

    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
  });

  // El focus entra al full i en surt cap al botó que l'ha obert.
  $effect(() => {
    if (!open) return;

    closeButton?.focus();

    const onKeydown = (event) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeydown);

    return () => window.removeEventListener("keydown", onKeydown);
  });

  // En obrir el full es torna a l'alçada natural.
  $effect(() => {
    if (open) {
      sheetHeight = null;
      expanded = false;
    }
  });

  function close() {
    open = false;
    onClose();
  }

  function maxHeight() {
    if (typeof window === "undefined") return 800;

    return Math.round(window.innerHeight * (MAX_HEIGHT / 100));
  }

  function clampHeight(value) {
    return Math.max(MIN_HEIGHT, Math.min(maxHeight(), value));
  }

  function setHeight(value) {
    sheetHeight = clampHeight(value);
    currentHeight = sheetHeight;
  }

  // L'objecte es crea una sola vegada: així l'acció no es torna a
  // muntar en cada render (perdre el pointer capture a mig drag).
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

  // Un toc al tirador desplega o recull el full.
  function toggleExpanded() {
    // Si s'acaba de fer un drag, el clic no ha de fer res.
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

  function handleResizeKey(event) {
    const step = event.shiftKey ? 80 : 40;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHeight((currentHeight || MIN_HEIGHT) + step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHeight((currentHeight || MIN_HEIGHT) - step);
    }
  }
</script>

{#if open}
  <button
    type="button"
    tabindex="-1"
    class="fixed inset-0 z-40 cursor-default bg-black/55 xl:hidden"
    aria-label={title}
    onclick={close}
    transition:fade={{ duration: reducedMotion ? 120 : 180 }}
  ></button>

  <div
    bind:this={panelElement}
    class="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden
           rounded-t-2xl border-t border-white/15 bg-[#101821] shadow-2xl xl:hidden"
    style={sheetHeight ? `height:${sheetHeight}px` : ""}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    transition:fly={{
      y: reducedMotion ? 0 : 480,
      duration: reducedMotion ? 140 : 250,
      easing: cubicOut,
    }}
  >
    <!-- Maneta: arrossegar per ampliar o reduir el full, tocar per
         desplegar-lo o recollir-lo. -->
    <button
      type="button"
      class="flex w-full shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing"
      aria-label={resizeLabel}
      aria-expanded={expanded}
      onclick={toggleExpanded}
      onkeydown={handleResizeKey}
      use:verticalResize={dragOptions}
    >
      <span class="h-1 w-10 rounded-full bg-white/25"></span>
    </button>

    <div class="flex shrink-0 items-center justify-between gap-3 px-4 pb-2">
      <h2
        class="text-[11px] font-semibold uppercase tracking-widest text-slate-400"
      >
        {title}
      </h2>

      <button
        type="button"
        bind:this={closeButton}
        class="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:text-slate-100"
        aria-label={closeLabel}
        onclick={close}
      >
        ✕
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      {@render children?.()}
    </div>
  </div>
{/if}
