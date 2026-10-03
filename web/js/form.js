// Diálogo para agendar y reprogramar citas.
import { api, ApiError } from './api.js';
import {
  clear, debounce, el, formatDateTime, hideError, minutesBetween, showError,
  summarizeSchedule, toLocalDate, toast, wireDialogClose,
} from './util.js';

const $ = (selector) => document.querySelector(selector);
const DURATIONS = [30, 60, 90, 120];

export function initAppointmentForm({ specialties, doctors, onSaved }) {
  const dialog = $('#appointment-dialog');
  const form = $('#appointment-form');
  const alertBox = $('#form-alert');
  const title = $('#appt-title');
  const submit = $('#f-submit');

  const specialtySel = $('#f-specialty');
  const doctorSel = $('#f-doctor');
  const doctorHint = $('#f-doctor-hint');
  const patientSearch = $('#f-patient-search');
  const patientSel = $('#f-patient');
  const newPatientBtn = $('#btn-new-patient');
  const dateInput = $('#f-date');
  const durationSel = $('#f-duration');
  const slotsBox = $('#slots');
  const slotsStatus = $('#slots-status');
  const nextDayBtn = $('#btn-next-day');
  const reasonInput = $('#f-reason');
  const notesInput = $('#f-notes');

  const np = {
    box: $('#new-patient'), alert: $('#np-alert'), first: $('#np-first'), last: $('#np-last'),
    phone: $('#np-phone'), email: $('#np-email'), birth: $('#np-birth'),
  };

  const state = { appointment: null, selectedStart: null, loadToken: 0 };
  const scheduleCache = new Map();

  wireDialogClose(dialog);

  // ------------------------------------------------------------------ listas desplegables

  function fillSpecialties() {
    clear(specialtySel);
    specialtySel.append(el('option', { value: '' }, 'Todas las especialidades'));
    for (const s of specialties) specialtySel.append(el('option', { value: s.id }, s.name));
  }

  function fillDoctors(specialtyId, selectedId) {
    clear(doctorSel);
    doctorSel.append(el('option', { value: '' }, 'Selecciona un médico'));
    for (const d of doctors.filter((x) => !specialtyId || x.specialtyId === Number(specialtyId))) {
      doctorSel.append(
        el('option', { value: d.id, selected: Number(selectedId) === d.id }, `${d.fullName} · ${d.specialtyName}`),
      );
    }
  }

  async function loadPatients(search = '', selectedId) {
    try {
      const patients = await api.patients(search);
      const keep = selectedId ?? patientSel.value;
      clear(patientSel);
      patientSel.append(el('option', { value: '' }, patients.length ? 'Selecciona un paciente' : 'Sin resultados'));
      for (const p of patients) {
        patientSel.append(el('option', { value: p.id, selected: String(p.id) === String(keep) }, p.fullName));
      }
    } catch (error) {
      showError(alertBox, error);
    }
  }

  async function updateDoctorHint() {
    const id = doctorSel.value;
    doctorHint.textContent = '';
    if (!id) return;
    try {
      if (!scheduleCache.has(id)) scheduleCache.set(id, (await api.doctor(id)).schedule);
      if (doctorSel.value === id) doctorHint.textContent = `Atiende: ${summarizeSchedule(scheduleCache.get(id))}`;
    } catch {
      /* el aviso es opcional */
    }
  }

  // ------------------------------------------------------------------ horarios disponibles

  async function refreshSlots() {
    clear(slotsBox);
    nextDayBtn.hidden = true;
    const doctorId = doctorSel.value;
    const date = dateInput.value;
    if (!doctorId || !date) {
      slotsStatus.textContent = 'Elige un médico y una fecha para ver los horarios disponibles.';
      return;
    }

    const token = ++state.loadToken;
    slotsStatus.textContent = 'Buscando horarios…';
    slotsBox.setAttribute('aria-busy', 'true');

    let data;
    try {
      data = await api.availability(doctorId, date, durationSel.value, state.appointment?.id);
    } catch (error) {
      if (token !== state.loadToken) return;
      slotsBox.removeAttribute('aria-busy');
      slotsStatus.textContent = error.message;
      return;
    }
    if (token !== state.loadToken) return; // llegó una respuesta vieja: se ignora
    slotsBox.removeAttribute('aria-busy');

    if (!data.attends) {
      state.selectedStart = null;
      slotsStatus.textContent = `${data.message} Prueba con otra fecha.`;
      nextDayBtn.hidden = false;
      return;
    }

    const free = data.slots.filter((s) => s.available);
    if (!free.some((s) => s.startAt === state.selectedStart)) {
      if (state.selectedStart) slotsStatus.dataset.lost = '1';
      state.selectedStart = null;
    }

    for (const slot of data.slots) {
      const reasonText = slot.reason === 'ocupado' ? 'ocupado' : 'ya pasó';
      const input = el('input', {
        type: 'radio',
        name: 'slot',
        value: slot.startAt,
        disabled: !slot.available,
        checked: slot.available && slot.startAt === state.selectedStart,
        'aria-label': slot.available ? slot.time : `${slot.time}, ${reasonText}`,
      });
      input.addEventListener('change', () => {
        state.selectedStart = slot.startAt;
        hideError(alertBox);
      });
      slotsBox.append(
        el(
          'label',
          { class: `slot${slot.available ? '' : ' unavailable'}`, title: slot.available ? false : `Horario ${reasonText}` },
          input,
          el('span', {}, slot.time),
        ),
      );
    }

    if (!free.length) {
      slotsStatus.textContent = 'No quedan horarios libres para esta fecha.';
      nextDayBtn.hidden = false;
    } else {
      const lost = slotsStatus.dataset.lost === '1';
      delete slotsStatus.dataset.lost;
      slotsStatus.textContent =
        `${lost ? 'El horario elegido ya no está disponible. ' : ''}` +
        `${free.length} de ${data.slots.length} horarios libres. Los tachados están ocupados o ya pasaron.`;
    }
  }

  async function findNextDay() {
    const doctorId = doctorSel.value;
    if (!doctorId || !dateInput.value) return;
    nextDayBtn.disabled = true;
    slotsStatus.textContent = 'Buscando el siguiente día con horarios libres…';
    const cursor = new Date(`${dateInput.value}T12:00:00`);
    try {
      for (let i = 0; i < 21; i += 1) {
        cursor.setDate(cursor.getDate() + 1);
        const day = toLocalDate(cursor);
        const data = await api.availability(doctorId, day, durationSel.value, state.appointment?.id);
        if (data.slots.some((s) => s.available)) {
          dateInput.value = day;
          state.selectedStart = null;
          await refreshSlots();
          return;
        }
      }
      slotsStatus.textContent = 'No se encontraron horarios libres en las próximas 3 semanas.';
    } catch (error) {
      slotsStatus.textContent = error.message;
    } finally {
      nextDayBtn.disabled = false;
    }
  }

  function applySuggestion(suggestion) {
    hideError(alertBox);
    dateInput.value = suggestion.startAt.slice(0, 10);
    state.selectedStart = suggestion.startAt;
    refreshSlots();
  }

  // ------------------------------------------------------------------ paciente nuevo

  function toggleNewPatient(show) {
    np.box.hidden = !show;
    hideError(np.alert);
    if (show) np.first.focus();
    else newPatientBtn.focus();
  }

  async function saveNewPatient() {
    hideError(np.alert);
    const body = { firstName: np.first.value.trim(), lastName: np.last.value.trim() };
    if (np.phone.value.trim()) body.phone = np.phone.value.trim();
    if (np.email.value.trim()) body.email = np.email.value.trim();
    if (np.birth.value) body.birthDate = np.birth.value;
    try {
      const patient = await api.createPatient(body);
      patientSearch.value = '';
      await loadPatients('', patient.id);
      for (const input of [np.first, np.last, np.phone, np.email, np.birth]) input.value = '';
      toggleNewPatient(false);
      toast(`Paciente registrado: ${patient.fullName}`);
    } catch (error) {
      if (error instanceof ApiError) showError(np.alert, error);
      else throw error;
    }
  }

  // ------------------------------------------------------------------ guardar

  async function handleSubmit(event) {
    event.preventDefault();
    hideError(alertBox);

    const problems = {};
    if (!doctorSel.value) problems.doctor = 'Selecciona un médico.';
    if (!patientSel.value) problems.patient = 'Selecciona un paciente o registra uno nuevo.';
    if (!state.selectedStart) problems.slot = 'Elige uno de los horarios disponibles.';
    if (reasonInput.value.trim().length < 3) problems.reason = 'Escribe el motivo de la consulta (mínimo 3 caracteres).';
    if (Object.keys(problems).length) {
      showError(alertBox, { message: 'Completa los datos obligatorios:', details: { fields: problems } });
      return;
    }

    const notes = notesInput.value.trim();
    const common = {
      doctorId: Number(doctorSel.value),
      startAt: state.selectedStart,
      durationMinutes: Number(durationSel.value),
      reason: reasonInput.value.trim(),
    };

    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    try {
      if (state.appointment) {
        await api.updateAppointment(state.appointment.id, { ...common, notes: notes || null });
        toast('Cita reprogramada correctamente.');
      } else {
        await api.createAppointment({ ...common, patientId: Number(patientSel.value), ...(notes && { notes }) });
        toast('Cita agendada correctamente.');
      }
      dialog.close();
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        showError(alertBox, error, { onSuggestion: applySuggestion });
        // Si alguien más ocupó el horario, la lista se actualiza para mostrarlo
        if (error.status === 409 || error.code === 'OUTSIDE_SCHEDULE') refreshSlots();
      } else {
        console.error(error);
        showError(alertBox, { message: 'Ocurrió un error inesperado. Intenta de nuevo.' });
      }
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  }

  // ------------------------------------------------------------------ eventos

  specialtySel.addEventListener('change', () => {
    fillDoctors(specialtySel.value);
    state.selectedStart = null;
    updateDoctorHint();
    refreshSlots();
  });
  doctorSel.addEventListener('change', () => {
    updateDoctorHint();
    refreshSlots();
  });
  dateInput.addEventListener('change', () => {
    if (state.selectedStart && !state.selectedStart.startsWith(dateInput.value)) state.selectedStart = null;
    refreshSlots();
  });
  durationSel.addEventListener('change', () => {
    state.selectedStart = null; // un horario válido para 30 min puede no serlo para 2 horas
    refreshSlots();
  });
  patientSearch.addEventListener('input', debounce(() => loadPatients(patientSearch.value.trim())));
  newPatientBtn.addEventListener('click', () => toggleNewPatient(true));
  $('#np-cancel').addEventListener('click', () => toggleNewPatient(false));
  $('#np-save').addEventListener('click', saveNewPatient);
  nextDayBtn.addEventListener('click', findNextDay);
  form.addEventListener('submit', handleSubmit);

  // ------------------------------------------------------------------ API pública

  /**
   * open()                                  -> agendar, vacío
   * open({ date, time, duration, doctorId }) -> agendar con datos de un clic/arrastre en el calendario
   * open({ appointment })                   -> reprogramar una cita existente
   */
  async function open({ appointment, date, time, duration, doctorId, specialtyId } = {}) {
    form.reset();
    hideError(alertBox);
    np.box.hidden = true;
    state.appointment = appointment ?? null;
    state.selectedStart = null;
    dateInput.min = toLocalDate(new Date());
    fillSpecialties();

    const editing = Boolean(appointment);
    title.textContent = editing ? 'Reprogramar cita' : 'Agendar cita';
    submit.textContent = editing ? 'Guardar cambios' : 'Agendar cita';
    for (const control of [patientSearch, patientSel, newPatientBtn]) control.disabled = editing;

    if (editing) {
      specialtySel.value = String(appointment.specialtyId);
      fillDoctors(appointment.specialtyId, appointment.doctorId);
      clear(patientSel);
      patientSel.append(el('option', { value: appointment.patientId, selected: true }, appointment.patientName));
      dateInput.value = appointment.startAt.slice(0, 10);
      const minutes = minutesBetween(appointment.startAt, appointment.endAt);
      durationSel.value = String(DURATIONS.includes(minutes) ? minutes : 30);
      state.selectedStart = appointment.startAt;
      reasonInput.value = appointment.reason;
      notesInput.value = appointment.notes ?? '';
    } else {
      await loadPatients('');
      specialtySel.value = specialtyId ? String(specialtyId) : '';
      fillDoctors(specialtyId, doctorId);
      dateInput.value = date ?? toLocalDate(new Date());
      // Al arrastrar en el calendario la duración puede ser cualquier múltiplo de 30: se ajusta a 30-120
      durationSel.value = String(duration ? Math.min(120, Math.max(30, Math.round(duration / 30) * 30)) : 30);
      if (date && time) state.selectedStart = `${date}T${time}:00`;
    }

    await updateDoctorHint();
    dialog.showModal();
    refreshSlots();
    (editing ? dateInput : doctorSel.value ? patientSearch : doctorSel).focus();
  }

  return { open };
}
