// Capa HTTP: traduce solicitudes a llamadas del servicio. Sin reglas de negocio aquí.
import { Router } from 'express';
import { validationError } from '../errors.js';
import { parseDate } from '../utils/datetime.js';
import {
  toPositiveInt,
  validateAppointmentFilters,
  validateAppointmentInput,
  validateAvailabilityQuery,
  validateCancelInput,
  validatePatientInput,
  validateStatusInput,
} from '../validation.js';

function idParam(value) {
  const id = toPositiveInt(value);
  if (id === null) throw validationError({ id: 'El identificador debe ser un número entero positivo.' });
  return id;
}

export function createApiRouter(service) {
  const router = Router();

  // ------------------------------------------------------------------ salud
  router.get('/health', async (req, res) => {
    try {
      await service.ping();
      res.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  // ------------------------------------------------------------------ catálogos
  router.get('/specialties', async (req, res) => {
    res.json(await service.listSpecialties());
  });

  router.get('/doctors', async (req, res) => {
    const specialtyId = req.query.specialtyId ? idParam(req.query.specialtyId) : undefined;
    res.json(await service.listDoctors({ specialtyId }));
  });

  router.get('/doctors/:id', async (req, res) => {
    res.json(await service.getDoctor(idParam(req.params.id)));
  });

  router.get('/doctors/:id/availability', async (req, res) => {
    const doctorId = idParam(req.params.id);
    const { dateMs, durationMinutes, excludeId } = validateAvailabilityQuery(req.query);
    res.json(await service.getAvailability(doctorId, dateMs, durationMinutes, excludeId));
  });

  // ------------------------------------------------------------------ pacientes
  router.get('/patients', async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : undefined;
    const limit = Math.min(toPositiveInt(req.query.limit) ?? 50, 200);
    res.json(await service.listPatients({ search, limit }));
  });

  router.post('/patients', async (req, res) => {
    const patient = await service.createPatient(validatePatientInput(req.body));
    res.status(201).location(`/api/patients/${patient.id}`).json(patient);
  });

  router.get('/patients/:id', async (req, res) => {
    res.json(await service.getPatient(idParam(req.params.id)));
  });

  // ------------------------------------------------------------------ citas
  // Importante: /stats se declara antes que /:id para que no se interprete como un identificador.
  router.get('/appointments/stats', async (req, res) => {
    let dayMs = service.today();
    if (req.query.date !== undefined) {
      dayMs = parseDate(req.query.date);
      if (dayMs === null) throw validationError({ date: '"date" debe tener el formato YYYY-MM-DD.' });
    }
    res.json(await service.stats(dayMs));
  });

  router.get('/appointments', async (req, res) => {
    res.json(await service.listAppointments(validateAppointmentFilters(req.query)));
  });

  router.post('/appointments', async (req, res) => {
    const appointment = await service.createAppointment(validateAppointmentInput(req.body));
    res.status(201).location(`/api/appointments/${appointment.id}`).json(appointment);
  });

  router.get('/appointments/:id', async (req, res) => {
    res.json(await service.getAppointment(idParam(req.params.id)));
  });

  // Reprogramar o editar (PUT y PATCH aceptan campos parciales)
  const update = async (req, res) => {
    const id = idParam(req.params.id);
    res.json(await service.updateAppointment(id, validateAppointmentInput(req.body, { partial: true })));
  };
  router.put('/appointments/:id', update);
  router.patch('/appointments/:id', update);

  // Confirmar / completar / marcar "no asistió"
  router.patch('/appointments/:id/status', async (req, res) => {
    const id = idParam(req.params.id);
    const { status } = validateStatusInput(req.body);
    res.json(await service.changeStatus(id, status));
  });

  // Cancelar (cancelación lógica: la cita se conserva con su motivo y su historial)
  router.post('/appointments/:id/cancel', async (req, res) => {
    const id = idParam(req.params.id);
    const { reason } = validateCancelInput(req.body);
    res.json(await service.cancelAppointment(id, reason));
  });

  // DELETE equivale a cancelar: en un sistema clínico no se borran registros.
  router.delete('/appointments/:id', async (req, res) => {
    const id = idParam(req.params.id);
    const { reason } = validateCancelInput({ reason: req.body?.reason ?? req.query.reason });
    res.json(await service.cancelAppointment(id, reason));
  });

  return router;
}
