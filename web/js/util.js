// Utilidades compartidas. Regla de oro: los datos del servidor se insertan SIEMPRE con
// textContent (nunca innerHTML) para evitar inyección de HTML/JavaScript (XSS).

export const STATUS = {
  programada: { label: 'Programada', icon: '◷' },
  confirmada: { label: 'Confirmada', icon: '✔' },
  completada: { label: 'Completada', icon: '☑' },
  cancelada: { label: 'Cancelada', icon: '✖' },
  no_asistio: { label: 'No asistió', icon: '⚠' },
};

const pad = (n) => String(n).padStart(2, '0');

/** Date -> "YYYY-MM-DD" con la hora local del navegador. */
export const toLocalDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Date -> "YYYY-MM-DDTHH:mm:ss" (hora local, sin zona horaria: es lo que espera la API). */
export const toLocalIso = (d) => `${toLocalDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** "YYYY-MM-DDTHH:mm:ss" -> Date local. */
export function fromLocalIso(iso) {
  const [date, time = '00:00:00'] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss = 0] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

export const minutesBetween = (startIso, endIso) => Math.round((fromLocalIso(endIso) - fromLocalIso(startIso)) / 60000);

const longDate = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('es-GT', { weekday: 'short', day: 'numeric', month: 'short' });

export const formatLongDate = (iso) => longDate.format(fromLocalIso(iso));
export const formatShortDate = (iso) => shortDate.format(fromLocalIso(iso)).replace('.', '');
export const formatTime = (iso) => iso.slice(11, 16);
export const formatRange = (startIso, endIso) => `${formatTime(startIso)} – ${formatTime(endIso)}`;
export const formatDateTime = (iso) => `${formatShortDate(iso)}, ${formatTime(iso)}`;

/** Crea un elemento DOM de forma segura: `el('p', { class: 'x' }, 'texto', otroNodo)`. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const clear = (node) => node.replaceChildren();

export function toast(message, type = 'success') {
  const host = document.getElementById('toasts');
  const close = el('button', { type: 'button', class: 'toast-close', 'aria-label': 'Cerrar aviso' }, '×');
  const item = el('div', { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' }, el('span', {}, message), close);
  const remove = () => item.remove();
  close.addEventListener('click', remove);
  host.append(item);
  setTimeout(remove, type === 'error' ? 9000 : 5000);
}

/**
 * Muestra un error de la API dentro de un contenedor role="alert".
 * Si el error trae errores por campo o sugerencias, los incluye.
 */
export function showError(container, error, { onSuggestion } = {}) {
  clear(container);
  container.hidden = false;
  container.append(el('strong', {}, error.message));

  const fields = error.details?.fields;
  if (fields && Object.keys(fields).length) {
    container.append(el('ul', {}, Object.values(fields).map((msg) => el('li', {}, msg))));
  }

  const suggestions = error.details?.suggestions;
  if (suggestions?.length && onSuggestion) {
    container.append(
      el('p', { class: 'suggest-title' }, 'Horarios disponibles cercanos:'),
      el(
        'div',
        { class: 'suggest-list' },
        suggestions.map((s) =>
          el('button', { type: 'button', class: 'btn small', onclick: () => onSuggestion(s) }, formatDateTime(s.startAt)),
        ),
      ),
    );
  }
  container.scrollIntoView?.({ block: 'nearest' });
}

export function hideError(container) {
  container.hidden = true;
  clear(container);
}

export function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Cierra el <dialog> al pulsar cualquier botón con data-close. */
export function wireDialogClose(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-close]')) dialog.close();
  });
}

const DAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** [{weekday, startTime, endTime}] -> "Lun–Vie 08:00–12:00, 14:00–17:00 · Sáb 08:00–12:00" */
export function summarizeSchedule(schedule) {
  const byDay = new Map();
  for (const b of schedule) byDay.set(b.weekday, [...(byDay.get(b.weekday) ?? []), `${b.startTime}–${b.endTime}`]);
  const days = [...byDay.entries()].sort(([a], [b]) => a - b).map(([day, blocks]) => ({ day, text: blocks.join(', ') }));

  const groups = [];
  for (const item of days) {
    const last = groups.at(-1);
    if (last && last.text === item.text && last.to === item.day - 1) last.to = item.day;
    else groups.push({ from: item.day, to: item.day, text: item.text });
  }
  return groups
    .map((g) => `${g.from === g.to ? DAY_ABBR[g.from] : `${DAY_ABBR[g.from]}–${DAY_ABBR[g.to]}`} ${g.text}`)
    .join(' · ');
}

/** Etiqueta de estado: símbolo + texto (no depende solo del color). */
export function statusBadge(status) {
  const meta = STATUS[status] ?? { label: status, icon: '•' };
  return el('span', { class: `badge status-${status}` }, el('span', { 'aria-hidden': 'true' }, meta.icon), ' ', meta.label);
}
