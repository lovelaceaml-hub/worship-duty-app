/* Change requests: a member asks to be taken off one duty. A request stays
   open while it is pending, its service has not started, and the member
   still holds that duty. If a leader changes the duty another way, the
   request counts as completed; once the service has started, as past. A
   request the member withdrew, or a leader answered, is closed. A request
   whose service was moved or deleted stays open until its date, so a leader
   can close it. */
import { serviceId, isUpcoming } from './services.js';

export function requestService(request, services) {
  return services.find(service => serviceId(service) === request.svcId) || null;
}

/* Whether the request's service has started (by the service, or by the date
   and time the request was made for when the service is gone). */
export function hasStarted(request, services, now = new Date()) {
  const service = requestService(request, services) || { date: request.date, service: request.service };
  return !!service.date && !isUpcoming(service, now);
}

/* The status to show: 'completed' once the duty changed another way,
   'past' once the service started with the request unanswered, 'pending'
   while it waits, else the stored one (approved, declined, withdrawn). */
export function shownStatus(request, services, canonical = name => name, now = new Date()) {
  if (request.status !== 'pending') return request.status;
  const service = requestService(request, services);
  if (service && canonical((service.assignments || {})[request.duty]) !== canonical(request.name)) return 'completed';
  return hasStarted(request, services, now) ? 'past' : 'pending';
}

export function isOpen(request, services, canonical = name => name, now = new Date()) {
  return !!request && shownStatus(request, services, canonical, now) === 'pending';
}

export function openRequestFor(requests, services, id, duty, name) {
  return requests.find(request => request.svcId === id && request.duty === duty && request.name === name &&
    isOpen(request, services)) || null;
}

/* Request document id, stable and readable: service, duty, time. */
export function requestId(id, duty, createdAt) {
  return id + '_' + String(duty).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '_' + createdAt;
}
