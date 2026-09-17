/* Shared factory used by all four layout modules. It fills in the parts of
   the renderer contract that do not vary by appearance (shell assembly, the
   six phases, the appearance/unavailable/legacy screens) from shared
   components, so each layouts/<id>.js file only has to supply its own
   weekGroup() and serviceSummary() plus a little CSS. This is code reuse
   inside one owner's files, not a second business-rule path: every value
   still comes from the shared information builders and shared components. */

export function createLayout(config) {
  const { id, name, stylesheet, weekGroup, serviceSummary } = config;

  function header(model, c) {
    return '<header class="wd-header" data-section="header">' +
      '<div class="wd-header-title">LV Zion Worship</div>' +
      c.appearanceButton(name) +
      '</header>';
  }

  function shell(model, c) {
    const secondaryTabs = typeof model.navigation.secondary === 'function'
      ? model.navigation.secondary(model.route, model.account) : [];
    const banners = '<div class="wd-banners" aria-live="polite">' + (model.banners || []).join('') + '</div>';
    return '<div class="wd-shell wd-shell-' + id + '">' +
      header(model, c) +
      c.secondaryTabs(secondaryTabs, model.route) +
      '<main class="wd-body" data-section="body">' + banners + (model.screenHtml || '') + '</main>' +
      c.saveBar(model.saveState) +
      c.mainNav(model.navigation, model.route) +
      '</div>';
  }

  function authWrap(bodyHtml) {
    return '<div class="wd-auth wd-auth-' + id + '"><div class="wd-auth-frame wd-legacy">' + (bodyHtml || '') + '</div></div>';
  }

  function phaseLocked(info, c) { return authWrap(info.siteLockHtml); }
  function phaseSignin(info, c) { return authWrap(info.loginHtml); }
  function phaseForcedPin(info, c) { return authWrap(info.forcedPinHtml); }
  function phaseLoading(info, c) {
    return '<div class="wd-auth"><div class="wd-auth-frame">' + c.skeleton(4) + '</div></div>';
  }
  function phaseRecovery(info, c) {
    return '<div class="wd-recovery-panel">' +
      '<h2>' + name + ' could not load</h2>' +
      '<p>Check your connection and try again, or use Original for this visit. Your saved appearance choice is not changed.</p>' +
      '<div class="wd-recovery-actions">' +
      '<button class="wd-appearance-btn" data-act="wd-appearance-retry">Retry</button>' +
      '<button class="wd-appearance-btn" data-act="wd-appearance-use-original">Use Original for now</button>' +
      '</div></div>';
  }
  function phaseMaintenance(info, c) {
    return '<div class="wd-auth"><div class="wd-auth-frame wd-legacy">' + (info.maintenanceHtml || '') + '</div></div>';
  }

  function screenSchedule(info, c) {
    if (!info.loaded) return c.unknownState('The schedule has not loaded yet.');
    let html = c.searchField(info.query, 'Search services');
    html += c.monthNav(info.month, info.months);
    if (info.focus) {
      html += '<div class="wd-week-range">Current or next service</div>' + serviceSummary(info.focus, c, { current: true });
    }
    const hasAny = info.weeks.some(week => week.days.some(day => day.services.length));
    if (!hasAny) html += c.emptyState(info.query ? 'No services match that search.' : 'No services this month.');
    else html += info.weeks.map(week => weekGroup(week, c, serviceSummary)).join('');
    return '<div class="wd-schedule-screen">' + html + '</div>';
  }

  function screenAppearance(info, c) {
    const tiles = info.layouts.map(l =>
      '<button type="button" class="wd-appearance-tile' + (l.id === info.current ? ' active' : '') + '" data-act="wd-appearance-select" data-mode="' + l.id + '" aria-pressed="' + (l.id === info.current) + '">' +
      '<strong>' + l.name + '</strong><small>' + l.description + '</small></button>'
    ).join('');
    return '<div class="wd-appearance-screen"><p class="wd-appearance-intro">One app, one shared schedule, four ways to view it. Your duties, song plans, sign-in and permissions stay the same.</p>' +
      '<div class="wd-appearance-grid">' + tiles + '</div>' +
      '<button class="wd-appearance-back" data-route="' + (info.returnRoute || '#schedule') + '">Return to workspace</button></div>';
  }

  function screenUnavailable(info, c) {
    return '<div class="wd-unavailable-screen">' + c.warning(info.message) +
      '<p><button class="wd-appearance-back" data-route="' + info.startRoute + '">Go to your workspace</button></p></div>';
  }

  function screenLegacy(info, c) {
    return '<div class="wd-legacy" id="wd-legacy-mount" data-legacy-kind="' + (info.kind || 'my') + '"></div>';
  }

  return {
    id, name, stylesheet,
    shell,
    phase: { locked: phaseLocked, signin: phaseSignin, forcedPin: phaseForcedPin, loading: phaseLoading, recovery: phaseRecovery, maintenance: phaseMaintenance },
    weekGroup, serviceSummary,
    screens: { schedule: screenSchedule, appearance: screenAppearance, unavailable: screenUnavailable, legacy: screenLegacy }
  };
}
