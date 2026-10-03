// Repositorio MySQL. Todas las consultas son parametrizadas (nunca se concatenan datos del usuario).
//
// Contrato (lo implementa también memoryRepository.js):
//   - Las fechas entran/salen como "YYYY-MM-DDTHH:mm:ss" (hora local de la clínica).
//   - transaction(fn) ejecuta fn con un repositorio ligado a UNA conexión con BEGIN/COMMIT.
//     Dentro de la transacción, lockDoctor()/lockPatient() hacen SELECT ... FOR UPDATE para
//     serializar reservas concurrentes del mismo médico o paciente (evita la doble reserva).
import mysql from 'mysql2/promise';

const toIso = (value) => (value ? String(value).replace(' ', 'T').slice(0, 19) : null);
const toTime = (value) => String(value).slice(0, 5); // 'HH:MM:SS' -> 'HH:MM'
const toDate = (value) => (value ? String(value).slice(0, 10) : null);

const APPOINTMENT_COLUMNS = {
  patientId: 'patient_id',
  doctorId: 'doctor_id',
  startAt: 'start_at',
  endAt: 'end_at',
  reason: 'reason',
  notes: 'notes',
  status: 'status',
  cancelReason: 'cancel_reason',
  cancelledAt: 'cancelled_at',
};

const APPOINTMENT_SELECT = `
  SELECT a.id,
         a.patient_id AS patientId,
         CONCAT(p.first_name, ' ', p.last_name) AS patientName,
         a.doctor_id AS doctorId,
         CONCAT(d.first_name, ' ', d.last_name) AS doctorName,
         d.specialty_id AS specialtyId,
         s.name AS specialtyName,
         s.color AS specialtyColor,
         a.start_at AS startAt,
         a.end_at AS endAt,
         a.reason,
         a.notes,
         a.status,
         a.cancel_reason AS cancelReason,
         a.cancelled_at AS cancelledAt,
         a.created_at AS createdAt,
         a.updated_at AS updatedAt
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    JOIN specialties s ON s.id = d.specialty_id`;

const DOCTOR_SELECT = `
  SELECT d.id, d.specialty_id AS specialtyId, s.name AS specialtyName, s.color AS specialtyColor,
         d.first_name AS firstName, d.last_name AS lastName,
         d.license_number AS licenseNumber, d.email, d.phone, d.office, d.active
    FROM doctors d
    JOIN specialties s ON s.id = d.specialty_id`;

const PATIENT_SELECT = `
  SELECT id, first_name AS firstName, last_name AS lastName, birth_date AS birthDate, phone, email
    FROM patients`;

const mapAppointment = (r) => ({
  ...r,
  startAt: toIso(r.startAt),
  endAt: toIso(r.endAt),
  cancelledAt: toIso(r.cancelledAt),
  createdAt: toIso(r.createdAt),
  updatedAt: toIso(r.updatedAt),
});

const mapDoctor = (r) => ({ ...r, fullName: `${r.firstName} ${r.lastName}`, active: Boolean(r.active) });

const mapPatient = (r) => ({ ...r, fullName: `${r.firstName} ${r.lastName}`, birthDate: toDate(r.birthDate) });

/** Construye el repositorio sobre un "ejecutor" (pool o conexión de una transacción). */
function buildRepository(db) {
  const repo = {
    async listSpecialties() {
      const [rows] = await db.query('SELECT id, name, color FROM specialties ORDER BY name');
      return rows;
    },

    async listDoctors({ specialtyId, activeOnly = true } = {}) {
      const where = [];
      const params = [];
      if (activeOnly) where.push('d.active = 1');
      if (specialtyId) {
        where.push('d.specialty_id = ?');
        params.push(specialtyId);
      }
      const sql = `${DOCTOR_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.last_name, d.first_name`;
      const [rows] = await db.query(sql, params);
      return rows.map(mapDoctor);
    },

    async getDoctor(id) {
      const [rows] = await db.query(`${DOCTOR_SELECT} WHERE d.id = ?`, [id]);
      return rows[0] ? mapDoctor(rows[0]) : null;
    },

    async getDoctorSchedule(doctorId) {
      const [rows] = await db.query(
        `SELECT weekday, start_time AS startTime, end_time AS endTime
           FROM doctor_schedules WHERE doctor_id = ? ORDER BY weekday, start_time`,
        [doctorId],
      );
      return rows.map((r) => ({ weekday: r.weekday, startTime: toTime(r.startTime), endTime: toTime(r.endTime) }));
    },

    // Bloquea la fila del médico hasta el COMMIT: dos reservas simultáneas del mismo médico se
    // ejecutan una detrás de otra, y la segunda ya ve la cita de la primera al revisar solapes.
    async lockDoctor(id) {
      const [rows] = await db.query(`${DOCTOR_SELECT} WHERE d.id = ? FOR UPDATE OF d`, [id]);
      return rows[0] ? mapDoctor(rows[0]) : null;
    },

    async lockPatient(id) {
      const [rows] = await db.query(`${PATIENT_SELECT} WHERE id = ? FOR UPDATE`, [id]);
      return rows[0] ? mapPatient(rows[0]) : null;
    },

    async listPatients({ search, limit = 50 } = {}) {
      const params = [];
      let where = '';
      if (search) {
        where = "WHERE CONCAT(first_name, ' ', last_name) LIKE ?";
        params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      }
      params.push(limit);
      const [rows] = await db.query(`${PATIENT_SELECT} ${where} ORDER BY last_name, first_name LIMIT ?`, params);
      return rows.map(mapPatient);
    },

    async getPatient(id) {
      const [rows] = await db.query(`${PATIENT_SELECT} WHERE id = ?`, [id]);
      return rows[0] ? mapPatient(rows[0]) : null;
    },

    async createPatient({ firstName, lastName, birthDate = null, phone = null, email = null }) {
      const [result] = await db.query(
        'INSERT INTO patients (first_name, last_name, birth_date, phone, email) VALUES (?, ?, ?, ?, ?)',
        [firstName, lastName, birthDate, phone, email],
      );
      return repo.getPatient(result.insertId);
    },

    /** Citas que se SOLAPAN con el rango [startAt, endAt). */
    async findAppointments({ startAt, endAt, doctorId, patientId, specialtyId, status, statuses }) {
      const where = ['a.start_at < ?', 'a.end_at > ?'];
      const params = [endAt, startAt];
      if (doctorId) { where.push('a.doctor_id = ?'); params.push(doctorId); }
      if (patientId) { where.push('a.patient_id = ?'); params.push(patientId); }
      if (specialtyId) { where.push('d.specialty_id = ?'); params.push(specialtyId); }
      if (status) { where.push('a.status = ?'); params.push(status); }
      if (statuses?.length) { where.push('a.status IN (?)'); params.push(statuses); }
      const [rows] = await db.query(
        `${APPOINTMENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.start_at, a.id`,
        params,
      );
      return rows.map(mapAppointment);
    },

    async getAppointment(id) {
      const [rows] = await db.query(`${APPOINTMENT_SELECT} WHERE a.id = ?`, [id]);
      return rows[0] ? mapAppointment(rows[0]) : null;
    },

    async insertAppointment({ patientId, doctorId, startAt, endAt, reason, notes = null }) {
      const [result] = await db.query(
        `INSERT INTO appointments (patient_id, doctor_id, start_at, end_at, reason, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [patientId, doctorId, startAt, endAt, reason, notes],
      );
      return result.insertId;
    },

    /** Actualiza solo las columnas de la lista blanca (nunca nombres de columna del cliente). */
    async updateAppointment(id, patch) {
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(APPOINTMENT_COLUMNS)) {
        if (patch[key] !== undefined) {
          sets.push(`${column} = ?`);
          params.push(patch[key]);
        }
      }
      if (!sets.length) return;
      params.push(id);
      await db.query(`UPDATE appointments SET ${sets.join(', ')} WHERE id = ?`, params);
    },

    async addHistory(appointmentId, action, detail = null) {
      await db.query(
        'INSERT INTO appointment_history (appointment_id, action, detail) VALUES (?, ?, ?)',
        [appointmentId, action, detail],
      );
    },

    async getHistory(appointmentId) {
      const [rows] = await db.query(
        `SELECT id, action, detail, created_at AS createdAt
           FROM appointment_history WHERE appointment_id = ? ORDER BY created_at, id`,
        [appointmentId],
      );
      return rows.map((r) => ({ ...r, createdAt: toIso(r.createdAt) }));
    },
  };
  return repo;
}

export function createPool(dbConfig) {
  return mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    dateStrings: true, // DATETIME llega como texto: sin conversiones de zona horaria
  });
}

export function createMysqlRepository(pool) {
  return {
    ...buildRepository(pool),

    async transaction(work) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await work(buildRepository(conn));
        await conn.commit();
        return result;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async ping() {
      await pool.query('SELECT 1');
    },

    async close() {
      await pool.end();
    },
  };
}
