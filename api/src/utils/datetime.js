// Fechas "locales de la clínica" (sin zona horaria).
//
// Formato de intercambio: "YYYY-MM-DDTHH:mm:ss" (hora de pared, sin offset).
// Internamente se trabaja con milisegundos calculados con Date.UTC() solo como
// calendario matemático: así el resultado NO depende de la zona horaria del servidor.

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MINUTE = 60_000;
export const DAY = 86_400_000;

const pad = (n, width = 2) => String(n).padStart(width, '0');

function build(y, mo, d, h, mi, s) {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(ms);
  // Rechaza fechas inexistentes como 2026-02-30
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

/** "2026-10-05T09:30:00" | "2026-10-05 09:30" -> ms, o null si es inválida. */
export function parseDateTime(value) {
  if (typeof value !== 'string') return null;
  const m = DATETIME_RE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  return build(y, mo, d, h, mi, s);
}

/** "2026-10-05" -> ms de las 00:00 de ese día, o null. */
export function parseDate(value) {
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  return build(y, mo, d, 0, 0, 0);
}

/** Acepta fecha ("2026-10-05") o fecha y hora. Útil para filtros de rango. */
export const parseDateOrDateTime = (value) => parseDate(value) ?? parseDateTime(value);

export function formatDateTime(ms) {
  const d = new Date(ms);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

export const formatDate = (ms) => formatDateTime(ms).slice(0, 10);

/** 0 = domingo ... 6 = sábado (igual que la columna weekday de MySQL en este proyecto). */
export const weekdayOf = (ms) => new Date(ms).getUTCDay();

/** Minutos transcurridos desde las 00:00 del día de `ms`. */
export const minutesOfDay = (ms) => {
  const d = new Date(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/** Medianoche del día de `ms`. */
export const startOfDay = (ms) => Math.floor(ms / DAY) * DAY;

/** "08:30" | "08:30:00" -> 510 */
export function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

/** 510 -> "08:30" */
export const minutesToTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** "Ahora" en la zona horaria de la clínica, expresado en el mismo formato (ms "locales"). */
export function nowInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}
