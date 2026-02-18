import { nanoid } from 'nanoid';
import { appendEventLog } from './store.js';

const events = [];
const alerts = [];
const LIMIT = 300;
const listeners = new Set();

function pushBounded(list, item) {
  list.unshift(item);
  if (list.length > LIMIT) {
    list.length = LIMIT;
  }
}

export async function trackEvent(type, payload = {}, severity = 'info') {
  const event = {
    id: nanoid(10),
    type,
    severity,
    payload,
    createdAt: new Date().toISOString()
  };
  pushBounded(events, event);
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors to keep event tracking reliable.
    }
  }
  await appendEventLog(event);
  return event;
}

export async function trackAlert(type, payload = {}, severity = 'warning') {
  const alert = await trackEvent(type, payload, severity);
  pushBounded(alerts, alert);
  return alert;
}

export function getEvents() {
  return events;
}

export function getAlerts() {
  return alerts;
}

export function dismissAlert(alertId) {
  const index = alerts.findIndex((item) => item.id === alertId);
  if (index === -1) {
    return false;
  }
  alerts.splice(index, 1);
  return true;
}

export function clearAlerts() {
  const count = alerts.length;
  alerts.length = 0;
  return count;
}

export function clearEvents() {
  events.length = 0;
}

export function subscribeEvents(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
