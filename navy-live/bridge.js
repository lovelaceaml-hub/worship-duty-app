/* Injected immediately before init(). Read-only presentation snapshot; original handlers remain unchanged. */
const navyOriginalRender = render;
render = function () {
  navyOriginalRender();
  if (!window.ZionDesign) return;
  const ready = (!window.FIREBASE_CONFIG || settingsLoaded) && (!feat('siteLock') || siteUnlocked());
  if (!ready) { window.ZionDesign.update({ ready:false, tab:ui.tab, sub:ui.sub }); return; }
  const toView = svc => ({ id:svcId(svc), date:svc.date, time:svc.time, service:svc.service, worship:svc.worship, assignments:{...svc.assignments} });
  const up = upcomingServices();
  let entries = up.concat(feat('pastServices') && ui.showPast ? pastServices().slice().reverse() : []);
  if (ui.deptFilter !== 'All') entries = entries.filter(s => categoryHasAssignments(s,ui.deptFilter));
  const next = ui.me ? dutiesFor(ui.me)[0] : null;
  const assigned = up.flatMap(s => Object.values(s.assignments || {}).filter(Boolean));
  const canEdit = !feat('editorLock') || (!!state.settings.pinHash && localStorage.getItem('wds-unlock') === state.settings.pinHash);
  window.ZionDesign.update({
    ready:true, tab:ui.tab, sub:ui.sub, today:todayISO(), member:ui.me,
    entries:entries.map(toView), canEdit,
    nextDuty:next ? { duty:next.duty, svc:toView(next.svc) } : null,
    stats:{ services:up.length, assignments:assigned.length, people:new Set(assigned).size }
  });
};
