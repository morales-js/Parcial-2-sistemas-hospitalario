// Reglas de negocio del módulo de citas. No conoce HTTP ni SQL:
// recibe un "repo" (inversión de dependencias) y un reloj inyectable (facilita las pruebas).
import { AppError, notFound } from '../errors.js';
import {
  DAY,
  MINUTE,
  formatDate,
  formatDateTime,
  minutesOfDay,
  nowInTimeZone,
  parseDateTime,
  startOfDay,
  timeToMinutes,
  weekdayOf,
} from '../utils/datetime.js';

// Estados que OCUPAN la agenda del médico y del paciente.
export const BLOCKING_STATUSES = ['programada', 'confirmada'];
const ALL_STATUSES = ['programada', 'confirmada', 'completada', 'cancelada', 'no_asistio'];
const STATUS_LABEL = {
  programada: 'programada',
  confirmada: 'confirmada',
  completada: 'completada',
  cancelada: 'cancelada',
  no_asistio: 'marcada como "no asistió"',
};
const WEEKDAY_NAMES = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

const human = (ms) => {
  const d = formatDateTime(ms);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`;
};

export function createAppointmentService({
  repo,
  config,
  now = () => nowInTimeZone(config.clinicTimeZone),
}) {
  const slot = config.slotMinutes;

  // ---------------------------------------------------------------- utilidades de reglas

  /** Qué acciones permite hoy cada cita. Es la única fuente de verdad (la API y el UI la usan). */
  function actionsFor(appointment) {
    const nowMs = now();
    const startMs = parseDateTime(appointment.startAt);
    const endMs = parseDateTime(appointment.endAt);
    const active = BLOCKING_STATUSES.includes(appointment.status);
    return {
      confirm: appointment.status === 'programada' && endMs > nowMs,
      reschedule: active && startMs > nowMs,
      cancel: active && startMs > nowMs,
      complete: active && startMs <= nowMs,
      markNoShow: active && startMs <= nowMs,
    };
  }

  const decorate = (appointment) => ({ ...appointment, allowedActions: actionsFor(appointment) });

  function assertDurationMinutes(minutes) {
    if (!Number.isInteger(minutes) || minutes < slot || minutes > config.maxDurationMinutes || minutes % slot !== 0) {
      throw new AppError(
        422,
        'INVALID_DURATION',
        `La duración debe ser múltiplo de ${slot} minutos y no superar ${config.maxDurationMinutes} minutos.`,
        { slotMinutes: slot, maxDurationMinutes: config.maxDurationMinutes },
      );
    }
  }

  /** Calcula la hora de fin: `endMs` explícito > `durationMinutes` > duración de respaldo. */
  function resolveEnd(startMs, { endMs, durationMinutes }, fallbackMinutes) {
    if (endMs !== undefined) {
      if (endMs <= startMs) {
        throw new AppError(422, 'INVALID_RANGE', 'La hora de fin debe ser posterior a la de inicio.');
      }
      return endMs;
    }
    return startMs + (durationMinutes ?? fallbackMinutes) * MINUTE;
  }

  const blocksFor = (schedule, dayMs) => schedule.filter((b) => b.weekday === weekdayOf(dayMs));

  function fitsSchedule(schedule, startMs, endMs) {
    const startMin = minutesOfDay(startMs);
    const endMin = startMin + (endMs - startMs) / MINUTE;
    return blocksFor(schedule, startMs).some(
      (b) => startMin >= timeToMinutes(b.startTime) && endMin <= timeToMinutes(b.endTime),
    );
  }

  function describeSchedule(doctor, schedule, dayMs) {
    const blocks = blocksFor(schedule, dayMs);
    const day = WEEKDAY_NAMES[weekdayOf(dayMs)];
    if (!blocks.length) return `${doctor.fullName} no atiende los ${day}.`;
    const ranges = blocks.map((b) => `${b.startTime} a ${b.endTime}`).join(' y de ');
    return `${doctor.fullName} atiende los ${day} de ${ranges}.`;
  }

  /** Genera los espacios de un día para un médico, marcando cuáles están libres. */
  async function daySlots(reader, doctorId, dayMs, durationMinutes, schedule, excludeId) {
    const blocks = blocksFor(schedule, dayMs);
    if (!blocks.length) return [];
    const busy = (
      await reader.findAppointments({
        startAt: formatDateTime(dayMs),
        endAt: formatDateTime(dayMs + DAY),
        doctorId,
        statuses: BLOCKING_STATUSES,
      })
    )
      .filter((a) => a.id !== excludeId)
      .map((a) => [parseDateTime(a.startAt), parseDateTime(a.endAt)]);

    const nowMs = now();
    const slots = [];
    for (const block of blocks) {
      const from = timeToMinutes(block.startTime);
      const to = timeToMinutes(block.endTime);
      for (let minute = from; minute + durationMinutes <= to; minute += slot) {
        const startMs = dayMs + minute * MINUTE;
        const endMs = startMs + durationMinutes * MINUTE;
        let available = true;
        let reason = null;
        if (startMs <= nowMs) {
          available = false;
          reason = 'pasado';
        } else if (busy.some(([bs, be]) => bs < endMs && be > startMs)) {
          available = false;
          reason = 'ocupado';
        }
        slots.push({ startMs, endMs, available, reason });
      }
    }
    return slots;
  }

  /** Próximos espacios libres del médico (para ofrecer alternativas ante un conflicto). */
  async function suggest(reader, doctorId, fromMs, durationMinutes, schedule, excludeId) {
    const found = [];
    const firstDay = startOfDay(fromMs);
    for (let i = 0; i <= config.suggestionsLookaheadDays && found.length < config.suggestionsCount; i += 1) {
      const slots = await daySlots(reader, doctorId, firstDay + i * DAY, durationMinutes, schedule, excludeId);
      for (const s of slots) {
        if (s.available && s.startMs >= fromMs && found.length < config.suggestionsCount) {
          found.push({ startAt: formatDateTime(s.startMs), endAt: formatDateTime(s.endMs) });
        }
      }
    }
    return found;
  }

  /**
   * Todas las reglas para poder ocupar un horario. Se ejecuta DENTRO de la transacción,
   * con el médico y el paciente bloqueados, para que dos usuarios no reserven lo mismo.
   */
  async function assertBookable(tx, { doctor, patientId, startMs, endMs, excludeId }) {
    assertDurationMinutes((endMs - startMs) / MINUTE);

    if (startMs <= now()) {
      throw new AppError(422, 'PAST_DATE', 'No se pueden agendar citas en una fecha u hora que ya pasó.');
    }
    if (startMs % MINUTE !== 0 || minutesOfDay(startMs) % slot !== 0) {
      throw new AppError(422, 'INVALID_SLOT', `La hora de inicio debe coincidir con bloques de ${slot} minutos (por ejemplo 09:00 o 09:30).`);
    }

    const schedule = await tx.getDoctorSchedule(doctor.id);
    if (!fitsSchedule(schedule, startMs, endMs)) {
      throw new AppError(422, 'OUTSIDE_SCHEDULE', describeSchedule(doctor, schedule, startMs), {
        suggestions: await suggest(tx, doctor.id, startMs, (endMs - startMs) / MINUTE, schedule, excludeId),
      });
    }

    const startAt = formatDateTime(startMs);
    const endAt = formatDateTime(endMs);

    const doctorConflicts = (
      await tx.findAppointments({ startAt, endAt, doctorId: doctor.id, statuses: BLOCKING_STATUSES })
    ).filter((a) => a.id !== excludeId);
    if (doctorConflicts.length) {
      throw new AppError(409, 'SLOT_TAKEN', `${doctor.fullName} ya tiene una cita en ese horario.`, {
        suggestions: await suggest(tx, doctor.id, startMs, (endMs - startMs) / MINUTE, schedule, excludeId),
      });
    }

    const patientConflicts = (
      await tx.findAppointments({ startAt, endAt, patientId, statuses: BLOCKING_STATUSES })
    ).filter((a) => a.id !== excludeId);
    if (patientConflicts.length) {
      const c = patientConflicts[0];
      throw new AppError(409, 'PATIENT_BUSY', 'El paciente ya tiene otra cita que coincide con ese horario.', {
        conflict: { id: c.id, startAt: c.startAt, endAt: c.endAt, doctorName: c.doctorName },
      });
    }
  }

  async function loadActiveAppointment(tx, id) {
    const current = await tx.getAppointment(id);
    if (!current) throw notFound('Cita');
    if (!BLOCKING_STATUSES.includes(current.status)) {
      throw new AppError(409, 'INVALID_STATE', `La cita ya está ${STATUS_LABEL[current.status]} y no admite más cambios.`);
    }
    return current;
  }

  // ---------------------------------------------------------------- catálogos

  const listSpecialties = () => repo.listSpecialties();
  const listDoctors = (filters) => repo.listDoctors(filters);

  async function getDoctor(id) {
    const doctor = await repo.getDoctor(id);
    if (!doctor) throw notFound('Médico');
    return { ...doctor, schedule: await repo.getDoctorSchedule(id) };
  }

  const listPatients = (filters) => repo.listPatients(filters);

  async function getPatient(id) {
    const patient = await repo.getPatient(id);
    if (!patient) throw notFound('Paciente');
    return patient;
  }

  async function createPatient(data) {
    if (data.birthDate && parseDateTime(`${data.birthDate}T00:00`) > now()) {
      throw new AppError(422, 'INVALID_BIRTH_DATE', 'La fecha de nacimiento no puede ser futura.');
    }
    return repo.createPatient(data);
  }

  // ---------------------------------------------------------------- disponibilidad

  async function getAvailability(doctorId, dayMs, durationMinutes = slot, excludeId) {
    assertDurationMinutes(durationMinutes);
    const doctor = await repo.getDoctor(doctorId);
    if (!doctor || !doctor.active) throw notFound('Médico');
    const schedule = await repo.getDoctorSchedule(doctorId);
    const slots = await daySlots(repo, doctorId, dayMs, durationMinutes, schedule, excludeId);
    return {
      doctorId,
      date: formatDate(dayMs),
      durationMinutes,
      slotMinutes: slot,
      attends: blocksFor(schedule, dayMs).length > 0,
      message: blocksFor(schedule, dayMs).length ? null : describeSchedule(doctor, schedule, dayMs),
      slots: slots.map((s) => ({
        startAt: formatDateTime(s.startMs),
        endAt: formatDateTime(s.endMs),
        time: formatDateTime(s.startMs).slice(11, 16),
        available: s.available,
        reason: s.reason,
      })),
    };
  }

  // ---------------------------------------------------------------- consultas de citas

  async function listAppointments({ startMs, endMs, doctorId, patientId, specialtyId, status }) {
    const rows = await repo.findAppointments({
      startAt: formatDateTime(startMs),
      endAt: formatDateTime(endMs),
      doctorId,
      patientId,
      specialtyId,
      status,
    });
    return rows.map(decorate);
  }

  async function getAppointment(id) {
    const appointment = await repo.getAppointment(id);
    if (!appointment) throw notFound('Cita');
    return { ...decorate(appointment), history: await repo.getHistory(id) };
  }

  async function stats(dayMs) {
    const nowMs = now();
    const weekStart = dayMs - ((weekdayOf(dayMs) + 6) % 7) * DAY; // lunes de esa semana
    const count = async (fromMs, toMs) => {
      const rows = await repo.findAppointments({ startAt: formatDateTime(fromMs), endAt: formatDateTime(toMs) });
      const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));
      for (const row of rows) byStatus[row.status] += 1;
      return { total: rows.length, byStatus };
    };
    const upcoming = await repo.findAppointments({
      startAt: formatDateTime(nowMs),
      endAt: formatDateTime(nowMs + 30 * DAY),
      statuses: BLOCKING_STATUSES,
    });
    return {
      date: formatDate(dayMs),
      day: await count(dayMs, dayMs + DAY),
      week: { from: formatDate(weekStart), to: formatDate(weekStart + 6 * DAY), ...(await count(weekStart, weekStart + 7 * DAY)) },
      upcoming: upcoming.slice(0, 5),
    };
  }

  // ---------------------------------------------------------------- comandos

  async function createAppointment(input) {
    const startMs = input.startMs;
    const endMs = resolveEnd(startMs, input, slot);

    return repo.transaction(async (tx) => {
      const doctor = await tx.lockDoctor(input.doctorId);
      if (!doctor || !doctor.active) throw notFound('Médico');
      const patient = await tx.lockPatient(input.patientId);
      if (!patient) throw notFound('Paciente');

      await assertBookable(tx, { doctor, patientId: patient.id, startMs, endMs });

      const id = await tx.insertAppointment({
        patientId: patient.id,
        doctorId: doctor.id,
        startAt: formatDateTime(startMs),
        endAt: formatDateTime(endMs),
        reason: input.reason,
        notes: input.notes ?? null,
      });
      await tx.addHistory(id, 'creada', `Agendada para el ${human(startMs)} con ${doctor.fullName}.`);
      return decorate(await tx.getAppointment(id));
    });
  }

  async function updateAppointment(id, input) {
    return repo.transaction(async (tx) => {
      const current = await loadActiveAppointment(tx, id);

      if (input.patientId !== undefined && input.patientId !== current.patientId) {
        throw new AppError(422, 'PATIENT_IMMUTABLE', 'No se puede cambiar el paciente de una cita. Cancélala y agenda una nueva.');
      }

      const currentStart = parseDateTime(current.startAt);
      const currentEnd = parseDateTime(current.endAt);
      const doctorId = input.doctorId ?? current.doctorId;
      const startMs = input.startMs ?? currentStart;
      const endMs = resolveEnd(startMs, input, (currentEnd - currentStart) / MINUTE);
      const timingChanged = doctorId !== current.doctorId || startMs !== currentStart || endMs !== currentEnd;

      const doctor = await tx.lockDoctor(doctorId);
      if (!doctor || !doctor.active) throw notFound('Médico');
      await tx.lockPatient(current.patientId);

      if (timingChanged) {
        if (!actionsFor(current).reschedule) {
          throw new AppError(409, 'INVALID_STATE', 'La cita ya inició y no puede reprogramarse.');
        }
        await assertBookable(tx, { doctor, patientId: current.patientId, startMs, endMs, excludeId: id });
      }

      const patch = {};
      if (timingChanged) {
        Object.assign(patch, { doctorId, startAt: formatDateTime(startMs), endAt: formatDateTime(endMs), status: 'programada' });
      }
      if (input.reason !== undefined && input.reason !== current.reason) patch.reason = input.reason;
      if (input.notes !== undefined && input.notes !== current.notes) patch.notes = input.notes;

      if (Object.keys(patch).length === 0) return decorate(current); // nada cambió

      await tx.updateAppointment(id, patch);
      if (timingChanged) {
        const doctorNote = doctorId !== current.doctorId ? ` Médico: ${current.doctorName} → ${doctor.fullName}.` : '';
        const resetNote = current.status === 'confirmada' ? ' Debe confirmarse de nuevo.' : '';
        await tx.addHistory(id, 'reprogramada', `De ${human(currentStart)} a ${human(startMs)}.${doctorNote}${resetNote}`);
      } else {
        await tx.addHistory(id, 'editada', 'Se actualizaron el motivo o las notas.');
      }
      return decorate(await tx.getAppointment(id));
    });
  }

  async function changeStatus(id, status) {
    if (status === 'cancelada') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Hay datos inválidos en la solicitud.', {
        fields: { status: 'Para cancelar usa POST /api/appointments/:id/cancel e indica el motivo.' },
      });
    }
    if (status === 'programada') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Hay datos inválidos en la solicitud.', {
        fields: { status: 'Una cita no puede volver a "programada"; reprográmala con PUT /api/appointments/:id.' },
      });
    }

    return repo.transaction(async (tx) => {
      const current = await loadActiveAppointment(tx, id);
      const actions = actionsFor(current);

      if (status === 'confirmada') {
        if (current.status === 'confirmada') throw new AppError(409, 'INVALID_STATE', 'La cita ya está confirmada.');
        if (!actions.confirm) throw new AppError(422, 'PAST_DATE', 'No se puede confirmar una cita que ya terminó.');
      } else if (!(status === 'completada' ? actions.complete : actions.markNoShow)) {
        throw new AppError(422, 'TOO_EARLY', 'La cita aún no ha iniciado: solo puede cerrarse cuando llegue su hora.');
      }

      await tx.updateAppointment(id, { status });
      await tx.addHistory(id, status, `Estado: ${current.status} → ${status}.`);
      return decorate(await tx.getAppointment(id));
    });
  }

  async function cancelAppointment(id, reason) {
    return repo.transaction(async (tx) => {
      const current = await loadActiveAppointment(tx, id);
      if (!actionsFor(current).cancel) {
        throw new AppError(422, 'TOO_LATE', 'La cita ya inició. Regístrala como "completada" o "no asistió".');
      }
      await tx.updateAppointment(id, {
        status: 'cancelada',
        cancelReason: reason,
        cancelledAt: formatDateTime(now()),
      });
      await tx.addHistory(id, 'cancelada', `Motivo: ${reason}`);
      return decorate(await tx.getAppointment(id));
    });
  }

  return {
    listSpecialties,
    listDoctors,
    getDoctor,
    listPatients,
    getPatient,
    createPatient,
    getAvailability,
    listAppointments,
    getAppointment,
    stats,
    createAppointment,
    updateAppointment,
    changeStatus,
    cancelAppointment,
    today: () => startOfDay(now()),
    ping: () => repo.ping(),
  };
}
