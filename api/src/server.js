// Punto de entrada: conecta con MySQL, arma el servicio y levanta el servidor HTTP.
import { createApp } from './app.js';
import { config } from './config.js';
import { createMysqlRepository, createPool } from './repositories/mysqlRepository.js';
import { createAppointmentService } from './services/appointmentService.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** MySQL tarda unos segundos en estar listo al arrancar el contenedor: reintentamos. */
async function waitForDatabase(repo, attempts = 20, delayMs = 3000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await repo.ping();
      return;
    } catch (error) {
      console.log(`[db] esperando a MySQL (${attempt}/${attempts}): ${error.code ?? error.message}`);
      if (attempt === attempts) throw error;
      await sleep(delayMs);
    }
  }
}

const repo = createMysqlRepository(createPool(config.db));
await waitForDatabase(repo);

const service = createAppointmentService({ repo, config });
const server = createApp({ service }).listen(config.port, () => {
  console.log(`[api] HIS · Citas médicas listo en http://localhost:${config.port}`);
});

async function shutdown(signal) {
  console.log(`[api] ${signal} recibido, cerrando...`);
  server.close(async () => {
    await repo.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
