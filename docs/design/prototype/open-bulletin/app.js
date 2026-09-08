/* Runtime-neutral fictional prototype for LV Zion Worship Service.
   All state lives in memory. No Firebase, external requests, fonts, or assets are used. */
(function bootPrototype(window, document) {
  "use strict";

  const FIX = window.WorshipPrototypeFixtures;
  if (!FIX) {
    window.addEventListener("WorshipPrototypeReady", () => bootPrototype(window, document), { once: true });
    return;
  }

  const NAV = ["home", "duty", "presider", "manage"];
  const SPECIAL = ["empty", "loading", "offline", "error", "success"];
  const REAL_MODE = FIX.readOnly === true;
  const VALID_SCREENS = REAL_MODE ? NAV : NAV.concat(SPECIAL);
  const deepClone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const BASE = deepClone(FIX);
  const sourceServices = Array.isArray(FIX.services) ? FIX.services : [];
  const sourceMembers = Array.isArray(FIX.members) ? FIX.members : [];
  const today = FIX.today || "2026-09-10";
  const scheduledServices = sourceServices.filter((service) => !service.standalone).slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time24 || a.time || "").localeCompare(String(b.time24 || b.time || "")));
  const firstService = scheduledServices.find((service) => String(service.date || "") >= today) || scheduledServices[scheduledServices.length - 1] || sourceServices[0] || null;
  const initialCalendarDate = FIX.initialDate || (firstService && firstService.date) || today;
  const READ_ONLY_ACTIONS = new Set([
    "request-change", "cancel-request", "calendar", "copy-calendar", "subscribe-calendar", "copy-feed-link", "clear-alert",
    "save-setlist", "retry-save", "confirm-songs", "add-song", "move-song", "remove-song", "manage-tab", "preview-name-unify",
    "cancel-name-unify", "confirm-name-unify", "open-request-service", "approve-request", "decline-request", "lock-editor", "lock-site",
    "edit-passcode", "cancel-passcode", "sync-now", "export-backup", "restore-sample", "confirm-restore-sample", "cancel-restore-sample",
    "reset-prototype", "confirm-reset-prototype", "cancel-reset-prototype", "apply-suggestion", "delete-service", "cancel-delete-service",
    "confirm-delete-service", "remove-member", "cancel-remove-member", "confirm-remove-member", "ack-conflict", "reopen-conflict",
    "copy-setlist", "clear-copy", "mark-sung", "cancel-mark-sung", "confirm-mark-sung", "undo-sung", "cancel-undo-sung",
    "confirm-undo-sung", "delete-setlist", "cancel-delete-setlist", "delete-setlist-confirm", "create-setlist", "remove-history",
    "open-backfill", "close-backfill", "recover-empty", "recover-loading", "recover-offline", "recover-error", "recover-success"
  ]);

  const state = {
    screen: readScreen(),
    selectedName: REAL_MODE ? "" : (sourceMembers[0] || ""),
    selectedDate: "",
    calendarMonth: initialCalendarDate.slice(0, 7),
    calendarDay: "",
    selectedServiceId: (firstService && firstService.id) || "",
    expandedServices: firstService ? { [firstService.id]: true } : {},
    openDutyTeams: {},
    homeDepartment: "All",
    dutyDepartment: "All",
    presiderFilter: "mine",
    departmentChoice: (FIX.categories && FIX.categories[0] && FIX.categories[0].name) || "",
    showPast: false,
    dutyNoteOpen: false,
    memberNotice: "",
    calendarMessage: "",
    copyText: "",
    copyMessage: "",
    copyLabel: "",
    calendarSubscription: "idle",
    calendarFeedMessage: "",
    alerts: REAL_MODE ? [] : [
      { id: "alert-1", text: "B. Daniel Reed is assigned Presider for the next service.", read: false },
      { id: "alert-2", text: "A fictional change request is waiting for coordinator review.", read: false }
    ],
    requestOpen: null,
    requestNote: "",
    requestMessage: "",
    services: deepClone(FIX.services || []),
    members: deepClone(FIX.members || []),
    categories: deepClone(FIX.categories || []),
    departments: deepClone(FIX.departments || {}),
    setlists: deepClone(FIX.setlists || {}),
    requests: deepClone(FIX.requests || []),
    songs: deepClone(FIX.songs || []),
    songStats: deepClone(FIX.songStats || {}),
    features: deepClone(FIX.features || {}),
    manageTab: "assignments",
    manageUnlocked: true,
    siteLocked: false,
    editorPasscode: FIX.passcodes && FIX.passcodes.editor || "",
    sitePasscode: FIX.passcodes && FIX.passcodes.site || "",
    accessError: "",
    passcodeMode: null,
    manageNotice: "",
    serviceDeleteId: null,
    removeMember: null,
    conflictAcknowledged: {},
    planWindow: "next-4-weeks",
    planNotice: "",
    sheetUrl: REAL_MODE ? "" : "local-sheet://fictional-schedule",
    syncStatus: "idle",
    syncMessage: "",
    songSearch: "",
    songCategory: "All",
    openSong: null,
    songLibraryOpen: false,
    songLibraryReturnFocus: "song-library-trigger",
    songNotice: "",
    saveState: "ready",
    failNextSave: new URLSearchParams(window.location.search).get("review") === "save-failure",
    showHistory: false,
    backfillOpen: false,
    markSungConfirm: null,
    undoSungConfirm: null,
    runsheetOpen: false,
    deleteSetlistConfirm: false,
    touchStart: null,
    saveTimer: null,
    importMessage: "",
    scheduler: "",
    nameMap: deepClone(FIX.nameMap || {}),
    nameUnifyPreview: false,
    resetConfirm: null
  };

  function readScreen() {
    const value = new URLSearchParams(window.location.search).get("screen");
    return VALID_SCREENS.includes(value) ? value : "home";
  }

  function serviceById(id) {
    return state.services.find((item) => item.id === id) || state.services[0] || null;
  }

  function serviceTime(service) {
    return service && (service.time24 || service.time || "");
  }

  function choirSongLabel(service) {
    const value = service && service.choirSong;
    const catalogId = value && typeof value === "object" ? (value.catalogId || value.songId || value.id || "") : value;
    const song = songById(catalogId);
    if (song) return song.title;
    if (REAL_MODE) {
      const sourceLabel = value && typeof value === "object" ? (value.label || value.title || value.name || "") : value;
      if (sourceLabel && String(sourceLabel).trim()) return String(sourceLabel);
    }
    return "Not assigned";
  }

  function setlistById(id) {
    return state.setlists[id] || null;
  }

  function currentSetlist() {
    return setlistById(state.selectedServiceId);
  }

  function songById(id) {
    return state.songs.find((item) => item.id === id) || null;
  }

  function calendarFeedUrl() {
    return "https://example.com/fictional-lv-zion/ics/" + encodeURIComponent(state.selectedName);
  }

  function lastHistoryDate(history) {
    return (history || []).reduce((last, entry) => {
      const date = entry && entry.date ? String(entry.date) : "";
      return date && (!last || date > last) ? date : last;
    }, null);
  }

  function songHistory(songId) {
    const stat = state.songStats[songId];
    if (stat && Array.isArray(stat.history)) return deepClone(stat.history);
    const song = songById(songId);
    return song && Array.isArray(song.history) ? deepClone(song.history) : [];
  }

  function writeSongHistory(songId, history) {
    const nextHistory = deepClone(history || []);
    const previous = state.songStats[songId] || {};
    const next = Object.assign({}, previous, {
      songId,
      timesSung: nextHistory.length,
      sungCount: nextHistory.length,
      lastSung: lastHistoryDate(nextHistory),
      history: nextHistory
    });
    state.songStats[songId] = next;
    const song = songById(songId);
    if (song) song.history = deepClone(nextHistory);
    return next;
  }

  function ensureSongStats(songId) {
    const history = songHistory(songId);
    const stat = state.songStats[songId];
    if (REAL_MODE) {
      if (stat && typeof stat === "object") {
        const suppliedCount = stat.sungCount !== undefined ? stat.sungCount : (stat.timesSung !== undefined ? stat.timesSung : 0);
        const suppliedLast = stat.lastSung !== undefined ? stat.lastSung : null;
        return Object.assign({ songId, sungCount: suppliedCount, timesSung: suppliedCount, lastSung: suppliedLast, history }, stat);
      }
      return { songId, sungCount: history.length, timesSung: history.length, lastSung: lastHistoryDate(history), history };
    }
    const count = history.length;
    const last = lastHistoryDate(history);
    if (!stat || !Array.isArray(stat.history) || stat.sungCount !== count || stat.lastSung !== last) {
      return writeSongHistory(songId, history);
    }
    return stat;
  }

  function historyForStats(statsMap, songId) {
    const stat = statsMap[songId];
    return stat && Array.isArray(stat.history) ? stat.history.slice() : songHistory(songId);
  }

  function uniqueSetlistSongs(setlist) {
    return Array.from(new Set((setlist && setlist.songs) || []));
  }

  function serviceSongsComplete(setlist) {
    const songs = uniqueSetlistSongs(setlist);
    return songs.length > 0 && songs.every((songId) => songHistory(songId).some((entry) => entry.service === setlist.id));
  }

  function hasServiceHistory(setlist) {
    return state.songs.some((song) => songHistory(song.id).some((entry) => entry.service === setlist.id));
  }

  function applySung(statsMap, setlist, options) {
    const opts = options || {};
    const service = setlist.id;
    const changed = {};
    Array.from(new Set(setlist.songs || [])).forEach((songId) => {
      const history = historyForStats(statsMap, songId);
      if (history.some((entry) => entry.service === service)) return;
      history.push({ date: setlist.date, service, by: opts.by || "", markedAt: opts.markedAt || today + "T12:00:00" });
      changed[songId] = { songId, timesSung: history.length, sungCount: history.length, lastSung: lastHistoryDate(history), history };
    });
    return { changed, removed: [] };
  }

  function applyUndo(statsMap, setlist) {
    const service = setlist.id;
    const changed = {};
    const removed = [];
    const songIds = new Set(setlist.songs || []);
    Object.keys(statsMap || {}).forEach((songId) => {
      if (historyForStats(statsMap, songId).some((entry) => entry.service === service)) songIds.add(songId);
    });
    Array.from(songIds).forEach((songId) => {
      const history = historyForStats(statsMap, songId);
      const nextHistory = history.filter((entry) => entry.service !== service);
      if (nextHistory.length === history.length) return;
      if (!nextHistory.length) removed.push(songId);
      else changed[songId] = { songId, timesSung: nextHistory.length, sungCount: nextHistory.length, lastSung: lastHistoryDate(nextHistory), history: nextHistory };
    });
    return { changed, removed: Array.from(new Set(removed)) };
  }

  function categoryForDuty(duty) {
    return state.categories.find((category) => category.duties.includes(duty)) || { name: "Worship", duties: [] };
  }

  function dateObject(iso) {
    const date = new Date(String(iso || "") + "T12:00:00");
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function monthStart(monthKey) {
    const value = /^\d{4}-\d{2}$/.test(String(monthKey || "")) ? String(monthKey) + "-01" : today;
    const date = dateObject(value) || new Date();
    date.setDate(1);
    return date;
  }

  function monthKey(date) {
    const source = date instanceof Date ? date : dateObject(date);
    if (!source) return today.slice(0, 7);
    return source.getFullYear() + "-" + String(source.getMonth() + 1).padStart(2, "0");
  }

  function monthTitle(key) {
    return monthStart(key).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  function shiftMonth(key, amount) {
    const date = monthStart(key);
    date.setMonth(date.getMonth() + amount);
    return monthKey(date);
  }

  function monthCalendarDays(key) {
    const first = monthStart(key);
    const startOffset = first.getDay();
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const days = [];
    for (let index = 0; index < startOffset; index += 1) days.push(null);
    for (let day = 1; day <= count; day += 1) {
      days.push(key + "-" + String(day).padStart(2, "0"));
    }
    while (days.length % 7) days.push(null);
    return days;
  }

  function departmentKey(name) {
    return String(name || "department").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "department";
  }

  function departmentForDuty(duty) {
    return categoryForDuty(duty).name || "Worship";
  }

  function serviceSort(a, b) {
    return String(a.date || "").localeCompare(String(b.date || "")) || serviceTime(a).localeCompare(serviceTime(b)) || String(a.id || "").localeCompare(String(b.id || ""));
  }

  function sourceServicesForMonth(key, options) {
    const opts = options || {};
    return state.services.filter((service) => service.date && service.date.slice(0, 7) === key && (opts.includeStandalone || !service.standalone)).sort(serviceSort);
  }

  function servicesForSelectedCalendar(options) {
    const opts = options || {};
    if (state.calendarDay) return servicesForDate(state.calendarDay).filter((service) => opts.includeStandalone || !service.standalone).sort(serviceSort);
    return sourceServicesForMonth(state.calendarMonth, opts);
  }

  function setCalendarSelection(date) {
    state.calendarDay = date || "";
    state.selectedDate = state.calendarDay;
    if (date) state.calendarMonth = date.slice(0, 7);
  }

  function selectedCalendarLabel() {
    return state.calendarDay ? fullDate(state.calendarDay) : monthTitle(state.calendarMonth) + ", whole month";
  }

  function songDisplayNumber(song) {
    if (!song) return "";
    const explicit = song.appendixNumber !== undefined ? song.appendixNumber : song.number;
    const match = String(explicit || "").match(/(?:appx|appendix)\s*\.?\s*#?\s*(\d+)/i);
    return match ? "A" + String(Number(match[1])).padStart(2, "0") : String(song.number || "");
  }

  function songLabel(song) {
    const number = songDisplayNumber(song);
    return number.charAt(0) === "A" ? number : "#" + number;
  }

  function fullDate(iso) {
    const date = dateObject(iso);
    return date ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Date not listed";
  }

  function compactDate(iso) {
    const date = dateObject(iso);
    return date ? date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Date not listed";
  }

  function dateWithoutYear(iso) {
    const date = dateObject(iso);
    return date ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Date not listed";
  }

  function formatTime(value) {
    if (!value && REAL_MODE) return "Time not listed";
    const [rawHour, minute = "00"] = String(value || "00:00").split(":");
    const hour24 = Number(rawHour) || 0;
    const hour = hour24 % 12 || 12;
    return hour + ":" + minute + " " + (hour24 >= 12 ? "PM" : "AM");
  }

  function formatRecordTime(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }

  function timeParts(value) {
    if (!value && REAL_MODE) return { large: "Time", suffix: "not listed" };
    const full = formatTime(value);
    return { large: full.replace(/\s?(AM|PM)$/, ""), suffix: full.slice(-2) };
  }

  function formatDuration(seconds) {
    const total = Number(seconds || 0);
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  }

  function escAttr(value) {
    return escapeHtml(value);
  }

  function servicesForDate(date) {
    return state.services.filter((service) => service.date === date).sort(serviceSort);
  }

  function upcomingServices() {
    return state.services.filter((service) => service.date >= today && !service.standalone).sort(serviceSort);
  }

  function pastServices() {
    return state.services.filter((service) => service.date < today && !service.standalone).sort((a, b) => serviceSort(b, a));
  }

  function myAssignments(name, includePast) {
    if (REAL_MODE && !name) return [];
    const source = (includePast ? state.services : state.services.filter((service) => service.date >= today)).filter((service) => !service.standalone);
    return source.flatMap((service) => Object.entries(service.assignments || {})
      .filter(([, member]) => member === name)
      .map(([duty]) => ({ service, duty, department: departmentForDuty(duty) })));
  }

  function nextDutyFor(name) {
    return myAssignments(name, false).sort((a, b) => a.service.date.localeCompare(b.service.date) || serviceTime(a.service).localeCompare(serviceTime(b.service)))[0] || null;
  }

  function isPresider(name, service) {
    const setlist = service && setlistById(service.id);
    return Boolean(service && ((service.assignments && service.assignments.Presider === name) || (setlist && setlist.presider === name)));
  }

  function presiderServices(name) {
    const allServices = state.services.filter((service) => REAL_MODE || !service.standalone || setlistById(service.id));
    const selectedDay = state.screen === "presider" && state.calendarDay;
    const selectedMonth = state.calendarMonth || today.slice(0, 7);
    if (state.presiderFilter === "all") {
      const all = allServices.filter((service) => service.date.slice(0, 7) === selectedMonth).sort(serviceSort);
      return selectedDay ? all.filter((service) => service.date === selectedDay) : all;
    }
    if (REAL_MODE && !name) return [];
    const todayMonth = today.slice(0, 7);
    const browsingPast = selectedMonth < todayMonth || (selectedDay && selectedDay < today);
    const source = browsingPast
      ? allServices.filter((service) => service.date.slice(0, 7) === selectedMonth)
      : allServices.filter((service) => service.date.slice(0, 7) === selectedMonth && service.date >= today);
    const mine = source.filter((service) => isPresider(name, service)).sort(serviceSort);
    return selectedDay ? mine.filter((service) => service.date === selectedDay) : mine;
  }

  function selectedPresiderService() {
    const options = presiderServices(state.selectedName);
    if (!options.some((service) => service.id === state.selectedServiceId)) {
      state.selectedServiceId = options[0]?.id || "";
    }
    return options.find((service) => service.id === state.selectedServiceId) || null;
  }

  function memberOptions(selected, includeBlank) {
    const options = REAL_MODE ? ['<option value=""' + (!selected ? " selected" : "") + '">Choose your name</option>'] : (includeBlank ? ['<option value="">Unassigned</option>'] : []);
    return options.concat(state.members.map((member) => '<option value="' + escAttr(member) + '"' + (member === selected ? " selected" : "") + ">" + escapeHtml(member) + "</option>")).join("");
  }

  function serviceOptions(selected, list) {
    return (list || upcomingServices()).map((service) => {
      const parts = [service.worshipType, service.serviceLabel, compactDate(service.date), formatTime(serviceTime(service))].filter(Boolean);
      return '<option value="' + escAttr(service.id) + '"' + (service.id === selected ? " selected" : "") + ">" + escapeHtml(parts.join(", ")) + "</option>";
    }).join("");
  }

  function songOptions(selected, allowBlank) {
    const values = allowBlank ? ['<option value="">No song selected</option>'] : [];
    return values.concat(state.songs.map((song) => '<option value="' + escAttr(song.id) + '"' + (song.id === selected ? " selected" : "") + ">" + escapeHtml(songLabel(song)) + " " + escapeHtml(song.title) + "</option>")).join("");
  }

  function notice(text, kind) {
    return text ? '<p class="prototype-notice' + (kind ? " " + kind : "") + '" role="' + (kind === "error" ? "alert" : "status") + '">' + escapeHtml(text) + "</p>" : "";
  }

  function renderCopyFallback(label) {
    if (!state.copyText) return "";
    return '<div class="copy-fallback">' + notice(state.copyMessage || "Copyable text prepared locally.", "success") + '<label class="field-label">' + escapeHtml(label || state.copyLabel || "Copyable text") + '<textarea readonly rows="4">' + escapeHtml(state.copyText) + '</textarea></label><button class="text-button" type="button" data-action="clear-copy">Clear copy text</button></div>';
  }

  function serviceCalendarText() {
    const rows = myAssignments(state.selectedName, false);
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "X-WR-CALNAME:LV Zion Worship Service",
      ...rows.flatMap((item) => [
        "SUMMARY:" + item.duty + " | " + item.service.worshipType + " " + item.service.serviceLabel,
        "DTSTART:" + item.service.date.replace(/-/g, "") + "T" + serviceTime(item.service).replace(":", "") + "00",
      ]),
      "END:VCALENDAR",
    ].join("\n");
  }

  function outlineText(service, setlist) {
    const preparation = preparationEntries(setlist).map((entry) => songLabel(entry.song) + " " + entry.song.title + " (" + formatDuration(entry.song.durationSec) + ")");
    const order = ["Glory song", "Opening prayer"];
    if (service.worshipType === "Sabbath Day" && service.serviceLabel === "Morning") order.push("Thanks song", "Prayer of thanks");
    order.push("Choir song", "Sermon", "Closing prayer");
    return [
      service.worshipType + ", " + service.serviceLabel + ", " + fullDate(service.date),
      "Preparation: " + preparation.join(", "),
      "Order: " + order.join(", "),
    ].join("\n");
  }

  function copyLocal(text, message, label) {
    if (REAL_MODE) return;
    state.copyText = text;
    state.copyMessage = message;
    state.copyLabel = label || "Copyable text";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => { state.copyMessage = message + " Clipboard text is also shown below."; render(); }).catch(() => render());
    } else render();
  }

  function focusSongSearch() {
    window.requestAnimationFrame(() => {
      const field = document.getElementById("song-search");
      if (field) field.focus();
    });
  }

  function focusSongLibraryReturn() {
    window.requestAnimationFrame(() => {
      const target = document.getElementById(state.songLibraryReturnFocus || "song-library-trigger");
      if (target) target.focus();
    });
  }

  function openSongLibrary() {
    state.songLibraryReturnFocus = document.activeElement && document.activeElement.id ? document.activeElement.id : "song-library-trigger";
    state.songLibraryOpen = true;
    render();
    focusSongSearch();
  }

  function closeSongLibrary() {
    state.songLibraryOpen = false;
    render();
    focusSongLibraryReturn();
  }

  function navigate(screen, replace) {
    state.screen = VALID_SCREENS.includes(screen) ? screen : "home";
    if (screen !== "presider") state.songLibraryOpen = false;
    const url = new URL(window.location.href);
    url.searchParams.set("screen", state.screen);
    if (screen !== "presider") url.searchParams.delete("review");
    if (replace) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
    render();
    focusMain();
  }

  function focusMain() {
    window.requestAnimationFrame(() => {
      const target = document.getElementById("main-title") || document.querySelector("#app-main h1, #app-main h2");
      if (target) target.focus();
    });
  }

  function renderMemberControl(id) {
    const controlId = id || "member-select";
    const prompt = state.selectedName ? "" : '<span class="member-needed" data-member-state="name-needed">Name needed to personalize</span>';
    return '<div class="selected-member member-picker" data-member-selector><label for="' + controlId + '">Member</label><select id="' + controlId + '" data-change="member" aria-describedby="' + controlId + '-state">' + memberOptions(state.selectedName) + "</select><span id=\"" + controlId + "-state\" class=\"member-state\">" + (prompt || "Schedule is personalized for this member") + "</span></div>";
  }

  function renderHeading(kicker, title, options) {
    const opts = options || {};
    const controls = opts.control || "";
    return '<section class="compact-heading" aria-labelledby="main-title"><div><p class="kicker">' + escapeHtml(kicker) + '</p><h1 id="main-title" tabindex="-1">' + escapeHtml(title) + "</h1>" +
      (opts.subtitle ? '<p class="heading-subtitle">' + escapeHtml(opts.subtitle) + "</p>" : "") +
      "</div>" + (controls ? '<div class="heading-controls">' + controls + "</div>" : "") + "</section>";
  }

  function renderNextDuty(actionName) {
    const next = nextDutyFor(state.selectedName);
    if (!next) {
      const selectedLabel = state.selectedDate ? compactDate(state.selectedDate) : (REAL_MODE ? "No service dates" : "Sep 2026");
      const emptyCopy = REAL_MODE ? "Choose your name to see your next duty." : "Choose a selected member with an assignment in the September sample.";
      return '<section class="next-duty" aria-labelledby="next-duty-title"><div class="next-duty-header"><p class="section-label" id="next-duty-title">My next duty</p><span class="date-chip"><span class="full-date">' + escapeHtml(selectedLabel) + '</span><span class="short-date">' + escapeHtml(selectedLabel) + '</span></span></div><div class="next-duty-content"><div><h2>No upcoming duty</h2><p>' + escapeHtml(emptyCopy) + '</p></div></div></section>';
    }
    const parts = timeParts(serviceTime(next.service));
    const action = actionName || "open-my-duties";
    const label = action === "open-presider" ? "Open Presider" : action === "duty-note" ? (state.dutyNoteOpen ? "Hide duty note" : "Show duty note") : "Open My Duties";
    const expanded = action === "duty-note" && state.dutyNoteOpen;
    const hidden = expanded ? "" : " hidden";
    return `<section class="next-duty" aria-labelledby="next-duty-title"><div class="next-duty-header"><p class="section-label" id="next-duty-title">My next duty</p><span class="date-chip"><span class="full-date">${escapeHtml(fullDate(next.service.date))}</span><span class="short-date">${escapeHtml(next.service.worshipType + ", " + compactDate(next.service.date))}</span></span></div><div class="next-duty-content"><div><h2>${escapeHtml(next.duty)}</h2><p>${escapeHtml(next.department + " department, " + state.selectedName + ".")}</p></div><div class="duty-time"><span>${escapeHtml(parts.large)}</span><small> ${escapeHtml(parts.suffix)}</small></div><button class="text-button" type="button" data-action="${action}" aria-expanded="${action === "duty-note" ? String(expanded) : "false"}">${label}</button></div><p class="duty-note" id="duty-note"${hidden}>Duty: ${escapeHtml(next.duty)}. Department: ${escapeHtml(next.department)}. Service: ${escapeHtml(fullDate(next.service.date) + ", " + formatTime(serviceTime(next.service))) }.</p></section>`;
  }

  function renderDateStrip(selectedDate, extra) {
    const dates = upcomingServices().map((service) => service.date).filter((date, index, all) => all.indexOf(date) === index);
    const dateLabel = (date) => {
      const service = servicesForDate(date)[0];
      return (service && service.worshipType ? service.worshipType + ", " : "") + compactDate(date);
    };
    if (!dates.length) return '<div class="date-strip prototype-date-strip" aria-label="Service dates"><span class="date-strip-label">Dates</span><span class="date-strip-note">No service dates</span></div>';
    const date = dateObject(dates[0]);
    const monthLabel = date ? date.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "Service dates";
    return '<div class="date-strip prototype-date-strip" aria-label="Service dates"><span class="date-strip-label">Dates</span>' +
      dates.map((date) => '<button class="date-strip-item' + (date === selectedDate ? " selected" : "") + '" data-action="select-date" data-date="' + escAttr(date) + '">' + escapeHtml(dateLabel(date)) + "</button>").join("") +
      '<span class="date-strip-note">' + escapeHtml(monthLabel) + '</span>' + (extra || "") + '</div>';
  }

  function renderMonthCalendar(context, includeStandalone) {
    const key = state.calendarMonth || today.slice(0, 7);
    const selected = state.calendarDay;
    const days = monthCalendarDays(key);
    const dayCounts = {};
    (includeStandalone ? sourceServicesForMonth(key, { includeStandalone: true }) : sourceServicesForMonth(key)).forEach((service) => {
      dayCounts[service.date] = (dayCounts[service.date] || 0) + 1;
    });
    const dayMarkup = days.map((date) => {
      if (!date) return '<span class="calendar-day calendar-day-empty" aria-hidden="true"></span>';
      const count = dayCounts[date] || 0;
      const day = Number(date.slice(-2));
      const pressed = selected === date;
      const todayMarker = date === today ? " Today" : "";
      return '<button class="calendar-day' + (pressed ? " selected" : "") + (count ? " has-services" : "") + '" type="button" data-action="calendar-day" data-date="' + escAttr(date) + '" data-calendar-day="' + escAttr(date) + '" aria-label="' + escAttr(fullDate(date) + (count ? ", " + count + " service" + (count === 1 ? "" : "s") : "") + todayMarker) + '" aria-pressed="' + String(pressed) + '"><span>' + day + '</span>' + (count ? '<small>' + count + '</small>' : '<small aria-hidden="true"></small>') + '</button>';
    }).join("");
    return '<section class="month-calendar" data-calendar="' + escAttr(context || "shared") + '" data-calendar-month="' + escAttr(key) + '" aria-labelledby="' + escAttr((context || "shared") + "-calendar-title") + '"><div class="month-calendar-header"><div><h2 id="' + escAttr((context || "shared") + "-calendar-title") + '">' + escapeHtml(monthTitle(key)) + '</h2></div><div class="month-calendar-actions"><button class="calendar-nav" type="button" data-action="calendar-prev" aria-label="Previous month"><span aria-hidden="true">‹</span></button><button class="calendar-nav" type="button" data-action="calendar-next" aria-label="Next month"><span aria-hidden="true">›</span></button><button class="calendar-clear" type="button" data-action="calendar-clear" aria-pressed="' + String(!selected) + '">Whole month</button></div></div><div class="calendar-weekdays" aria-hidden="true">' + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => '<span>' + day + '</span>').join("") + '</div><div class="calendar-grid">' + dayMarkup + '</div><p class="calendar-selection" data-calendar-selection>' + escapeHtml(selected ? "Selected day: " + selectedCalendarLabel() : "Showing the whole month") + '</p></section>';
  }

  function renderDepartmentControls(value, changeName, context) {
    const selected = value || "All";
    const options = ['<option value="All"' + (selected === "All" ? " selected" : "") + ">All departments</option>"];
    state.categories.forEach((category) => options.push('<option value="' + escAttr(category.name) + '"' + (selected === category.name ? " selected" : "") + ">" + escapeHtml(category.name) + "</option>"));
    return '<div class="department-controls" data-department-control="' + escAttr(context || "shared") + '"><div><p class="section-label">Departments</p></div><label class="department-picker" for="' + escAttr((context || "shared") + "-department") + '">Department<select id="' + escAttr((context || "shared") + "-department") + '" data-change="' + escAttr(changeName) + '">' + options.join("") + '</select></label></div>';
  }

  function renderDepartmentSelect(value, changeName) {
    const opts = ['<option value="All"' + (value === "All" ? " selected" : "") + ">All departments</option>"];
    state.categories.forEach((category) => opts.push('<option value="' + escAttr(category.name) + '"' + (value === category.name ? " selected" : "") + ">" + escapeHtml(category.name) + "</option>"));
    return '<label class="inline-filter">Department<select data-change="' + escAttr(changeName) + '">' + opts.join("") + "</select></label>";
  }

  function assignmentEntries(service, filter) {
    const rows = [];
    const assignments = service && service.assignments || {};
    const seen = new Set();
    state.categories.forEach((category) => category.duties.forEach((duty) => {
      if (filter && filter !== "All" && category.name !== filter) return;
      if (seen.has(duty)) return;
      seen.add(duty);
      if (Object.prototype.hasOwnProperty.call(assignments, duty)) rows.push({ category: category.name, duty, member: assignments[duty] || "" });
    }));
    return rows;
  }

  function renderDepartmentTeam(rows, options) {
    const opts = options || {};
    const rowClass = opts.rowClass || "service-team-row";
    const groups = [];
    (rows || []).forEach((row) => {
      let group = groups.find((entry) => entry.category === row.category);
      if (!group) {
        group = { category: row.category, rows: [] };
        groups.push(group);
      }
      group.rows.push(row);
    });
    if (!groups.length) return '<p class="service-empty">No assigned duties are listed.</p>';
    return groups.map((group) => '<section class="team-department department-' + departmentKey(group.category) + '" data-department-section="' + escAttr(group.category) + '"><div class="team-department-heading"><span class="department-tag">' + escapeHtml(group.category) + '</span><span class="department-duty-count">' + group.rows.length + " dut" + (group.rows.length === 1 ? "y" : "ies") + '</span></div><div class="team-department-rows">' + group.rows.map((row) => {
      const mine = row.member && row.member === state.selectedName;
      return '<div class="' + rowClass + ' department-' + departmentKey(row.category) + '" data-department-row="' + escAttr(row.category) + '"><span class="assignment-duty">' + escapeHtml(row.duty) + '</span><strong class="' + (mine ? "is-mine" : "") + '">' + escapeHtml(row.member || "Unassigned") + (mine ? ' <em>You</em>' : "") + "</strong></div>";
    }).join("") + '</div></section>').join("");
  }

  function renderAssignmentPairs(service, options) {
    const opts = options || {};
    const rows = assignmentEntries(service, opts.filter || "All");
    const start = Number.isInteger(opts.start) ? Math.max(0, opts.start) : 0;
    const visible = opts.limit ? rows.slice(start, start + opts.limit) : rows.slice(start);
    if (!visible.length) return '<p class="service-empty">No assigned duties in this department.</p>';
    return visible.map((row) => {
      const mine = row.member && row.member === state.selectedName;
      return '<span class="assignment-dept">' + escapeHtml(row.duty) + '</span><strong class="' + (mine ? "is-mine" : "") + '">' + escapeHtml(row.member || "Unassigned") + (mine ? ' <em>You</em>' : "") + "</strong>";
    }).join("");
  }

  function renderServiceCard(service, nearest) {
    const expanded = state.expandedServices[service.id] === true;
    const entries = assignmentEntries(service, state.homeDepartment);
    const shown = entries.slice(0, 12);
    const remaining = entries.slice(12);
    const time = timeParts(serviceTime(service));
    const status = nearest ? "Nearest service" : (service.serviceLabel || service.worshipType || "Service");
    const detailLabel = expanded ? "Hide additional assignments" : "View " + remaining.length + " additional " + (remaining.length === 1 ? "assignment" : "assignments");
    const rowMarkup = (rows) => renderDepartmentTeam(rows);
    const details = state.features.whoElse && remaining.length ? '<details' + (expanded ? " open" : "") + '><summary>' + escapeHtml(detailLabel) + '</summary><div class="service-team service-team-extra">' + rowMarkup(remaining) + "</div></details>" : "";
    return '<article class="service-card' + (nearest ? " nearest" : "") + '" data-service-card="' + escAttr(service.id) + '" data-service-id="' + escAttr(service.id) + '"><div class="service-card-top"><div><p class="service-type">' + escapeHtml(service.worshipType || "Service") + '</p><time datetime="' + escAttr(service.date + (serviceTime(service) ? "T" + serviceTime(service) : "")) + '">' + escapeHtml(time.large + " " + time.suffix) + '</time></div><span class="service-status">' + escapeHtml(status) + '</span></div><h3>' + escapeHtml((service.serviceLabel || service.worshipType || "Service") + " worship") + '</h3><p class="service-meta">' + escapeHtml(fullDate(service.date)) + '</p><div class="service-team">' + rowMarkup(shown) + '</div>' + (remaining.length ? '<p class="card-footnote">' + remaining.length + " more labeled assignments in full team" + "</p>" : "") + details + "</article>";
  }

  function renderScheduleSection(date) {
    const services = servicesForDate(date).filter((service) => service.date >= today && !service.standalone);
    if (!services.length) return '<div class="service-empty">' + (REAL_MODE ? "No upcoming services for this date." : "No upcoming services for this date in the fictional sample.") + "</div>";
    return '<div class="service-grid">' + services.map((service, index) => renderServiceCard(service, index === 0)).join("") + "</div>";
  }

  function renderServiceCollection(services, emptyMessage) {
    const visible = (services || []).filter((service) => !service.standalone && (state.homeDepartment === "All" || assignmentEntries(service, state.homeDepartment).length)).sort(serviceSort);
    if (!visible.length) return '<div class="service-empty">' + escapeHtml(emptyMessage || "No services match this view.") + "</div>";
    return '<div class="service-grid" data-service-collection>' + visible.map((service, index) => renderServiceCard(service, index === 0)).join("") + "</div>";
  }

  function upcomingContextServices() {
    const all = upcomingServices().filter((service) => state.homeDepartment === "All" || assignmentEntries(service, state.homeDepartment).length);
    if (!all.length) return [];
    const targetDate = state.calendarDay && state.calendarDay >= today && all.some((service) => service.date === state.calendarDay)
      ? state.calendarDay
      : all[0].date;
    return all.filter((service) => service.date === targetDate).slice(0, 3);
  }

  function renderMonthServiceList() {
    const monthServices = sourceServicesForMonth(state.calendarMonth).filter((service) => !service.standalone && (state.homeDepartment === "All" || assignmentEntries(service, state.homeDepartment).length));
    if (!monthServices.length) return '<div class="service-empty">' + escapeHtml(REAL_MODE ? "No current services are listed for this month." : "No fictional services are listed for this month.") + '</div>';
    return '<div class="month-service-list" data-month-service-list>' + monthServices.map((service) => {
      const team = assignmentEntries(service, state.homeDepartment);
      return '<details class="month-service-row" data-service-id="' + escAttr(service.id) + '"><summary><span class="month-service-date">' + escapeHtml(compactDate(service.date)) + '</span><span class="month-service-time">' + escapeHtml(formatTime(serviceTime(service))) + '</span><span class="month-service-type">' + escapeHtml(service.worshipType || "Service") + '</span><strong>' + escapeHtml(service.serviceLabel || "Service") + '</strong><span class="month-service-count">' + team.length + " duty" + (team.length === 1 ? "" : "ies") + '</span></summary><div class="month-service-detail"><div class="service-team">' + renderDepartmentTeam(team) + '</div></div></details>';
    }).join("") + '</div>';
  }

  function renderMonthSchedule() {
    const monthServices = sourceServicesForMonth(state.calendarMonth).filter((service) => !service.standalone);
    return '<section class="month-schedule" aria-labelledby="month-schedule-title" data-schedule="month"><div class="schedule-heading"><div><p class="section-label">Selected month</p><h2 id="month-schedule-title">' + escapeHtml(monthTitle(state.calendarMonth)) + '</h2></div><span class="schedule-count">' + monthServices.length + " service" + (monthServices.length === 1 ? "" : "s") + " in month" + '</span></div>' + renderMonthServiceList() + '</section>';
  }

  function renderHome() {
    const upcoming = upcomingContextServices();
    const selectedDate = state.calendarDay;
    const contextLabel = selectedDate && selectedDate >= today && upcoming.length ? "Upcoming on selected day" : "Next upcoming day";
    return '<section class="prototype-page home-page" data-prototype-screen="home">' +
      renderHeading(REAL_MODE ? "Current schedule" : "Sabbath Day schedule", "Worship schedule", { memberControl: true }) +
      renderNextDuty("duty-note") +
      '<div class="home-calendar-column">' + renderMonthCalendar("home") + renderDepartmentControls(state.homeDepartment, "home-department", "home") + '</div>' +
      '<section class="schedule upcoming-schedule" aria-labelledby="upcoming-title" data-schedule="upcoming"><div class="schedule-heading"><div><p class="section-label">Upcoming schedule</p><h2 id="upcoming-title">' + escapeHtml(contextLabel) + '</h2><p class="heading-subtitle">' + escapeHtml(selectedDate ? "Calendar focus: " + fullDate(selectedDate) : "Calendar focus: whole month") + '</p></div><span class="schedule-count">' + upcoming.length + " service" + (upcoming.length === 1 ? "" : "s") + " ahead" + '</span></div>' + renderServiceCollection(upcoming, REAL_MODE ? "No upcoming services are listed." : "No upcoming fictional services are listed.") + '</section>' +
      renderMonthSchedule() + '</section>';
  }

  function requestFor(serviceId, duty, name) {
    return state.requests.find((item) => item.serviceId === serviceId && item.duty === duty && item.name === name && item.status === "pending") ||
      state.requests.find((item) => item.serviceId === serviceId && item.duty === duty && item.name === name && item.status === "approved") || null;
  }

  function renderRequestForm(service, duty) {
    return '<form class="request-form" data-form="request" data-service="' + escAttr(service.id) + '" data-duty="' + escAttr(duty) + '"><p>Request a change for ' + escapeHtml(duty) + "</p><label for=\"request-note\">Reason or note<textarea id=\"request-note\" name=\"note\" rows=\"3\" data-input=\"request-note\">" + escapeHtml(state.requestNote) + '</textarea></label><div class="button-row"><button class="button-primary" type="submit">Submit request</button><button class="text-button" type="button" data-action="cancel-request">Cancel</button></div></form>';
  }

  function renderCompleteTeam(service) {
    const rows = assignmentEntries(service, "All");
    if (!rows.length) return '<p class="service-empty">No assigned duties are listed for this service.</p>';
    return '<div class="complete-team" data-complete-team="' + escAttr(service.id) + '">' + renderDepartmentTeam(rows, { rowClass: "team-row" }) + '</div>';
  }

  function renderDutyRoleGroups(items) {
    const groups = [];
    (items || []).forEach((item) => {
      let group = groups.find((entry) => entry.department === item.department);
      if (!group) {
        group = { department: item.department, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    });
    return groups.map((group) => '<section class="team-department duty-department department-' + departmentKey(group.department) + '" data-department-section="' + escAttr(group.department) + '"><div class="team-department-heading"><span class="department-tag">' + escapeHtml(group.department) + '</span><span class="department-duty-count">' + group.items.length + " dut" + (group.items.length === 1 ? "y" : "ies") + '</span></div><div class="team-department-rows">' + group.items.map((item) => {
      const req = requestFor(item.service.id, item.duty, state.selectedName);
      const requestOpen = state.requestOpen && state.requestOpen.serviceId === item.service.id && state.requestOpen.duty === item.duty;
      const changeControl = !REAL_MODE && state.features.changeRequests ? (req && req.status === "pending" ? '<span class="request-status pending">Pending</span>' : '<button class="text-button" type="button" data-action="request-change" data-service="' + escAttr(item.service.id) + '" data-duty="' + escAttr(item.duty) + '">Request change</button>') : "";
      return '<div class="duty-role-row department-' + departmentKey(item.department) + '" data-department-row="' + escAttr(item.department) + '"><div><strong>' + escapeHtml(item.duty) + "</strong></div><div><b>" + escapeHtml(state.selectedName) + '</b><small>You</small></div>' + changeControl + "</div>" + (requestOpen ? renderRequestForm(item.service, item.duty) : "");
    }).join("") + '</div></section>').join("");
  }

  function renderDutyRows() {
    if (REAL_MODE && !state.selectedName) return '<div class="service-empty">Choose your name to see your current assignments.</div>';
    let assignments = myAssignments(state.selectedName, state.showPast && state.features.pastServices).filter((item) => state.dutyDepartment === "All" || item.department === state.dutyDepartment);
    if (state.calendarDay) assignments = assignments.filter((item) => item.service.date === state.calendarDay);
    else assignments = assignments.filter((item) => item.service.date.slice(0, 7) === state.calendarMonth);
    const grouped = [];
    assignments.forEach((item) => {
      let group = grouped.find((entry) => entry.date === item.service.date);
      if (!group) { group = { date: item.service.date, service: item.service, items: [] }; grouped.push(group); }
      group.items.push(item);
    });
    if (!grouped.length) return '<div class="service-empty">No duties are assigned to this selected member in the current view.</div>';
    return grouped.sort((a, b) => a.date.localeCompare(b.date)).map((group) => {
      const dateServices = servicesForDate(group.date).filter((service) => !service.standalone);
      const labels = Array.from(new Set(dateServices.map((service) => service.worshipType || service.serviceLabel).filter(Boolean))).join(" / ");
      const serviceCards = dateServices.filter((service) => group.items.some((item) => item.service.id === service.id)).map((service) => {
        const items = group.items.filter((item) => item.service.id === service.id);
        const teamOpen = state.openDutyTeams[service.id] === true;
        return '<article class="duty-service-card" data-duty-service="' + escAttr(service.id) + '" data-service-id="' + escAttr(service.id) + '"><div class="duty-service-card-head"><div><p class="section-label">' + escapeHtml(service.worshipType || "Service") + "</p><h3>" + escapeHtml((service.serviceLabel || service.worshipType || "Service") + " worship") + '</h3></div><div class="duty-card-meta"><time>' + escapeHtml(formatTime(serviceTime(service))) + '</time><button class="text-button" type="button" data-action="open-duty-team" data-service="' + escAttr(service.id) + '" aria-expanded="' + String(teamOpen) + '">' + (teamOpen ? "Hide full team" : "View full team") + '</button></div></div>' +
          '<div class="duty-role-list">' + renderDutyRoleGroups(items) + "</div>" + (teamOpen ? '<div class="full-team-panel"><p class="section-label">Complete team</p>' + renderCompleteTeam(service) + '</div>' : '') + "</article>";
      }).join("");
      return '<section class="duty-date-group" data-duty-date="' + escAttr(group.date) + '"><div class="duty-date-heading"><div><p class="section-label">' + escapeHtml(fullDate(group.date)) + '</p><h3>' + escapeHtml(labels || "Services") + '</h3></div><span>' + dateServices.length + " service" + (dateServices.length === 1 ? "" : "s") + '</span></div>' + serviceCards + '</section>';
    }).join("");
  }

  function renderAlerts() {
    if (REAL_MODE || !state.features.notifications) return "";
    const unread = state.alerts.filter((item) => !item.read).length;
    return '<section class="secondary-panel" aria-labelledby="alerts-title"><div class="panel-heading"><h2 id="alerts-title">Alerts</h2><span>' + unread + " new</span></div>" +
      (state.alerts.length ? '<ul class="alert-list">' + state.alerts.map((alert) => '<li class="' + (alert.read ? "read" : "") + '"><span>' + escapeHtml(alert.text) + '</span><button class="text-button" type="button" data-action="clear-alert" data-alert="' + escAttr(alert.id) + '">Clear</button></li>').join("") + "</ul>" : '<p class="service-empty">No alerts right now.</p>') + "</section>";
  }

  function renderCalendarTools() {
    if (REAL_MODE || !state.features.calendarExport) return "";
    const subscribed = state.calendarSubscription === "subscribed";
    const feed = calendarFeedUrl();
    return '<section class="secondary-panel" aria-labelledby="calendar-title"><div class="panel-heading"><h2 id="calendar-title">Calendar</h2><span>Local sample</span></div><p>Subscribe to a fictional feed for updates, or prepare a one-time calendar snapshot. No calendar app is opened from this prototype.</p><div class="calendar-feed-link"><label class="field-label" for="calendar-feed-url">Reserved example feed URL<input id="calendar-feed-url" type="url" value="' + escAttr(feed) + '" readonly></label><div class="button-row"><button class="button-secondary" type="button" data-action="subscribe-calendar" aria-pressed="' + String(subscribed) + '">' + (subscribed ? "Subscribed locally" : "Subscribe to feed") + '</button><button class="text-button" type="button" data-action="copy-feed-link">Copy feed link</button></div></div><div class="button-row"><button class="button-secondary" type="button" data-action="calendar">Prepare calendar text</button><button class="text-button" type="button" data-action="copy-calendar">Copy calendar text</button></div>' + notice(state.calendarMessage, "success") + notice(state.calendarFeedMessage, "success") + "</section>";
  }

  function renderRequestsHistory() {
    const mine = state.requests.filter((item) => item.name === state.selectedName);
    return '<section class="secondary-panel" aria-labelledby="request-history-title"><div class="panel-heading"><h2 id="request-history-title">Request history</h2><span>' + mine.length + " record" + (mine.length === 1 ? "" : "s") + "</span></div>" + (mine.length ? '<div class="request-history">' + mine.map((request) => '<div class="request-history-row"><div><strong>' + escapeHtml(request.duty) + '</strong><span>' + escapeHtml(serviceLabel(request.serviceId, request)) + '</span></div><span class="request-status ' + escapeHtml(request.status) + '" data-request-status="' + escapeHtml(request.status) + '">' + escapeHtml(request.status) + "</span></div>").join("") + "</div>" : '<p class="service-empty">No change requests for this selected member.</p>') + "</section>";
  }

  function serviceLabel(id, fallback) {
    const service = state.services.find((item) => item.id === id);
    if (service) return [service.worshipType, service.serviceLabel, compactDate(service.date)].filter(Boolean).join(", ");
    if (REAL_MODE) {
      const source = fallback || {};
      const ownLabel = [source.worshipType, source.serviceLabel, source.date ? compactDate(source.date) : ""].filter(Boolean).join(", ");
      return ownLabel || "Service no longer scheduled";
    }
    const original = serviceById(id);
    return original ? original.worshipType + ", " + original.serviceLabel + ", " + compactDate(original.date) : "Service removed";
  }

  function renderDuty() {
    const pastControl = state.features.pastServices ? '<button class="text-button" type="button" data-action="toggle-past">' + (state.showPast ? "Hide past services" : "Show past services") + "</button>" : "";
    const dutyCount = myAssignments(state.selectedName, state.showPast && state.features.pastServices).filter((item) => !state.calendarDay || item.service.date === state.calendarDay).filter((item) => state.calendarDay || item.service.date.slice(0, 7) === state.calendarMonth).length;
    return '<section class="prototype-page duty-page" data-prototype-screen="duty">' + renderHeading("Selected member", "My duties", { memberControl: true }) + renderNextDuty("open-presider") + renderMonthCalendar("duty") + renderDepartmentControls(state.dutyDepartment, "duty-department", "duty") +
      '<section class="schedule personal-schedule" aria-labelledby="personal-title"><div class="schedule-heading"><div><p class="section-label">Personal schedule</p><h2 id="personal-title">Assignments by date</h2><p class="heading-subtitle">' + escapeHtml(selectedCalendarLabel()) + '</p></div><div class="schedule-heading-actions"><span class="schedule-count">' + dutyCount + " dut" + (dutyCount === 1 ? "y" : "ies") + " in view</span>" + pastControl + "</div></div>" +
      (state.requestMessage ? '<p class="prototype-notice success" data-request-success role="status">' + escapeHtml(state.requestMessage) + '</p>' : "") + '<div class="duty-list">' + renderDutyRows() + "</div></section>" + renderAlerts() + renderCalendarTools() + renderCopyFallback("Calendar text") + renderRequestsHistory() + "</section>";
  }

  function preparationEntries(setlist) {
    if (!setlist) return [];
    return (setlist.songs || []).map((id, index) => ({ id, index, song: songById(id) })).filter((entry) => entry.song && entry.id !== setlist.glorySong && entry.id !== setlist.thanksSong);
  }

  function prepTotal(setlist) {
    return preparationEntries(setlist).reduce((total, entry) => total + entry.song.durationSec, 0);
  }

  function renderOutline(service, setlist) {
    const assignment = service.assignments || {};
    const prep = preparationEntries(setlist);
    const prepRows = prep.length ? prep.map((entry, position) => {
      const outlineActions = REAL_MODE ? "" : '<span class="outline-actions">' +
        '<button class="icon-button" type="button" data-action="move-song" data-index="' + entry.index + '" data-direction="up"' + (position === 0 ? " disabled" : "") + '>Up</button>' +
        '<button class="icon-button" type="button" data-action="move-song" data-index="' + entry.index + '" data-direction="down"' + (position === prep.length - 1 ? " disabled" : "") + '>Down</button>' +
        '<button class="icon-button" type="button" data-action="remove-song" data-index="' + entry.index + '">Remove</button></span>';
      return '<div class="outline-row"><span class="song-number">' + escapeHtml(songDisplayNumber(entry.song)) + '</span><span class="song-title">' + escapeHtml(entry.song.title) + '</span><span class="song-duration">' + formatDuration(entry.song.durationSec) + '</span>' +
        outlineActions + '</div>';
    }).join("") : '<div class="service-empty">' + (REAL_MODE ? "No preparation songs in this saved plan." : "No preparation songs yet. Add one from the library.") + '</div>';
    const prepHtml = '<details class="outline-group song-group preparation-group" data-song-group="preparation" open><summary class="outline-group-label">Preparation</summary><div class="outline-group-body">' + prepRows + '</div></details>';
    const gloryHtml = REAL_MODE
      ? '<div class="read-only-field"><span class="field-label">Glory song</span><p>' + escapeHtml(songById(setlist.glorySong)?.title || "Not assigned") + '</p></div>'
      : '<label class="field-label" for="glory-song-select">Glory song<select id="glory-song-select" data-change="glory-song">' + songOptions(setlist.glorySong, true) + '</select></label>';
    const thanksHtml = REAL_MODE
      ? '<div class="read-only-field"><span class="field-label">Thanks song</span><p>' + escapeHtml(songById(setlist.thanksSong)?.title || "Not assigned") + '</p></div>'
      : '<label class="field-label" for="thanks-song-select">Thanks song<select id="thanks-song-select" data-change="thanks-song">' + songOptions(setlist.thanksSong, true) + '</select></label>';
    const glorySection = '<details class="outline-group song-group glory-group" data-song-group="glory" open><summary class="outline-group-label">Glory</summary><div class="outline-group-body">' + gloryHtml + '</div></details>';
    const thanksSection = '<details class="outline-group song-group thanks-group" data-song-group="thanks" open><summary class="outline-group-label">Thanks</summary><div class="outline-group-body">' + thanksHtml + '</div></details>';
    const order = [
      { label: "Opening prayer", who: assignment.Sermon || "Not assigned" }
    ];
    if (service.worshipType === "Sabbath Day" && service.serviceLabel === "Morning") {
      order.push({ label: "Prayer of thanks", who: assignment["Prayer of Thanks"] || "Not assigned" });
    }
    order.push({ label: "Choir song", note: state.features.choirSong ? choirSongLabel(service) : "Choir song is off" });
    order.push({ label: "Sermon", who: assignment.Sermon || "Not assigned" });
    order.push({ label: "Closing prayer", who: assignment["Closing Prayer"] || "Not assigned" });
    return prepHtml + glorySection + thanksSection + '<div class="outline-group order-group" data-song-group="service-order"><p class="outline-group-label">Service order</p>' + order.map((step, index) => '<div class="order-row"><span class="order-number">' + (index + 1) + '</span><span><strong>' + escapeHtml(step.label) + '</strong><small>' + escapeHtml(step.note || "") + '</small></span><span class="step-who">' + escapeHtml(step.who || "") + "</span></div>").join("") + "</div>";
  }

  function renderSongPicker() {
    const search = state.songSearch.trim().toLowerCase();
    const categories = REAL_MODE ? ["All"].concat(Array.from(new Set(state.songs.map((song) => song.category).filter(Boolean)))) : ["All", "Faith", "Hope", "Love", "Gratitude", "Worship"];
    const filtered = state.songs.filter((song) => (!search || (song.number + " " + song.title).toLowerCase().includes(search)) && (state.songCategory === "All" || song.category === state.songCategory));
    const panelRole = state.songLibraryOpen ? "dialog" : "complementary";
    const panelState = state.songLibraryOpen ? " is-open" : "";
    const modalAttr = state.songLibraryOpen ? ' aria-modal="true"' : "";
    return '<div id="song-library-panel" class="song-picker phone-song-panel' + panelState + '" role="' + panelRole + '"' + modalAttr + ' aria-labelledby="song-picker-title"><div class="panel-heading"><h2 id="song-picker-title">Song library</h2><button class="text-button song-library-close" type="button" data-action="close-song-library">Close song library</button><span>' + filtered.length + " of " + state.songs.length + "</span></div><label class=\"field-label\" for=\"song-search\">Search songs<input id=\"song-search\" type=\"search\" value=\"" + escAttr(state.songSearch) + "\" data-input=\"song-search\"></label><div class=\"filter-pills\" role=\"toolbar\" aria-label=\"Song categories\">" + categories.map((category) => '<button type=\"button\" class=\"' + (state.songCategory === category ? "selected" : "") + '\" data-action=\"song-category\" data-category=\"' + escAttr(category) + '">' + escapeHtml(category) + "</button>").join("") + "</div><div class=\"song-library-list\">" + (filtered.length ? filtered.map((song) => {
      const open = state.openSong === song.id;
      const stat = ensureSongStats(song.id);
      const history = songHistory(song.id);
      const addControl = REAL_MODE ? "" : '<button class="text-button" type="button" data-action="add-song" data-song="' + escAttr(song.id) + '">Add</button>';
      return '<div class="song-library-row"><button class="song-open" type="button" data-action="toggle-song" data-song="' + escAttr(song.id) + '"><span>' + escapeHtml(songLabel(song)) + " " + escapeHtml(song.title) + '</span><small>' + formatDuration(song.durationSec) + "</small></button>" + addControl + (open ? '<div class="song-detail"><p>' + escapeHtml(song.category) + " category, " + formatDuration(song.durationSec) + ".</p><p>" + stat.sungCount + " recorded uses" + (stat.lastSung ? ", last " + escapeHtml(stat.lastSung) : ", no recorded use") + '.</p><p>' + (history.length ? history.map((entry) => escapeHtml(entry.date + ", " + entry.service)).join("; ") : "No sung history yet.") + "</p></div>" : "") + "</div>";
    }).join("") : '<p class="service-empty">No songs match this search.</p>') + "</div></div>";
  }

  function renderSetlistState(setlist) {
    if (REAL_MODE) {
      const stamp = setlist.confirmedAt || setlist.updatedAt || "";
      const confirmed = setlist.confirmed === true || setlist.status === "confirmed" || setlist.status === "sung";
      const status = setlist.status === "sung" ? "Sung" : setlist.status === "changed" ? "Changed" : confirmed ? "Confirmed" : "Read-only plan";
      const detail = stamp ? (setlist.confirmedAt ? "Confirmed " : "Updated ") + formatRecordTime(stamp) : "No confirmation timestamp recorded";
      return '<div class="planner-state-bar"><span class="state-pill ' + (setlist.status === "sung" || confirmed ? "confirmed" : "") + '" data-save-state="read-only">' + escapeHtml(status) + '</span><span class="read-only-note">Read-only preview, ' + escapeHtml(detail) + "</span></div>";
    }
    const status = state.saveState === "saving" ? "Saving" : state.saveState === "failed" ? "Save failed" : setlist.status === "changed" ? "Changed after confirmation" : setlist.status === "sung" ? "Sung" : setlist.confirmed ? "Confirmed" : state.saveState === "saved" ? "Saved locally" : "Not confirmed";
    const saveButton = state.saveState === "failed" ? '<button class="button-primary" type="button" data-action="retry-save">Retry save</button>' : '<button class="button-primary" type="button" data-action="save-setlist"' + (state.saveState === "saving" ? " disabled" : "") + ">Save changes</button>";
    return '<div class="planner-state-bar"><span class="state-pill ' + (state.saveState === "failed" ? "failed" : setlist.status === "changed" ? "changed" : setlist.confirmed ? "confirmed" : "") + '" data-save-state="' + escapeHtml(state.saveState) + '">' + escapeHtml(status) + '</span><div class="button-row">' + saveButton + '<button class="text-button" type="button" data-action="confirm-songs">' + (setlist.confirmed ? "Confirm again" : "Confirm songs") + "</button></div></div>";
  }

  function renderPresiderHistory() {
    const rows = state.songs.flatMap((song) => songHistory(song.id).map((entry, index) => ({ song, entry, index })));
    const historyRows = rows.map((row) => '<div class="history-row"><span>' + escapeHtml(songLabel(row.song) + " " + row.song.title) + '</span><span>' + escapeHtml(row.entry.date + ", " + row.entry.service) + '</span>' + (REAL_MODE ? "" : '<button class="text-button" type="button" data-action="remove-history" data-song="' + escAttr(row.song.id) + '" data-history-index="' + row.index + '">Remove</button>') + "</div>").join("");
    const backfill = REAL_MODE ? "" : '<div class="backfill-area">' + (state.backfillOpen ? '<form class="backfill-form" data-form="backfill"><label class="field-label">Song<select name="song">' + songOptions(state.backfillSong, false) + '</select></label><label class="field-label">Past date<input type="date" name="date" min="2026-09-01" max="2026-09-30" value="' + escAttr(state.backfillDate) + '" required></label><div class="button-row"><button class="button-secondary" type="submit">Add history</button><button class="text-button" type="button" data-action="close-backfill">Cancel</button></div></form>' : '<button class="text-button" type="button" data-action="open-backfill">Backfill a September date</button>') + "</div>";
    return '<section class="secondary-panel history-panel" aria-labelledby="song-history-title"><div class="panel-heading"><h2 id="song-history-title">Song history</h2><button class="text-button" type="button" data-action="toggle-history">' + (state.showHistory ? "Hide history" : "Show history") + "</button></div>" + (state.showHistory ? (rows.length ? '<div class="history-list">' + historyRows + "</div>" : '<p class="service-empty">No song history yet.</p>') : "") + backfill + "</section>";
  }

  function renderRunsheet(service, setlist) {
    if (!state.runsheetOpen) return "";
    const steps = ["Glory song", "Opening prayer"];
    if (service.worshipType === "Sabbath Day" && service.serviceLabel === "Morning") steps.push("Thanks song", "Prayer of thanks");
    steps.push("Choir song", "Sermon", "Closing prayer");
    return '<section class="runsheet-panel" aria-labelledby="runsheet-title"><div class="panel-heading"><h2 id="runsheet-title">Runsheet</h2><button class="text-button" type="button" data-action="close-runsheet">Close</button></div><ol>' + steps.map((step) => "<li>" + escapeHtml(step) + "</li>").join("") + "</ol><p>Preparation total: " + formatDuration(prepTotal(setlist)) + "</p></section>";
  }

  function renderPresiderFilter() {
    return '<label class="presider-filter" for="presider-filter"><span>Show</span><select id="presider-filter" data-change="presider-filter"><option value="mine"' + (state.presiderFilter === "mine" ? " selected" : "") + '>My presiding</option><option value="all"' + (state.presiderFilter === "all" ? " selected" : "") + '>All services</option></select></label>';
  }

  function renderPresiderServicePicker(options, selected) {
    if (!options.length) return "";
    return '<label class="selected-member service-picker" for="presider-service"><span>Service</span><select id="presider-service" data-change="presider-service">' + serviceOptions(selected, options) + '</select></label>';
  }

  function renderServiceInfo(service) {
    const assignment = service.assignments || {};
    const prayerRows = [
      ["Prayer of thanks", assignment["Prayer of Thanks"] || "Not assigned"],
      ["Closing prayer", assignment["Closing Prayer"] || "Not assigned"]
    ];
    const prayerMarkup = prayerRows.map((row) => '<div><dt>' + escapeHtml(row[0]) + '</dt><dd>' + escapeHtml(row[1]) + '</dd></div>').join("");
    const choir = state.features.choirSong ? (REAL_MODE
      ? '<div><dt>Choir song</dt><dd>' + escapeHtml(choirSongLabel(service)) + '</dd></div>'
      : '<div><dt>Choir song</dt><dd><label class="sr-only" for="presider-choir-song">Choir song</label><select id="presider-choir-song" data-change="choir-song">' + songOptions(service.choirSong, true) + '</select></dd></div>') : "";
    return '<section class="service-info" aria-labelledby="service-info-title"><div class="panel-heading"><h3 id="service-info-title">Service information</h3><span>Prayer and choir</span></div><dl class="service-info-grid">' + prayerMarkup + choir + '</dl></section>';
  }

  function renderPresider() {
    const options = presiderServices(state.selectedName);
    const selectedId = options.some((service) => service.id === state.selectedServiceId) ? state.selectedServiceId : options[0]?.id || "";
    if (selectedId && selectedId !== state.selectedServiceId) state.selectedServiceId = selectedId;
    const controls = '<div class="presider-controls">' + renderPresiderFilter() + renderPresiderServicePicker(options, selectedId) + '</div>';
    const shell = (body) => '<section class="prototype-page presider-page" data-prototype-screen="presider">' + renderHeading("For the service", "Presider", { memberControl: true, control: controls }) + renderMonthCalendar("presider", true) + body + '</section>';
    if (REAL_MODE && !state.selectedName && state.presiderFilter === "mine") {
      return shell('<div class="state-card" data-presider-state="name-needed"><p class="state-marker">Name needed</p><h2>Choose your name first</h2><p>Use the shared member selector above to see services you preside.</p></div>');
    }
    if (!state.features.songPicker) {
      const unavailableCopy = REAL_MODE ? "The saved song catalog is unavailable in this read-only payload." : "Turn on Presider song picker in Manage settings to prepare a fictional outline.";
      const settingsButton = REAL_MODE ? "" : '<button class="button-primary" type="button" data-action="open-manage-settings">Open settings</button>';
      return shell('<div class="state-card"><p class="state-marker">Song picker unavailable</p><h2>Presider tools are turned off</h2><p>' + unavailableCopy + "</p>" + settingsButton + "</div>");
    }
    if (!options.length) {
      const emptyCopy = REAL_MODE
        ? (state.selectedName ? state.selectedName + " has no saved Presider plan." : "Choose your name to inspect saved Presider plans.")
        : state.selectedName + " is not the Presider for an upcoming fictional service. Select another member above.";
      return shell('<div class="state-card" data-presider-state="empty"><p class="state-marker">No Presider duty</p><h2>Choose a service to review</h2><p>' + escapeHtml(emptyCopy) + "</p></div>");
    }
    const service = selectedPresiderService();
    if (!service) return shell('<div class="state-card" data-presider-state="empty"><p class="state-marker">No service selected</p><h2>Choose a service to review</h2></div>');
    const setlist = currentSetlist();
    if (!setlist) {
      const noPlanCopy = REAL_MODE ? "No saved song plan for this service." : "The local setlist was deleted, but the service is still available.";
      const recreate = REAL_MODE ? "" : '<button class="button-primary" type="button" data-action="create-setlist">Recreate outline</button>';
      const assignment = service.assignments || {};
      const noPlanContext = '<section class="presider-context" data-service-summary data-service-id="' + escAttr(service.id) + '"><p class="section-label">' + escapeHtml(service.worshipType || "Service") + '</p><h2>' + escapeHtml((service.serviceLabel || "Service") + " worship") + '</h2><dl class="service-facts"><div><dt>Date</dt><dd>' + escapeHtml(fullDate(service.date)) + '</dd></div><div><dt>Time</dt><dd>' + escapeHtml(formatTime(serviceTime(service))) + '</dd></div><div><dt>Presider</dt><dd>' + escapeHtml((assignment.Presider || service.presider || "Not listed")) + '</dd></div><div><dt>Choir song</dt><dd>' + escapeHtml(choirSongLabel(service)) + '</dd></div></dl></section>';
      return shell('<div class="state-card" data-presider-state="no-plan"><p class="state-marker">No outline</p>' + noPlanContext + renderServiceInfo(service) + '<p>' + noPlanCopy + "</p>" + recreate + "</div>");
    }
    const deleteConfirm = REAL_MODE ? "" : (state.deleteSetlistConfirm ? '<div class="confirm-inline"><p>Delete this local setlist and keep the service?</p><button class="button-danger" type="button" data-action="delete-setlist-confirm">Delete setlist</button><button class="text-button" type="button" data-action="cancel-delete-setlist">Cancel</button></div>' : "");
    const sungConfirm = REAL_MODE ? "" : (state.markSungConfirm ? '<div class="confirm-inline"><p>Mark songs in this service as sung?</p><button class="button-primary" type="button" data-action="confirm-mark-sung">Mark sung</button><button class="text-button" type="button" data-action="cancel-mark-sung">Cancel</button></div>' : "");
    const undoConfirm = REAL_MODE ? "" : (state.undoSungConfirm ? '<div class="confirm-inline"><p>Undo the sung mark and restore the recorded counts?</p><button class="button-primary" type="button" data-action="confirm-undo-sung">Undo sung</button><button class="text-button" type="button" data-action="cancel-undo-sung">Cancel</button></div>' : "");
    const hasSongs = uniqueSetlistSongs(setlist).length > 0;
    const sung = serviceSongsComplete(setlist);
    const hasHistory = hasServiceHistory(setlist);
    const serviceName = service.serviceLabel || service.worshipType || "Service";
    const notes = REAL_MODE
      ? '<div class="read-only-field"><span class="field-label">Notes</span><p>' + escapeHtml(setlist.notes || "No notes recorded.") + "</p></div>"
      : '<label class="field-label" for="setlist-notes">Notes<textarea id="setlist-notes" data-change="setlist-notes" rows="3">' + escapeHtml(setlist.notes || "") + "</textarea></label>";
    const copyButton = REAL_MODE ? "" : '<button class="text-button" type="button" data-action="copy-setlist">Copy outline</button>';
    const presiderLabel = setlist.presider || (service.assignments && service.assignments.Presider) || service.presider || "Not listed";
    const footer = REAL_MODE
      ? '<div class="outline-footer"><span class="read-only-note">Saved plan is read-only in this preview.</span></div>'
      : '<div class="outline-footer"><button class="button-secondary" type="button" data-action="mark-sung"' + (sung || !hasSongs ? " disabled" : "") + ">" + (sung ? "Sung" : "Mark service sung") + "</button>" + (hasHistory ? '<button class="text-button" type="button" data-action="undo-sung">Undo sung</button>' : "") + '<button class="button-danger" type="button" data-action="delete-setlist">Delete setlist</button></div>' + sungConfirm + undoConfirm + deleteConfirm;
    const statusText = setlist.status === "sung" ? "Sung" : setlist.status === "changed" ? "Changed" : setlist.confirmed ? "Confirmed" : "Not confirmed";
    return shell('<section class="presider-intro" data-service-summary data-service-id="' + escAttr(service.id) + '"><div class="presider-summary"><p class="section-label">' + escapeHtml(service.worshipType || "Service") + '</p><h2>' + escapeHtml(serviceName + " worship") + '</h2><dl class="service-facts"><div><dt>Date</dt><dd data-service-date>' + escapeHtml(fullDate(service.date)) + '</dd></div><div><dt>Time</dt><dd>' + escapeHtml(formatTime(serviceTime(service))) + '</dd></div><div><dt>Presider</dt><dd data-service-presider>' + escapeHtml(presiderLabel) + '</dd></div><div><dt>Confirmation</dt><dd data-confirmation-state>' + escapeHtml(statusText) + '</dd></div></dl></div><div class="button-row"><button class="button-secondary phone-song-trigger" id="song-library-trigger" type="button" data-action="open-song-library" aria-controls="song-library-panel" aria-expanded="' + String(state.songLibraryOpen) + '">Search songs</button><button class="button-secondary" type="button" data-action="open-runsheet">View runsheet</button>' + copyButton + '</div></section>' +
      renderSetlistState(setlist) + '<div class="presider-layout"><section class="outline-card" aria-labelledby="outline-title"><div class="panel-heading"><h2 id="outline-title">Service workspace</h2><span>' + formatDuration(prepTotal(setlist)) + ' preparation</span></div>' + notes + renderServiceInfo(service) + renderOutline(service, setlist) + footer + '</section>' + renderSongPicker() + '</div>' + renderRunsheet(service, setlist) + notice(state.songNotice, "success") + (REAL_MODE ? "" : renderCopyFallback("Outline text")) + renderPresiderHistory());
  }


  function conflictRows(service) {
    const byMember = {};
    assignmentEntries(service).forEach((row) => {
      if (!row.member) return;
      (byMember[row.member] ||= []).push(row);
    });
    const prayer = (duty) => duty === "Prayer of Thanks" || duty === "Closing Prayer";
    const usher = (duty) => duty.indexOf("Usher") === 0 || duty === "Lobby Security";
    const rows = [];
    Object.keys(byMember).forEach((member) => {
      const entries = byMember[member];
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          const first = entries[i];
          const second = entries[j];
          if ((prayer(first.duty) && usher(second.duty)) || (prayer(second.duty) && usher(first.duty))) continue;
          rows.push({ id: service.id + "|" + member + "|" + first.duty + "|" + second.duty, member, first, second });
        }
      }
    });
    return rows;
  }

  function renderPendingRequests() {
    const pending = state.requests.filter((request) => request.status === "pending");
    return '<section class="pending-band" aria-labelledby="pending-title"><div class="panel-heading"><h2 id="pending-title">Pending requests</h2><span data-pending-count="' + pending.length + '">' + pending.length + "</span></div>" +
      (pending.length ? '<div class="pending-list">' + pending.map((request) => '<article class="pending-request"><div><strong>' + escapeHtml(request.name) + " · " + escapeHtml(request.duty) + '</strong><span>' + escapeHtml(serviceLabel(request.serviceId, request)) + "</span><p>" + escapeHtml(request.note || "No note added.") + '</p></div><div class="button-row"><button class="button-secondary" type="button" data-action="open-request-service" data-service="' + escAttr(request.serviceId) + '">Open service</button><button class="button-primary" type="button" data-action="approve-request" data-request="' + escAttr(request.id) + '">Approve</button><button class="text-button" type="button" data-action="decline-request" data-request="' + escAttr(request.id) + '">Decline</button></div></article>').join("") + "</div>" : '<p class="service-empty">No pending requests.</p>') + "</section>";
  }

  function renderAssignmentEditor() {
    const service = serviceById(state.selectedServiceId);
    if (!service) return '<section class="manage-section"><div class="state-card"><h2>No services</h2><p>Add a fictional service to continue.</p>' + renderAddService() + "</div></section>";
    const conflicts = state.features.conflictWarnings ? conflictRows(service) : [];
    const selectedDepartment = state.departmentChoice || "All";
    const visibleCategories = state.categories.filter((category) => selectedDepartment === "All" || category.name === selectedDepartment);
    const deletion = state.serviceDeleteId === service.id ? '<div class="confirm-inline"><p>Delete ' + escapeHtml(service.worshipType + ", " + service.serviceLabel) + " and its local assignments?</p><button class=\"button-danger\" type=\"button\" data-action=\"confirm-delete-service\">Delete service</button><button class=\"text-button\" type=\"button\" data-action=\"cancel-delete-service\">Cancel</button></div>" : "";
    return renderPendingRequests() + '<section class="manage-section" aria-labelledby="assignment-title"><div class="section-heading-row"><div><p class="section-label">Assignments</p><h2 id="assignment-title">Service team</h2></div><label class="selected-member service-picker"><span>Service</span><select data-change="manage-service">' + serviceOptions(service.id, state.services.slice().sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))) + "</select></label></div>" +
      '<div class="service-edit-grid"><label class="field-label">Worship type<select data-change="service-field" data-field="worshipType"><option' + (service.worshipType === "Sabbath Day" ? " selected" : "") + '>Sabbath Day</option><option' + (service.worshipType === "Third Day" ? " selected" : "") + '>Third Day</option></select></label><label class="field-label">Service label<input data-change="service-field" data-field="serviceLabel" value="' + escAttr(service.serviceLabel) + '"></label><label class="field-label">Date<input type="date" data-change="service-field" data-field="date" min="2026-09-01" max="2026-09-30" value="' + escAttr(service.date) + '"></label><label class="field-label">Time<input type="time" data-change="service-field" data-field="time" value="' + escAttr(service.time) + '"></label><label class="field-label field-wide">Notes<textarea data-change="service-field" data-field="notes" rows="2">' + escapeHtml(service.notes || "") + "</textarea></label>" + (state.features.choirSong ? '<label class=\"field-label\">Choir song<select data-change=\"service-field\" data-field=\"choirSong\">' + songOptions(service.choirSong, true) + "</select></label>" : "") + "</div>" +
      '<div class="assignment-table"><div class="assignment-table-head"><span>Department</span><span>Duty</span><span>Assigned member</span></div>' + visibleCategories.map((category) => '<div class="department-group"><h3>' + escapeHtml(category.name) + "</h3>" + category.duties.map((duty) => {
        const has = Object.prototype.hasOwnProperty.call(service.assignments, duty);
        if (!has && !state.features.emptyDuties) return "";
        return '<label class="assignment-edit-row"><span>' + escapeHtml(category.name) + '</span><strong>' + escapeHtml(duty) + '</strong><select data-change="assignment" data-duty="' + escAttr(duty) + '">' + memberOptions(service.assignments[duty] || "", true) + "</select></label>";
      }).join("") + "</div>").join("") + "</div>" +
      (conflicts.length ? '<div class="conflict-panel"><div class="panel-heading"><h3>Conflicts</h3><span>' + conflicts.length + "</span></div>" + conflicts.map((conflict) => '<div class="conflict-row"><span><strong>' + escapeHtml(conflict.member) + "</strong>: " + escapeHtml(conflict.first.duty + " and " + conflict.second.duty) + '</span><button class="text-button" type="button" data-action="' + (state.conflictAcknowledged[conflict.id] ? "reopen-conflict" : "ack-conflict") + '" data-conflict="' + escAttr(conflict.id) + '">' + (state.conflictAcknowledged[conflict.id] ? "Reopen" : "Acknowledge") + "</button></div>").join("") + "</div>" : '<p class="service-empty">No double-duty conflicts in this service.</p>') +
      '<div class="service-actions"><button class="button-danger" type="button" data-action="delete-service">Delete service</button></div>' + deletion + notice(state.manageNotice, "success") + "</section>" + renderAddService();
  }

  function renderAddService() {
    return '<section class="secondary-panel" aria-labelledby="add-service-title"><div class="panel-heading"><h2 id="add-service-title">Add service</h2><span>Blank assignments</span></div><form class="add-service-form" data-form="add-service"><label class="field-label">Worship type<select name="worship"><option>Sabbath Day</option><option>Third Day</option></select></label><label class="field-label">Service label<input name="label" value="Evening" required></label><label class="field-label">Date<input name="date" type="date" min="2026-09-01" max="2026-09-30" value="2026-09-18" required></label><label class="field-label">Time<input name="time" type="time" value="19:00" required></label><button class="button-secondary" type="submit">Add blank service</button></form></section>';
  }

  function renderManageRequests() {
    return '<section class="manage-section" aria-labelledby="request-admin-title"><p class="section-label">Change requests</p><h2 id="request-admin-title">Request history</h2><div class="request-admin-list">' + (state.requests.length ? state.requests.map((request) => '<article class="request-admin-row"><div><strong>' + escapeHtml(request.name) + " · " + escapeHtml(request.duty) + '</strong><span>' + escapeHtml(serviceLabel(request.serviceId, request)) + '</span><p>' + escapeHtml(request.note || "No note added.") + "</p></div><span class=\"request-status " + escapeHtml(request.status) + '">' + escapeHtml(request.status) + "</span>" + (request.status === "pending" ? '<div class="button-row"><button class="button-primary" type="button" data-action="approve-request" data-request="' + escAttr(request.id) + '">Approve</button><button class="text-button" type="button" data-action="decline-request" data-request="' + escAttr(request.id) + '">Decline</button></div>' : "") + "</article>").join("") : '<p class="service-empty">No requests recorded.</p>') + "</div></section>";
  }

  function addDaysISO(iso, days) {
    const date = dateObject(iso);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function planningServices(windowName) {
    const all = state.services.slice().sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    if (windowName === "last") return pastServices().slice(0, 1);
    if (windowName === "next") return upcomingServices().slice(0, 1);
    if (windowName === "year") return all.filter((service) => service.date.slice(0, 4) === "2026");
    if (windowName === "next-4-weeks" || windowName === "next-8-weeks") {
      const end = addDaysISO(today, windowName === "next-4-weeks" ? 28 : 56);
      return all.filter((service) => service.date >= today && service.date <= end);
    }
    return upcomingServices();
  }

  function findSuggestion(services) {
    const source = services || planningServices("upcoming");
    const service = source.find((item) => !item.assignments["Parking #5"] || !item.assignments["Offering #6"]);
    if (!service) return null;
    const duty = !service.assignments["Parking #5"] ? "Parking #5" : "Offering #6";
    const member = state.members.find((person) => service.assignments[duty] !== person) || state.members[0];
    return { service, duty, member, current: service.assignments[duty] || "Unassigned" };
  }

  function renderPlanning() {
    const scopedServices = planningServices(state.planWindow);
    const conflicts = scopedServices.flatMap((service) => conflictRows(service).map((row) => Object.assign(row, { service })));
    const serviceCount = scopedServices.length;
    const workload = state.members.map((person) => ({ person, count: scopedServices.reduce((total, service) => total + Object.values(service.assignments || {}).filter((member) => member === person).length, 0) }));
    const suggestion = findSuggestion(scopedServices);
    const gapRows = state.categories.flatMap((category) => category.duties.map((duty) => {
      const missing = scopedServices.filter((service) => !service.assignments[duty]).length;
      return missing ? { department: category.name, duty, missing } : null;
    }).filter(Boolean)).slice(0, 8);
    const ranges = [["next-4-weeks", "Next 4 weeks"], ["next-8-weeks", "Next 8 weeks"], ["upcoming", "Upcoming"], ["year", "2026 year"], ["last", "Last service"], ["next", "Next service"]];
    const rangeOptions = ranges.map((item) => '<option value="' + item[0] + '"' + (state.planWindow === item[0] ? " selected" : "") + ">" + item[1] + "</option>").join("");
    const conflictPanel = conflicts.length ? '<div class="secondary-panel"><div class="panel-heading"><h3>Conflict review</h3><span>Selected range, prayer and usher pairings are allowed</span></div>' + conflicts.slice(0, 8).map((item) => '<div class="conflict-row"><span><strong>' + escapeHtml(item.member) + "</strong>, " + escapeHtml(item.service.serviceLabel + ", " + item.first.duty + " and " + item.second.duty) + '</span><span class="request-status">' + (state.conflictAcknowledged[item.id] ? "Acknowledged" : "Open") + "</span></div>").join("") + "</div>" : '<div class="secondary-panel"><p class="service-empty">No derived conflicts in this range.</p></div>';
    const suggestionPanel = '<div class="secondary-panel"><div class="panel-heading"><h3>Coverage suggestion</h3><span>Selected range, changes one assignment</span></div>' + (suggestion ? '<div class="suggestion-row"><span><strong>' + escapeHtml(suggestion.service.serviceLabel + ", " + suggestion.duty) + "</strong><small>" + escapeHtml(suggestion.current) + " to " + escapeHtml(suggestion.member) + '</small></span><button class="button-secondary" type="button" data-action="apply-suggestion" data-service="' + escAttr(suggestion.service.id) + '" data-duty="' + escAttr(suggestion.duty) + '" data-member="' + escAttr(suggestion.member) + '">Apply suggestion</button></div>' : '<p class="service-empty">No open suggestion for the selected range.</p>') + notice(state.planNotice, "success") + "</div>";
    const gapsPanel = '<div class="secondary-panel"><div class="panel-heading"><h3>Coverage gaps</h3><span>Selected range</span></div>' + (gapRows.length ? '<div class="gap-list">' + gapRows.map((row) => '<div><strong>' + escapeHtml(row.duty) + '</strong><span>' + escapeHtml(row.department) + '</span><b>' + row.missing + " open</b></div>").join("") + "</div>" : '<p class="service-empty">No open duty slots in the selected range.</p>') + "</div>";
    const workloadPanel = '<div class="secondary-panel"><div class="panel-heading"><h3>Workload</h3><span>Selected range assignments</span></div><div class="workload-list">' + workload.map((row) => '<div><strong>' + escapeHtml(row.person) + "</strong><span>" + row.count + " duties</span></div>").join("") + "</div></div>";
    return '<section class="manage-section" aria-labelledby="planning-title" data-plan-window="' + escAttr(state.planWindow) + '" data-plan-scope-count="' + serviceCount + '"><div class="section-heading-row"><div><p class="section-label">Planning</p><h2 id="planning-title">Coverage review</h2></div><label class="inline-filter">Range<select data-change="plan-window">' + rangeOptions + '</select></label></div><div class="planning-grid"><div class="metric"><strong>' + conflicts.length + '</strong><span>derived conflicts</span></div><div class="metric"><strong>' + serviceCount + '</strong><span>services in range</span></div><div class="metric"><strong>' + state.categories.length + '</strong><span>departments</span></div></div>' + conflictPanel + suggestionPanel + gapsPanel + workloadPanel + "</section>";
  }

  function applyNameMapToSnapshot(source) {
    const map = source.nameMap || {};
    const canonical = (name) => map[name] || name;
    const sourceMembers = Array.isArray(source.members) ? source.members.slice() : [];
    const members = Array.from(new Set(sourceMembers.map(canonical))).sort();
    const membersMerged = sourceMembers.filter((member) => map[member] && canonical(member) !== member).length;
    const services = deepClone(source.services || []);
    const touchedServices = [];
    services.forEach((service) => {
      let touched = false;
      service.assignments = service.assignments || {};
      Object.keys(service.assignments).forEach((duty) => {
        const next = canonical(service.assignments[duty]);
        if (next !== service.assignments[duty]) touched = true;
        service.assignments[duty] = next;
      });
      if (service.conflictOk && typeof service.conflictOk === "object") {
        const nextConflict = {};
        Object.keys(service.conflictOk).forEach((member) => {
          const nextMember = canonical(member);
          const duties = Array.isArray(service.conflictOk[member]) ? service.conflictOk[member] : [service.conflictOk[member]];
          nextConflict[nextMember] = Array.from(new Set((nextConflict[nextMember] || []).concat(duties)));
          if (nextMember !== member) touched = true;
        });
        service.conflictOk = nextConflict;
      }
      if (touched) touchedServices.push(service.id);
    });
    const departments = deepClone(source.departments || {});
    let departmentsChanged = 0;
    Object.keys(departments).forEach((department) => {
      const roster = Array.isArray(departments[department]) ? departments[department] : [];
      const nextRoster = Array.from(new Set(roster.map(canonical))).sort();
      if (JSON.stringify(roster) !== JSON.stringify(nextRoster)) departmentsChanged += 1;
      departments[department] = nextRoster;
    });
    return {
      state: { members, services, departments },
      membersChanged: membersMerged > 0 || members.length !== sourceMembers.length,
      membersMerged,
      touchedServices,
      departmentsChanged: departmentsChanged > 0,
      departmentsChangedCount: departmentsChanged
    };
  }

  function nameUnifyImpact() {
    const result = applyNameMapToSnapshot(state);
    return {
      membersMerged: result.membersMerged,
      servicesChanged: result.touchedServices.length,
      departmentsChanged: result.departmentsChangedCount,
      total: result.membersMerged + result.touchedServices.length + result.departmentsChangedCount
    };
  }

  function applyNameMap() {
    const result = applyNameMapToSnapshot(state);
    state.members = result.state.members;
    state.services = result.state.services;
    state.departments = result.state.departments;
    if (state.nameMap[state.selectedName]) state.selectedName = state.nameMap[state.selectedName];
    return result;
  }

  function renderNameUnifyCard() {
    const entries = Object.entries(state.nameMap || {});
    if (!entries.length) return "";
    const impact = nameUnifyImpact();
    const mapText = entries.map(([from, to]) => escapeHtml(from + " to " + to)).join(", ");
    const preview = state.nameUnifyPreview ? '<div class="impact-preview" data-name-unify-preview><p><strong>Local impact preview</strong></p><ul><li>' + impact.membersMerged + ' member variant' + (impact.membersMerged === 1 ? "" : "s") + ' will merge</li><li>' + impact.servicesChanged + ' service' + (impact.servicesChanged === 1 ? "" : "s") + ' will update</li><li>' + impact.departmentsChanged + ' department roster' + (impact.departmentsChanged === 1 ? "" : "s") + ' will update</li></ul><div class="button-row"><button class="button-primary" type="button" data-action="confirm-name-unify">Confirm local consolidation</button><button class="text-button" type="button" data-action="cancel-name-unify">Cancel</button></div></div>' : "";
    return '<div class="secondary-panel name-unify-panel"><div class="panel-heading"><h3>Unify fictional names</h3><span>Canonical local map</span></div><p>Review the local name map before merging assignments and department rosters.</p><p class="impact-map" data-name-unify-map>' + mapText + '</p><button class="button-secondary" type="button" data-action="preview-name-unify">Preview impact</button>' + preview + notice(state.manageNotice, "success") + "</div>";
  }

  function renderSync() {
    const statusText = state.syncStatus === "syncing" ? "Syncing locally" : state.syncStatus === "warning" ? "Review warning" : state.syncStatus === "complete" ? "Saved locally" : "Ready";
    const restoreConfirm = state.resetConfirm === "restore" ? '<div class="confirm-inline" data-confirmation="restore-sample"><p>Restore the original fictional sample? This replaces current local edits.</p><button class="button-primary" type="button" data-action="confirm-restore-sample">Confirm restore</button><button class="text-button" type="button" data-action="cancel-restore-sample">Cancel</button></div>' : "";
    const resetConfirm = state.resetConfirm === "reset" ? '<div class="confirm-inline" data-confirmation="reset-prototype"><p>Reset all fictional local changes? This clears edits in memory.</p><button class="button-danger" type="button" data-action="confirm-reset-prototype">Confirm reset</button><button class="text-button" type="button" data-action="cancel-reset-prototype">Cancel</button></div>' : "";
    return '<section class="manage-section" aria-labelledby="sync-title"><p class="section-label">Sync and recovery</p><h2 id="sync-title">Local schedule data</h2><div class="secondary-panel"><div class="panel-heading"><h3>Sheet URL</h3><span>' + escapeHtml(statusText) + "</span></div><form data-form=\"sheet-url\"><label class=\"field-label\" for=\"sheet-url-input\">Fictional schedule source<input id=\"sheet-url-input\" name=\"url\" value=\"" + escAttr(state.sheetUrl) + '" inputmode="url" required></label><div class="button-row"><button class="button-secondary" type="submit">Save URL</button><button class="button-primary" type="button" data-action="sync-now">Sync fictional sample</button></div></form>' + notice(state.syncMessage, state.syncStatus === "warning" ? "error" : "success") + "</div><div class=\"secondary-panel\"><div class=\"panel-heading\"><h3>Backup</h3><span>This device only</span></div><p>Export or import a fictional JSON backup for this prototype.</p><div class=\"button-row\"><button class=\"button-secondary\" type=\"button\" data-action=\"export-backup\">Export local backup</button><label class=\"button-secondary file-button\">Import local backup<input type=\"file\" accept=\"application/json\" data-change=\"import-file\"></label><button class=\"text-button\" type=\"button\" data-action=\"restore-sample\">Restore sample</button></div>" + restoreConfirm + notice(state.importMessage, "success") + "</div>" + renderNameUnifyCard() + "<div class=\"secondary-panel\"><div class=\"panel-heading\"><h3>Reset</h3></div><p>Reset all in-memory people, services, assignments, requests, songs, and settings.</p><button class=\"button-danger\" type=\"button\" data-action=\"reset-prototype\">Reset all local changes</button>" + resetConfirm + "</div></section>";
  }

  const FEATURE_LABELS = {
    siteLock: ["Site passcode", "Lock the prototype entry screen locally."],
    editorLock: ["Editor passcode", "Gate Manage editing locally."],
    notifications: ["New-duty alerts", "Show selected member alerts."],
    reminders: ["Day-before reminders", "Include reminder language in alerts."],
    calendarExport: ["Add to calendar", "Show calendar preview actions."],
    whoElse: ["Full service lineup", "Allow full team expansion on service cards."],
    choirSong: ["Choir song", "Keep the service choir song field visible."],
    songPicker: ["Presider song picker", "Allow outline and song history editing."],
    pastServices: ["Past services", "Show past records in My Duties."],
    emptyDuties: ["Unassigned duties", "Show blank slots in Manage."],
    conflictWarnings: ["Double-duty warnings", "Derive and review same-service conflicts."],
    sheetSync: ["Schedule sync", "Show the local Sheet URL and sync actions."],
    changeRequests: ["Change requests", "Allow members to submit requests."]
  };

  function renderSettings() {
    const passcodeForm = state.passcodeMode ? '<form class="passcode-form" data-form="passcode"><input type="hidden" name="kind" value="' + escAttr(state.passcodeMode) + '"><label class="field-label">Current passcode<input name="current" type="password" inputmode="numeric" autocomplete="off" required></label><label class="field-label">New passcode<input name="next" type="password" inputmode="numeric" autocomplete="off" minlength="4" required></label><div class="button-row"><button class="button-primary" type="submit">Save passcode</button><button class="text-button" type="button" data-action="cancel-passcode">Cancel</button></div></form>' : "";
    const featureRows = Object.keys(FEATURE_LABELS).map((key) => '<label class="feature-row"><span><strong>' + escapeHtml(FEATURE_LABELS[key][0]) + '</strong><small>' + escapeHtml(FEATURE_LABELS[key][1]) + '</small></span><input type="checkbox" data-change="feature" data-feature="' + escAttr(key) + '"' + (state.features[key] ? " checked" : "") + ' aria-label="' + escAttr(FEATURE_LABELS[key][0]) + '"></label>').join("");
    const schedulerOptions = '<option value="">None</option>' + memberOptions(state.scheduler || "");
    const passcodes = '<div class="secondary-panel"><div class="panel-heading"><h3>Passcodes</h3><span>Fictional local values</span></div><p>Demo editor passcode is 2468. Demo site passcode is 1357.</p><div class="button-row"><button class="button-secondary" type="button" data-action="edit-passcode" data-kind="editor">Change editor passcode</button><button class="button-secondary" type="button" data-action="edit-passcode" data-kind="site">Change site passcode</button><button class="text-button" type="button" data-action="lock-editor">Lock Manage</button><button class="text-button" type="button" data-action="lock-site">Lock site</button></div>' + passcodeForm + notice(state.manageNotice, "success") + "</div>";
    return '<section class="manage-section" aria-labelledby="settings-title"><p class="section-label">Settings</p><h2 id="settings-title">Feature controls</h2><div class="feature-list">' + featureRows + "</div>" + passcodes + '<div class="secondary-panel"><div class="panel-heading"><h3>Selected scheduler</h3></div><label class="field-label">Request notification recipient<select data-change="scheduler">' + schedulerOptions + "</select></label></div></section>";
  }

  function renderSpecial(screen) {
    const states = {
      empty: ["Empty state", "No upcoming duties", "This fictional member has no assignment in the selected view. Choose another member to return to the schedule.", '<button class="button-primary" type="button" data-action="recover-empty">Choose another member</button>'],
      loading: ["Loading state", "Loading schedule", "The local September sample is being prepared.", '<span class="loading-mark" role="status" aria-label="Loading"></span><button class="button-primary" type="button" data-action="recover-loading">Load sample</button>'],
      offline: ["Offline state", "Using saved schedule", "A local saved schedule is available while sync is unavailable.", '<button class="button-primary" type="button" data-action="recover-offline">Use saved schedule</button>'],
      error: ["Recoverable error", "Could not save this change", "The review state simulates a local save failure. Retry to restore the outline.", '<button class="button-primary" type="button" data-action="recover-error">Retry save</button>'],
      success: ["Success state", "Saved locally", "The fictional action completed in this browser.", '<button class="button-primary" type="button" data-action="recover-success">Continue to Home</button>']
    }[screen];
    return '<section class="state-wrap" data-prototype-screen="' + screen + '"><div class="state-card ' + screen + '"><p class="state-marker">' + escapeHtml(states[0]) + '</p><h1 id="main-title" tabindex="-1">' + escapeHtml(states[1]) + "</h1><p>" + escapeHtml(states[2]) + '</p><div class="button-row">' + states[3] + "</div></div></section>";
  }


  function renderPeople() {
    const department = state.departmentChoice || state.categories[0].name;
    const roster = state.departments[department] || [];
    const removal = state.removeMember ? '<div class="confirm-inline"><p>Remove ' + escapeHtml(state.removeMember) + " from the local roster? " + countAssignments(state.removeMember) + " future duties will become unassigned.</p><button class=\"button-danger\" type=\"button\" data-action=\"confirm-remove-member\">Remove member</button><button class=\"text-button\" type=\"button\" data-action=\"cancel-remove-member\">Cancel</button></div>" : "";
    return '<section class="manage-section" aria-labelledby="people-title"><p class="section-label">People</p><h2 id="people-title">Roster</h2><form class="add-person-form" data-form="add-person"><label class="field-label">Add fictional person<input name="name" placeholder="Title. First Last" required></label><button class="button-secondary" type="submit">Add person</button></form><div class="people-list">' +
      state.members.map((person) => '<div class="person-row"><form data-form="rename-person" data-person="' + escAttr(person) + '"><label class="field-label"><span class="sr-only">Name</span><input name="name" value="' + escAttr(person) + '" required></label><button class="text-button" type="submit">Rename</button></form><button class="button-danger" type="button" data-action="remove-member" data-member="' + escAttr(person) + '">Remove</button></div>').join("") +
      "</div>" + removal + '<div class="roster-editor"><div class="panel-heading"><h3>Department roster</h3><label class="inline-filter"><span class="sr-only">Department</span><select data-change="department-choice">' +
      state.categories.map((category) => '<option value="' + escAttr(category.name) + '"' + (category.name === department ? " selected" : "") + ">" + escapeHtml(category.name) + "</option>").join("") +
      '</select></label></div><div class="roster-checks">' + state.members.map((person) => '<label><input type="checkbox" data-change="department-member" data-member="' + escAttr(person) + '"' + (roster.includes(person) ? " checked" : "") + ">" + escapeHtml(person) + "</label>").join("") + "</div></div>" + notice(state.manageNotice, "success") + "</section>";
  }

  function renderManageTabs() {
    const tabs = [["assignments", "Assignments"], ["requests", "Requests"], ["people", "People"], ["planning", "Planning"], ["sync", "Sync"], ["settings", "Settings"]];
    return '<div class="manage-tabs" role="tablist" aria-label="Manage sections">' + tabs.map(([id, label]) => '<button type="button" role="tab" aria-selected="' + (state.manageTab === id ? "true" : "false") + '" class="' + (state.manageTab === id ? "active" : "") + '" data-action="manage-tab" data-tab="' + id + '">' + label + "</button>").join("") + "</div>";
  }

  function renderManageDepartmentFirst() {
    const selected = state.departmentChoice && state.categories.some((category) => category.name === state.departmentChoice)
      ? state.departmentChoice
      : state.categories[0]?.name || "";
    state.departmentChoice = selected;
    const options = state.categories.map((category) => '<option value="' + escAttr(category.name) + '"' + (category.name === selected ? " selected" : "") + '>' + escapeHtml(category.name) + '</option>').join("");
    return '<section class="manage-department-first" data-manage-department-first aria-labelledby="manage-department-title"><div><p class="section-label">Start here</p><h2 id="manage-department-title">Choose a department</h2></div><label for="manage-department-choice">Department<select id="manage-department-choice" data-change="department-choice">' + options + '</select></label></section>';
  }

  function renderSiteGate() {
    return '<section class="state-wrap" data-prototype-screen="manage"><div class="state-card access-gate"><p class="state-marker">Site passcode</p><h1 id="main-title" tabindex="-1">Site is locked</h1><p>Enter the fictional site passcode to continue this local review.</p><form data-form="site-unlock"><label class="field-label">Site passcode<input name="passcode" type="password" inputmode="numeric" autocomplete="off" required></label><div class="button-row"><button class="button-primary" type="submit">Unlock site</button><a class="text-button" href="?screen=home" data-nav="home">Return Home</a></div></form>' + notice(state.accessError, "error") + "</div></section>";
  }

  function renderEditorGate() {
    return '<section class="state-wrap" data-prototype-screen="manage"><div class="state-card access-gate"><p class="state-marker">Manage access</p><h1 id="main-title" tabindex="-1">Editing is locked</h1><p>Enter the fictional editor passcode to review local coordinator controls.</p><form data-form="unlock"><label class="field-label">Editor passcode<input name="passcode" type="password" inputmode="numeric" autocomplete="off" required></label><div class="button-row"><button class="button-primary" type="submit">Unlock Manage</button><a class="text-button" href="?screen=home" data-nav="home">Return Home</a></div></form>' + notice(state.accessError, "error") + "</div></section>";
  }

  function renderReadOnlyManage() {
    const service = serviceById(state.selectedServiceId);
    const assignments = service ? assignmentEntries(service, state.departmentChoice || "All") : [];
    const assignmentBody = assignments.length
      ? assignments.map((row) => '<div class="assignment-read-only-row"><span>' + escapeHtml(row.category) + '</span><strong>' + escapeHtml(row.duty) + '</strong><span>' + escapeHtml(row.member || "Unassigned") + "</span></div>").join("")
      : '<p class="service-empty">No saved assignments for this service.</p>';
    const pending = state.requests.filter((request) => request.status === "pending");
    const requestBody = pending.length
      ? pending.map((request) => '<div class="request-admin-row"><div><strong>' + escapeHtml(request.name || "Unassigned") + " · " + escapeHtml(request.duty || "Duty") + '</strong><span>' + escapeHtml(serviceLabel(request.serviceId, request)) + '</span><p>' + escapeHtml(request.note || "No note added.") + "</p></div><span class=\"request-status pending\">Pending</span></div>").join("")
      : '<p class="service-empty">No pending requests.</p>';
    const peopleBody = state.members.length
      ? '<div class="people-list">' + state.members.map((person) => '<div class="person-row\"><span>' + escapeHtml(person) + "</span></div>").join("") + "</div>"
      : '<p class="service-empty">No members are listed.</p>';
    const departmentBody = Object.keys(state.departments).length
      ? '<div class="roster-checks">' + Object.entries(state.departments).map(([department, roster]) => '<p><strong>' + escapeHtml(department) + '</strong><span>' + escapeHtml((roster || []).join(", ") || "No members listed") + "</span></p>").join("") + "</div>"
      : '<p class="service-empty">No department rosters are listed.</p>';
    const featureBody = Object.keys(state.features).length
      ? '<dl class="read-only-features">' + Object.entries(state.features).map(([key, value]) => '<div><dt>' + escapeHtml(key) + '</dt><dd>' + (value ? "On" : "Off") + "</dd></div>").join("") + "</dl>"
      : '<p class="service-empty">No feature settings are listed.</p>';
    const servicePicker = '<label class="selected-member service-picker\"><span>Service</span><select data-change="presider-service">' + serviceOptions(service && service.id, state.services) + "</select></label>";
    const serviceLabelText = service ? (service.worshipType ? service.worshipType + ", " : "") + (service.serviceLabel || "Service") + ", " + compactDate(service.date) : "No service selected";
    return '<section class="prototype-page manage-page" data-prototype-screen="manage">' + renderHeading("Read-only preview", "Manage", { memberControl: true, control: servicePicker }) + renderManageDepartmentFirst() +
      '<section class="manage-section\" aria-labelledby=\"read-only-assignments-title\"><div class=\"section-heading-row\"><div><p class=\"section-label\">Current records</p><h2 id=\"read-only-assignments-title\">Service assignments</h2><p class=\"heading-subtitle\">' + escapeHtml(serviceLabelText) + "</p></div></div><div class=\"assignment-table read-only-assignment-table\" tabindex=\"0\" role=\"region\" aria-label=\"Read-only service assignments\"><div class=\"assignment-table-head\"><span>Department</span><span>Duty</span><span>Assigned member</span></div>" + assignmentBody + "</div></section>" +
      '<section class=\"manage-section\" aria-labelledby=\"read-only-requests-title\"><p class=\"section-label\">Current records</p><h2 id=\"read-only-requests-title\">Pending requests</h2><div class=\"request-admin-list\">' + requestBody + "</div></section>" +
      '<section class=\"manage-section\" aria-labelledby=\"read-only-people-title\"><p class=\"section-label\">Current records</p><h2 id=\"read-only-people-title\">People</h2>' + peopleBody + '<div class=\"roster-editor\"><div class=\"panel-heading\"><h3>Department roster</h3></div>' + departmentBody + "</div></section>" +
      '<section class=\"manage-section\" aria-labelledby=\"read-only-features-title\"><p class=\"section-label\">Preview state</p><h2 id=\"read-only-features-title\">Feature settings</h2>' + featureBody + "</section></section>";
  }

  function renderManage() {
    if (REAL_MODE) return renderReadOnlyManage();
    if (state.siteLocked) return renderSiteGate();
    if (!state.manageUnlocked) return renderEditorGate();
    let body = "";
    if (state.manageTab === "assignments") body = renderAssignmentEditor();
    if (state.manageTab === "requests") body = renderPendingRequests() + renderManageRequests();
    if (state.manageTab === "people") body = renderPeople();
    if (state.manageTab === "planning") body = renderPlanning();
    if (state.manageTab === "sync") body = state.features.sheetSync ? renderSync() : '<section class="manage-section"><div class="state-card"><h2>Schedule sync is off</h2><button class="button-secondary" type="button" data-action="open-manage-settings">Open settings</button></div></section>';
    if (state.manageTab === "settings") body = renderSettings();
    return '<section class="prototype-page manage-page" data-prototype-screen="manage">' + renderHeading("For the team", "Manage", { memberControl: true }) + renderManageDepartmentFirst() + renderManageTabs() + body + "</section>";
  }

  function render() {
    const app = document.getElementById("app-main");
    if (!app) return;
    if (state.screen === "presider" && state.failNextSave) state.saveState = "failed";
    const content = state.siteLocked ? renderSiteGate() : SPECIAL.includes(state.screen) ? renderSpecial(state.screen) :
      state.screen === "home" ? renderHome() :
      state.screen === "duty" ? renderDuty() :
      state.screen === "presider" ? renderPresider() : renderManage();
    app.innerHTML = content;
    const headerMember = document.getElementById("header-member-control");
    if (headerMember) headerMember.innerHTML = renderMemberControl("header-member-select");
    document.querySelectorAll("nav a[data-nav]").forEach((link) => {
      const active = link.dataset.nav === state.screen;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.title = state.screen === "home" ? "Worship schedule, LV Zion Worship Service" : state.screen.charAt(0).toUpperCase() + state.screen.slice(1) + ", LV Zion Worship Service";
  }

  function markSetlistChanged() {
    const setlist = currentSetlist();
    if (!setlist) return;
    setlist.status = setlist.confirmed ? "changed" : "planned";
    state.saveState = setlist.confirmed ? "changed" : "ready";
  }

  function saveSetlist() {
    const setlist = currentSetlist();
    if (!setlist) return;
    state.saveState = "saving";
    render();
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      if (state.failNextSave) {
        state.failNextSave = false;
        state.saveState = "failed";
      } else {
        state.saveState = "saved";
        setlist.updatedAt = "2026-09-07T12:00:00";
      }
      render();
    }, 180);
  }

  function addSong(id) {
    const setlist = currentSetlist();
    const song = songById(id);
    if (!setlist || !song) return;
    setlist.songs.push(id);
    state.songNotice = songLabel(song) + " " + song.title + " added to the local outline.";
    markSetlistChanged();
    render();
  }

  function moveSong(index, direction) {
    const setlist = currentSetlist();
    const numeric = Number(index);
    if (!setlist || !Number.isInteger(numeric) || numeric < 0 || numeric >= setlist.songs.length) return;
    const prep = preparationEntries(setlist);
    const position = prep.findIndex((entry) => entry.index === numeric);
    const next = position + (direction === "up" ? -1 : 1);
    if (position < 0 || next < 0 || next >= prep.length) return;
    const swapIndex = prep[next].index;
    [setlist.songs[numeric], setlist.songs[swapIndex]] = [setlist.songs[swapIndex], setlist.songs[numeric]];
    markSetlistChanged();
    render();
  }

  function removeSong(index) {
    const setlist = currentSetlist();
    const numeric = Number(index);
    if (!setlist || !Number.isInteger(numeric) || numeric < 0 || numeric >= setlist.songs.length) return;
    setlist.songs.splice(numeric, 1);
    markSetlistChanged();
    render();
  }

  function updateServiceField(field, value) {
    const service = serviceById(state.selectedServiceId);
    if (!service) return;
    service[field] = value;
    const setlist = setlistById(service.id);
    if (setlist && ["date", "worshipType", "serviceLabel"].includes(field)) setlist[field] = value;
    if (field === "choirSong") service.choirSong = value || null;
    if (field === "date") state.selectedDate = value;
    if (field === "time") service.time = value;
  }

  function addService(date, time, worshipType, label) {
    if (!date || !time || !worshipType || !label) return;
    const id = "local-" + date + "-" + time.replace(":", "");
    if (state.services.some((service) => service.id === id)) {
      state.manageNotice = "A service with that date and time already exists.";
      render();
      return;
    }
    const service = { id, date, time, worshipType, serviceLabel: label, notes: "", choirSong: null, status: "planned", assignments: {} };
    state.services.push(service);
    state.setlists[id] = { id, date, worshipType, serviceLabel: label, presider: "", notes: "", songs: [], glorySong: null, thanksSong: null, confirmed: false, status: "planned", updatedAt: "2026-09-07T12:00:00", sungAt: null };
    state.selectedServiceId = id;
    state.manageNotice = "Blank service added locally.";
    render();
  }

  function deleteService() {
    const id = state.serviceDeleteId;
    const service = serviceById(id);
    if (!service) return;
    state.services = state.services.filter((item) => item.id !== id);
    delete state.setlists[id];
    state.serviceDeleteId = null;
    state.selectedServiceId = state.services[0]?.id || "";
    state.manageNotice = service.serviceLabel + " service deleted locally.";
    render();
  }

  function removeMember() {
    const member = state.removeMember;
    if (!member) return;
    state.services.forEach((service) => Object.keys(service.assignments).forEach((duty) => { if (service.assignments[duty] === member) service.assignments[duty] = ""; }));
    Object.keys(state.departments).forEach((key) => { state.departments[key] = state.departments[key].filter((person) => person !== member); });
    state.members = state.members.filter((person) => person !== member);
    if (!state.members.length) state.members = deepClone(BASE.members);
    if (state.selectedName === member) state.selectedName = state.members[0];
    state.removeMember = null;
    state.manageNotice = "Future duties were unassigned and the member was removed locally.";
    render();
  }

  function deleteSetlist() {
    if (!state.selectedServiceId) return;
    delete state.setlists[state.selectedServiceId];
    state.deleteSetlistConfirm = false;
    state.songNotice = "Setlist deleted locally. The service remains available.";
    render();
  }

  function createSetlist() {
    const service = serviceById(state.selectedServiceId);
    if (!service) return;
    state.setlists[service.id] = { id: service.id, date: service.date, worshipType: service.worshipType, serviceLabel: service.serviceLabel, presider: service.assignments.Presider || "", notes: "", songs: [], glorySong: null, thanksSong: null, confirmed: false, status: "planned", updatedAt: "2026-09-07T12:00:00", sungAt: null };
    state.saveState = "ready";
    state.songNotice = "Blank outline created locally.";
    render();
  }

  function resetPrototype(message) {
    state.services = deepClone(BASE.services);
    state.members = deepClone(BASE.members);
    state.categories = deepClone(BASE.categories);
    state.departments = deepClone(BASE.departments);
    state.setlists = deepClone(BASE.setlists);
    state.requests = deepClone(BASE.requests);
    state.songs = deepClone(BASE.songs);
    state.songStats = deepClone(BASE.songStats);
    state.features = deepClone(BASE.features);
    state.nameMap = deepClone(BASE.nameMap || {});
    state.selectedName = BASE.members[0];
    state.selectedServiceId = BASE.services[0].id;
    state.calendarMonth = "2026-09";
    state.calendarDay = "";
    state.selectedDate = "";
    state.openDutyTeams = {};
    state.presiderFilter = "mine";
    state.manageUnlocked = true;
    state.siteLocked = false;
    state.accessError = "";
    state.passcodeMode = null;
    state.removeMember = null;
    state.serviceDeleteId = null;
    state.departmentChoice = "Worship";
    state.nameUnifyPreview = false;
    state.resetConfirm = null;
    state.songSearch = "";
    state.songCategory = "All";
    state.openSong = null;
    state.songLibraryOpen = false;
    state.songLibraryReturnFocus = "song-library-trigger";
    state.markSungConfirm = null;
    state.undoSungConfirm = null;
    state.runsheetOpen = false;
    state.deleteSetlistConfirm = false;
    state.calendarSubscription = "idle";
    state.calendarMessage = "";
    state.calendarFeedMessage = "";
    state.sheetUrl = "local-sheet://fictional-schedule";
    state.copyText = "";
    state.copyMessage = "";
    state.copyLabel = "";
    state.importMessage = "";
    state.editorPasscode = BASE.passcodes.editor;
    state.sitePasscode = BASE.passcodes.site;
    state.manageNotice = message;
    state.syncMessage = message;
    state.syncStatus = "complete";
    render();
  }

  function exportBackup() {
    state.songs.forEach((song) => ensureSongStats(song.id));
    const payload = { prototype: FIX.backupMarker, fixtureId: FIX.fixtureId, fixtureSignature: FIX.fixtureSignature, version: 1, members: state.members, services: state.services, departments: state.departments, setlists: state.setlists, requests: state.requests, songs: state.songs, songStats: state.songStats };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fictional-worship-sample-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    state.syncMessage = "Local fictional backup prepared.";
    render();
  }

  function isValidFictionalBackup(payload) {
    const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
    if (!isObject(payload) || payload.prototype !== FIX.backupMarker || payload.fixtureId !== FIX.fixtureId || payload.fixtureSignature !== FIX.fixtureSignature || payload.version !== 1) return false;
    const members = payload.members;
    if (!Array.isArray(members) || !members.length || members.some((member) => typeof member !== "string" || !member.trim()) || new Set(members).size !== members.length) return false;
    if (!Array.isArray(payload.services) || !payload.services.length) return false;
    if (!isObject(payload.departments) || !isObject(payload.setlists) || !Array.isArray(payload.requests) || !Array.isArray(payload.songs) || !isObject(payload.songStats)) return false;
    const serviceIds = new Set();
    payload.services.forEach((service) => serviceIds.add(service && service.id));
    if (serviceIds.size !== payload.services.length) return false;
    for (const service of payload.services) {
      if (!isObject(service) || typeof service.id !== "string" || !/^(sab|third|local)-2026-09-/.test(service.id) || !/^2026-09-\d\d$/.test(String(service.date || "")) || typeof service.worshipType !== "string" || typeof service.serviceLabel !== "string" || typeof service.time !== "string" || !isObject(service.assignments)) return false;
      if (Object.values(service.assignments).some((member) => member !== "" && !members.includes(member))) return false;
    }
    const knownSongs = new Set((FIX.songs || []).map((song) => song.id));
    if (payload.songs.some((song) => !isObject(song) || !knownSongs.has(song.id))) return false;
    if (new Set(payload.songs.map((song) => song.id)).size !== knownSongs.size) return false;
    if (Object.values(payload.departments).some((roster) => !Array.isArray(roster) || roster.some((member) => !members.includes(member)))) return false;
    for (const [id, setlist] of Object.entries(payload.setlists)) {
      const service = payload.services.find((item) => item && item.id === id);
      if (!service || !isObject(setlist) || setlist.id !== id || setlist.date !== service.date || setlist.worshipType !== service.worshipType || setlist.serviceLabel !== service.serviceLabel || !Array.isArray(setlist.songs) || setlist.songs.some((songId) => !knownSongs.has(songId))) return false;
    }
    if (payload.requests.some((request) => !isObject(request) || typeof request.name !== "string" || !members.includes(request.name))) return false;
    if (Object.entries(payload.songStats).some(([id, stat]) => !knownSongs.has(id) || !isObject(stat) || (stat.history !== undefined && (!Array.isArray(stat.history) || stat.history.some((entry) => !isObject(entry) || typeof entry.date !== "string" || typeof entry.service !== "string"))))) return false;
    return true;
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result));
        if (!isValidFictionalBackup(payload)) throw new Error("fictional-backup");
        state.members = deepClone(payload.members);
        state.services = deepClone(payload.services);
        if (payload.departments) state.departments = deepClone(payload.departments);
        if (payload.setlists) state.setlists = deepClone(payload.setlists);
        if (payload.requests) state.requests = deepClone(payload.requests);
        if (payload.songs) state.songs = deepClone(payload.songs);
        if (payload.songStats) state.songStats = deepClone(payload.songStats);
        state.importMessage = "Fictional backup imported locally.";
      } catch (error) {
        state.importMessage = "Backup rejected. Choose a September 2026 fictional backup.";
      }
      render();
    };
    reader.readAsText(file);
  }


  function handleClick(event) {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      event.preventDefault();
      navigate(nav.dataset.nav);
      return;
    }
    const review = event.target.closest("[data-review-route]");
    if (review) {
      event.preventDefault();
      if (REAL_MODE) return;
      navigate(review.dataset.reviewRoute);
      return;
    }
    const saveFailure = event.target.closest("[data-review-save-error]");
    if (saveFailure) {
      event.preventDefault();
      if (REAL_MODE) return;
      state.failNextSave = true;
      state.selectedName = sourceMembers[0] || "";
      state.selectedServiceId = firstService ? firstService.id : "";
      navigate("presider");
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const type = action.dataset.action;
    if (REAL_MODE && READ_ONLY_ACTIONS.has(type)) return;
    if (type === "duty-note") { state.dutyNoteOpen = !state.dutyNoteOpen; render(); }
    else if (type === "open-my-duties") navigate("duty");
    else if (type === "open-presider") navigate("presider");
    else if (type === "open-song-library") openSongLibrary();
    else if (type === "close-song-library") closeSongLibrary();
    else if (type === "open-manage-settings") { state.manageTab = "settings"; navigate("manage"); }
    else if (type === "select-date" || type === "calendar-day") { setCalendarSelection(action.dataset.date); render(); }
    else if (type === "calendar-clear") { setCalendarSelection(""); render(); }
    else if (type === "calendar-prev" || type === "calendar-next") {
      state.calendarMonth = shiftMonth(state.calendarMonth, type === "calendar-next" ? 1 : -1);
      setCalendarSelection("");
      render();
    }
    else if (type === "toggle-service") { state.expandedServices[action.dataset.service] = !state.expandedServices[action.dataset.service]; render(); }
    else if (type === "open-duty-team") { state.openDutyTeams[action.dataset.service] = !state.openDutyTeams[action.dataset.service]; render(); }
    else if (type === "toggle-past") { state.showPast = !state.showPast; render(); }
    else if (type === "request-change") { state.requestOpen = { serviceId: action.dataset.service, duty: action.dataset.duty }; state.requestNote = ""; render(); }
    else if (type === "cancel-request") { state.requestOpen = null; state.requestNote = ""; render(); }
    else if (type === "calendar") {
      state.calendarMessage = "Calendar text prepared for " + state.selectedName + ".";
      copyLocal(serviceCalendarText(), state.calendarMessage, "Calendar text");
    }
    else if (type === "copy-calendar") {
      state.calendarMessage = "Calendar text prepared for " + state.selectedName + ".";
      copyLocal(serviceCalendarText(), state.calendarMessage, "Calendar text");
    }
    else if (type === "subscribe-calendar") {
      state.calendarSubscription = "subscribed";
      state.calendarFeedMessage = "Subscription simulated locally. No calendar app or external page was opened.";
      render();
    }
    else if (type === "copy-feed-link") {
      copyLocal(calendarFeedUrl(), "Reserved fictional feed link prepared for copying.", "Calendar feed link");
      state.calendarFeedMessage = "Reserved fictional feed link prepared locally.";
      render();
    }
    else if (type === "clear-alert") { state.alerts = state.alerts.filter((item) => item.id !== action.dataset.alert); render(); }
    else if (type === "save-setlist") saveSetlist();
    else if (type === "retry-save") { state.failNextSave = false; saveSetlist(); }
    else if (type === "confirm-songs") {
      const setlist = currentSetlist();
      if (setlist) { setlist.confirmed = true; setlist.status = "confirmed"; state.saveState = "saved"; state.songNotice = "Outline confirmed locally."; render(); }
    } else if (type === "toggle-song") { state.openSong = state.openSong === action.dataset.song ? null : action.dataset.song; render(); }
    else if (type === "add-song") addSong(action.dataset.song);
    else if (type === "move-song") moveSong(action.dataset.index, action.dataset.direction);
    else if (type === "remove-song") removeSong(action.dataset.index);
    else if (type === "song-category") { state.songCategory = action.dataset.category; render(); }
    else if (type === "manage-tab") { state.manageTab = action.dataset.tab; state.manageNotice = ""; render(); }
    else if (type === "preview-name-unify") { state.nameUnifyPreview = true; render(); }
    else if (type === "cancel-name-unify") { state.nameUnifyPreview = false; render(); }
    else if (type === "confirm-name-unify") {
      const impact = nameUnifyImpact();
      applyNameMap();
      state.nameUnifyPreview = false;
      state.manageNotice = impact.total ? "Fictional names consolidated locally. Assignments and department rosters were recomputed." : "No fictional names needed consolidation.";
      render();
    }
    else if (type === "open-request-service") { state.selectedServiceId = action.dataset.service; state.manageTab = "assignments"; render(); }
    else if (type === "approve-request" || type === "decline-request") {
      const request = state.requests.find((item) => item.id === action.dataset.request);
      if (request) {
        request.status = type === "approve-request" ? "approved" : "declined";
        request.resolvedAt = "2026-09-07T12:00:00";
        state.manageNotice = "Request " + request.status + " locally.";
        render();
      }
    } else if (type === "lock-editor") { state.manageUnlocked = false; state.accessError = ""; render(); }
    else if (type === "lock-site") { state.siteLocked = true; state.accessError = ""; render(); }
    else if (type === "edit-passcode") { state.passcodeMode = action.dataset.kind; render(); }
    else if (type === "cancel-passcode") { state.passcodeMode = null; render(); }
    else if (type === "sync-now") {
      state.syncStatus = "syncing";
      state.syncMessage = "Preparing the fictional schedule locally.";
      render();
      window.clearTimeout(state.saveTimer);
      state.saveTimer = window.setTimeout(() => {
        state.syncStatus = state.sheetUrl.indexOf("local-sheet://") === 0 ? "complete" : "warning";
        state.syncMessage = state.syncStatus === "complete" ? "Fictional sample synced locally." : "Review the fictional URL before syncing.";
        render();
      }, 180);
    } else if (type === "export-backup") exportBackup();
    else if (type === "restore-sample") { state.resetConfirm = "restore"; render(); }
    else if (type === "confirm-restore-sample") resetPrototype("Sample restored locally.");
    else if (type === "cancel-restore-sample") { state.resetConfirm = null; render(); }
    else if (type === "reset-prototype") { state.resetConfirm = "reset"; render(); }
    else if (type === "confirm-reset-prototype") resetPrototype("All local changes were reset.");
    else if (type === "cancel-reset-prototype") { state.resetConfirm = null; render(); }
    else if (type === "apply-suggestion") {
      const service = serviceById(action.dataset.service);
      if (service) {
        service.assignments[action.dataset.duty] = action.dataset.member;
        state.planNotice = action.dataset.duty + " assigned to " + action.dataset.member + ".";
        render();
      }
    } else if (type === "delete-service") { state.serviceDeleteId = state.selectedServiceId; render(); }
    else if (type === "cancel-delete-service") { state.serviceDeleteId = null; render(); }
    else if (type === "confirm-delete-service") deleteService();
    else if (type === "remove-member") { state.removeMember = action.dataset.member; render(); }
    else if (type === "cancel-remove-member") { state.removeMember = null; render(); }
    else if (type === "confirm-remove-member") removeMember();
    else if (type === "ack-conflict" || type === "reopen-conflict") { state.conflictAcknowledged[action.dataset.conflict] = type === "ack-conflict"; render(); }
    else if (type === "open-runsheet") { state.runsheetOpen = true; render(); }
    else if (type === "close-runsheet") { state.runsheetOpen = false; render(); }
    else if (type === "copy-setlist") {
      const service = serviceById(state.selectedServiceId);
      const setlist = currentSetlist();
      if (service && setlist) copyLocal(outlineText(service, setlist), "Outline text prepared for copying.", "Outline text");
    }
    else if (type === "clear-copy") { state.copyText = ""; state.copyMessage = ""; render(); }
    else if (type === "mark-sung") { state.markSungConfirm = state.selectedServiceId; render(); }
    else if (type === "cancel-mark-sung") { state.markSungConfirm = null; render(); }
    else if (type === "confirm-mark-sung") markSung();
    else if (type === "undo-sung") { state.undoSungConfirm = state.selectedServiceId; render(); }
    else if (type === "cancel-undo-sung") { state.undoSungConfirm = null; render(); }
    else if (type === "confirm-undo-sung") undoSung();
    else if (type === "delete-setlist") { state.deleteSetlistConfirm = true; render(); }
    else if (type === "cancel-delete-setlist") { state.deleteSetlistConfirm = false; render(); }
    else if (type === "delete-setlist-confirm") deleteSetlist();
    else if (type === "create-setlist") createSetlist();
    else if (type === "toggle-history") { state.showHistory = !state.showHistory; render(); }
    else if (type === "remove-history") removeHistory(action.dataset.song, action.dataset.historyIndex);
    else if (type === "open-backfill") { state.backfillOpen = true; render(); }
    else if (type === "close-backfill") { state.backfillOpen = false; render(); }
    else if (type === "recover-empty" || type === "recover-loading" || type === "recover-offline" || type === "recover-success") navigate("home");
    else if (type === "recover-error") { state.failNextSave = false; navigate("success"); }
  }

  function handleChange(event) {
    const target = event.target;
    const change = target.dataset.change;
    if (!change) return;
    if (REAL_MODE && !["member", "home-department", "duty-department", "presider-service", "presider-filter", "department-choice"].includes(change)) return;
    if (change === "member") {
      state.selectedName = target.value;
      state.memberNotice = "";
      state.calendarMessage = "";
      if (state.screen === "presider" && !state.calendarDay && state.presiderFilter === "mine" && state.selectedName) {
        const nearestPresider = state.services.filter((service) => (REAL_MODE || !service.standalone || setlistById(service.id)) && service.date >= today && isPresider(state.selectedName, service)).sort(serviceSort)[0];
        if (nearestPresider) state.calendarMonth = nearestPresider.date.slice(0, 7);
      }
      if (state.screen === "presider") state.selectedServiceId = presiderServices(state.selectedName)[0]?.id || "";
      render();
    } else if (change === "home-department") { state.homeDepartment = target.value; render(); }
    else if (change === "duty-department") { state.dutyDepartment = target.value; render(); }
    else if (change === "presider-filter") {
      state.presiderFilter = target.value === "all" ? "all" : "mine";
      if (state.presiderFilter === "mine" && !state.calendarDay && state.selectedName) {
        const nearestPresider = state.services.filter((service) => (REAL_MODE || !service.standalone || setlistById(service.id)) && service.date >= today && isPresider(state.selectedName, service)).sort(serviceSort)[0];
        if (nearestPresider) state.calendarMonth = nearestPresider.date.slice(0, 7);
      }
      state.selectedServiceId = presiderServices(state.selectedName)[0]?.id || "";
      state.saveState = currentSetlist()?.confirmed ? "saved" : "ready";
      state.failNextSave = false;
      render();
    }
    else if (change === "presider-service") { state.selectedServiceId = target.value; state.saveState = currentSetlist()?.confirmed ? "saved" : "ready"; state.failNextSave = false; render(); }
    else if (change === "manage-service") { state.selectedServiceId = target.value; state.serviceDeleteId = null; render(); }
    else if (change === "service-field") { updateServiceField(target.dataset.field, target.value); render(); }
    else if (change === "assignment") {
      const service = serviceById(state.selectedServiceId);
      if (service) {
        service.assignments[target.dataset.duty] = target.value;
        if (target.dataset.duty === "Presider" && state.setlists[service.id]) state.setlists[service.id].presider = target.value;
        state.manageNotice = "Assignment saved locally.";
      }
      render();
    } else if (change === "department-choice") { state.departmentChoice = target.value; render(); }
    else if (change === "department-member") {
      const department = state.departmentChoice || state.categories[0]?.name || "Worship";
      state.departmentChoice = department;
      const roster = state.departments[department] ||= [];
      if (target.checked && !roster.includes(target.dataset.member)) roster.push(target.dataset.member);
      if (!target.checked) state.departments[department] = roster.filter((person) => person !== target.dataset.member);
      state.manageNotice = "Department roster updated locally.";
      render();
    } else if (change === "plan-window") { state.planWindow = target.value; render(); }
    else if (change === "feature") {
      state.features[target.dataset.feature] = target.checked;
      state.manageNotice = FEATURE_LABELS[target.dataset.feature][0] + " is now " + (target.checked ? "on" : "off") + " locally.";
      render();
    } else if (change === "scheduler") { state.scheduler = target.value; state.manageNotice = "Scheduler recipient saved locally."; render(); }
    else if (change === "choir-song") { const service = serviceById(state.selectedServiceId); if (service) service.choirSong = target.value || null; render(); }
    else if (change === "glory-song" || change === "thanks-song") {
      const setlist = currentSetlist();
      if (setlist) { setlist[change === "glory-song" ? "glorySong" : "thanksSong"] = target.value || null; markSetlistChanged(); render(); }
    } else if (change === "setlist-notes") {
      const setlist = currentSetlist();
      if (setlist) { setlist.notes = target.value; markSetlistChanged(); render(); }
    } else if (change === "import-file") importBackup(target.files && target.files[0]);
  }

  function handleInput(event) {
    const target = event.target;
    if (target.dataset.input === "request-note") state.requestNote = target.value;
    else if (target.dataset.input === "song-search") {
      const active = document.activeElement === target;
      state.songSearch = target.value;
      render();
      if (active) {
        const next = document.getElementById("song-search");
        if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
      }
    }
  }

  function handleKeydown(event) {
    if (!state.songLibraryOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeSongLibrary();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = document.getElementById("song-library-panel");
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest("[data-form]");
    if (!form) return;
    event.preventDefault();
    if (REAL_MODE) return;
    const data = new FormData(form);
    if (form.dataset.form === "request") {
      const request = { id: "request-local-" + Date.now(), name: state.selectedName, serviceId: form.dataset.service, duty: form.dataset.duty, note: String(data.get("note") || ""), status: "pending", createdAt: "2026-09-07T12:00:00" };
      state.requests.unshift(request);
      state.requestOpen = null;
      state.requestNote = "";
      state.requestMessage = "Request pending for coordinator review.";
      render();
    } else if (form.dataset.form === "unlock") {
      if (String(data.get("passcode")) === state.editorPasscode) { state.manageUnlocked = true; state.accessError = ""; }
      else state.accessError = "That editor passcode does not match the fictional local value.";
      render();
    } else if (form.dataset.form === "site-unlock") {
      if (String(data.get("passcode")) === state.sitePasscode) { state.siteLocked = false; state.accessError = ""; }
      else state.accessError = "That site passcode does not match the fictional local value.";
      render();
    } else if (form.dataset.form === "passcode") {
      const kind = String(data.get("kind"));
      const current = kind === "editor" ? state.editorPasscode : state.sitePasscode;
      if (String(data.get("current")) !== current) state.manageNotice = "Current passcode did not match.";
      else { if (kind === "editor") state.editorPasscode = String(data.get("next")); else state.sitePasscode = String(data.get("next")); state.manageNotice = (kind === "editor" ? "Editor" : "Site") + " passcode changed locally."; state.passcodeMode = null; }
      render();
    } else if (form.dataset.form === "add-person") {
      const name = String(data.get("name") || "").trim();
      if (!name) return;
      if (!state.members.includes(name)) { state.members.push(name); state.departments.Worship.push(name); state.manageNotice = name + " added to the local roster."; }
      render();
    } else if (form.dataset.form === "rename-person") {
      const oldName = form.dataset.person;
      const newName = String(data.get("name") || "").trim();
      if (!newName || state.members.includes(newName)) { state.manageNotice = "Choose a new unique fictional name."; render(); return; }
      renameMember(oldName, newName);
    } else if (form.dataset.form === "add-service") {
      addService(String(data.get("date")), String(data.get("time")), String(data.get("worship")), String(data.get("label")));
    } else if (form.dataset.form === "sheet-url") {
      state.sheetUrl = String(data.get("url") || "").trim();
      state.syncMessage = "Fictional Sheet URL saved locally.";
      state.syncStatus = "complete";
      render();
    } else if (form.dataset.form === "backfill") {
      const song = songById(String(data.get("song")));
      const date = String(data.get("date"));
      if (song && /^2026-09-\d\d$/.test(date)) {
        const history = songHistory(song.id);
        const service = "backfill-" + date + "-" + song.id;
        if (history.some((entry) => entry.service === service)) {
          state.songNotice = "That fictional backfill already exists.";
        } else {
          history.push({ date, service, by: "Backfill", markedAt: date + "T12:00:00", backfilled: true });
          writeSongHistory(song.id, history);
          state.songNotice = "Backfilled history for " + songLabel(song) + " locally.";
        }
        state.backfillOpen = false;
        render();
      }
    }
  }

  function renameMember(oldName, newName) {
    state.members = state.members.map((member) => member === oldName ? newName : member);
    state.services.forEach((service) => Object.keys(service.assignments).forEach((duty) => { if (service.assignments[duty] === oldName) service.assignments[duty] = newName; }));
    Object.keys(state.departments).forEach((key) => { state.departments[key] = state.departments[key].map((member) => member === oldName ? newName : member); });
    state.requests.forEach((request) => { if (request.name === oldName) request.name = newName; });
    Object.keys(state.setlists).forEach((id) => { if (state.setlists[id].presider === oldName) state.setlists[id].presider = newName; });
    if (state.selectedName === oldName) state.selectedName = newName;
    state.manageNotice = "Member renamed locally.";
    render();
  }

  function countAssignments(person) {
    return state.services.filter((service) => service.date >= today).reduce((total, service) => total + Object.values(service.assignments).filter((value) => value === person).length, 0);
  }

  function markSung() {
    const setlist = currentSetlist();
    if (!setlist) return;
    if (!uniqueSetlistSongs(setlist).length) {
      state.markSungConfirm = null;
      state.songNotice = "Add a song before marking this service sung locally.";
      render();
      return;
    }
    const alreadySung = serviceSongsComplete(setlist);
    if (alreadySung) {
      state.markSungConfirm = null;
      state.songNotice = "This service is already marked sung locally.";
      render();
      return;
    }
    const result = applySung(state.songStats, setlist, { by: state.selectedName, markedAt: setlist.date + "T" + setlist.time + ":00" });
    Object.keys(result.changed).forEach((songId) => writeSongHistory(songId, result.changed[songId].history));
    setlist.status = "sung";
    setlist.sungAt = setlist.date + "T" + setlist.time + ":00";
    setlist.confirmed = true;
    state.markSungConfirm = null;
    state.songNotice = "Service marked sung locally.";
    render();
  }

  function undoSung() {
    const setlist = currentSetlist();
    if (!setlist) return;
    const result = applyUndo(state.songStats, setlist);
    Object.keys(result.changed).forEach((songId) => writeSongHistory(songId, result.changed[songId].history));
    result.removed.forEach((songId) => {
      const song = songById(songId);
      if (song) song.history = [];
      delete state.songStats[songId];
    });
    setlist.status = "confirmed";
    setlist.sungAt = null;
    state.undoSungConfirm = null;
    state.songNotice = Object.keys(result.changed).length || result.removed.length ? "Sung mark undone for this service locally." : "No sung history for this service.";
    render();
  }

  function removeHistory(songId, historyIndex) {
    const index = Number(historyIndex);
    const history = songHistory(songId);
    if (!Number.isInteger(index) || !history[index]) return;
    history.splice(index, 1);
    writeSongHistory(songId, history);
    state.songNotice = "History entry removed locally.";
    render();
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("submit", handleSubmit);
  window.addEventListener("popstate", () => { state.screen = readScreen(); render(); focusMain(); });
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  function handleTouchStart(event) {
    if (window.innerWidth >= 600 || event.touches.length !== 1) return;
    if (event.target.closest("input,select,textarea,button,a,[data-scrollable]")) return;
    const touch = event.touches[0];
    state.touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }

  function handleTouchEnd(event) {
    if (!state.touchStart || window.innerWidth >= 600 || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - state.touchStart.x;
    const dy = touch.clientY - state.touchStart.y;
    const elapsed = Date.now() - state.touchStart.time;
    state.touchStart = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) <= 1.5 * Math.abs(dy) || elapsed >= 600) return;
    const index = NAV.indexOf(state.screen);
    const next = index + (dx < 0 ? 1 : -1);
    if (index >= 0 && next >= 0 && next < NAV.length) navigate(NAV[next]);
  }

  render();
})(window, document);
