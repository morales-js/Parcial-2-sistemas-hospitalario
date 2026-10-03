-- ============================================================
-- HIS · Módulo de control de citas médicas · Esquema MySQL 8
-- Se ejecuta automáticamente la primera vez que arranca el contenedor.
-- ============================================================
SET NAMES utf8mb4;

-- Especialidades médicas (el color se usa en el calendario)
CREATE TABLE specialties (
  id    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name  VARCHAR(80)       NOT NULL,
  color CHAR(7)           NOT NULL DEFAULT '#0f766e',
  PRIMARY KEY (id),
  UNIQUE KEY uq_specialties_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Médicos
CREATE TABLE doctors (
  id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  specialty_id   SMALLINT UNSIGNED NOT NULL,
  first_name     VARCHAR(80)       NOT NULL,
  last_name      VARCHAR(80)       NOT NULL,
  license_number VARCHAR(30)       NOT NULL,
  email          VARCHAR(120)      NULL,
  phone          VARCHAR(30)       NULL,
  office         VARCHAR(40)       NULL,
  active         TINYINT(1)        NOT NULL DEFAULT 1,
  created_at     TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_doctors_license (license_number),
  KEY idx_doctors_specialty (specialty_id),
  CONSTRAINT fk_doctors_specialty FOREIGN KEY (specialty_id) REFERENCES specialties (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Horario de atención semanal del médico (puede haber varios bloques por día).
-- weekday: 0 = domingo ... 6 = sábado (igual que Date.getDay() en JavaScript)
CREATE TABLE doctor_schedules (
  id         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  doctor_id  INT UNSIGNED     NOT NULL,
  weekday    TINYINT UNSIGNED NOT NULL,
  start_time TIME             NOT NULL,
  end_time   TIME             NOT NULL,
  PRIMARY KEY (id),
  KEY idx_schedules_doctor_day (doctor_id, weekday),
  CONSTRAINT fk_schedules_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE,
  CONSTRAINT chk_schedules_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT chk_schedules_range CHECK (end_time > start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pacientes (datos mínimos para agendar; el expediente clínico vive en otro módulo)
CREATE TABLE patients (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name  VARCHAR(80)  NOT NULL,
  last_name   VARCHAR(80)  NOT NULL,
  birth_date  DATE         NULL,
  phone       VARCHAR(30)  NULL,
  email       VARCHAR(120) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_patients_name (last_name, first_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Citas. Las fechas son hora local de la clínica (DATETIME, sin zona horaria).
-- Las citas NUNCA se borran: se cancelan (status = 'cancelada') para conservar el historial.
CREATE TABLE appointments (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id    INT UNSIGNED    NOT NULL,
  doctor_id     INT UNSIGNED    NOT NULL,
  start_at      DATETIME        NOT NULL,
  end_at        DATETIME        NOT NULL,
  reason        VARCHAR(255)    NOT NULL,
  notes         TEXT            NULL,
  status        ENUM('programada','confirmada','completada','cancelada','no_asistio')
                                NOT NULL DEFAULT 'programada',
  cancel_reason VARCHAR(255)    NULL,
  cancelled_at  DATETIME        NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Índices que usan las consultas de disponibilidad y de rango del calendario
  KEY idx_appt_doctor_time  (doctor_id, start_at, end_at),
  KEY idx_appt_patient_time (patient_id, start_at, end_at),
  KEY idx_appt_start        (start_at),
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
  CONSTRAINT fk_appt_doctor  FOREIGN KEY (doctor_id)  REFERENCES doctors (id),
  CONSTRAINT chk_appt_range  CHECK (end_at > start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bitácora de cambios de cada cita (auditoría)
CREATE TABLE appointment_history (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id BIGINT UNSIGNED NOT NULL,
  action         ENUM('creada','editada','reprogramada','confirmada','completada','no_asistio','cancelada')
                                 NOT NULL,
  detail         VARCHAR(500)    NULL,
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_appointment (appointment_id, created_at),
  CONSTRAINT fk_history_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
