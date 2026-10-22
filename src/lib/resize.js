// Arrossegar verticalment per redimensionar un panell inferior.
//
// L'acció només s'encarrega del llògic del punter (posició inicial,
// delta i final). El component decideix què fer amb el delta: alçada
// mínima i màxima, transició, etc.
export function verticalResize(node, { onStart, onDelta, onEnd } = {}) {
  let startY = 0;
  let active = false;

  const onPointerDown = (event) => {
    // Només el botó principal.
    if (event.button !== undefined && event.button !== 0) return;

    active = true;
    startY = event.clientY;

    // Captura el punter per continuar el drag fora de la maneta.
    node.setPointerCapture?.(event.pointerId);

    onStart?.(event);
  };

  const onPointerMove = (event) => {
    if (!active) return;

    // Cal `touch-action: none` a la maneta perquè el navegador no
    // interpreti el moviment com un desplaçament de la pàgina.
    event.preventDefault();

    onDelta?.(startY - event.clientY, event);
  };

  const onPointerUp = (event) => {
    if (!active) return;

    active = false;

    node.releasePointerCapture?.(event.pointerId);

    onEnd?.(event);
  };

  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("pointermove", onPointerMove);
  node.addEventListener("pointerup", onPointerUp);
  node.addEventListener("pointercancel", onPointerUp);

  return {
    destroy() {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerUp);
    },
  };
}
