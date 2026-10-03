import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseDateTime } from '../src/utils/datetime.js';
import { withApi } from '../support/testApi.js';

describe('catálogos y salud', () => {
  test('health responde ok', () =>
    withApi(async ({ call }) => {
      const res = await call('GET', '/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
    }));

  test('lista médicos activos y entrega el horario de un médico', () =>
    withApi(async ({ call }) => {
      const doctors = await call('GET', '/api/doctors');
      assert.deepEqual(doctors.body.map((d) => d.id).sort(), [1, 2]); // el inactivo no aparece
      const detail = await call('GET', '/api/doctors/1');
      assert.equal(detail.body.schedule.length, 10); // 5 días x 2 bloques
      assert.equal((await call('GET', '/api/doctors/99')).status, 404);
      assert.equal((await call('GET', '/api/doctors/abc')).status, 400);
    }));

  test('ruta inexistente devuelve JSON 404', () =>
    withApi(async ({ call }) => {
      const res = await call('GET', '/api/nada');
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }));

  test('JSON inválido devuelve 400', () =>
    withApi(async ({ call }) => {
      const res = await call('POST', '/api/appointments', undefined, { raw: '{no es json' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_JSON');
    }));
});

describe('disponibilidad', () => {
  test('genera los espacios del día y marca los ocupados', () =>
    withApi(async ({ call, book }) => {
      const before = await call('GET', '/api/doctors/1/availability?date=2026-10-06');
      assert.equal(before.status, 200);
      assert.equal(before.body.slots.length, 14); // 8 por la mañana + 6 por la tarde
      assert.ok(before.body.slots.every((s) => s.available));
      assert.equal(before.body.slots[0].time, '08:00');

      await book({ startAt: '2026-10-06T09:00:00', durationMinutes: 60 });
      const busyTimes = (res) => res.body.slots.filter((s) => !s.available).map((s) => s.time);

      // Para una consulta de 30 min solo se ocupan 09:00 y 09:30
      const after = await call('GET', '/api/doctors/1/availability?date=2026-10-06');
      assert.deepEqual(busyTimes(after), ['09:00', '09:30']);
      assert.ok(after.body.slots.filter((s) => !s.available).every((s) => s.reason === 'ocupado'));

      // Para una de 60 min, empezar a las 08:30 invadiría la cita de las 09:00
      const long = await call('GET', '/api/doctors/1/availability?date=2026-10-06&duration=60');
      assert.deepEqual(busyTimes(long), ['08:30', '09:00', '09:30']);
    }));

  test('al reprogramar, la propia cita no cuenta como ocupada (exclude)', () =>
    withApi(async ({ book, call }) => {
      const { body: appt } = await book();
      const busy = (res) => res.body.slots.filter((s) => !s.available).map((s) => s.time);
      assert.deepEqual(busy(await call('GET', '/api/doctors/1/availability?date=2026-10-06')), ['09:00']);
      assert.deepEqual(busy(await call('GET', `/api/doctors/1/availability?date=2026-10-06&exclude=${appt.id}`)), []);
      assert.equal((await call('GET', '/api/doctors/1/availability?date=2026-10-06&exclude=abc')).status, 400);
    }));

  test('día sin atención explica por qué', () =>
    withApi(async ({ call }) => {
      const res = await call('GET', '/api/doctors/1/availability?date=2026-10-11'); // domingo
      assert.equal(res.body.attends, false);
      assert.equal(res.body.slots.length, 0);
      assert.match(res.body.message, /no atiende los domingos/);
    }));

  test('los espacios que ya pasaron salen como no disponibles', () =>
    withApi(
      async ({ call }) => {
        const res = await call('GET', '/api/doctors/1/availability?date=2026-10-05');
        const byTime = Object.fromEntries(res.body.slots.map((s) => [s.time, s]));
        assert.equal(byTime['09:30'].available, false);
        assert.equal(byTime['09:30'].reason, 'pasado');
        assert.equal(byTime['10:30'].available, true);
      },
      { now: parseDateTime('2026-10-05T10:00:00') },
    ));

  test('valida parámetros', () =>
    withApi(async ({ call }) => {
      assert.equal((await call('GET', '/api/doctors/1/availability')).status, 400);
      assert.equal((await call('GET', '/api/doctors/1/availability?date=hoy')).status, 400);
      assert.equal((await call('GET', '/api/doctors/1/availability?date=2026-10-06&duration=45')).status, 422);
    }));
});

describe('agendar citas', () => {
  test('crea una cita válida', () =>
    withApi(async ({ book, call }) => {
      const res = await book();
      assert.equal(res.status, 201);
      assert.match(res.headers.get('location'), /^\/api\/appointments\/\d+$/);
      assert.equal(res.body.status, 'programada');
      assert.equal(res.body.startAt, '2026-10-06T09:00:00');
      assert.equal(res.body.endAt, '2026-10-06T09:30:00');
      assert.equal(res.body.allowedActions.cancel, true);
      assert.equal(res.body.allowedActions.complete, false);

      const detail = await call('GET', `/api/appointments/${res.body.id}`);
      assert.equal(detail.body.history[0].action, 'creada');
    }));

  test('acepta endAt en lugar de durationMinutes', () =>
    withApi(async ({ book }) => {
      const res = await book({ durationMinutes: undefined, endAt: '2026-10-06T10:00:00' });
      assert.equal(res.status, 201);
      assert.equal(res.body.endAt, '2026-10-06T10:00:00');
    }));

  test('impide la doble reserva del médico y ofrece alternativas', () =>
    withApi(async ({ book }) => {
      assert.equal((await book()).status, 201);
      const clash = await book({ patientId: 2 });
      assert.equal(clash.status, 409);
      assert.equal(clash.body.error.code, 'SLOT_TAKEN');
      const { suggestions } = clash.body.error.details;
      assert.equal(suggestions.length, 3);
      assert.equal(suggestions[0].startAt, '2026-10-06T09:30:00');
      assert.ok(suggestions.every((s) => s.startAt !== '2026-10-06T09:00:00'));
    }));

  test('detecta solapes parciales', () =>
    withApi(async ({ book }) => {
      await book({ startAt: '2026-10-06T09:00:00', durationMinutes: 30 });
      const clash = await book({ patientId: 2, startAt: '2026-10-06T08:30:00', durationMinutes: 60 });
      assert.equal(clash.status, 409);
      // Citas pegadas (una termina cuando la otra empieza) NO son un solape
      assert.equal((await book({ patientId: 2, startAt: '2026-10-06T09:30:00' })).status, 201);
      assert.equal((await book({ patientId: 3, startAt: '2026-10-06T08:30:00' })).status, 201);
    }));

  test('un paciente no puede tener dos citas a la misma hora con médicos distintos', () =>
    withApi(async ({ book }) => {
      assert.equal((await book()).status, 201);
      const clash = await book({ doctorId: 2 });
      assert.equal(clash.status, 409);
      assert.equal(clash.body.error.code, 'PATIENT_BUSY');
      assert.equal(clash.body.error.details.conflict.doctorName, 'Ana Pérez');
    }));

  test('respeta el horario de atención del médico', () =>
    withApi(async ({ book }) => {
      const lunch = await book({ startAt: '2026-10-06T13:00:00' });
      assert.equal(lunch.status, 422);
      assert.equal(lunch.body.error.code, 'OUTSIDE_SCHEDULE');
      assert.match(lunch.body.error.message, /atiende los martes de 08:00 a 12:00 y de 14:00 a 17:00/);
      assert.ok(lunch.body.error.details.suggestions.length > 0);

      const crossing = await book({ startAt: '2026-10-06T11:30:00', durationMinutes: 60 }); // invade el almuerzo
      assert.equal(crossing.status, 422);

      const sunday = await book({ startAt: '2026-10-11T09:00:00' });
      assert.match(sunday.body.error.message, /no atiende los domingos/);
    }));

  test('no permite fechas pasadas ni horas fuera de la cuadrícula', () =>
    withApi(async ({ book }) => {
      const past = await book({ startAt: '2026-10-05T06:00:00' });
      assert.equal(past.status, 422);
      assert.equal(past.body.error.code, 'PAST_DATE');
      const odd = await book({ startAt: '2026-10-06T09:15:00' });
      assert.equal(odd.body.error.code, 'INVALID_SLOT');
    }));

  test('valida duración, datos obligatorios y existencia de médico y paciente', () =>
    withApi(async ({ book, call }) => {
      assert.equal((await book({ durationMinutes: 45 })).body.error.code, 'INVALID_DURATION');
      assert.equal((await book({ durationMinutes: 150 })).body.error.code, 'INVALID_DURATION');
      assert.equal((await book({ patientId: 99 })).status, 404);
      assert.equal((await book({ doctorId: 99 })).status, 404);
      assert.equal((await book({ doctorId: 3 })).status, 404); // médico inactivo

      const empty = await call('POST', '/api/appointments', {});
      assert.equal(empty.status, 400);
      assert.deepEqual(Object.keys(empty.body.error.details.fields).sort(), ['doctorId', 'patientId', 'reason', 'startAt']);

      const badDate = await book({ startAt: '06/10/2026 9am' });
      assert.match(badDate.body.error.details.fields.startAt, /YYYY-MM-DDTHH:mm:ss/);
      assert.equal((await book({ reason: 'ab' })).status, 400);
    }));
});

describe('reprogramar y editar', () => {
  test('reprograma una cita y libera el horario anterior', () =>
    withApi(async ({ book, call }) => {
      const { body: appt } = await book();
      const moved = await call('PUT', `/api/appointments/${appt.id}`, { startAt: '2026-10-06T10:00:00' });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.startAt, '2026-10-06T10:00:00');
      assert.equal(moved.body.endAt, '2026-10-06T10:30:00'); // conserva la duración

      const detail = await call('GET', `/api/appointments/${appt.id}`);
      assert.equal(detail.body.history.at(-1).action, 'reprogramada');
      assert.equal((await book({ patientId: 2 })).status, 201); // el 09:00 volvió a estar libre
    }));

  test('una cita puede moverse a un horario que se solapa con ella misma', () =>
    withApi(async ({ book, call }) => {
      const { body: appt } = await book({ durationMinutes: 60 });
      const moved = await call('PATCH', `/api/appointments/${appt.id}`, { startAt: '2026-10-06T09:30:00' });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.endAt, '2026-10-06T10:30:00');
    }));

  test('no se puede reprogramar a un horario ocupado', () =>
    withApi(async ({ book, call }) => {
      await book({ patientId: 2, startAt: '2026-10-06T10:00:00' });
      const { body: appt } = await book();
      const res = await call('PUT', `/api/appointments/${appt.id}`, { startAt: '2026-10-06T10:00:00' });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'SLOT_TAKEN');
    }));

  test('cambiar de médico revisa la agenda del nuevo médico', () =>
    withApi(async ({ book, call }) => {
      await book({ patientId: 2, doctorId: 2 });
      const { body: appt } = await book();
      assert.equal((await call('PUT', `/api/appointments/${appt.id}`, { doctorId: 2 })).status, 409);
      const ok = await call('PUT', `/api/appointments/${appt.id}`, { doctorId: 2, startAt: '2026-10-06T11:00:00' });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.doctorId, 2);
    }));

  test('editar solo motivo/notas queda en la bitácora como "editada"; cambiar de paciente no se permite', () =>
    withApi(async ({ book, call }) => {
      const { body: appt } = await book();
      const edited = await call('PUT', `/api/appointments/${appt.id}`, { reason: 'Dolor de cabeza', notes: 'Trae estudios' });
      assert.equal(edited.body.reason, 'Dolor de cabeza');
      const detail = await call('GET', `/api/appointments/${appt.id}`);
      assert.equal(detail.body.history.at(-1).action, 'editada');

      const swap = await call('PUT', `/api/appointments/${appt.id}`, { patientId: 2 });
      assert.equal(swap.body.error.code, 'PATIENT_IMMUTABLE');
      assert.equal((await call('PUT', `/api/appointments/${appt.id}`, {})).status, 400);
    }));

  test('reprogramar una cita confirmada exige confirmarla de nuevo', () =>
    withApi(async ({ book, call }) => {
      const { body: appt } = await book();
      await call('PATCH', `/api/appointments/${appt.id}/status`, { status: 'confirmada' });
      const moved = await call('PUT', `/api/appointments/${appt.id}`, { startAt: '2026-10-06T10:00:00' });
      assert.equal(moved.body.status, 'programada');
    }));
});

describe('estados y cancelación', () => {
  test('confirma una cita', () =>
    withApi(async ({ book, call }) => {
      const { body: appt } = await book();
      const res = await call('PATCH', `/api/appointments/${appt.id}/status`, { status: 'confirmada' });
      assert.equal(res.body.status, 'confirmada');
      assert.equal((await call('PATCH', `/api/appointments/${appt.id}/status`, { status: 'confirmada' })).status, 409);
    }));

  test('cancelar exige motivo, libera el horario y no se puede repetir', () =>
    withApi(async ({ book, call }) => {
      const { body: appt } = await book();
      const noReason = await call('POST', `/api/appointments/${appt.id}/cancel`, {});
      assert.equal(noReason.status, 400);
      assert.ok(noReason.body.error.details.fields.reason);

      const cancelled = await call('POST', `/api/appointments/${appt.id}/cancel`, { reason: 'El paciente no puede asistir' });
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.body.status, 'cancelada');
      assert.equal(cancelled.body.cancelReason, 'El paciente no puede asistir');
      assert.equal(cancelled.body.cancelledAt, '2026-10-05T07:00:00');
      assert.equal(cancelled.body.allowedActions.cancel, false);

      assert.equal((await book({ patientId: 2 })).status, 201); // el horario quedó libre
      assert.equal((await call('POST', `/api/appointments/${appt.id}/cancel`, { reason: 'otra vez' })).status, 409);
      assert.equal((await call('PUT', `/api/appointments/${appt.id}`, { reason: 'editar cancelada' })).status, 409);
    }));

  test('DELETE cancela (no borra) y conserva el registro', () =>
    withApi(async ({ book, call }) => {
      const { body: appt } = await book();
      assert.equal((await call('DELETE', `/api/appointments/${appt.id}`)).status, 400); // sin motivo
      const res = await call('DELETE', `/api/appointments/${appt.id}?reason=Cambio%20de%20planes`);
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'cancelada');
      assert.equal((await call('GET', `/api/appointments/${appt.id}`)).status, 200);
    }));

  test('"cancelada" no se acepta por el endpoint de estado', () =>
    withApi(async ({ book, call }) => {
      const { body: appt } = await book();
      const res = await call('PATCH', `/api/appointments/${appt.id}/status`, { status: 'cancelada' });
      assert.equal(res.status, 400);
      assert.equal((await call('PATCH', `/api/appointments/${appt.id}/status`, { status: 'inventado' })).status, 400);
    }));

  test('completar o marcar "no asistió" solo cuando llegó la hora', () =>
    withApi(async ({ book, call, clock }) => {
      const { body: appt } = await book();
      const early = await call('PATCH', `/api/appointments/${appt.id}/status`, { status: 'completada' });
      assert.equal(early.status, 422);
      assert.equal(early.body.error.code, 'TOO_EARLY');

      clock.now = parseDateTime('2026-10-06T09:10:00');
      const detail = await call('GET', `/api/appointments/${appt.id}`);
      assert.equal(detail.body.allowedActions.complete, true);
      assert.equal(detail.body.allowedActions.cancel, false);

      const late = await call('POST', `/api/appointments/${appt.id}/cancel`, { reason: 'Ya empezó la cita' });
      assert.equal(late.body.error.code, 'TOO_LATE');

      const done = await call('PATCH', `/api/appointments/${appt.id}/status`, { status: 'completada' });
      assert.equal(done.body.status, 'completada');
      assert.equal((await call('PATCH', `/api/appointments/${appt.id}/status`, { status: 'no_asistio' })).status, 409);
    }));
});

describe('consultas', () => {
  test('lista citas por rango y filtros', () =>
    withApi(async ({ book, call }) => {
      await book({ startAt: '2026-10-06T09:00:00' });
      await book({ patientId: 2, doctorId: 2, startAt: '2026-10-07T10:00:00' });
      await book({ patientId: 3, startAt: '2026-10-20T10:00:00' });

      const week = await call('GET', '/api/appointments?start=2026-10-05&end=2026-10-12');
      assert.equal(week.body.length, 2);
      assert.deepEqual(week.body.map((a) => a.startAt), ['2026-10-06T09:00:00', '2026-10-07T10:00:00']);

      const byDoctor = await call('GET', '/api/appointments?start=2026-10-05&end=2026-10-12&doctorId=2');
      assert.equal(byDoctor.body.length, 1);
      assert.equal(byDoctor.body[0].doctorName, 'Luis Gómez');

      // Formato que envía FullCalendar (fecha y hora locales)
      const fc = await call('GET', '/api/appointments?start=2026-10-06T09:15:00&end=2026-10-06T23:59:00');
      assert.equal(fc.body.length, 1); // la cita de 09:00-09:30 se solapa con el rango

      const none = await call('GET', '/api/appointments?start=2026-10-05&end=2026-10-12&status=cancelada');
      assert.equal(none.body.length, 0);
    }));

  test('exige un rango válido', () =>
    withApi(async ({ call }) => {
      assert.equal((await call('GET', '/api/appointments')).status, 400);
      assert.equal((await call('GET', '/api/appointments?start=2026-10-12&end=2026-10-05')).status, 400);
      assert.equal((await call('GET', '/api/appointments?start=2026-01-01&end=2027-01-01')).status, 400);
      assert.equal((await call('GET', '/api/appointments?start=2026-10-05&end=2026-10-12&status=x')).status, 400);
    }));

  test('estadísticas del día y de la semana', () =>
    withApi(async ({ book, call }) => {
      const a = await book({ startAt: '2026-10-06T09:00:00' });
      await book({ patientId: 2, startAt: '2026-10-06T10:00:00' });
      await book({ patientId: 3, startAt: '2026-10-08T10:00:00' });
      await call('POST', `/api/appointments/${a.body.id}/cancel`, { reason: 'Paciente enfermo' });

      const stats = await call('GET', '/api/appointments/stats?date=2026-10-06');
      assert.equal(stats.body.day.total, 2);
      assert.equal(stats.body.day.byStatus.cancelada, 1);
      assert.equal(stats.body.week.total, 3);
      assert.equal(stats.body.week.from, '2026-10-05');
      assert.equal(stats.body.upcoming.length, 2); // las canceladas no cuentan como próximas
    }));
});

describe('pacientes', () => {
  test('crea, busca y valida pacientes', () =>
    withApi(async ({ call }) => {
      const created = await call('POST', '/api/patients', {
        firstName: 'Carmen', lastName: 'López', birthDate: '1990-05-17', phone: '5555-1234', email: 'carmen@example.com',
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.fullName, 'Carmen López');

      const found = await call('GET', '/api/patients?search=carm');
      assert.equal(found.body.length, 1);
      assert.equal((await call('GET', `/api/patients/${created.body.id}`)).status, 200);
      assert.equal((await call('GET', '/api/patients/999')).status, 404);

      const invalid = await call('POST', '/api/patients', { firstName: 'A', lastName: '', email: 'no-es-correo', phone: 'abc' });
      assert.equal(invalid.status, 400);
      assert.deepEqual(Object.keys(invalid.body.error.details.fields).sort(), ['email', 'firstName', 'lastName', 'phone']);

      const future = await call('POST', '/api/patients', { firstName: 'Bebé', lastName: 'Futuro', birthDate: '2030-01-01' });
      assert.equal(future.status, 422);
    }));
});
