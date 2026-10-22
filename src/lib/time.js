// Formatació de dates i hores.
// Totes les hores es mostren en hora local d'Espanya (Europe/Madrid),
// igual que feia l'aplicació abans d'extreure aquestes funcions.
import { translate } from "../dictionary.js";

const TIME_ZONE = "Europe/Madrid";

const LOCALES = { ca: "ca-ES", en: "en-GB" };

function localeOf(language) {
  return LOCALES[language] ?? LOCALES.ca;
}

function toDate(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function format(value, language, options) {
  const date = toDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat(localeOf(language), {
    timeZone: TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatWeekdayLong(value, language) {
  return format(value, language, { weekday: "long" });
}

export function formatWeekdayShort(value, language) {
  // En català Intl retorna "dj."; per a les xips compacts volem "dj".
  return format(value, language, { weekday: "short" }).replace(/\.$/, "");
}

export function formatDayMonth(value, language) {
  return format(value, language, { day: "numeric", month: "long" });
}

export function formatYear(value, language) {
  return format(value, language, { year: "numeric" });
}

export function formatDateShort(value, language) {
  return format(value, language, { day: "2-digit", month: "2-digit" });
}

export function formatTime(value, language) {
  return format(value, language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function formatShortDateTime(value, language) {
  return format(value, language, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// Data completa per a lectors de pantalla (aria-valuetext).
export function formatFullDate(value, language) {
  const date = toDate(value);

  if (!date) return "—";

  const weekday = formatWeekdayLong(date, language);
  const dayMonth = formatDayMonth(date, language);
  const year = formatYear(date, language);
  const time = formatTime(date, language);

  return language === "ca"
    ? `${weekday} ${dayMonth} de ${year}, ${time}`
    : `${weekday} ${dayMonth} ${year}, ${time}`;
}

// Clau del dia natural (YYYY-MM-DD) en hora local.
export function dayKey(value) {
  const date = toDate(value);

  if (!date) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).formatToParts(date);

  const pick = (type) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function shiftDayKey(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

// "Avui" / "Demà" / "Ahir" segons el dia natural local.
export function relativeDayLabel(value, language) {
  const key = dayKey(value);

  if (!key) return null;

  const today = dayKey(new Date());

  if (!today) return null;
  if (key === today) return translate("today", language);
  if (key === shiftDayKey(today, 1)) return translate("tomorrow", language);
  if (key === shiftDayKey(today, -1)) return translate("yesterday", language);

  return null;
}

// Diferència en hores entre dos instants (pot ser fraccionària).
export function hoursBetween(from, to) {
  const a = toDate(from);
  const b = toDate(to);

  if (!a || !b) return null;

  return Math.round(((b.getTime() - a.getTime()) / 3600000) * 10) / 10;
}

// Índex del primer pas de previsió que es mostra.
//
// Es conserva el darrer pas anterior a «ara» (per tenir una referència
// recent del que ja ha passat) i tot el que ve després. Si aquell pas
// caigués en un dia anterior, es fa servir el primer pas del dia d'avui:
// mai es mostren previsions de dies passats.
export function firstVisibleIndex(items, now = new Date()) {
  if (!items.length) return 0;

  const reference = toDate(now) ?? new Date();
  const times = items.map((item) =>
    toDate(item?.valid_time ?? item?.validTime),
  );

  let next = times.findIndex(
    (time) => time && time.getTime() >= reference.getTime(),
  );

  // Cap pas futur: el manifest ja és tot passat.
  if (next === -1) next = items.length;

  const previous = next - 1;

  if (previous >= 0) {
    const time = times[previous];

    // El pas anterior només es mostra si és del dia d'avui.
    if (time && dayKey(time) === dayKey(reference)) return previous;

    // Sense passos futurs tampoc no hi ha res millor que l'últim disponible.
    if (next >= items.length) return items.length - 1;
  }

  return Math.max(0, next);
}
