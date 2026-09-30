/* The switches in Manage, Features. Each is saved in app/settings.features
   and applies to every member. `on` is the value when nothing is saved. */
export const FEATURES = [
  { id: 'siteLock', label: 'Site passcode', description: 'Ask for the 4-digit passcode the first time the app opens on a device.', on: true },
  { id: 'notifications', label: 'New duty alerts', description: 'Tell members when a duty is added for them.', on: true },
  { id: 'reminders', label: 'Day-before reminders', description: 'Remind members in the 24 hours before each duty.', on: true },
  { id: 'calendarExport', label: 'Calendar link', description: 'Members can add their duties to their phone calendar.', on: true },
  { id: 'whoElse', label: 'Who else is serving', description: 'My Duties can show everyone serving at the same service.', on: true },
  { id: 'choirSong', label: 'Choir song', description: 'Show the choir song on each service.', on: true },
  { id: 'songPicker', label: 'Presider song planner', description: 'Presiders get the Presider tab to plan their songs.', on: true },
  { id: 'pastServices', label: 'Past services', description: 'Members can look back at services that already happened.', on: true },
  { id: 'emptyDuties', label: 'Unfilled duties', description: 'Show every duty on the schedule, even ones with no one assigned.', on: false },
  { id: 'conflictWarnings', label: 'Double duty warnings', description: 'Flag a person who has two duties in the same service.', on: true },
  { id: 'sheetSync', label: 'Google Sheet import', description: 'Bring schedule changes in from the Google Sheet every 2 hours.', on: true },
  { id: 'changeRequests', label: 'Change requests', description: 'Members can ask for a change to a duty from My Duties.', on: true }
];

export function featureOn(settings, id) {
  const saved = (settings && settings.features) || {};
  if (Object.prototype.hasOwnProperty.call(saved, id)) return saved[id] === true;
  const feature = FEATURES.find(item => item.id === id);
  return feature ? feature.on : true;
}
