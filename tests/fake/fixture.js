/* TEST ONLY. Made-up members and a schedule around today's date, for the dev
   server's --fake mode and the browser tests. No real member data.
   Site passcode 2468. Every member's PIN is 1234. B. Adam is an
   administrator, E. Joseph leads Worship and Media, S. Grace leads Usher
   Sisters, M. Ruth edits songs, B. Silas must choose a new PIN, and
   S. Joanna is in no department yet. B. Samuel is the default for Opening
   Prayer.
   A test can set window.__fixtureOverrides first: `patch` merges fields into
   documents by path, and any other key replaces that part of the fixture. */
(function () {
  const params = new URLSearchParams(location.search);
  const today = params.get('today') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const day = (offset) => {
    const date = new Date(today + 'T12:00:00');
    date.setDate(date.getDate() + offset);
    return date.toLocaleDateString('en-CA');
  };
  const weekday = iso => new Date(iso + 'T12:00:00').getDay();

  const rosters = {
    Worship: ['B. Adam', 'E. Joseph', 'B. Caleb', 'S. Hannah', 'D. Miriam', 'M. Ruth', 'B. Samuel'],
    'Usher Sisters': ['S. Leah', 'S. Naomi', 'S. Esther', 'S. Grace'],
    'Usher Brothers': ['B. Daniel', 'B. Isaac', 'B. Levi', 'B. Micah'],
    Lobby: ['S. Lydia', 'S. Phoebe'],
    Translation: ['S. Priscilla', 'B. Silas'],
    Media: ['B. Titus', 'S. Tabitha', 'E. Joseph'],
    'Parking Lot': ['B. Jonah', 'B. Amos'],
    Offering: ['S. Dorcas', 'S. Martha']
  };
  const duties = window.WorshipDutyPermissions.DEPARTMENT_DUTIES;
  const members = Array.from(new Set(Object.values(rosters).flat().concat('S. Joanna'))).sort();

  /* Services: Tuesday evening (Third Day) and Saturday morning, afternoon and
     evening (Sabbath Day), four weeks back to five weeks ahead. */
  const services = [];
  let turn = 0;
  for (let offset = -28; offset <= 35; offset++) {
    const date = day(offset);
    const slots = weekday(date) === 2 ? [['Evening', '20:00', 'Third Day']]
      : weekday(date) === 6 ? [['Morning', '09:00', 'Sabbath Day'], ['Afternoon', '15:00', 'Sabbath Day'], ['Evening', '20:00', 'Sabbath Day']] : [];
    slots.forEach(([label, time, worship]) => {
      const assignments = {};
      Object.entries(rosters).forEach(([department, names]) => {
        if (['Parking Lot', 'Offering'].includes(department) && label !== 'Morning') return;
        duties[department].slice(0, department === 'Worship' ? 4 : 2).forEach((duty, index) => {
          // Thanks Prayer is only at Sabbath Day Morning.
          if (duty !== 'Prayer of Thanks' || (worship === 'Sabbath Day' && label === 'Morning')) assignments[duty] = names[(turn + index) % names.length];
        });
      });
      turn++;
      services.push({ date, time, service: label, worship, choirSong: label === 'Morning' ? '#311 I Repent of My Sin' : '', assignments });
    });
  }
  // The admin presides at the next Saturday morning and also serves twice there.
  const nextSaturday = services.find(service => service.date > today && service.service === 'Morning' && service.worship === 'Sabbath Day');
  if (nextSaturday) Object.assign(nextSaturday.assignments, { Presider: 'B. Adam', 'Media Booth #1': 'B. Adam' });

  const docs = {
    'app/settings': { sitePinHash: 'a1fb4e703a9ef1fa4936801721ff285a97ac85330856674412e054892afe6972', features: {}, schedulerName: 'E. Joseph',
      dutyDefaults: { Sermon: 'B. Samuel' } },
    'app/members': { list: members },
    'app/departments': { map: rosters },
    'app/nameMap': { map: { 'B. Adam A': 'B. Adam' } },
    'app/leaderConfig': {
      admin: ['B. Adam'], globalLeaderManager: ['B. Adam'],
      departmentLeaders: { Worship: ['E. Joseph'], Media: ['E. Joseph'], 'Usher Sisters': ['S. Grace'] },
      songEditors: ['M. Ruth']
    }
  };
  services.forEach(service => {
    docs['schedule/' + service.date + '_' + service.service.toLowerCase().replace(/[^a-z0-9]+/g, '-')] = service;
  });
  // B. Silas serves in Translation but has no profile there, as happens for
  // members who had never signed in when departments were set up.
  Object.entries(rosters).forEach(([department, names]) => names.forEach(name => {
    if (department === 'Translation' && name === 'B. Silas') return;
    const uid = 'member:' + name;
    docs['departments/' + department + '/members/' + uid] = {
      uid, memberUid: uid, department, departmentId: department, memberName: name,
      role: (docs['app/leaderConfig'].departmentLeaders[department] || []).includes(name) ? 'departmentLeader' : 'member',
      status: 'active', eligibleDuties: duties[department].slice(), schedulable: true, revision: 1, updatedAt: Date.parse(day(-10) + 'T12:00:00Z'),
      availability: { recurring: { 'early-morning': 'available', morning: 'available', afternoon: 'available', evening: 'available', commemoration: 'available' }, exceptions: {} }
    };
  }));
  if (nextSaturday) {
    const id = nextSaturday.date + '_morning';
    docs['setlists/' + id] = { id, date: nextSaturday.date, worshipType: 'Sabbath Day', serviceLabel: 'Morning', presider: 'B. Adam',
      songs: ['001', '015'], status: 'planned', updatedAt: 1, source: 'schedule' };
  }
  docs['songStats/001'] = { songId: '001', timesSung: 3, lastSung: day(-14), history: [
    { date: day(-60), service: day(-60) + '_morning', by: 'B. Adam', markedAt: 1 },
    { date: day(-35), service: day(-35) + '_morning', by: 'E. Joseph', markedAt: 2 },
    { date: day(-14), service: day(-14) + '_morning', by: 'B. Adam', markedAt: 3 }] };
  docs['songStats/015'] = { songId: '015', timesSung: 1, lastSung: day(-21), history: [{ date: day(-21), service: day(-21) + '_evening', by: 'B. Caleb', markedAt: 4 }] };

  const leahDuty = services.find(service => service.date > today && Object.values(service.assignments).includes('S. Leah'));
  if (leahDuty) {
    const duty = Object.keys(leahDuty.assignments).find(key => leahDuty.assignments[key] === 'S. Leah');
    const svcId = leahDuty.date + '_' + leahDuty.service.toLowerCase();
    docs['requests/' + svcId + '_leah'] = { id: svcId + '_leah', svcId, name: 'S. Leah', memberId: 'S. Leah', requesterUid: 'member:S. Leah',
      date: leahDuty.date, service: leahDuty.service, worship: leahDuty.worship, duty, department: 'Usher Sisters',
      note: 'Family visiting that weekend.', status: 'pending', createdAt: Date.parse(day(-1) + 'T18:00:00Z') };
  }
  docs['feedback/note-1'] = { uid: 'member:S. Naomi', name: 'S. Naomi', kind: 'suggestion', message: 'Could the duty list use larger text?',
    screen: 'my', appearance: 'classic', status: 'new', createdAt: Date.parse(day(-2) + 'T17:00:00Z') };

  const claims = (name, extra) => Object.assign({ memberId: name, memberName: name, role: 'member', roles: ['member'], departments: [], mustChangePin: false, roleVersion: 1 }, extra);
  const accounts = {};
  members.forEach(name => { accounts[name] = { pin: '1234', claims: claims(name) }; });
  accounts['B. Adam'].claims = claims('B. Adam', { role: 'admin', roles: ['admin'], admin: true });
  accounts['E. Joseph'].claims = claims('E. Joseph', { role: 'departmentLeader', roles: ['departmentLeader'], departments: ['Worship', 'Media'] });
  accounts['S. Grace'].claims = claims('S. Grace', { role: 'departmentLeader', roles: ['departmentLeader'], departments: ['Usher Sisters'] });
  accounts['M. Ruth'].claims = claims('M. Ruth', { role: 'songEditor', roles: ['songEditor'] });
  accounts['B. Silas'].claims = claims('B. Silas', { mustChangePin: true });

  const overrides = Object.assign({}, window.__fixtureOverrides);
  Object.entries(overrides.patch || {}).forEach(([path, fields]) => { docs[path] = Object.assign({}, docs[path], fields); });
  delete overrides.patch;
  window.__fixture = Object.assign({ docs, accounts, denied: ['app/songSettings', 'app/presiders'], delays: { songStats: 40 } }, overrides);
})();
