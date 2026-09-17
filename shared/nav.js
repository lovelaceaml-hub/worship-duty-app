/* buildNavigation(account): main floating destinations and compact secondary
   tabs, driven only by the account's capabilities. Layouts arrange these;
   they never decide which destinations exist. */

export function buildNavigation(account) {
  if (!account) return { main: [], secondary: [] };
  const main = [
    { id: 'schedule', route: '#schedule', label: 'Schedule' },
    { id: 'duties', route: '#duties', label: 'My duties' }
  ];
  if (account.canManage) main.push({ id: 'manage', route: '#manage/schedule', label: 'Manage' });
  if (account.isPresider || account.canEditSongs) main.push({ id: 'songs', route: '#songs/my-service', label: 'Songs' });
  return { main, secondary: secondaryFor };
}

/* Secondary tabs for the active top-level section. `route` is the current
   hash route; returns [] when the section has no secondary tabs (schedule,
   appearance, unavailable). */
function secondaryFor(route, account) {
  if (route.indexOf('#duties') === 0 || route.indexOf('#availability') === 0 || route.indexOf('#reminders') === 0) {
    return [
      { route: '#duties', label: 'Upcoming' },
      { route: '#availability', label: 'Availability' },
      { route: '#reminders', label: 'Reminders' }
    ];
  }
  if (route.indexOf('#manage') === 0) {
    const tabs = [
      { route: '#manage/schedule', label: 'Schedule' },
      { route: '#manage/attention', label: 'Needs attention' },
      { route: '#manage/members', label: 'Members' }
    ];
    if (account && account.isAdmin) tabs.push({ route: '#manage/settings', label: 'Settings' });
    return tabs;
  }
  if (route.indexOf('#songs') === 0) {
    return [
      { route: '#songs/my-service', label: 'My service' },
      { route: '#songs/library', label: 'Songs' },
      { route: '#songs/history', label: 'History' }
    ];
  }
  return [];
}
