'use strict';

/* Pure member selectors. Runtime catalogs, service IDs, and setlist records
   are supplied by callers so this module stays browser and storage free. */
(function expose(root, factory) {
  const browserSetlist = root && root.window && root.window.WorshipApp &&
    root.window.WorshipApp.domain && root.window.WorshipApp.domain.setlist;
  const setlistDomain = browserSetlist ||
    (typeof module !== 'undefined' && module.exports && typeof require === 'function'
      ? require('./setlist.js') : null);
  const api = Object.freeze(factory(setlistDomain));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const domain = app.domain || (app.domain = {});
    domain.member = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMemberDomain(setlistDomain) {
  if (!setlistDomain || typeof setlistDomain.summary !== 'function') {
    throw new Error('Member domain requires the setlist domain');
  }

  function fallbackServiceId(service) {
    return service.date + '_' + String(service.service || '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function serviceIdFor(service, serviceId) {
    return typeof serviceId === 'function' ? serviceId(service) : fallbackServiceId(service);
  }

  /* Group the renderer's member-duty records by local date and then service.
     The service and duty references are retained, while the construction map
     stays private so the returned renderer shape remains small and stable. */
  function groupDuties(duties, serviceId) {
    const days = [];
    const dayIndex = Object.create(null);
    (duties || []).forEach(dutyRecord => {
      const service = dutyRecord && (dutyRecord.svc || dutyRecord.service);
      if (!service) return;
      const date = service.date;
      let day = dayIndex[date];
      if (!day) {
        day = dayIndex[date] = {
          date,
          edge: dutyRecord.cat && dutyRecord.cat.color,
          services: []
        };
        day.serviceIndex = Object.create(null);
        days.push(day);
      }
      const id = serviceIdFor(service, serviceId);
      let serviceEntry = day.serviceIndex[id];
      if (!serviceEntry) {
        serviceEntry = day.serviceIndex[id] = { svc: service, id, duties: [] };
        day.services.push(serviceEntry);
      }
      serviceEntry.duties.push(dutyRecord);
    });
    days.forEach(day => { delete day.serviceIndex; });
    return days;
  }

  /* Pending requests are matched by the exact service, duty, and member. */
  function findPendingRequest(requests, serviceId, duty, name) {
    return (requests || []).find(request =>
      request.svcId === serviceId && request.duty === duty &&
      request.name === name && request.status === 'pending');
  }

  function requestsForMember(requests, name) {
    return (requests || []).filter(request => request.name === name).slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function pendingRequestCount(requests) {
    return (requests || []).filter(request => request.status === 'pending').length;
  }

  /* Compatibility wrapper for the extracted setlist summary rule. */
  function setlistSummary(setlists, id) {
    return setlistDomain.summary(setlists, id);
  }

  return {
    groupDuties,
    groupDutiesByDay: groupDuties,
    findPendingRequest,
    requestsForMember,
    memberRequests: requestsForMember,
    pendingRequestCount,
    pendingRequestsCount: pendingRequestCount,
    setlistSummary,
    songStateFor: setlistSummary
  };
});
