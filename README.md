# Parcial 2 · Sistema Hospitalario Integrado (HIS)

Demo de un sistema hospitalario para la entrega del parcial 2. El repositorio reúne **dos partes que se ejecutan por separado**:

| Parte | Qué es | Carpetas | Puerto |
|-------|--------|----------|--------|
| **A. Dashboard base (Flask)** | Pacientes, médicos, citas (vista de ejemplo), facturación e inventario con datos de ejemplo | `app.py`, `hospital_data.py`, `templates/`, `static/` | 5000 |
| **B. Módulo funcional de control de citas** | Calendario interactivo + API REST + MySQL en Docker | `api/`, `web/`, `db/`, `docker-compose.yml`, `docs/` | 3000 |

> La página `/citas` del dashboard (Parte A) muestra citas de ejemplo. El módulo **completamente funcional** de agendar, reprogramar y cancelar es la **Parte B**.

---

## Parte A · Dashboard base (Flask)

Este proyecto es una demo rápida de un sistema hospitalario para la entrega del parcial 2. Incluye módulos de pacientes, médicos, citas, facturación e inventario con datos de ejemplo para mostrar la funcionalidad de una clínica moderna.

### Funcionalidades principales

- Gestión de pacientes
- Gestión de médicos
- Control de citas médicas
- Vista de facturación
- Inventario y stock hospitalario
- Dashboard con estadísticas generales

### Ejecución rápida

1. Crear entorno virtual:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Linux/macOS
   .venv\Scripts\activate     # Windows
   ```

2. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```

3. Ejecutar la aplicación:
   ```bash
   python app.py
   ```

4. Abrir en el navegador:
   ```text
   http://localhost:5000
   ```

### Estructura

- app.py -> aplicación principal
- hospital_data.py -> base de datos mock y datos de ejemplo
- templates/ -> vistas HTML
- static/ -> estilos CSS

### Nota del parcial

La aplicación está construida con enfoque académico y funcional, priorizando rapidez y presentación visual sobre complejidad de infraestructura.

---

## Parte B · Módulo funcional: Control de citas médicas

Calendario interactivo (FullCalendar) para **agendar, programar, reprogramar y cancelar** citas médicas,
respaldado por una **API REST propia** (Node.js + Express) y una base de datos **MySQL 8 en un contenedor Docker**.

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + JavaScript (módulos ES) · FullCalendar 6 |
| API REST | Node.js 22 · Express 5 · mysql2 |
| Base de datos | MySQL 8.0 (Docker) |
| Orquestación | Docker Compose |
| Pruebas | `node:test` (incluido en Node, sin dependencias extra) |

---

### 1. Inicio rápido

Requisitos: **Docker Desktop** en ejecución y Git.

```bash
git clone https://github.com/morales-js/Parcial-2-sistemas-hospitalario.git
cd Parcial-2-sistemas-hospitalario

cp .env.example .env          # en CMD/PowerShell: copy .env.example .env
docker compose up -d --build
```

Abre **http://localhost:3000**. La primera vez MySQL ejecuta `db/init/*.sql` y carga datos de ejemplo
(8 médicos, 12 pacientes y ~20 citas en la semana actual). La API espera a que MySQL esté listo.

Comandos útiles:

```bash
docker compose logs -f api        # ver el log de la API
docker compose ps                 # estado de los contenedores
docker compose down               # detener (conserva los datos)
docker compose down -v            # detener y BORRAR la base de datos (se recrea con datos de ejemplo)
```

> Los scripts de `db/init` solo corren cuando el volumen está vacío. Si cambias el esquema, usa `docker compose down -v`.

Para conectarte a MySQL desde Workbench/DBeaver: `localhost`, puerto **3307**, usuario y clave de tu `.env`.

---

### 2. Qué puede hacer el usuario

- **Agendar**: botón *Nueva cita*, o clic / arrastre sobre un espacio vacío del calendario (toma fecha, hora y duración).
- **Elegir horario con ayuda visual**: los horarios ocupados o pasados salen **tachados y deshabilitados**; si el día está lleno, *Buscar el siguiente día con horarios*.
- **Reprogramar**: arrastrando la cita a otro espacio, estirándola para cambiar su duración, o desde *Detalle → Reprogramar*.
- **Cancelar** con motivo obligatorio (la cita se conserva con su historial; el horario queda libre).
- **Confirmar**, y cerrar como **Completada** o **No asistió** cuando llega su hora.
- **Registrar un paciente nuevo** sin salir del formulario.
- **Filtrar** por especialidad, médico y estado; con un médico elegido se sombrea *su* horario de atención.
- **Historial** de cada cita (creada, reprogramada, confirmada, cancelada…).
- Vistas mes / semana / día / agenda, indicadores del día y la semana, y vista de lista en móviles.

### Cuando algo sale mal, el sistema explica y propone

Si el horario ya está ocupado, el servidor responde `409` con **alternativas cercanas** y el formulario las muestra como botones:

```json
{
  "error": {
    "code": "SLOT_TAKEN",
    "message": "Ana Pérez ya tiene una cita en ese horario.",
    "details": { "suggestions": [{ "startAt": "2026-10-06T09:30:00", "endAt": "2026-10-06T10:00:00" }] }
  }
}
```

---

### 3. API REST

Base: `http://localhost:3000/api` · Fechas: `YYYY-MM-DDTHH:mm:ss` (hora local de la clínica, sin zona horaria).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado de la API y la base de datos |
| GET | `/specialties` | Especialidades (con color) |
| GET | `/doctors?specialtyId=` | Médicos activos |
| GET | `/doctors/:id` | Médico + horario semanal de atención |
| GET | `/doctors/:id/availability?date=YYYY-MM-DD&duration=30&exclude=` | Espacios del día (libres / ocupados / pasados) |
| GET | `/patients?search=&limit=` | Buscar pacientes |
| POST | `/patients` | Registrar paciente |
| GET | `/patients/:id` | Detalle de paciente |
| GET | `/appointments?start=&end=&doctorId=&specialtyId=&patientId=&status=` | Citas que se solapan con el rango (máx. 100 días) |
| GET | `/appointments/stats?date=` | Conteos del día y la semana + próximas citas |
| GET | `/appointments/:id` | Detalle + historial + acciones permitidas |
| POST | `/appointments` | **Agendar** |
| PUT / PATCH | `/appointments/:id` | **Reprogramar / editar** (campos parciales) |
| PATCH | `/appointments/:id/status` | Confirmar · completar · no asistió |
| POST | `/appointments/:id/cancel` | **Cancelar** (`{ "reason": "..." }` obligatorio) |
| DELETE | `/appointments/:id?reason=` | Equivale a cancelar: en un sistema clínico no se borran registros |

Ejemplo — agendar:

```bash
curl -X POST http://localhost:3000/api/appointments \
  -H "Content-Type: application/json" \
  -d '{"patientId":1,"doctorId":1,"startAt":"2026-10-06T09:00:00","durationMinutes":30,"reason":"Control de presión arterial"}'
```

Códigos de error: `400` datos inválidos (`VALIDATION_ERROR`, con detalle por campo) · `404` no existe ·
`409` conflicto (`SLOT_TAKEN`, `PATIENT_BUSY`, `INVALID_STATE`) · `422` regla de negocio
(`PAST_DATE`, `OUTSIDE_SCHEDULE`, `INVALID_SLOT`, `INVALID_DURATION`, `TOO_EARLY`, `TOO_LATE`) · `503` MySQL ocupado.

Hay una colección lista para importar en Postman: [`docs/postman_collection.json`](docs/postman_collection.json).

---

### 4. Reglas de negocio

1. Una cita dura 30–120 min, en bloques de 30, y empieza en punto o y media.
2. Solo dentro del **horario de atención** del médico (tabla `doctor_schedules`; no cruza el almuerzo).
3. No se agenda en el pasado.
4. **Sin doble reserva**: ni el médico ni el paciente pueden tener dos citas activas que se solapen.
   Citas "pegadas" (una termina cuando empieza la otra) están permitidas.
5. Estados: `programada → confirmada → completada | no_asistio`, y `cancelada`.
   Solo las citas `programada` y `confirmada` ocupan agenda.
6. Cancelar y reprogramar solo antes de que la cita inicie; completar / "no asistió" solo cuando ya inició.
7. Reprogramar una cita confirmada la devuelve a `programada` (hay que confirmar de nuevo).
8. No se puede cambiar el paciente de una cita (se cancela y se agenda otra).

La API decide qué acciones están permitidas (`allowedActions` en cada cita) y el frontend solo las muestra:
las reglas viven en un único lugar.

---

### 5. Arquitectura y decisiones

```
Navegador (FullCalendar) ──HTTP/JSON──▶ Express (routes) ──▶ Service (reglas) ──▶ Repository ──▶ MySQL
                                           validation.js      appointmentService     mysql | memoria
```

- **Responsabilidad única (SRP)**: `routes` traduce HTTP, `validation` revisa la forma de los datos,
  `services` aplica las reglas, `repositories` hablan con la base de datos.
- **Inversión de dependencias**: el servicio recibe un *repositorio*. En producción es MySQL; en las pruebas es
  una versión en memoria con el mismo contrato, por eso la suite corre en milisegundos y sin Docker.
- **Concurrencia**: crear / reprogramar corre en una **transacción** que bloquea la fila del médico y del paciente
  (`SELECT … FOR UPDATE`) antes de revisar solapes, para que dos usuarios no reserven el mismo horario a la vez.
- **Seguridad**: consultas parametrizadas, columnas actualizables en lista blanca, el frontend inserta datos con
  `textContent` (nunca `innerHTML`, evita XSS), la API corre como usuario no-root en Docker y el servidor no
  filtra detalles técnicos en los errores 500.
- **Historial clínico intacto**: las citas no se eliminan; se cancelan y quedan en `appointment_history`.
- **Fechas "de pared"**: la hora se guarda como `DATETIME` local y se calcula sin depender de la zona horaria del servidor.
- **Accesibilidad**: `<dialog>` nativo (foco atrapado, Escape cierra), citas enfocables con Tab y abribles con Enter,
  estados con símbolo + texto (no solo color), mensajes de error en regiones `role="alert"`, foco visible.

---

### 6. Desarrollo y pruebas

```bash
cd api
npm install
npm test            # 37 pruebas: fechas, reglas de negocio y todos los endpoints
```

Ejecutar la API fuera de Docker (solo MySQL en el contenedor):

```bash
docker compose up -d db
cd api
# Git Bash:
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=citas_user DB_PASSWORD=<tu clave> npm run dev
# PowerShell:
#   $env:DB_PORT=3307; $env:DB_PASSWORD="<tu clave>"; npm run dev
```

Variables de entorno de la API: `PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`CLINIC_TIMEZONE` (por defecto `America/Guatemala`), `SLOT_MINUTES`, `MAX_DURATION_MINUTES`.

---

### 7. Estructura del repositorio

```
├── docker-compose.yml        MySQL + API
├── .env.example              variables (copiar a .env)
├── db/init/
│   ├── 01-schema.sql         tablas, claves, índices y restricciones
│   └── 02-seed.sql           datos de ejemplo
├── api/
│   ├── Dockerfile
│   ├── src/
│   │   ├── server.js · app.js · config.js · errors.js · validation.js
│   │   ├── routes/api.js
│   │   ├── services/appointmentService.js     reglas de negocio
│   │   ├── repositories/mysqlRepository.js    SQL
│   │   ├── repositories/memoryRepository.js   para pruebas
│   │   └── utils/datetime.js
│   ├── support/testApi.js    arranque de la API para pruebas
│   └── test/                 pruebas automáticas
├── web/                      calendario (index.html, css/, js/)
└── docs/postman_collection.json
```

---

### 8. Alcance y siguientes pasos

- **Autenticación y roles** no están incluidos: el módulo se integraría con el login del HIS (p. ej. el token del módulo Laravel).
- El `patientId` del módulo de citas debe alinearse con el expediente clínico (EMR) cuando se integren ambos.
- Mejoras posibles: recordatorios por correo/SMS, lista de espera, citas recurrentes, excepciones de horario (vacaciones/feriados).
