// Repositorio en memoria con el MISMO contrato que mysqlRepository.js.
// Se usa en las pruebas automáticas (rápidas, sin Docker) y sirve como ejemplo de la
// inversión de dependencias: el servicio no sabe si abajo hay MySQL o un arreglo.
import { formatDateTime } from '../utils/datetime.js';

/** Datos mínimos para las pruebas: 1 especialidad, 2 médicos, 3 pacientes. */
export function defaultSeed() {
  const weekdays = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, startTime: '08:00', endTime: '12:00' },
    { weekday, startTime: '14:00', endTime: '17:00' },
  ]);
  return {
    specialties: [{ id: 1, name: 'Medicina General', color: '#0f766e' }],
    doctors: [
      { id: 1, specialtyId: 1, firstName: 'Ana', lastName: 'Pérez', licenseNumber: 'COL-1', email: null, phone: null, office: 'C-101', active: true },
      { id: 2, specialtyId: 1, firstName: 'Luis', lastName: 'Gómez', licenseNumber: 'COL-2', email: null, phone: null, office: 'C-102', active: true },
      { id: 3, specialtyId: 1, firstName: 'Inactivo', lastName: 'Doctor', licenseNumber: 'COL-3', email: null, phone: null, office: null, active: false },
    ],
    schedules: { 1: weekdays, 2: weekdays, 3: weekdays },
    patients: [
      { id: 1, firstName: 'Rosa', lastName: 'Hernández', birthDate: '1984-03-12', phone: null, email: null },
      { id: 2, firstName: 'Juan', lastName: 'Ajú', birthDate: null, phone: null, email: null },
      { id: 3, firstName: 'Mateo', lastName: 'Estrada', birthDate: null, phone: null, email: null },
    ],
  };
}

export function createMemoryRepository(seed = defaultSeed(), { clock = () => formatDateTime(Date.now()) } = {}) {
  const specialties = structuredClone(seed.specialties);
  const doctors = structuredClone(seed.doctors);
  const schedules = structuredClone(seed.schedules);
  const patients = structuredClone(seed.patients);
  const appointments = [];
  const history = [];
  let nextPatientId = Math.max(0, ...patients.map((p) => p.id)) + 1;
  let nextAppointmentId = 1;
  let nextHistoryId = 1;

  const fullName = (x) => `${x.firstName} ${x.lastName}`;
  const withSpecialty = (d) => {
    const s = specialties.find((sp) => sp.id === d.specialtyId);
    return { ...d, fullName: fullName(d), specialtyName: s.name, specialtyColor: s.color };
  };
  const withPatientName = (p) => ({ ...p, fullName: fullName(p) });

  const toDto = (a) => {
    const d = withSpecialty(doctors.find((x) => x.id === a.doctorId));
    const p = patients.find((x) => x.id === a.patientId);
    return {
      id: a.id,
      patientId: a.patientId,
      patientName: fullName(p),
      doctorId: a.doctorId,
      doctorName: d.fullName,
      specialtyId: d.specialtyId,
      specialtyName: d.specialtyName,
      specialtyColor: d.specialtyColor,
      startAt: a.startAt,
      endAt: a.endAt,
      reason: a.reason,
      notes: a.notes ?? null,
      status: a.status,
      cancelReason: a.cancelReason ?? null,
      cancelledAt: a.cancelledAt ?? null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  };

  const repo = {
    async listSpecialties() {
      return [...specialties].sort((a, b) => a.name.localeCompare(b.name));
    },

    async listDoctors({ specialtyId, activeOnly = true } = {}) {
      return doctors
        .filter((d) => (!activeOnly || d.active) && (!specialtyId || d.specialtyId === specialtyId))
        .map(withSpecialty)
        .sort((a, b) => a.lastName.localeCompare(b.lastName));
    },

    async getDoctor(id) {
      const d = doctors.find((x) => x.id === id);
      return d ? withSpecialty(d) : null;
    },

    async getDoctorSchedule(doctorId) {
      return structuredClone(schedules[doctorId] ?? []);
    },

    async lockDoctor(id) {
      return repo.getDoctor(id);
    },

    async lockPatient(id) {
      return repo.getPatient(id);
    },

    async listPatients({ search, limit = 50 } = {}) {
      const term = search?.toLowerCase();
      return patients
        .filter((p) => !term || fullName(p).toLowerCase().includes(term))
        .map(withPatientName)
        .slice(0, limit);
    },

    async getPatient(id) {
      const p = patients.find((x) => x.id === id);
      return p ? withPatientName(p) : null;
    },

    async createPatient({ firstName, lastName, birthDate = null, phone = null, email = null }) {
      const patient = { id: nextPatientId++, firstName, lastName, birthDate, phone, email };
      patients.push(patient);
      return withPatientName(patient);
    },

    async findAppointments({ startAt, endAt, doctorId, patientId, specialtyId, status, statuses }) {
      return appointments
        .filter((a) => a.startAt < endAt && a.endAt > startAt)
        .filter((a) => !doctorId || a.doctorId === doctorId)
        .filter((a) => !patientId || a.patientId === patientId)
        .filter((a) => !specialtyId || doctors.find((d) => d.id === a.doctorId).specialtyId === specialtyId)
        .filter((a) => !status || a.status === status)
        .filter((a) => !statuses?.length || statuses.includes(a.status))
        .sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : a.id - b.id))
        .map(toDto);
    },

    async getAppointment(id) {
      const a = appointments.find((x) => x.id === id);
      return a ? toDto(a) : null;
    },

    async insertAppointment({ patientId, doctorId, startAt, endAt, reason, notes = null }) {
      const now = clock();
      const appointment = {
        id: nextAppointmentId++, patientId, doctorId, startAt, endAt, reason, notes,
        status: 'programada', cancelReason: null, cancelledAt: null, createdAt: now, updatedAt: now,
      };
      appointments.push(appointment);
      return appointment.id;
    },

    async updateAppointment(id, patch) {
      const a = appointments.find((x) => x.id === id);
      const allowed = ['patientId', 'doctorId', 'startAt', 'endAt', 'reason', 'notes', 'status', 'cancelReason', 'cancelledAt'];
      for (const key of allowed) if (patch[key] !== undefined) a[key] = patch[key];
      a.updatedAt = clock();
    },

    async addHistory(appointmentId, action, detail = null) {
      history.push({ id: nextHistoryId++, appointmentId, action, detail, createdAt: clock() });
    },

    async getHistory(appointmentId) {
      return history
        .filter((h) => h.appointmentId === appointmentId)
        .map(({ id, action, detail, createdAt }) => ({ id, action, detail, createdAt }));
    },

    // En memoria no hay concurrencia real (JavaScript es de un solo hilo y los métodos no esperan E/S).
    async transaction(work) {
      return work(repo);
    },

    async ping() {},
    async close() {},
  };
  return repo;
}
