import { AGENDA_TZ, addDaysIso, brasiliaParts } from '../utils/agendaTime.js';
import { GoogleAuthError } from './googleAuth.js';

// Cliente mínimo da API do Google Calendar (v3) com `fetch`. Aqui não há acesso a banco: só HTTP e o
// formato dos eventos, para ser fácil de testar com um `fetch` simulado.
const API = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_DURATION_MS = 60 * 60_000;
export const MEET_HOST = 'meet.google.com';

export class GoogleApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GoogleApiError';
    this.status = status;
  }
}

export const isMeetUrl = (url) => {
  try {
    return new URL(String(url)).hostname === MEET_HOST;
  } catch {
    return false;
  }
};

/**
 * Evento do Google a partir de uma atividade do CRM.
 * @param activity { id, titulo, descricao, local, link, startAt, endAt, allDay, remindMinutes }
 * @param opts { attendees: string[], meet: boolean }
 */
export function buildEventBody(activity, { attendees = [], meet = false } = {}) {
  const start = new Date(activity.startAt);
  let startField;
  let endField;
  if (activity.allDay) {
    const day = brasiliaParts(start).iso;
    startField = { date: day };
    endField = { date: addDaysIso(day, 1) }; // no Google o fim de um dia inteiro é exclusivo
  } else {
    const end = activity.endAt && new Date(activity.endAt) > start ? new Date(activity.endAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
    startField = { dateTime: start.toISOString(), timeZone: AGENDA_TZ };
    endField = { dateTime: end.toISOString(), timeZone: AGENDA_TZ };
  }

  // Um link que não é do Meet (Zoom, Teams…) vai na descrição, já que o Google só mostra o seu próprio.
  const extraLink = activity.link && !isMeetUrl(activity.link) ? `Link: ${activity.link}` : '';
  const description = [activity.descricao, extraLink].filter(Boolean).join('\n\n');

  const body = {
    summary: activity.titulo,
    description,
    location: activity.local || '',
    start: startField,
    end: endField,
    extendedProperties: { private: { vesk_activity_id: String(activity.id) } },
  };
  body.status = activity.status === 'Cancelada' ? 'cancelled' : 'confirmed';
  if (attendees.length) body.attendees = attendees.map((email) => ({ email }));
  if (!activity.allDay && Number.isInteger(activity.remindMinutes)) {
    body.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: Math.min(activity.remindMinutes, 40320) }] };
  } else {
    body.reminders = { useDefault: true };
  }
  if (meet) {
    body.conferenceData = {
      createRequest: {
        requestId: `vesk-${activity.id}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  return body;
}

/** URL do Google Meet de um evento (campo `hangoutLink` ou ponto de entrada de vídeo). */
export function meetUrlOf(event) {
  if (event?.hangoutLink) return event.hangoutLink;
  const entry = event?.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video');
  return entry?.uri || '';
}

async function request(accessToken, method, path, { query, body } = {}) {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  const res = await fetch(`${API}${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new GoogleAuthError();
    throw new GoogleApiError(data?.error?.message || `Google Agenda respondeu ${res.status}`, res.status);
  }
  return data;
}

const calPath = (calendarId) => `/calendars/${encodeURIComponent(calendarId || 'primary')}/events`;

export function insertEvent(accessToken, calendarId, body, { invite = false } = {}) {
  return request(accessToken, 'POST', calPath(calendarId), {
    query: { conferenceDataVersion: '1', sendUpdates: invite ? 'all' : 'none' },
    body,
  });
}

export function patchEvent(accessToken, calendarId, eventId, body, { invite = false } = {}) {
  return request(accessToken, 'PATCH', `${calPath(calendarId)}/${encodeURIComponent(eventId)}`, {
    query: { conferenceDataVersion: '1', sendUpdates: invite ? 'all' : 'none' },
    body,
  });
}

/** Remove o evento; "já não existe" (404/410) conta como sucesso. */
export async function deleteEvent(accessToken, calendarId, eventId, { invite = false } = {}) {
  try {
    await request(accessToken, 'DELETE', `${calPath(calendarId)}/${encodeURIComponent(eventId)}`, {
      query: { sendUpdates: invite ? 'all' : 'none' },
    });
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}

/**
 * Mudanças do calendário. Com `syncToken` devolve só o que mudou desde a última leitura; sem ele, lê a partir de
 * `timeMin`. Se o Google invalidar o token (410), `reset: true` pede uma leitura completa.
 */
export async function listChanges(accessToken, calendarId, { syncToken, timeMin }) {
  const events = [];
  let pageToken;
  let nextSyncToken = null;
  do {
    const query = { singleEvents: 'true', showDeleted: 'true', maxResults: '250' };
    if (syncToken) query.syncToken = syncToken;
    else query.timeMin = timeMin;
    if (pageToken) query.pageToken = pageToken;
    let page;
    try {
      page = await request(accessToken, 'GET', calPath(calendarId), { query });
    } catch (err) {
      if (err instanceof GoogleApiError && err.status === 410) return { reset: true, events: [], nextSyncToken: null };
      throw err;
    }
    events.push(...(page.items || []));
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken || nextSyncToken;
  } while (pageToken);
  return { reset: false, events, nextSyncToken };
}
