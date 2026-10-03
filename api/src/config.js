// Configuración centralizada: todo viene de variables de entorno con valores por defecto.
const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = Object.freeze({
  port: int(process.env.PORT, 3000),

  // Zona horaria de la clínica: define qué significa "ahora" para validar citas en el pasado.
  clinicTimeZone: process.env.CLINIC_TIMEZONE ?? 'America/Guatemala',

  // Reglas de agenda
  slotMinutes: int(process.env.SLOT_MINUTES, 30), // granularidad de la agenda
  maxDurationMinutes: int(process.env.MAX_DURATION_MINUTES, 120),
  suggestionsCount: 3, // alternativas que se ofrecen cuando el horario está ocupado
  suggestionsLookaheadDays: 14,

  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'citas_user',
    password: process.env.DB_PASSWORD ?? 'cambia_esta_clave_app',
    database: process.env.DB_NAME ?? 'his_citas',
  },
});
