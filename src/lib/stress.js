// Helpers per a la detecció dels períodes amb estrès tèrmic.
//
// La zona de confort de l'UTCI (rampa "Sense estrès tèrmic") és el rang
// entre 9 °C i 26 °C. Qualsevol valor fora d'aquest interval indica estrès
// (fred extrema o calor), i l'intensitat (de la lleu a l'extrema) es treu del
// valor en si: aquests helpers només troben els brins consecutius amb
// estrès, de fins que es surt de la zona de confort.
export const COMFORT_MIN = 9;
export const COMFORT_MAX = 26;

export function isThermalStress(value) {
  const v = Number(value);
  return Number.isFinite(v) && (v < COMFORT_MIN || v > COMFORT_MAX);
}

// Calcula els períodes consecutius amb estrès a partir d'una sèrie de punts
// ({ index, time, value }). Un període: { from, to, peak, peakTime, peakIsHeat }.
export function computeStressPeriods(points = []) {
  const runs = [];
  let run = null;

  for (const point of points) {
    if (!point) continue;

    const value = Number(point.value);

    if (isThermalStress(value)) {
      const isHeat = value > COMFORT_MAX;

      if (!run) {
        run = {
          from: point.index,
          to: point.index,
          peak: value,
          peakTime: point.time,
          peakIsHeat: isHeat,
        };
      } else {
        run.to = point.index;
        const moreSevere = isHeat ? value > run.peak : value < run.peak;
        if (moreSevere) {
          run.peak = value;
          run.peakTime = point.time;
        }
      }
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }

  if (run) runs.push(run);

  return runs;
}
