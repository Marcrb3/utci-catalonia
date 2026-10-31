// Escala de classes UTCI i mapeig dels textos al diccionari d'i18n.
// Els valors numèrics (min/max) defineixen la classificació; el text
// (label/range) és només de display i es tradueix amb labelForClass/rangeForClass.
import { translate } from "../dictionary.js";

export const classes = [
  {
    c: "#542788",
    label: "Fred extrem",
    range: "< −40 °C",
    min: -Infinity,
    max: -40,
  },
  {
    c: "#4169b1",
    label: "Fred molt fort",
    range: "−40 a −27 °C",
    min: -40,
    max: -27,
  },
  {
    c: "#56b9ce",
    label: "Fred fort",
    range: "−27 a −13 °C",
    min: -27,
    max: -13,
  },
  {
    c: "#8dd3c7",
    label: "Fred moderat",
    range: "−13 a 0 °C",
    min: -13,
    max: 0,
  },
  { c: "#b7d85b", label: "Fred lleu", range: "0 a 9 °C", min: 0, max: 9 },
  {
    c: "#62b77a",
    label: "Sense estrès tèrmic",
    range: "9 a 26 °C",
    min: 9,
    max: 26,
  },
  {
    c: "#f1d34f",
    label: "Calor moderada",
    range: "26 a 32 °C",
    min: 26,
    max: 32,
  },
  {
    c: "#ec8744",
    label: "Calor forta",
    range: "32 a 38 °C",
    min: 32,
    max: 38,
  },
  {
    c: "#d94d4d",
    label: "Calor molt forta",
    range: "38 a 46 °C",
    min: 38,
    max: 46,
  },
  {
    c: "#8d202b",
    label: "Calor extrema",
    range: "> 46 °C",
    min: 46,
    max: Infinity,
  },
];

export const classLabels = {
  "Fred extrem": "extremeCold",
  "Fred molt fort": "veryStrongCold",
  "Fred fort": "strongCold",
  "Fred moderat": "moderateCold",
  "Fred lleu": "slightCold",
  "Sense estrès tèrmic": "noHeatStress",
  "Calor moderada": "moderateHeat",
  "Calor forta": "strongHeat",
  "Calor molt forta": "veryStrongHeat",
  "Calor extrema": "extremeHeat",
};

export const rangeKeys = {
  "< −40 °C": "rangeBelow40",
  "−40 a −27 °C": "range40to27",
  "−27 a −13 °C": "range27to13",
  "−13 a 0 °C": "range13to0",
  "0 a 9 °C": "range0to9",
  "9 a 26 °C": "range9to26",
  "26 a 32 °C": "range26to32",
  "32 a 38 °C": "range32to38",
  "38 a 46 °C": "range38to46",
  "> 46 °C": "rangeAbove46",
};

export function labelForClass(item, language) {
  if (!item) return "";

  return translate(classLabels[item.label] ?? item.label, language);
}

export function rangeForClass(item, language) {
  if (!item) return "";

  return translate(rangeKeys[item.range] ?? item.range, language);
}

// Classe UTCI corresponent a un valor.
export function getClass(value) {
  return (
    classes.find(
      (item, i) =>
        value >= item.min && (value < item.max || i === classes.length - 1),
    ) ?? classes[0]
  );
}

// --- Rampa contínua ---------------------------------------------------
// Mateixa paleta que les classes, interpolada linealment entre els
// punts mitjans de cada interval: cada color es veu al centre de la seva
// classe i les transicions passen pels límits de classe. Els intervals
// infinits es queden al seu límit, de manera que els valors per fora del
// domini es clampen al color de l'extrem.

function midpoint(item) {
  const min = Number.isFinite(item.min) ? item.min : null;
  const max = Number.isFinite(item.max) ? item.max : null;

  if (min === null) return max; // classe més freda
  if (max === null) return min; // classe més calenta

  return (min + max) / 2;
}

export const rampStops = classes.map((item) => ({
  value: midpoint(item),
  c: item.c,
}));

export const RAMP_MIN = rampStops[0].value; // −40
export const RAMP_MAX = rampStops[rampStops.length - 1].value; // 46

// Marques de la llegenda contínua: límits de classe rellevants, sense
// saturar l'amplada del panell.
export const rampTicks = [-40, -13, 0, 9, 26, 38, 46];

export function rampTickPercent(value) {
  return ((value - RAMP_MIN) / (RAMP_MAX - RAMP_MIN)) * 100;
}

function mixHex(from, to, t) {
  const channel = (hex, i) =>
    parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

  const mixed = [0, 1, 2].map((i) =>
    Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t),
  );

  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Color de la rampa contínua per a un valor (amb clamp al domini).
export function rampColorForValue(value) {
  if (!Number.isFinite(value)) return "#64748b";

  const v = Math.min(RAMP_MAX, Math.max(RAMP_MIN, value));

  let from = rampStops[0];
  let to = rampStops[rampStops.length - 1];

  for (let i = 0; i < rampStops.length - 1; i++) {
    if (v >= rampStops[i].value && v <= rampStops[i + 1].value) {
      from = rampStops[i];
      to = rampStops[i + 1];
      break;
    }
  }

  const span = to.value - from.value;
  const t = span === 0 ? 0 : (v - from.value) / span;

  return mixHex(from.c, to.c, t);
}

// Degradat CSS de la rampa, amb els mateixos stops que rampColorForValue.
export function rampGradientCss() {
  const stops = rampStops
    .map((stop) => `${stop.c} ${rampTickPercent(stop.value).toFixed(2)}%`)
    .join(", ");

  return `linear-gradient(90deg, ${stops})`;
}

// Color de la gràfica: per defecte la classe (mode categoritzat);
// amb displayMode "continuous", la rampa.
export function colorForValue(value, displayMode = "utci") {
  if (displayMode === "continuous") return rampColorForValue(value);

  if (!Number.isFinite(value)) return "#64748b";

  return getClass(value).c;
}
