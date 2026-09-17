/* Pure HTML-string components shared by every layout. Stable class names,
   prefixed `wd-`. Each appearance stylesheet restyles these classes; it does
   not fork their markup. Tap targets are at least 44 CSS pixels. No listeners
   are attached here: every interactive element carries `data-act` / `data-
   route` and is handled by the one delegated listener in shared/shell.js. */

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function mainNav(navigation, activeRoute) {
  if (!navigation || !navigation.main || !navigation.main.length) return '';
  const items = navigation.main.map(item => {
    const active = activeRoute.indexOf(item.route) === 0 || (item.id === 'schedule' && activeRoute === '#schedule');
    return '<button class="wd-nav-btn' + (active ? ' active' : '') + '" data-route="' + esc(item.route) + '" aria-current="' + (active ? 'page' : 'false') + '">' +
      '<span class="wd-nav-label">' + esc(item.label) + '</span></button>';
  }).join('');
  return '<nav class="wd-main-nav" data-section="main-nav" aria-label="Main">' + items + '</nav>';
}

export function secondaryTabs(tabs, activeRoute) {
  if (!tabs || !tabs.length) return '<div class="wd-secondary-tabs wd-secondary-tabs-empty" data-section="secondary-tabs"></div>';
  const items = tabs.map(tab => {
    const active = activeRoute.indexOf(tab.route) === 0;
    return '<button class="wd-tab-btn' + (active ? ' active' : '') + '" data-route="' + esc(tab.route) + '">' + esc(tab.label) + '</button>';
  }).join('');
  return '<div class="wd-secondary-tabs" data-section="secondary-tabs" role="tablist">' + items + '</div>';
}

export function appearanceButton(currentName) {
  return '<button class="wd-appearance-btn" data-route="#appearance" aria-label="Appearance. Current design: ' + esc(currentName || '') + '">' +
    '<span class="wd-appearance-dot" aria-hidden="true"></span>Appearance</button>';
}

export function searchField(value, placeholder, id) {
  return '<div class="wd-search"><input type="search" id="' + esc(id || 'wd-schedule-search') + '" class="wd-search-input" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || 'Search') + '" aria-label="' + esc(placeholder || 'Search') + '"></div>';
}

export function monthNav(month, months) {
  const idx = months.indexOf(month);
  const prev = idx > 0 ? months[idx - 1] : null;
  const next = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;
  const label = monthLabel(month);
  return '<div class="wd-month-nav">' +
    '<button class="wd-month-step" data-act="wd-month-prev" ' + (prev ? '' : 'disabled') + ' aria-label="Previous month">&#8249;</button>' +
    '<span class="wd-month-label">' + esc(label) + '</span>' +
    '<button class="wd-month-step" data-act="wd-month-next" ' + (next ? '' : 'disabled') + ' aria-label="Next month">&#8250;</button>' +
    '</div>';
}

function monthLabel(month) {
  if (!month || month.indexOf('-') === -1) return 'This month';
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function pager(page, totalPages) {
  if (totalPages <= 1) return '';
  return '<div class="wd-pager">' +
    '<button class="wd-pager-btn" data-act="wd-page-prev" ' + (page <= 1 ? 'disabled' : '') + '>Previous</button>' +
    '<span class="wd-pager-label">Page ' + page + ' of ' + totalPages + '</span>' +
    '<button class="wd-pager-btn" data-act="wd-page-next" ' + (page >= totalPages ? 'disabled' : '') + '>Next</button>' +
    '</div>';
}

export function saveBar(saveState) {
  const status = (saveState && saveState.status) || 'unsaved';
  const labels = { unsaved: 'Unsaved changes', saving: 'Saving...', saved: 'Saved', failed: 'Failed', stale: 'Someone else changed this' };
  const showRetry = status === 'failed' || status === 'stale';
  return '<div class="wd-save-bar wd-save-' + status + '" data-section="save-bar">' +
    '<span class="wd-save-label">' + esc(labels[status] || labels.unsaved) + '</span>' +
    (saveState && saveState.error ? '<span class="wd-save-error">' + esc(saveState.error) + '</span>' : '') +
    (showRetry ? '<button class="wd-save-retry" data-act="wd-save-retry">Retry</button>' : '') +
    '</div>';
}

export function warning(text) {
  return '<div class="wd-warning">' + esc(text) + '</div>';
}

export function emptyState(text) {
  return '<div class="wd-empty">' + esc(text) + '</div>';
}

/* Missing data is rendered here, never as a vacancy, a zero count, or an
   invented row. */
export function unknownState(text) {
  return '<div class="wd-unknown">' + esc(text || 'Not loaded yet') + '</div>';
}

export function skeleton(lines) {
  const count = lines || 3;
  let rows = '';
  for (let i = 0; i < count; i += 1) rows += '<div class="wd-skeleton-row"></div>';
  return '<div class="wd-skeleton" aria-hidden="true">' + rows + '</div>';
}

export function assignmentRow(duty, memberName, options) {
  const opts = options || {};
  const filled = !!memberName;
  return '<div class="wd-assignment-row' + (opts.mine ? ' mine' : '') + '">' +
    '<span class="wd-assignment-duty">' + esc(duty) + '</span>' +
    (filled ? '<span class="wd-assignment-name">' + esc(memberName) + (opts.mine ? ' (You)' : '') + '</span>'
      : '<span class="wd-assignment-open">Open</span>') +
    '</div>';
}

export function memberPicker(id, members, selected, label) {
  const options = ['<option value="">' + esc(label || 'Choose a member') + '</option>']
    .concat((members || []).map(m => '<option value="' + esc(m) + '"' + (m === selected ? ' selected' : '') + '>' + esc(m) + '</option>'))
    .join('');
  return '<select id="' + esc(id) + '" class="wd-member-picker" aria-label="' + esc(label || 'Choose a member') + '">' + options + '</select>';
}

export function dialog(title, bodyHtml, actionsHtml) {
  return '<div class="wd-dialog-backdrop" data-act="wd-dialog-dismiss">' +
    '<div class="wd-dialog" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
    '<div class="wd-dialog-title">' + esc(title) + '</div>' +
    '<div class="wd-dialog-body">' + bodyHtml + '</div>' +
    '<div class="wd-dialog-actions">' + (actionsHtml || '<button class="wd-dialog-close" data-act="wd-dialog-dismiss">Close</button>') + '</div>' +
    '</div></div>';
}
