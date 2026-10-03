// Ensambla Express: API REST bajo /api y el frontend estático (calendario) en /.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { AppError } from './errors.js';
import { createApiRouter } from './routes/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es un JSON válido.' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud es demasiado grande.' } });
  }
  // Interbloqueo o espera de bloqueo en MySQL: el cliente puede reintentar
  if (err?.code === 'ER_LOCK_DEADLOCK' || err?.code === 'ER_LOCK_WAIT_TIMEOUT') {
    return res.status(503).json({ error: { code: 'BUSY', message: 'El sistema está ocupado. Intenta de nuevo en unos segundos.' } });
  }

  console.error(err); // el detalle técnico queda en el log del servidor, no se envía al cliente
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado. Intenta de nuevo.' } });
}

export function createApp({
  service,
  webDir = path.resolve(here, '../../web'),
  modulesDir = path.resolve(here, '../node_modules'),
}) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  app.use('/api', express.json({ limit: '100kb' }), createApiRouter(service));
  app.use('/api', (req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `La ruta ${req.method} ${req.originalUrl} no existe.` } }),
  );

  // FullCalendar se sirve desde las dependencias instaladas (sin depender de un CDN externo).
  app.get('/vendor/fullcalendar.js', (req, res, next) =>
    res.sendFile(path.join(modulesDir, 'fullcalendar/index.global.min.js'), (err) => err && next(err)),
  );
  app.get('/vendor/fullcalendar-es.js', (req, res, next) =>
    res.sendFile(path.join(modulesDir, '@fullcalendar/core/locales/es.global.min.js'), (err) => err && next(err)),
  );

  app.use(express.static(webDir));
  app.use(errorHandler);
  return app;
}
