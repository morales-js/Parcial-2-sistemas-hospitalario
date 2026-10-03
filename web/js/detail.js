// Detalle de una cita: datos, historial y acciones permitidas (confirmar, reprogramar, cancelar...).
import { api, ApiError } from './api.js';
import {
  clear, el, formatDateTime, formatLongDate, formatRange, hideError, showError, statusBadge, toast, wireDialogClose,
} from './util.js';

const $ = (selector) => document.querySelector(selector);

const ACTION_LABEL = {
  creada: 'Creada',
  editada: 'Editada',
  reprogramada: 'Reprogramada',
  confirmada: 'Confirmada',
  completada: 'Completada',
  no_asistio: 'No asistió',
  cancelada: 'Cancelada',
};

const row = (label, value) => [el('dt', {}, label), el('dd', {}, value)];

export function initDetail({ onChanged, onReschedule }) {
  const dialog = $('#detail-dialog');
  const title = $('#detail-title');
  const body = $('#detail-body');
  const actions = $('#detail-actions');
  const alertBox = $('#detail-alert');

  const cancelDialog = $('#cancel-dialog');
  const cancelForm = $('#cancel-form');
  const cancelSummary = $('#cancel-summary');
  const cancelReason = $('#cancel-reason');
  const cancelAlert = $('#cancel-alert');
  const cancelSubmit = $('#cancel-submit');

  let current = null;
  wireDialogClose(dialog);
  wireDialogClose(cancelDialog);

  async function load(id) {
    current = await api.appointment(id);
    render();
  }

  async function open(id) {
    hideError(alertBox);
    clear(body);
    clear(actions);
    title.textContent = 'Detalle de la cita';
    body.append(el('p', { class: 'hint' }, 'Cargando…'));
    if (!dialog.open) dialog.showModal();
    try {
      await load(id);
    } catch (error) {
      clear(body);
      showError(alertBox, error);
    }
  }

  function render() {
    const a = current;
    const can = a.allowedActions;
    title.textContent = `Cita #${a.id}`;
    clear(body);
    clear(actions);

    body.append(
      el(
        'div',
        { class: 'detail-head' },
        statusBadge(a.status),
        el('p', { class: 'detail-when' }, `${formatLongDate(a.startAt)} · ${formatRange(a.startAt, a.endAt)}`),
      ),
      el(
        'dl',
        { class: 'detail-list' },
        row('Paciente', a.patientName),
        row('Médico', `${a.doctorName} · ${a.specialtyName}`),
        row('Motivo', a.reason),
        a.notes ? row('Notas', a.notes) : null,
        a.status === 'cancelada' ? row('Motivo de cancelación', a.cancelReason) : null,
      ),
      el('h3', {}, 'Historial'),
      el(
        'ol',
        { class: 'history' },
        a.history.map((h) =>
          el(
            'li',
            {},
            el('strong', {}, ACTION_LABEL[h.action] ?? h.action),
            ` · ${formatDateTime(h.createdAt)}`,
            h.detail ? el('div', { class: 'hint' }, h.detail) : null,
          ),
        ),
      ),
    );

    if (can.confirm) actions.append(el('button', { type: 'button', class: 'btn primary', onclick: () => changeStatus('confirmada', 'Cita confirmada.') }, 'Confirmar cita'));
    if (can.complete) actions.append(el('button', { type: 'button', class: 'btn primary', onclick: () => changeStatus('completada', 'Cita marcada como completada.') }, 'Marcar como completada'));
    if (can.markNoShow) actions.append(el('button', { type: 'button', class: 'btn', onclick: () => changeStatus('no_asistio', 'Se registró que el paciente no asistió.') }, 'No asistió'));
    if (can.reschedule) {
      actions.append(
        el('button', { type: 'button', class: 'btn', onclick: () => { dialog.close(); onReschedule(current); } }, 'Reprogramar'),
      );
    }
    if (can.cancel) actions.append(el('button', { type: 'button', class: 'btn danger-outline', onclick: openCancel }, 'Cancelar cita'));
    actions.append(el('button', { type: 'button', class: 'btn', 'data-close': true }, 'Cerrar'));
  }

  async function changeStatus(status, message) {
    hideError(alertBox);
    try {
      await api.setStatus(current.id, status);
      toast(message);
      await load(current.id);
      onChanged();
    } catch (error) {
      if (error instanceof ApiError) showError(alertBox, error);
      else throw error;
    }
  }

  function openCancel() {
    hideError(cancelAlert);
    cancelForm.reset();
    cancelSummary.textContent = `${current.patientName} · ${current.doctorName} · ${formatDateTime(current.startAt)}`;
    cancelDialog.showModal();
    cancelReason.focus();
  }

  cancelForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(cancelAlert);
    const reason = cancelReason.value.trim();
    if (reason.length < 5) {
      showError(cancelAlert, { message: 'Indica el motivo de la cancelación (mínimo 5 caracteres).' });
      cancelReason.focus();
      return;
    }
    cancelSubmit.disabled = true;
    try {
      await api.cancel(current.id, reason);
      cancelDialog.close();
      toast('Cita cancelada. El horario quedó libre.');
      await load(current.id);
      onChanged();
    } catch (error) {
      if (error instanceof ApiError) showError(cancelAlert, error);
      else throw error;
    } finally {
      cancelSubmit.disabled = false;
    }
  });

  return { open };
}
