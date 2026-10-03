// Arranca la API completa en un puerto libre con repositorio en memoria y reloj controlable.
import os from 'node:os';
import { createApp } from '../src/app.js';
import { createMemoryRepository, defaultSeed } from '../src/repositories/memoryRepository.js';
import { createAppointmentService } from '../src/services/appointmentService.js';
import { formatDateTime, parseDateTime } from '../src/utils/datetime.js';

export const config = Object.freeze({
  clinicTimeZone: 'America/Guatemala',
  slotMinutes: 30,
  maxDurationMinutes: 120,
  suggestionsCount: 3,
  suggestionsLookaheadDays: 14,
});

// Lunes 5 de octubre de 2026, 07:00 (antes de que abra cualquier consultorio)
export const START_OF_TEST = parseDateTime('2026-10-05T07:00:00');

export async function startApi({ now = START_OF_TEST } = {}) {
  const clock = { now };
  const repo = createMemoryRepository(defaultSeed(), { clock: () => formatDateTime(clock.now) });
  const service = createAppointmentService({ repo, config, now: () => clock.now });
  const app = createApp({ service, webDir: os.tmpdir() });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, url, body, { raw } = {}) {
    const response = await fetch(base + url, {
      method,
      headers: body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {},
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }

  return {
    call,
    clock,
    close: () => new Promise((resolve) => server.close(resolve)),
    /** Atajo: crea una cita válida y devuelve la respuesta. */
    book: (overrides = {}) =>
      call('POST', '/api/appointments', {
        patientId: 1,
        doctorId: 1,
        startAt: '2026-10-06T09:00:00',
        durationMinutes: 30,
        reason: 'Consulta de control',
        ...overrides,
      }),
  };
}

/** Ejecuta `fn(api)` con una API nueva y la cierra al terminar. */
export async function withApi(fn, options) {
  const api = await startApi(options);
  try {
    await fn(api);
  } finally {
    await api.close();
  }
}
