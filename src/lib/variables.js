// Variables del diagnòstic que expliquen d'on surt el valor UTCI.
//
// Les dades arriben com a objecte {nom_de_banda: valor} des d'App.svelte.
// Les agrupem segons el paper que tenen en el procés per fer més llegible
// d'on surt el valor UTCI final. Les comparteixen el panell del punt
// (PointPanel.svelte) i la pàgina de detall (ForecastDetail.svelte).

export const ORIGINAL_ROWS = [
  { key: "t2m_raw", labelKey: "varT2mRaw", digits: 1, unit: "°C" },
  {
    key: "corr_total",
    labelKey: "varCorrTotal",
    digits: 1,
    unit: "°C",
    signed: true,
  },
];

export const USED_ROWS = [
  { key: "t2m_used", labelKey: "varT2mUsed", digits: 1, unit: "°C" },
  { key: "wind", labelKey: "varWind", digits: 1, unit: "m/s" },
  { key: "rh", labelKey: "varRh", digits: 0, unit: "%" },
  { key: "mrt", labelKey: "varMrt", digits: 1, unit: "°C" },
  { key: "shadow", labelKey: "varShadow", percent: true },
];

export function formatVariable(row, raw) {
  // null vol dir "banda sense valor" (fora del domini o pendent).
  if (raw == null) return "—";

  const value = Number(raw);

  if (!Number.isFinite(value)) return "—";

  // L'ombra es publica com a fracció del píxel amb ombra.
  if (row.percent) return `${Math.round(value * 100)} %`;

  let sign = "";

  if (row.signed && value > 0) sign = "+";
  else if (value < 0) sign = "−";

  return `${sign}${Math.abs(value).toFixed(row.digits)} ${row.unit}`;
}

export function formatDifference(raw) {
  if (raw == null || !Number.isFinite(Number(raw))) return "—";

  const value = Number(raw);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";

  return `${sign}${Math.abs(value).toFixed(1)} °C`;
}

export function numericValue(raw) {
  if (raw == null || !Number.isFinite(Number(raw))) return null;

  return Number(raw);
}

// Són diferències descriptives entre valors observats. No són una
// descomposició causal de l'UTCI, que es calcula amb una funció no lineal.
export function airTemperatureDifference(variables) {
  const used = numericValue(variables?.t2m_used);
  const raw = numericValue(variables?.t2m_raw);

  return used !== null && raw !== null ? used - raw : null;
}

export function utciAirTemperatureDifference(value, variables) {
  const used = numericValue(variables?.t2m_used);

  if (value?.value == null || used === null) return null;

  return Number(value.value) - used;
}
