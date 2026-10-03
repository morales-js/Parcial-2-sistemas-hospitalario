// Cliente de la API REST. Todas las llamadas devuelven JSON o lanzan ApiError con un mensaje legible.

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message ?? 'No se pudo completar la solicitud.');
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.error?.code ?? 'UNKNOWN';
    this.details = payload?.error?.details ?? null;
  }
}

async function request(method, path, { query, body } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  }
  const qs = params.toString();

  let response;
  try {
    response = await fetch(`/api${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, {
      error: { code: 'NETWORK', message: 'No hay conexión con el servidor. Verifica que la API esté en ejecución.' },
    });
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

export const api = {
  specialties: () => request('GET', '/specialties'),
  doctors: (specialtyId) => request('GET', '/doctors', { query: { specialtyId } }),
  doctor: (id) => request('GET', `/doctors/${id}`),
  availability: (doctorId, date, duration, exclude) =>
    request('GET', `/doctors/${doctorId}/availability`, { query: { date, duration, exclude } }),

  patients: (search) => request('GET', '/patients', { query: { search, limit: 30 } }),
  createPatient: (body) => request('POST', '/patients', { body }),

  appointments: (filters) => request('GET', '/appointments', { query: filters }),
  appointment: (id) => request('GET', `/appointments/${id}`),
  stats: (date) => request('GET', '/appointments/stats', { query: { date } }),
  createAppointment: (body) => request('POST', '/appointments', { body }),
  updateAppointment: (id, body) => request('PUT', `/appointments/${id}`, { body }),
  setStatus: (id, status) => request('PATCH', `/appointments/${id}/status`, { body: { status } }),
  cancel: (id, reason) => request('POST', `/appointments/${id}/cancel`, { body: { reason } }),
};
