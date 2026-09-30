/* Change requests: a member asks to be taken off one duty. A request stays
   open while it is pending and the member still holds that duty. If a leader
   changes the duty another way, the request counts as completed. */
import { serviceId } from './services.js';

export function requestService(request, services) {
  return services.find(service => serviceId(service) === request.svcId) || null;
}

export function isOpen(request, services, canonical = name => name) {
  if (!request || request.status !== 'pending') return false;
  const service = requestService(request, services);
  if (!service) return true;
  return canonical((service.assignments || {})[request.duty]) === canonical(request.name);
}

export function shownStatus(request, services, canonical) {
  return request.status === 'pending' && !isOpen(request, services, canonical) ? 'completed' : request.status;
}

export function openRequestFor(requests, services, id, duty, name) {
  return requests.find(request => request.svcId === id && request.duty === duty && request.name === name &&
    isOpen(request, services)) || null;
}

/* Request document id, stable and readable: service, duty, time. */
export function requestId(id, duty, createdAt) {
  return id + '_' + String(duty).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '_' + createdAt;
}
