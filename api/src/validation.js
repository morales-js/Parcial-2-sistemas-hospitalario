// Validación de entradas HTTP. Solo revisa forma y tipos; las reglas de negocio
// (horarios, solapamientos, estados) viven en services/appointmentService.js.
import { validationError } from './errors.js';
import { DAY, parseDate, parseDateOrDateTime, parseDateTime } from './utils/datetime.js';

export const STATUSES = ['programada', 'confirmada', 'completada', 'cancelada', 'no_asistio'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{6,30}$/;
const FORMAT_HINT = 'Formato esperado: YYYY-MM-DDTHH:mm:ss';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (obj, key) => obj[key] !== undefined && obj[key] !== null && obj[key] !== '';

function requireObject(body) {
  if (!isObject(body)) {
    throw validationError({ body: 'El cuerpo de la solicitud debe ser un objeto JSON.' });
  }
}

/** Entero positivo a partir de número o texto ("12"). Devuelve null si no es válido. */
export function toPositiveInt(value) {
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function readText(obj, key, errors, { required, min = 1, max, label }) {
  if (!has(obj, key)) {
    if (required) errors[key] = `${label} es obligatorio.`;
    return undefined;
  }
  if (typeof obj[key] !== 'string') {
    errors[key] = `${label} debe ser texto.`;
    return undefined;
  }
  const text = obj[key].trim();
  if (text.length < min) errors[key] = `${label} debe tener al menos ${min} caracteres.`;
  else if (text.length > max) errors[key] = `${label} no puede superar ${max} caracteres.`;
  else return text;
  return undefined;
}

/**
 * Cita (crear o editar).
 * - partial=false (POST): patientId, doctorId, startAt y reason son obligatorios.
 * - partial=true  (PUT/PATCH): todo es opcional, pero debe venir al menos un campo.
 * Para la hora final se acepta `endAt` o `durationMinutes`.
 */
export function validateAppointmentInput(body, { partial = false } = {}) {
  requireObject(body);
  const errors = {};
  const out = {};

  for (const [key, label] of [['patientId', 'El paciente'], ['doctorId', 'El médico']]) {
    if (has(body, key)) {
      const id = toPositiveInt(body[key]);
      if (id === null) errors[key] = `${label} no es válido.`;
      else out[key] = id;
    } else if (!partial) {
      errors[key] = `${label} es obligatorio.`;
    }
  }

  if (has(body, 'startAt')) {
    const ms = parseDateTime(body.startAt);
    if (ms === null) errors.startAt = `La fecha y hora de inicio no es válida. ${FORMAT_HINT}`;
    else out.startMs = ms;
  } else if (!partial) {
    errors.startAt = 'La fecha y hora de inicio es obligatoria.';
  }

  if (has(body, 'endAt')) {
    const ms = parseDateTime(body.endAt);
    if (ms === null) errors.endAt = `La fecha y hora de fin no es válida. ${FORMAT_HINT}`;
    else out.endMs = ms;
  }

  if (has(body, 'durationMinutes')) {
    const minutes = toPositiveInt(body.durationMinutes);
    if (minutes === null) errors.durationMinutes = 'La duración debe ser un número entero de minutos.';
    else out.durationMinutes = minutes;
  }

  if (out.startMs !== undefined && out.endMs !== undefined && out.endMs <= out.startMs) {
    errors.endAt = 'La hora de fin debe ser posterior a la de inicio.';
  }

  const reason = readText(body, 'reason', errors, {
    required: !partial, min: 3, max: 255, label: 'El motivo de la consulta',
  });
  if (reason !== undefined) out.reason = reason;

  if (body.notes === null) {
    out.notes = null;
  } else if (has(body, 'notes')) {
    const notes = readText(body, 'notes', errors, { required: false, max: 2000, label: 'Las notas' });
    if (notes !== undefined) out.notes = notes;
  }

  if (Object.keys(errors).length) throw validationError(errors);
  if (partial && Object.keys(out).length === 0) {
    throw validationError({ body: 'Envía al menos un campo para actualizar.' });
  }
  return out;
}

export function validatePatientInput(body) {
  requireObject(body);
  const errors = {};
  const out = {};

  out.firstName = readText(body, 'firstName', errors, { required: true, min: 2, max: 80, label: 'El nombre' });
  out.lastName = readText(body, 'lastName', errors, { required: true, min: 2, max: 80, label: 'El apellido' });

  if (has(body, 'birthDate')) {
    const ms = parseDate(body.birthDate);
    if (ms === null) errors.birthDate = 'La fecha de nacimiento no es válida. Formato esperado: YYYY-MM-DD';
    else out.birthDate = body.birthDate.trim();
  }
  if (has(body, 'phone')) {
    if (typeof body.phone !== 'string' || !PHONE_RE.test(body.phone.trim())) {
      errors.phone = 'El teléfono no es válido (6 a 30 dígitos, puede incluir + - ( )).';
    } else out.phone = body.phone.trim();
  }
  if (has(body, 'email')) {
    if (typeof body.email !== 'string' || body.email.length > 120 || !EMAIL_RE.test(body.email.trim())) {
      errors.email = 'El correo electrónico no es válido.';
    } else out.email = body.email.trim();
  }

  if (Object.keys(errors).length) throw validationError(errors);
  return out;
}

export function validateCancelInput(body) {
  const source = isObject(body) ? body : {};
  const errors = {};
  const reason = readText(source, 'reason', errors, {
    required: true, min: 5, max: 255, label: 'El motivo de cancelación',
  });
  if (Object.keys(errors).length) throw validationError(errors);
  return { reason };
}

export function validateStatusInput(body) {
  requireObject(body);
  if (!STATUSES.includes(body.status)) {
    throw validationError({ status: `El estado debe ser uno de: ${STATUSES.join(', ')}.` });
  }
  return { status: body.status };
}

/** Filtros de GET /api/appointments. El rango start-end es obligatorio y está acotado. */
export function validateAppointmentFilters(query) {
  const errors = {};
  const out = {};

  const start = parseDateOrDateTime(query.start);
  const end = parseDateOrDateTime(query.end);
  if (start === null) errors.start = `"start" es obligatorio. Usa YYYY-MM-DD o ${FORMAT_HINT.replace('Formato esperado: ', '')}`;
  if (end === null) errors.end = `"end" es obligatorio. Usa YYYY-MM-DD o ${FORMAT_HINT.replace('Formato esperado: ', '')}`;
  if (start !== null && end !== null) {
    if (end <= start) errors.end = '"end" debe ser posterior a "start".';
    else if (end - start > 100 * DAY) errors.end = 'El rango máximo de consulta es de 100 días.';
    else {
      out.startMs = start;
      out.endMs = end;
    }
  }

  for (const key of ['doctorId', 'patientId', 'specialtyId']) {
    if (has(query, key)) {
      const id = toPositiveInt(query[key]);
      if (id === null) errors[key] = `"${key}" no es válido.`;
      else out[key] = id;
    }
  }
  if (has(query, 'status')) {
    if (!STATUSES.includes(query.status)) errors.status = `"status" debe ser uno de: ${STATUSES.join(', ')}.`;
    else out.status = query.status;
  }

  if (Object.keys(errors).length) throw validationError(errors);
  return out;
}

export function validateAvailabilityQuery(query) {
  const errors = {};
  const out = {};
  const dateMs = parseDate(query.date);
  if (dateMs === null) errors.date = '"date" es obligatorio. Formato esperado: YYYY-MM-DD';
  else out.dateMs = dateMs;

  if (has(query, 'duration')) {
    const minutes = toPositiveInt(query.duration);
    if (minutes === null) errors.duration = '"duration" debe ser un número entero de minutos.';
    else out.durationMinutes = minutes;
  }
  // Al reprogramar, la cita actual no debe contar como "ocupada" en su propio horario
  if (has(query, 'exclude')) {
    const id = toPositiveInt(query.exclude);
    if (id === null) errors.exclude = '"exclude" debe ser el identificador de una cita.';
    else out.excludeId = id;
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return out;
}
