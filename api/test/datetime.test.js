import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatDateTime,
  minutesOfDay,
  nowInTimeZone,
  parseDate,
  parseDateTime,
  timeToMinutes,
  weekdayOf,
} from '../src/utils/datetime.js';
import { toPositiveInt } from '../src/validation.js';

test('parseDateTime y formatDateTime son inversas', () => {
  const ms = parseDateTime('2026-10-05T09:30:00');
  assert.equal(formatDateTime(ms), '2026-10-05T09:30:00');
  assert.equal(formatDateTime(parseDateTime('2026-10-05 09:30')), '2026-10-05T09:30:00'); // formato MySQL
});

test('rechaza fechas inexistentes o mal formadas', () => {
  for (const bad of ['2026-02-30T10:00:00', '2026-13-01T10:00:00', '2026-10-05T25:00:00', '05/10/2026', '', null, 42, '2026-10-05T09:30:00Z']) {
    assert.equal(parseDateTime(bad), null, `debería rechazar ${bad}`);
  }
  assert.equal(parseDate('2026-02-29'), null); // 2026 no es bisiesto
  assert.notEqual(parseDate('2028-02-29'), null);
});

test('día de la semana y minutos del día no dependen de la zona horaria del servidor', () => {
  const monday = parseDateTime('2026-10-05T14:30:00');
  assert.equal(weekdayOf(monday), 1);
  assert.equal(minutesOfDay(monday), 14 * 60 + 30);
  assert.equal(weekdayOf(parseDate('2026-10-04')), 0); // domingo
  assert.equal(timeToMinutes('08:30:00'), 510);
});

test('nowInTimeZone devuelve un instante razonable', () => {
  const ms = nowInTimeZone('America/Guatemala');
  assert.ok(Number.isFinite(ms));
  assert.ok(ms > parseDateTime('2026-01-01T00:00:00'));
});

test('toPositiveInt acepta solo enteros positivos', () => {
  assert.equal(toPositiveInt('12'), 12);
  assert.equal(toPositiveInt(7), 7);
  for (const bad of ['0', -3, '1.5', 'abc', '', null, undefined, '12abc']) {
    assert.equal(toPositiveInt(bad), null, `debería rechazar ${bad}`);
  }
});
