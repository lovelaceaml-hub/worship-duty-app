'use strict';

/*
 * Member identity cleanup + department-leader Manage visibility.
 *
 * This module is intentionally separate from app.js so it can:
 *  - clean legacy/duplicate member spellings in Firestore without disturbing
 *    the main scheduling renderer;
 *  - keep a shared list of department leaders in app/settings; and
 *  - hide the Manage tab for everyone else while preserving the existing
 *    editor-passcode requirement as a second layer.
 */

const FIREBASE_VERSION = '10.12.2';
const CLEANUP_MARKER = 'wds-member-cleanup-v3';

const STATIC_ALIASES = {
  'B. Anthony L': 'B. Anthony',
  'D. Chris K': 'D. Chris',
  'D. Chris Kane': 'D. Chris',
  'B. James D': 'B. James',
  'B. Jason S': 'B. Jason',
  'S. Martha B': 'S. Martha',
  'S. Monica Salazar': 'S. Monica S',
  'M.Chad': 'M. Chad',
  'B. Gio': 'B. Giomar'
};

const LONG_PREFIXES = {
  brother: 'B.',
  bro: 'B.',
  deacon: 'D.',
  sister: 'S.',
  sis: 'S.',
  missionary: 'M.',
  evangelist: 'E.'
};

const SHORT_PREFIXES = {
  b: 'B.',
  d: 'D.',
  s: 'S.',
  m: 'M.',
  e: 'E.'
};

function normalizeMemberName(value) {
  let name = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!name) return '';

  let match = name.match(/^(Brother|Bro|Deacon|Sister|Sis|Missionary|Evangelist)\b[\s,.:;-]*(.+)$/i);
  if (match) {
    const prefix = LONG_PREFIXES[match[1].toLowerCase()];
    const rest = match[2].trim().replace(/\s+/g, ' ');
    return rest ? prefix + ' ' + rest : prefix;
  }

  // Single-letter titles require an actual separator so an ordinary name like
  // "Brent" can never be interpreted as "B. rent".
  match = name.match(/^([BDSME])(?:\s+|[.,:;-]\s*)(.+)$/i);
  if (match) {
    const prefix = SHORT_PREFIXES[match[1].toLowerCase()];
    const rest = match[2].trim().replace(/\s+/g, ' ');
    return rest ? prefix + ' ' + rest : prefix;
  }

  return name;
}

function makeCanonicalizer(aliasMap) {
  const aliases = Object.assign({}, STATIC_ALIASES, aliasMap || {});
  return value => {
    const original = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
    if (!original) return '';

    let current = original;
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      if (seen.has(current)) break;
      seen.add(current);
      const normalized = normalizeMemberName(current);
      const next = aliases[current] || aliases[normalized];
      if (!next) return normalized;
      current = String(next).trim().replace(/\s+/g, ' ');
    }
    return normalizeMemberName(current);
  };
}

function uniqueSorted(values) {
  return Array.from(new Set((values || []).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function sameArray(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function remapConflictOk(conflictOk, canon) {
  const input = conflictOk || {};
  const output = {};
  Object.keys(input).forEach(name => {
    const target = canon(name);
    const duties = Array.isArray(input[name]) ? input[name] : [];
    output[target] = Array.from(new Set((output[target] || []).concat(duties)));
  });
  return output;
}

async function ensureSignedIn(app) {
  const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
  const auth = authMod.getAuth(app);
  if (!auth.currentUser) await authMod.signInAnonymously(auth);
  return auth;
}

async function commitWrites(fsMod, db, writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = fsMod.writeBatch(db);
    writes.slice(i, i + 400).forEach(write => batch.set(write.ref, write.data, write.options || {}));
    await batch.commit();
  }
}

async function cleanMemberIdentities(app, db, fsMod, interactive) {
  await ensureSignedIn(app);

  const membersRef = fsMod.doc(db, 'app', 'members');
  const departmentsRef = fsMod.doc(db, 'app', 'departments');
  const nameMapRef = fsMod.doc(db, 'app', 'nameMap');
  const settingsRef = fsMod.doc(db, 'app', 'settings');

  const [membersSnap, departmentsSnap, nameMapSnap, settingsSnap, scheduleSnap, requestsSnap] =
    await Promise.all([
      fsMod.getDoc(membersRef),
      fsMod.getDoc(departmentsRef),
      fsMod.getDoc(nameMapRef),
      fsMod.getDoc(settingsRef),
      fsMod.getDocs(fsMod.collection(db, 'schedule')),
      fsMod.getDocs(fsMod.collection(db, 'requests'))
    ]);

  const storedMap = nameMapSnap.exists() ? (nameMapSnap.data().map || {}) : {};
  const canon = makeCanonicalizer(storedMap);
  const learnedAliases = {};

  const remember = value => {
    const raw = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    const target = canon(raw);
    if (target && target !== raw) learnedAliases[raw] = target;
    return target;
  };

  const writes = [];
  let memberRowsRemoved = 0;
  let servicesChanged = 0;
  let requestsChanged = 0;
  let departmentsChanged = false;
  let settingsChanged = false;

  const oldMembers = membersSnap.exists() && Array.isArray(membersSnap.data().list)
    ? membersSnap.data().list : [];
  const mappedMembers = oldMembers.map(remember);
  const cleanedMembers = uniqueSorted(mappedMembers);
  memberRowsRemoved = oldMembers.filter((name, index) => {
    const target = mappedMembers[index];
    return target !== name || mappedMembers.indexOf(target) !== index;
  }).length;

  if (!sameArray(oldMembers, cleanedMembers)) {
    writes.push({ ref: membersRef, data: { list: cleanedMembers } });
  }

  const oldDepartments = departmentsSnap.exists() ? (departmentsSnap.data().map || {}) : {};
  const cleanedDepartments = {};
  Object.keys(oldDepartments).forEach(category => {
    cleanedDepartments[category] = uniqueSorted((oldDepartments[category] || []).map(remember));
  });
  if (!sameJson(oldDepartments, cleanedDepartments)) {
    departmentsChanged = true;
    writes.push({ ref: departmentsRef, data: { map: cleanedDepartments } });
  }

  scheduleSnap.forEach(snap => {
    const service = snap.data() || {};
    const assignments = Object.assign({}, service.assignments || {});
    let changed = false;

    Object.keys(assignments).forEach(duty => {
      const oldName = assignments[duty];
      const target = remember(oldName);
      if (target !== oldName) {
        assignments[duty] = target;
        changed = true;
      }
    });

    const oldConflictOk = service.conflictOk || {};
    const conflictOk = remapConflictOk(oldConflictOk, remember);
    if (!sameJson(oldConflictOk, conflictOk)) changed = true;

    if (changed) {
      servicesChanged++;
      writes.push({
        ref: snap.ref,
        data: Object.assign({}, service, { assignments, conflictOk })
      });
    }
  });

  requestsSnap.forEach(snap => {
    const request = snap.data() || {};
    const next = Object.assign({}, request);
    let changed = false;
    ['name', 'resolvedBy'].forEach(field => {
      if (!request[field] || request[field] === 'editor') return;
      const target = remember(request[field]);
      if (target !== request[field]) {
        next[field] = target;
        changed = true;
      }
    });
    if (changed) {
      requestsChanged++;
      writes.push({ ref: snap.ref, data: next });
    }
  });

  const settings = settingsSnap.exists() ? (settingsSnap.data() || {}) : {};
  const nextSettings = Object.assign({}, settings);
  if (settings.schedulerName) {
    const scheduler = remember(settings.schedulerName);
    if (scheduler !== settings.schedulerName) {
      nextSettings.schedulerName = scheduler;
      settingsChanged = true;
    }
  }
  if (Array.isArray(settings.departmentLeaders)) {
    const leaders = uniqueSorted(settings.departmentLeaders.map(remember));
    if (!sameArray(settings.departmentLeaders, leaders)) {
      nextSettings.departmentLeaders = leaders;
      settingsChanged = true;
    }
  }
  if (settingsChanged) writes.push({ ref: settingsRef, data: nextSettings });

  const mergedNameMap = Object.assign({}, STATIC_ALIASES, storedMap, learnedAliases);
  if (!sameJson(storedMap, mergedNameMap)) {
    writes.push({ ref: nameMapRef, data: { map: mergedNameMap } });
  }

  if (writes.length) await commitWrites(fsMod, db, writes);
  localStorage.setItem(CLEANUP_MARKER, '1');

  if (interactive) {
    const details = [
      memberRowsRemoved + ' duplicate/variant member entr' + (memberRowsRemoved === 1 ? 'y' : 'ies') + ' cleaned',
      servicesChanged + ' service' + (servicesChanged === 1 ? '' : 's') + ' updated',
      departmentsChanged ? 'department rosters cleaned' : 'department rosters already clean',
      requestsChanged + ' request' + (requestsChanged === 1 ? '' : 's') + ' updated'
    ];
    alert('Member cleanup complete.\n\n' + details.join('\n'));
  }
}

function currentMember() {
  const select = document.getElementById('me-select');
  const raw = (select && select.value) || localStorage.getItem('wds-me') || '';
  return normalizeMemberName(raw);
}

function setupLeaderAccess(app, db, fsMod) {
  const settingsRef = fsMod.doc(db, 'app', 'settings');
  const membersRef = fsMod.doc(db, 'app', 'members');
  let settings = {};
  let members = [];
  let settingsLoaded = false;
  let renderQueued = false;

  const leaders = () => uniqueSorted((settings.departmentLeaders || []).map(normalizeMemberName));
  const restrictionActive = () => leaders().length > 0;
  const canManage = () => settingsLoaded && (!restrictionActive() || leaders().includes(currentMember()));

  function queueApply() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      applyAccess();
      renderLeaderEditor();
    });
  }

  function applyAccess() {
    const manageTab = document.getElementById('tab-manage');
    if (!manageTab) return;
    const allowed = canManage();
    manageTab.classList.toggle('hidden', !allowed);
    manageTab.setAttribute('aria-hidden', allowed ? 'false' : 'true');

    if (!allowed && manageTab.classList.contains('active')) {
      const myTab = document.getElementById('tab-my');
      if (myTab) myTab.click();
    }
  }

  function renderLeaderEditor() {
    const view = document.getElementById('view');
    if (!view) return;
    const peopleTab = view.querySelector('.subnav button[data-sub="people"].active');
    const existing = document.getElementById('department-leader-access');
    if (!peopleTab || !canManage()) {
      if (existing) existing.remove();
      return;
    }

    const selected = new Set(leaders());
    const available = uniqueSorted(members.map(normalizeMemberName));
    const signature = JSON.stringify({ available, selected: Array.from(selected), active: restrictionActive() });
    if (existing && existing.dataset.signature === signature) return;

    const card = existing || document.createElement('div');
    card.id = 'department-leader-access';
    card.className = 'card';
    card.dataset.signature = signature;
    card.innerHTML =
      '<div class="f-label">Department leader access</div>' +
      '<div class="f-desc">Only selected department leaders will see the Manage tab. The existing editor passcode still applies after they open it.</div>' +
      (!restrictionActive()
        ? '<p class="hint" style="margin-top:10px"><b>Leader-only access is not active yet.</b> Select every department leader below, then save.</p>'
        : '') +
      '<div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:12px">' +
      available.map(name =>
        '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px">' +
        '<input type="checkbox" data-access-leader value="' + escapeHtml(name) + '"' +
        (selected.has(name) ? ' checked' : '') + '>' + escapeHtml(name) + '</label>'
      ).join('') +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px">' +
      '<button class="primary" type="button" data-access-save-leaders>Save department leaders</button>' +
      '<span class="hint" style="margin:0">' + selected.size + ' currently selected</span>' +
      '</div>';

    if (!existing) {
      const subnav = view.querySelector('.subnav');
      if (subnav) subnav.insertAdjacentElement('afterend', card);
    }
  }

  // Default closed until the shared settings snapshot arrives so a non-leader
  // never sees a brief Manage-tab flash during startup.
  const initialManageTab = document.getElementById('tab-manage');
  if (initialManageTab) {
    initialManageTab.classList.add('hidden');
    initialManageTab.setAttribute('aria-hidden', 'true');
  }

  fsMod.onSnapshot(settingsRef, snap => {
    settings = snap.exists() ? (snap.data() || {}) : {};
    settingsLoaded = true;
    queueApply();
  });

  fsMod.onSnapshot(membersRef, snap => {
    members = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    queueApply();
  });

  document.addEventListener('click', event => {
    const manageTab = event.target.closest && event.target.closest('#tab-manage');
    if (manageTab && !canManage()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const saveButton = event.target.closest && event.target.closest('[data-access-save-leaders]');
    if (!saveButton) return;

    event.preventDefault();
    const checked = Array.from(document.querySelectorAll('#department-leader-access [data-access-leader]:checked'))
      .map(input => normalizeMemberName(input.value))
      .filter(Boolean);
    const next = uniqueSorted(checked);
    if (!next.length) {
      alert('Select at least one department leader before saving.');
      return;
    }

    const me = currentMember();
    if (me && !next.includes(me) &&
        !confirm('Your name is not selected. After saving, Manage will disappear for you on this device. Save anyway?')) {
      return;
    }

    ensureSignedIn(app)
      .then(() => fsMod.setDoc(settingsRef, { departmentLeaders: next }, { merge: true }))
      .catch(error => {
        console.warn('Could not save department leaders:', error);
        alert('Could not save department leaders. Check the connection and try again.');
      });
  }, true);

  document.addEventListener('change', event => {
    if (event.target && event.target.id === 'me-select') setTimeout(queueApply, 0);
  });

  const observer = new MutationObserver(queueApply);
  observer.observe(document.body, { childList: true, subtree: true });
  queueApply();
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function start() {
  if (!window.FIREBASE_CONFIG) return;

  const [appMod, fsMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)
  ]);

  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(window.FIREBASE_CONFIG);
  const db = fsMod.getFirestore(app);

  setupLeaderAccess(app, db, fsMod);

  // Replace the old one-time cleanup handler with the stronger version. Capture
  // phase lets this run before app.js's delegated click handler.
  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('[data-act="unify-names"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!confirm('Clean duplicate and variant member names across members, duties, departments, and requests?')) return;
    cleanMemberIdentities(app, db, fsMod, true).catch(error => {
      console.warn('Member cleanup failed:', error);
      alert('Member cleanup could not finish. Check the connection and try again.');
    });
  }, true);

  // One idempotent migration per device after this release. This fixes existing
  // ghost identities without requiring every member to press the cleanup button.
  if (localStorage.getItem(CLEANUP_MARKER) !== '1') {
    setTimeout(() => {
      cleanMemberIdentities(app, db, fsMod, false).catch(error => {
        console.warn('Background member cleanup skipped:', error);
      });
    }, 1200);
  }
}

start().catch(error => console.warn('Member access module did not start:', error));
