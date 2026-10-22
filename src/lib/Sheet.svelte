<script>
  import { cubicOut } from "svelte/easing";

  // Full inferior per a pantalles petites. El contingut el posa el pare
  // (children); el títol serveix de capçalera visible i d'aria-label.
  let {
    open = $bindable(false),
    title = "",
    closeLabel = "Close",
    onClose = () => {},
    children,
  } = $props();

  let closeButton = $state(null);
  let reducedMotion = $state(false);

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

  function close() {
    open = false;
    onClose();
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
    class="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-hidden
           rounded-t-2xl border-t border-white/15 bg-[#101821] shadow-2xl xl:hidden"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    transition:fly={{
      y: reducedMotion ? 0 : 480,
      duration: reducedMotion ? 140 : 250,
      easing: cubicOut,
    }}
  >
    <div class="flex justify-center pt-2.5">
      <span class="h-1 w-10 rounded-full bg-white/20"></span>
    </div>

    <div class="flex items-center justify-between gap-3 px-4 pb-2 pt-2">
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

    <div class="max-h-[62dvh] overflow-y-auto px-4 pb-6">
      {@render children?.()}
    </div>
  </div>
{/if}
