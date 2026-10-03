// Error de negocio con código HTTP y un código estable que el frontend puede interpretar.
export class AppError extends Error {
  /**
   * @param {number} status   Código HTTP (400, 404, 409, 422...)
   * @param {string} code     Código estable en MAYÚSCULAS (p. ej. SLOT_TAKEN)
   * @param {string} message  Mensaje legible para el usuario final (español)
   * @param {object} [details] Datos extra (errores por campo, horarios sugeridos...)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const validationError = (fields) =>
  new AppError(400, 'VALIDATION_ERROR', 'Hay datos inválidos en la solicitud.', { fields });

export const notFound = (what) => new AppError(404, 'NOT_FOUND', `${what} no encontrado.`);
