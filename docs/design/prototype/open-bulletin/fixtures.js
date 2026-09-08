/* Fictional September 2026 fixtures for the local prototype only. */
(function exposeFixtures(root) {
  const variantName = "B. Daniel R.";
  const members = ["B. Daniel Reed", "S. Mira Lane", "B. Elias Park", variantName];

  const categories = [
    { name: "Worship", duties: ["Presider", "Sermon", "Prayer of Thanks", "Closing Prayer"] },
    { name: "Usher Sisters", duties: ["Usher Door", "Usher Front", "Usher Back"] },
    { name: "Usher Brothers", duties: ["Usher #1", "Usher #2", "Lobby Security"] },
    { name: "Lobby", duties: ["Lobby Desk #1", "Lobby Desk #2"] },
    { name: "Translation", duties: ["Translation #1", "Translation #2"] },
    { name: "Media", duties: ["Media Booth #1", "Media Booth #2"] },
    { name: "Parking Lot", duties: ["Parking #1", "Parking #2", "Parking #3", "Parking #4", "Parking #5"] },
    { name: "Offering", duties: ["Offering #1", "Offering #2", "Offering #3", "Offering #4", "Offering #5", "Offering #6"] }
  ];

  const morningAssignments = {
    "Presider": "B. Daniel Reed", "Sermon": "S. Mira Lane", "Prayer of Thanks": "B. Elias Park", "Closing Prayer": "B. Daniel Reed",
    "Usher Door": "S. Mira Lane", "Usher Front": "B. Elias Park", "Usher Back": "S. Mira Lane",
    "Usher #1": "B. Elias Park", "Usher #2": "B. Daniel Reed", "Lobby Security": "S. Mira Lane",
    "Lobby Desk #1": "B. Daniel Reed", "Lobby Desk #2": "B. Elias Park", "Translation #1": "S. Mira Lane", "Translation #2": "B. Elias Park",
    "Media Booth #1": "B. Elias Park", "Media Booth #2": "B. Daniel Reed", "Parking #1": "B. Daniel Reed", "Parking #2": "S. Mira Lane",
    "Parking #3": "B. Elias Park", "Offering #1": "S. Mira Lane", "Offering #2": "B. Daniel Reed", "Offering #3": "B. Daniel R."
  };

  const services = [
    { id: "sab-2026-09-12-morning", date: "2026-09-12", worshipType: "Sabbath Day", serviceLabel: "Morning", time: "09:00", notes: "Morning service outline is ready for review.", choirSong: "song-402", status: "planned", assignments: morningAssignments },
    { id: "sab-2026-09-12-afternoon", date: "2026-09-12", worshipType: "Sabbath Day", serviceLabel: "Afternoon", time: "15:00", notes: "Afternoon service assignments.", choirSong: "song-224", status: "confirmed", assignments: {
      "Presider": "B. Elias Park", "Sermon": "S. Mira Lane", "Prayer of Thanks": "B. Daniel Reed", "Closing Prayer": "S. Mira Lane",
      "Usher Door": "B. Daniel Reed", "Usher #1": "S. Mira Lane", "Lobby Desk #1": "B. Elias Park", "Media Booth #1": "B. Daniel Reed", "Offering #1": "S. Mira Lane"
    } },
    { id: "sab-2026-09-12-evening", date: "2026-09-12", worshipType: "Sabbath Day", serviceLabel: "Evening", time: "20:00", notes: "Evening service assignments.", choirSong: "song-337", status: "planned", assignments: {
      "Presider": "S. Mira Lane", "Sermon": "B. Daniel Reed", "Prayer of Thanks": "S. Mira Lane", "Closing Prayer": "B. Elias Park",
      "Usher Back": "B. Daniel Reed", "Usher #2": "S. Mira Lane", "Lobby Security": "B. Elias Park", "Translation #1": "B. Daniel Reed", "Media Booth #1": "S. Mira Lane"
    } },
    { id: "third-2026-09-15-evening", date: "2026-09-15", worshipType: "Third Day", serviceLabel: "Evening", time: "19:00", notes: "Third Day service assignments.", choirSong: null, status: "planned", assignments: {
      "Presider": "B. Daniel Reed", "Sermon": "B. Elias Park", "Prayer of Thanks": "S. Mira Lane", "Closing Prayer": "B. Daniel Reed",
      "Usher Door": "B. Elias Park", "Usher #1": "S. Mira Lane", "Lobby Desk #2": "B. Daniel Reed", "Translation #2": "S. Mira Lane", "Offering #1": "B. Elias Park"
    } },
    { id: "sab-2026-09-05-morning", date: "2026-09-05", worshipType: "Sabbath Day", serviceLabel: "Morning", time: "09:00", notes: "Past service record.", choirSong: "song-205", status: "sung", assignments: {
      "Presider": "S. Mira Lane", "Sermon": "B. Elias Park", "Prayer of Thanks": "B. Daniel Reed", "Closing Prayer": "S. Mira Lane", "Usher Door": "B. Daniel Reed", "Media Booth #1": "S. Mira Lane"
    } },
    { id: "third-2026-09-08-evening", date: "2026-09-08", worshipType: "Third Day", serviceLabel: "Evening", time: "19:00", notes: "Past service record.", choirSong: null, status: "sung", assignments: {
      "Presider": "B. Elias Park", "Sermon": "S. Mira Lane", "Prayer of Thanks": "B. Daniel Reed", "Closing Prayer": "B. Elias Park", "Offering #1": "S. Mira Lane"
    } }
  ];

  const songs = [
    { id: "song-101", number: "101", title: "A Quiet Beginning", durationSec: 184, category: "Faith", history: [{ date: "2026-08-29", service: "Sabbath Morning" }, { date: "2026-07-18", service: "Third Day Evening" }] },
    { id: "song-118", number: "118", title: "Keep the Word Near", durationSec: 212, category: "Hope", history: [{ date: "2026-08-15", service: "Sabbath Evening" }] },
    { id: "song-205", number: "205", title: "Steady in the Light", durationSec: 196, category: "Faith", history: [{ date: "2026-08-01", service: "Sabbath Morning" }, { date: "2026-06-20", service: "Third Day Evening" }] },
    { id: "song-224", number: "224", title: "A Glad Heart", durationSec: 176, category: "Gratitude", history: [{ date: "2026-08-22", service: "Sabbath Afternoon" }] },
    { id: "song-311", number: "311", title: "I Will Follow", durationSec: 228, category: "Hope", history: [] },
    { id: "song-337", number: "337", title: "Peace for the Journey", durationSec: 205, category: "Love", history: [{ date: "2026-07-25", service: "Sabbath Morning" }] },
    { id: "song-402", number: "402", title: "Gathered in One Voice", durationSec: 190, category: "Worship", history: [] },
    { id: "song-440", number: "440", title: "Serve with Joy", durationSec: 172, category: "Gratitude", history: [{ date: "2026-08-08", service: "Sabbath Morning" }] },
    { id: "song-503", number: "503", title: "The Work Before Us", durationSec: 221, category: "Worship", history: [] },
    { id: "song-518", number: "518", title: "Rest in the Promise", durationSec: 204, category: "Hope", history: [{ date: "2026-07-11", service: "Sabbath Evening" }] }
  ];

  const setlists = {
    "sab-2026-09-12-morning": { id: "sab-2026-09-12-morning", date: "2026-09-12", worshipType: "Sabbath Day", serviceLabel: "Morning", presider: "B. Daniel Reed", notes: "Bring the outline to the service team before Saturday morning.", songs: ["song-101", "song-118", "song-118", "song-205"], glorySong: "song-224", thanksSong: "song-337", confirmed: false, status: "planned", updatedAt: "2026-09-07T09:00:00", sungAt: null },
    "sab-2026-09-12-afternoon": { id: "sab-2026-09-12-afternoon", date: "2026-09-12", worshipType: "Sabbath Day", serviceLabel: "Afternoon", presider: "B. Elias Park", notes: "", songs: ["song-224", "song-311"], glorySong: "song-402", thanksSong: null, confirmed: true, status: "confirmed", updatedAt: "2026-09-06T13:00:00", sungAt: null },
    "sab-2026-09-12-evening": { id: "sab-2026-09-12-evening", date: "2026-09-12", worshipType: "Sabbath Day", serviceLabel: "Evening", presider: "S. Mira Lane", notes: "", songs: ["song-337", "song-503"], glorySong: "song-440", thanksSong: null, confirmed: true, status: "confirmed", updatedAt: "2026-09-06T14:00:00", sungAt: null },
    "third-2026-09-15-evening": { id: "third-2026-09-15-evening", date: "2026-09-15", worshipType: "Third Day", serviceLabel: "Evening", presider: "B. Daniel Reed", notes: "", songs: [], glorySong: null, thanksSong: null, confirmed: false, status: "planned", updatedAt: "2026-09-07T09:00:00", sungAt: null },
    "sab-2026-09-05-morning": { id: "sab-2026-09-05-morning", date: "2026-09-05", worshipType: "Sabbath Day", serviceLabel: "Morning", presider: "S. Mira Lane", notes: "Past setlist record.", songs: ["song-205", "song-337"], glorySong: "song-224", thanksSong: null, confirmed: true, status: "sung", updatedAt: "2026-09-05T12:00:00", sungAt: "2026-09-05T12:00:00" },
    "third-2026-09-08-evening": { id: "third-2026-09-08-evening", date: "2026-09-08", worshipType: "Third Day", serviceLabel: "Evening", presider: "B. Elias Park", notes: "Past setlist record.", songs: ["song-118", "song-402"], glorySong: null, thanksSong: null, confirmed: true, status: "sung", updatedAt: "2026-09-08T21:00:00", sungAt: "2026-09-08T21:00:00" }
  };

  const requests = [
    { id: "request-s-mira-usher-door", name: "S. Mira Lane", serviceId: "sab-2026-09-12-morning", duty: "Usher Door", note: "Please review this morning assignment.", status: "pending", createdAt: "2026-09-07T10:15:00" },
    { id: "request-b-elias-resolved", name: "B. Elias Park", serviceId: "sab-2026-09-12-afternoon", duty: "Sermon", note: "Resolved sample request.", status: "approved", createdAt: "2026-09-04T09:00:00", resolvedAt: "2026-09-05T09:00:00" }
  ];

  const departments = {
    "Worship": members.slice(),
    "Usher Sisters": ["S. Mira Lane", "B. Elias Park"],
    "Usher Brothers": ["B. Daniel Reed", "B. Elias Park"],
    "Lobby": members.slice(),
    "Translation": ["S. Mira Lane", "B. Daniel Reed"],
    "Media": ["B. Elias Park", "B. Daniel Reed"],
    "Parking Lot": ["B. Daniel Reed", "S. Mira Lane"],
    "Offering": ["S. Mira Lane", "B. Elias Park"]
  };

  const songStats = {
    "song-101": { sungCount: 4, lastSung: "2026-08-29" }, "song-118": { sungCount: 3, lastSung: "2026-08-15" }, "song-205": { sungCount: 5, lastSung: "2026-08-01" },
    "song-224": { sungCount: 2, lastSung: "2026-08-22" }, "song-311": { sungCount: 0, lastSung: null }, "song-337": { sungCount: 3, lastSung: "2026-07-25" },
    "song-402": { sungCount: 1, lastSung: "2026-08-08" }, "song-440": { sungCount: 2, lastSung: "2026-08-08" }, "song-503": { sungCount: 0, lastSung: null }, "song-518": { sungCount: 1, lastSung: "2026-07-11" }
  };

  const features = {
    siteLock: true, editorLock: true, notifications: true, reminders: true, calendarExport: true, whoElse: true,
    choirSong: true, songPicker: true, pastServices: true, emptyDuties: false, conflictWarnings: true, sheetSync: true, changeRequests: true
  };

  root.WorshipPrototypeFixtures = Object.freeze({
    members,
    categories,
    services,
    songs,
    setlists,
    requests,
    departments,
    songStats,
    features,
    nameMap: { [variantName]: "B. Daniel Reed" },
    backupMarker: "open-bulletin-fictional-backup",
    fixtureId: "september-2026-fictional",
    fixtureSignature: "open-bulletin-september-2026-v2",
    passcodes: { editor: "2468", site: "1357" }
  });
})(window);
