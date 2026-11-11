'use strict';

/*
 * The lists permissions.js decides from: the departments and their duties,
 * the duties that may be held together, the default member per duty, and
 * who leads what before Manage, Leaders has saved anything. Data only, no
 * rules. The browser loads this file before permissions.js; the server has
 * an identical copy in functions/, and a test keeps the two the same.
 */
(function () {
  const DEPARTMENT_DUTIES = {
    Worship: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer'],
    'Usher Sisters': ['Usher Door', 'Usher Front', 'Usher Back'],
    'Usher Brothers': ['Usher #1', 'Usher #2', 'Lobby Security'],
    Lobby: ['Lobby Desk #1', 'Lobby Desk #2'],
    Translation: ['Translation #1', 'Translation #2'],
    Media: ['Media Booth #1', 'Media Booth #2'],
    'Parking Lot': ['Parking #1', 'Parking #2', 'Parking #3', 'Parking #4', 'Parking #5'],
    Offering: ['Offering #1', 'Offering #2', 'Offering #3', 'Offering #4', 'Offering #5', 'Offering #6'],
    "Children's Teachers": ['Small Sanctuary #1', 'Small Sanctuary #2', 'Main Sanctuary #1', 'Main Sanctuary #2']
  };
  Object.keys(DEPARTMENT_DUTIES).forEach(department => {
    Object.freeze(DEPARTMENT_DUTIES[department]);
  });
  Object.freeze(DEPARTMENT_DUTIES);

  /* Thanks Prayer or Closing Prayer may be held together with an usher duty
     (Lobby Security is not an usher duty here). The rule is in
     permissions.js, dutiesAllowedTogether. */
  const PRAYER_DUTIES = Object.freeze(['Prayer of Thanks', 'Closing Prayer']);
  const USHER_DUTIES = Object.freeze(['Usher Door', 'Usher Front', 'Usher Back', 'Usher #1', 'Usher #2']);

  /* Duties with a default member: Fill always gives the duty to its default
     when they can take it, and new services start with them on it. Opening
     Prayer goes to the church overseer unless a Worship leader or an
     administrator chooses someone else, or no one (app/settings dutyDefaults);
     another preacher is put on by hand. app/config/duties.js holds the same. */
  const DUTY_DEFAULTS = Object.freeze({ Sermon: 'E. Simon' });

  const DEFAULT_DEPARTMENT_LEADERS = {
    Worship: ['E. Simon', 'D. Armani', 'B. Brent'],
    'Usher Sisters': ['M. Chloe'],
    'Usher Brothers': ['D. Chris'],
    Lobby: ['S. Anessa'],
    Translation: ['S. Paola'],
    Media: ['D. Aaron', 'D. Armani', 'B. Brent'],
    'Parking Lot': ['D. Aaron'],
    Offering: ['S. Elisa'],
    "Children's Teachers": ['D. Kenya']
  };
  Object.keys(DEFAULT_DEPARTMENT_LEADERS).forEach(department => {
    Object.freeze(DEFAULT_DEPARTMENT_LEADERS[department]);
  });
  Object.freeze(DEFAULT_DEPARTMENT_LEADERS);

  const DEFAULT_SONG_EDITORS = Object.freeze([
    'D. Danielle', 'B. James', 'D. Aaron', 'D. Armani', 'B. Brent'
  ]);

  const DEFAULT_ADMINS = Object.freeze(['B. Anthony']);
  const DEFAULT_GLOBAL_LEADER_MANAGERS = Object.freeze(['B. Anthony', 'E. Simon']);

  const DATA = Object.freeze({
    DEPARTMENT_DUTIES, PRAYER_DUTIES, USHER_DUTIES, DUTY_DEFAULTS,
    DEFAULT_DEPARTMENT_LEADERS, DEFAULT_SONG_EDITORS, DEFAULT_ADMINS, DEFAULT_GLOBAL_LEADER_MANAGERS
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  if (typeof window !== 'undefined') window.WorshipDutyPermissionsData = DATA;
})();
