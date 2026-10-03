-- ============================================================
-- Datos de ejemplo (ficticios) para probar el calendario.
-- Las citas se generan en la semana actual (lunes a viernes) para que
-- siempre haya eventos visibles, sin importar cuándo se levante el contenedor.
-- ============================================================
SET NAMES utf8mb4;

INSERT INTO specialties (id, name, color) VALUES
  (1, 'Medicina General',        '#0f766e'),
  (2, 'Pediatría',               '#1d4ed8'),
  (3, 'Cardiología',             '#9d174d'),
  (4, 'Ginecología y Obstetricia','#6d28d9'),
  (5, 'Traumatología',           '#b45309'),
  (6, 'Dermatología',            '#0e7490'),
  (7, 'Neurología',              '#4d7c0f');

INSERT INTO doctors (id, specialty_id, first_name, last_name, license_number, email, phone, office) VALUES
  (1, 3, 'Ana Lucía',        'Pérez Gómez',      'COL-1001', 'ana.perez@his.example.com',    '5555-0101', 'Consultorio 101'),
  (2, 2, 'Carlos Enrique',   'Méndez Ruiz',      'COL-1002', 'carlos.mendez@his.example.com','5555-0102', 'Consultorio 102'),
  (3, 1, 'María José',       'Castillo Lemus',   'COL-1003', 'maria.castillo@his.example.com','5555-0103','Consultorio 103'),
  (4, 4, 'Sofía Alejandra',  'Ramírez Díaz',     'COL-1004', 'sofia.ramirez@his.example.com','5555-0104', 'Consultorio 201'),
  (5, 5, 'Luis Fernando',    'Orellana Barrios', 'COL-1005', 'luis.orellana@his.example.com','5555-0105', 'Consultorio 202'),
  (6, 6, 'Karla Patricia',   'Jiménez Solís',    'COL-1006', 'karla.jimenez@his.example.com','5555-0106', 'Consultorio 203'),
  (7, 1, 'Pedro Andrés',     'Ixcoy Tzoc',       'COL-1007', 'pedro.ixcoy@his.example.com',  '5555-0107', 'Consultorio 104'),
  (8, 7, 'Lucía Fernanda',   'Barrios Cabrera',  'COL-1008', 'lucia.barrios@his.example.com','5555-0108', 'Consultorio 301');

-- Horario base: lunes a viernes, 08:00-12:00 y 14:00-17:00 (todos menos el médico 5)
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time)
SELECT d.id, w.weekday, b.start_time, b.end_time
FROM doctors d
JOIN (SELECT 1 AS weekday UNION ALL SELECT 2 UNION ALL SELECT 3
      UNION ALL SELECT 4 UNION ALL SELECT 5) w
JOIN (SELECT '08:00:00' AS start_time, '12:00:00' AS end_time
      UNION ALL SELECT '14:00:00', '17:00:00') b
WHERE d.id <> 5;

-- Traumatología: lunes, miércoles y viernes, 08:00-12:00 y 14:00-18:00
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES
  (5, 1, '08:00:00', '12:00:00'), (5, 1, '14:00:00', '18:00:00'),
  (5, 3, '08:00:00', '12:00:00'), (5, 3, '14:00:00', '18:00:00'),
  (5, 5, '08:00:00', '12:00:00'), (5, 5, '14:00:00', '18:00:00');

-- Pediatría atiende también el sábado por la mañana
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES
  (2, 6, '08:00:00', '12:00:00');

INSERT INTO patients (id, first_name, last_name, birth_date, phone, email) VALUES
  (1,  'Rosa María',      'Hernández López',   '1984-03-12', '5510-0001', 'rosa.hernandez@example.com'),
  (2,  'Juan Carlos',     'Ajú Choc',          '1991-07-30', '5510-0002', 'juan.aju@example.com'),
  (3,  'Mateo Alejandro', 'Estrada Paz',       '2019-05-21', '5510-0003', NULL),
  (4,  'Gabriela Sofía',  'Cifuentes Reyes',   '1996-11-02', '5510-0004', 'gabriela.cifuentes@example.com'),
  (5,  'Roberto Antonio', 'Villatoro Mejía',   '1978-01-18', '5510-0005', NULL),
  (6,  'Elena Beatriz',   'Monzón Girón',      '1962-09-09', '5510-0006', 'elena.monzon@example.com'),
  (7,  'Marta Lucrecia',  'Gálvez Ochoa',      '1988-06-25', '5510-0007', NULL),
  (8,  'Héctor Manuel',   'Tzoc Batz',         '1970-12-04', '5510-0008', NULL),
  (9,  'Silvia Patricia', 'Aguilar Fuentes',   '1993-04-14', '5510-0009', 'silvia.aguilar@example.com'),
  (10, 'Diego Armando',   'Salazar Prado',     '2000-08-08', '5510-0010', 'diego.salazar@example.com'),
  (11, 'Valeria Isabel',  'Castañeda Morán',   '2021-02-27', '5510-0011', NULL),
  (12, 'Óscar René',      'Palencia Cano',     '1985-10-16', '5510-0012', NULL);

-- Citas de la semana actual. day_offset: 0 = lunes ... 4 = viernes.
-- Todas respetan el horario del médico y no se solapan (ni por médico ni por paciente).
SET @monday = DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY);

INSERT INTO appointments (patient_id, doctor_id, start_at, end_at, reason, status)
SELECT s.patient_id, s.doctor_id,
       TIMESTAMP(DATE_ADD(@monday, INTERVAL s.day_offset DAY), s.start_time),
       TIMESTAMP(DATE_ADD(@monday, INTERVAL s.day_offset DAY),
                 ADDTIME(s.start_time, SEC_TO_TIME(s.minutes * 60))),
       s.reason,
       'programada'
FROM (
  SELECT 1 AS patient_id, 1 AS doctor_id, 0 AS day_offset, '08:00:00' AS start_time, 30 AS minutes, 'Control de presión arterial' AS reason
  UNION ALL SELECT 2,  3, 0, '08:30:00', 30, 'Fiebre y malestar general'
  UNION ALL SELECT 3,  2, 0, '09:00:00', 30, 'Control de niño sano'
  UNION ALL SELECT 4,  4, 0, '10:00:00', 60, 'Control prenatal'
  UNION ALL SELECT 5,  5, 0, '14:00:00', 60, 'Dolor de rodilla izquierda'
  UNION ALL SELECT 6,  1, 1, '09:00:00', 30, 'Electrocardiograma de control'
  UNION ALL SELECT 7,  6, 1, '10:30:00', 30, 'Revisión de lunares'
  UNION ALL SELECT 8,  7, 1, '14:00:00', 30, 'Chequeo médico general'
  UNION ALL SELECT 9,  8, 1, '15:00:00', 60, 'Migrañas frecuentes'
  UNION ALL SELECT 10, 3, 2, '08:00:00', 30, 'Entrega de resultados de laboratorio'
  UNION ALL SELECT 11, 2, 2, '09:30:00', 30, 'Vacunación y control de peso'
  UNION ALL SELECT 12, 5, 2, '10:00:00', 60, 'Seguimiento de fractura de muñeca'
  UNION ALL SELECT 1,  4, 2, '14:30:00', 30, 'Consulta ginecológica de rutina'
  UNION ALL SELECT 8,  1, 3, '08:30:00', 30, 'Dolor de pecho al hacer ejercicio'
  UNION ALL SELECT 2,  6, 3, '10:00:00', 30, 'Alergia en la piel'
  UNION ALL SELECT 10, 8, 4, '08:00:00', 60, 'Mareos y pérdida de equilibrio'
  UNION ALL SELECT 11, 2, 4, '09:00:00', 30, 'Control de crecimiento'
  UNION ALL SELECT 9,  3, 4, '10:30:00', 30, 'Certificado médico'
  UNION ALL SELECT 5,  5, 4, '14:00:00', 60, 'Control posoperatorio'
  UNION ALL SELECT 7,  7, 4, '15:00:00', 30, 'Chequeo anual'
) AS s;

-- Estados coherentes con la fecha en que se creó la base de datos
UPDATE appointments SET status = 'completada' WHERE start_at < NOW();
UPDATE appointments SET status = 'no_asistio' WHERE status = 'completada' AND id % 7 = 0;
UPDATE appointments SET status = 'confirmada' WHERE start_at >= NOW() AND id % 3 = 0;
UPDATE appointments
   SET status = 'cancelada',
       cancel_reason = 'El paciente solicitó reprogramar por motivos laborales',
       cancelled_at = NOW()
 WHERE start_at >= NOW() AND id % 8 = 0;

-- Bitácora inicial
INSERT INTO appointment_history (appointment_id, action, detail)
SELECT id, 'creada', 'Cita registrada (datos de ejemplo)' FROM appointments;

INSERT INTO appointment_history (appointment_id, action, detail)
SELECT id, status, 'Estado inicial de los datos de ejemplo'
FROM appointments WHERE status IN ('confirmada', 'completada', 'no_asistio');

INSERT INTO appointment_history (appointment_id, action, detail)
SELECT id, 'cancelada', CONCAT('Motivo: ', cancel_reason)
FROM appointments WHERE status = 'cancelada';
