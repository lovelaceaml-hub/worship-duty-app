# Immediate production interface contract

Owner authorized production implementation without design/prototype/stage gates. Astra controller, Sol team lead, Luna task effort, Gemini3.8Flash implementation. All production lanes start concurrently. Read-first canonical run INDEX: /Users/anthony/Projects/worship-duty-app/docs/runs/worship-refactor-20260907/INDEX.md. Latest detailed requirements: /Users/anthony/Projects/worship-duty-app/docs/runs/worship-refactor-20260907/decisions/20260908-service-layout-v2.md. No real personal data in new source/tests/docs.

## Shared API

Buildless IIFEs. Member exposes window.WorshipApp.screens.member.create(deps). Manage exposes window.WorshipApp.screens.coordinator.create(deps). Each returns {render():string,handle(kind,token,element,event):boolean|Promise<boolean>,afterRender(root):void,destroy():void}. kind is act/chg/input/submit. Controls use production data-act/data-chg and namespaced tokens (member-calendar-next, manage-department). Shell delegates active screen first; return true only if consumed. Use all four methods even when a no-op. Avoid generic framework or separate approval freeze.

Shared deps via getters: {getState,getUi,getSetlists,core,scheduleDomain,memberDomain,coordinatorDomain,fmt:{esc,date,time,badge,serviceId,today},feature,requestRender,addBanner,confirm,storage,commands}. Authoritative state shape remains existing production. Inspect actual existing functions for signatures and report needed adapters, never invent Firebase calls. Commands preserve current persistence, mutation and afterDataChange: persistService,deleteService,persistMembers,persistSettings,persistDepartments,persistNameMap,persistRequest,resolveRequest,persistAll,syncFromSheet,registerPush,unregisterPush,subscribeCalendar,copyCalendarLink,exportBackup,importBackup,applyNameMap,openPresider. Expose optional legacy render helpers if required to keep settings/planning capabilities while new primary UI is delivered.

Presider keeps song-app.js export mount(root,context), exact context {fb,authReady,me,schedule,service,nameMap,nav}; optional ui callbacks permitted. Shell lazy-loads song-app.js as today. Presider visual code may be extracted under src/screens/presider; do not add a no-op screen module solely for API symmetry. Keep importer-facing files, transactions/history, auth/write sequencing and data shapes compatible.

## Ownership

Member: /Users/anthony/Projects/worship-refactor-worktrees/production-member/src/screens/member/**. Entry member-screen.js and own CSS if needed.
Manage: /Users/anthony/Projects/worship-refactor-worktrees/production-manage/src/screens/coordinator/**. Entry coordinator-screen.js and own CSS.
Presider: /Users/anthony/Projects/worship-refactor-worktrees/production-presider/song-app.js, song-app.css, src/screens/presider/**.
Shell: /Users/anthony/Projects/worship-refactor-worktrees/production-shell/app.js,index.html,src/ui/**.
Theme: /Users/anthony/Projects/worship-refactor-worktrees/production-themes/styles.css. Gemini already running.
Root integrates shared changes. You are not alone; do not revert others or edit another ownership. Existing dirty docs in each worktree are root authority copies, not your work. No Git mutation/deploy/live records. Worktree HEAD b44bec7 contains LF4 static setlist dependency; preserve it.

## Visual contract

Shell classes .app-shell,.topbar,.brand,.primary-nav,#header-member-control,#sync-pill,#banners,#view. Screen root .member-page/.presider-page/.manage-page plus data-screen. styles.css is new shared stylesheet; legacy production shell CSS currently inline index.html. Theme worker extracts necessary inline styles into styles.css. Shell links styles.css and screen CSS if present, stamped ?v=DEV. Shared primitives .ws-heading,.ws-toolbar,.ws-card,.ws-date-card,.ws-date-title,.ws-calendar,.ws-calendar-day,.ws-departments,.ws-table,.ws-table-scroll,.ws-duty-row,.ws-service-card,.ws-prayers,.ws-actions,.ws-badge,.ws-member-control. Theme documentElement data-theme blue(default),sage,sand. Day classes date-tone-saturday/tuesday/other, aliases ws-saturday/tuesday/other.

Manage access reads optional state.settings.departmentManagers (department -> names array, Admin -> admins). Manager roster qualifications/availability may use optional state.settings.departmentRosterRules (department -> member -> {duties:[],unavailableDates:[],unavailableServiceIds:[]}) while preserving existing app/departments.map roster arrays. Root supplies actual authorized mapping through a root-only provider operation, never literals in source. Existing passcodes/names remain. UI manager restriction is not stronger verified authentication. Choir is a synthetic management department and manual choir titles persist only schedule.choirSong, never library.

## Delivery

Missing modules fall back to current renderer during integration. Writers implement against this contract now and report adapter needs while continuing. Run necessary syntax/affected fixture checks only. No separate reviewer/approval per lane, no exhaustive repeated broad suites. Root verifies complete functional integration and consequential writes. Ready code should land without waiting on perfect prototype parity.
