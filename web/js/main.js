// Punto de entrada del frontend: filtros, indicadores y calendario interactivo (FullCalendar).
import { api, ApiError } from './api.js';
import { initDetail } from './detail.js';
import { initAppointmentForm } from './form.js';
import {
  STATUS, clear, el, formatDateTime, summarizeSchedule, toLocalDate, toLocalIso, toast,
} from './util.js';

const $ = (selector) => document.querySelector(selector);

const DEFAULT_HOURS = [{ daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '17:00' }];
const isNarrow = () => window.matchMedia('(max-width: 720px)').matches;

const filters = { specialtyId: '', doctorId: '', status: '' };
let specialties = [];
let doctors = [];
let calendar;
let form;
let detail;

// ---------------------------------------------------------------------- utilidades

/** Mensaje para un toast de error; incluye horarios alternativos si el servidor los sugiere. */
function errorText(error) {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado.';
  const suggestions = error.details?.suggestions;
  if (suggestions?.length) {
    return `${error.message} Horarios cercanos: ${suggestions.map((s) => formatDateTime(s.startAt)).join(' · ')}.`;
  }
  return error.message;
}

const toEvent = (a) => ({
  id: String(a.id),
  title: `${a.patientName} — ${a.doctorName}`,
  start: a.startAt,
  end: a.endAt,
  backgroundColor: a.specialtyColor,
  borderColor: a.specialtyColor,
  textColor: '#ffffff',
  classNames: [`status-${a.status}`],
  startEditable: a.allowedActions.reschedule,
  durationEditable: a.allowedActions.reschedule,
  extendedProps: a,
});

// ---------------------------------------------------------------------- indicadores

async function refreshStats() {
  try {
    const stats = await api.stats(toLocalDate(new Date()));
    const active = (b) => b.programada + b.confirmada;
    $('#kpi-today').textContent = active(stats.day.byStatus);
    $('#kpi-week').textContent = active(stats.week.byStatus);
    $('#kpi-pending').textContent = stats.week.byStatus.programada;
    $('#kpi-cancelled').textContent = stats.week.byStatus.cancelada;
  } catch {
    for (const id of ['today', 'week', 'pending', 'cancelled']) $(`#kpi-${id}`).textContent = '–';
  }
}

function refresh() {
  calendar.refetchEvents();
  refreshStats();
}

// ---------------------------------------------------------------------- filtros

function fillFilterOptions() {
  const specialtySel = $('#flt-specialty');
  const doctorSel = $('#flt-doctor');

  clear(specialtySel);
  specialtySel.append(el('option', { value: '' }, 'Todas'));
  for (const s of specialties) specialtySel.append(el('option', { value: s.id }, s.name));

  clear(doctorSel);
  doctorSel.append(el('option', { value: '' }, 'Todos'));
  for (const d of doctors.filter((x) => !filters.specialtyId || x.specialtyId === Number(filters.specialtyId))) {
    doctorSel.append(el('option', { value: d.id }, d.fullName));
  }
  doctorSel.value = filters.doctorId;
}

/** Con un médico filtrado, el calendario sombrea SU horario y no deja agendar fuera de él. */
async function applyDoctorHours() {
  const hint = $('#filter-hint');
  if (!filters.doctorId) {
    calendar.setOption('businessHours', DEFAULT_HOURS);
    calendar.setOption('selectConstraint', undefined);
    calendar.setOption('eventConstraint', undefined);
    hint.textContent = '';
    return;
  }
  try {
    const doctor = await api.doctor(filters.doctorId);
    if (String(doctor.id) !== String(filters.doctorId)) return; // el usuario ya cambió de filtro
    calendar.setOption('businessHours', doctor.schedule.map((b) => ({ daysOfWeek: [b.weekday], startTime: b.startTime, endTime: b.endTime })));
    calendar.setOption('selectConstraint', 'businessHours');
    calendar.setOption('eventConstraint', 'businessHours');
    hint.textContent = `Horario de atención de ${doctor.fullName}: ${summarizeSchedule(doctor.schedule)}`;
  } catch (error) {
    toast(error.message, 'error');
  }
}

function wireFilters() {
  $('#flt-specialty').addEventListener('change', (e) => {
    filters.specialtyId = e.target.value;
    filters.doctorId = '';
    fillFilterOptions();
    applyDoctorHours();
    calendar.refetchEvents();
  });
  $('#flt-doctor').addEventListener('change', (e) => {
    filters.doctorId = e.target.value;
    applyDoctorHours();
    calendar.refetchEvents();
  });
  $('#flt-status').addEventListener('change', (e) => {
    filters.status = e.target.value;
    calendar.refetchEvents();
  });
  $('#btn-clear').addEventListener('click', () => {
    Object.assign(filters, { specialtyId: '', doctorId: '', status: '' });
    $('#flt-status').value = '';
    fillFilterOptions();
    applyDoctorHours();
    calendar.refetchEvents();
  });
}

// ---------------------------------------------------------------------- calendario

async function moveEvent(info) {
  const { event } = info;
  const start = event.start;
  const end = event.end ?? new Date(start.getTime() + 30 * 60_000);
  try {
    await api.updateAppointment(event.id, { startAt: toLocalIso(start), endAt: toLocalIso(end) });
    toast(`Cita reprogramada para ${formatDateTime(toLocalIso(start))}.`);
    refresh();
  } catch (error) {
    info.revert(); // la cita vuelve a su lugar original
    toast(errorText(error), 'error');
  }
}

function renderEventContent(arg) {
  const a = arg.event.extendedProps;
  // Al arrastrar para seleccionar, FullCalendar dibuja un evento "fantasma" que no es una cita
  if (!a.status) return { domNodes: [document.createTextNode(arg.timeText ?? '')] };
  const meta = STATUS[a.status];

  if (arg.view.type.startsWith('list')) {
    return {
      domNodes: [document.createTextNode(`${meta.icon} ${a.patientName} — ${a.doctorName} (${a.specialtyName}) · ${meta.label}`)],
    };
  }

  const wrap = el('div', { class: 'appt' });
  wrap.append(
    el(
      'div',
      { class: 'appt-line' },
      el('span', { class: 'appt-icon', 'aria-hidden': 'true' }, meta.icon),
      arg.timeText ? el('span', { class: 'appt-time' }, arg.timeText) : null,
      el('span', { class: 'appt-name' }, a.patientName),
    ),
  );
  if (arg.view.type.startsWith('timeGrid')) {
    wrap.append(el('div', { class: 'appt-sub' }, `${a.doctorName} · ${meta.label}`));
  }
  return { domNodes: [wrap] };
}

function buildCalendar() {
  const calendarEl = $('#calendar');
  const loadingEl = $('#loading');

  calendar = new window.FullCalendar.Calendar(calendarEl, {
    locale: 'es',
    initialView: isNarrow() ? 'listWeek' : 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
    },
    firstDay: 1,
    height: 'auto',
    navLinks: true,
    nowIndicator: true,
    allDaySlot: false,
    dayMaxEvents: 3,
    slotMinTime: '07:00:00',
    slotMaxTime: '19:00:00',
    slotDuration: '00:30:00',
    snapDuration: '00:30:00',
    scrollTime: '07:30:00',
    slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    businessHours: DEFAULT_HOURS,

    selectable: true,
    selectMirror: true,
    editable: true,
    eventInteractive: true, // las citas se pueden enfocar con Tab y abrir con Enter

    selectAllow: (info) => {
      const now = new Date();
      return info.allDay ? toLocalDate(info.start) >= toLocalDate(now) : info.start >= now;
    },
    eventAllow: (dropInfo, event) =>
      !dropInfo.allDay && dropInfo.start > new Date() && Boolean(event.extendedProps.allowedActions?.reschedule),

    events: async (info, success, failure) => {
      try {
        const list = await api.appointments({
          start: toLocalIso(info.start),
          end: toLocalIso(info.end),
          doctorId: filters.doctorId,
          specialtyId: filters.specialtyId,
          status: filters.status,
        });
        success(list.map(toEvent));
      } catch (error) {
        failure(error);
        toast(error.message, 'error');
      }
    },
    loading: (isLoading) => {
      loadingEl.hidden = !isLoading;
      calendarEl.setAttribute('aria-busy', String(isLoading));
    },

    select: (info) => {
      calendar.unselect();
      const date = toLocalDate(info.start);
      const base = { doctorId: filters.doctorId, specialtyId: filters.specialtyId };
      if (info.allDay) {
        form.open({ ...base, date });
      } else {
        form.open({
          ...base,
          date,
          time: toLocalIso(info.start).slice(11, 16),
          duration: Math.round((info.end - info.start) / 60_000),
        });
      }
    },
    eventClick: (info) => {
      info.jsEvent.preventDefault();
      detail.open(Number(info.event.id));
    },
    eventDrop: moveEvent,
    eventResize: moveEvent,

    eventContent: renderEventContent,
    eventDidMount: (info) => {
      const a = info.event.extendedProps;
      if (!a.status) return; // evento fantasma de la selección
      const text = `${STATUS[a.status].label}: ${a.patientName} con ${a.doctorName}, ${formatDateTime(a.startAt)}`;
      info.el.setAttribute('title', text);
      info.el.setAttribute('aria-label', text);
    },
  });

  calendar.render();

  // En pantallas angostas se usa la vista de lista; al rotar/redimensionar se adapta
  window.matchMedia('(max-width: 720px)').addEventListener('change', () => {
    calendar.changeView(isNarrow() ? 'listWeek' : 'timeGridWeek');
  });
}

// ---------------------------------------------------------------------- arranque

async function bootstrap() {
  try {
    [specialties, doctors] = await Promise.all([api.specialties(), api.doctors()]);
  } catch (error) {
    $('#calendar').replaceChildren(
      el('div', { class: 'alert', role: 'alert' }, el('strong', {}, 'No se pudo cargar el módulo de citas. '), error.message),
    );
    return;
  }

  fillFilterOptions();
  form = initAppointmentForm({ specialties, doctors, onSaved: refresh });
  detail = initDetail({
    onChanged: refresh,
    onReschedule: (appointment) => form.open({ appointment }),
  });
  buildCalendar();
  wireFilters();
  refreshStats();

  $('#btn-new').addEventListener('click', () =>
    form.open({ doctorId: filters.doctorId, specialtyId: filters.specialtyId }),
  );
}

bootstrap();
