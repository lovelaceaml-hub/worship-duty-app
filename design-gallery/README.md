# LV Zion appearance gallery: Original + 3 optional designs

This integration places **Original, Prism, Navy & Cream, and Aurora** behind one member-facing **Appearance** chooser while keeping one live application, one Firebase project, one schedule, one set of permissions and one Presider song planner.

## Member experience

After the existing site passcode/login gate is cleared and shared settings have loaded, the app offers a four-card appearance chooser. Members can use **Appearance** at any time to switch again. The choice is stored only in that browser/device under `wds-design-gallery-v1`; it does not change another member's view.

Existing Prism users are migrated from `wds-design-choice-v1` and remain on Prism before the new gallery is shown. A previous Navy preference in `wds-appearance-navy-v1` is also recognized. The gallery is shown once after migration so those members can discover the two additional choices without silently changing their current appearance. `?design=classic` is an emergency session-only way to stay on Original if an experimental stylesheet has a problem.

All four modes preserve the original app's actual actions and data model. In particular, Presider remains the real Home / Library / Services / Insights song planner, and the native single prayer + single usher double-duty exception is unchanged.

## Designs

- **Original**: existing production interface.
- **Prism**: the reviewed calendar-first workspace from `feature/prism-opt-in-live`.
- **Navy & Cream**: warm cream surfaces, navy shell, burgundy selections, gold details and restrained motion across Schedule, My Duties, Presider and Manage.
- **Aurora**: the latest `prototype/aurora-workspace` design, adapted to the live runtime instead of its offline reference-data sandbox: desktop navigation rail, dynamic schedule workspace, dedicated My Duties/Manage layouts and the actual Presider song-planning workspaces.

Prism and Aurora keep their existing light/dark and motion controls. Navy uses its warm-light palette and respects the operating system's reduced-motion preference. The shared chooser itself has no domain actions.

## Safety boundaries

`build.mjs` stages only hosting files in `.hosting-gallery`. It injects presentation dispatchers around the **unchanged original business/domain functions**. Original Firebase configuration, auth flow, realtime listeners, writes, notification logic, calendar route, change requests, feature flags, Firestore rules and Cloud Functions remain authoritative.

The integration never creates a second schedule or copies production records. Switching appearances keeps the same document alive and preserves in-progress text/select values. The Presider module is not remounted just to change appearance.

GitHub Actions is QA-only and never deploys. Tests use mocked/isolated Firebase responses and block external traffic.

## Verification

The QA suite builds an isolated `.hosting-gallery`, mocks Firebase Auth and Firestore, blocks other network requests, and drives the real domain handlers at phone and desktop widths. It covers the site passcode and member login gates, forced PIN changes, exact four-design names, leader-only Manage visibility and department scope, alert badges, Presider Home with My Services and All Services without a Services tab, Prism month and day navigation, canonical choir-song rendering, and no-write appearance switches.

Run the focused browser suite with:

```sh
node design-gallery/test.mjs
```

## Build

```sh
node design-gallery/build.mjs
python3 -m http.server 8092 --directory .hosting-gallery
```

The resulting build is wired to the repository's real Firebase config. For safe automated editing tests, use the QA suite rather than pointing a local browser at production.

## Release

From an authenticated Firebase terminal in this repository:

```sh
# temporary channel; still reads real Firebase records
node design-gallery/release.mjs --preview

# publish the four-choice gallery at the existing site
node design-gallery/release.mjs --publish
```

The release script deploys **Hosting only**. Before production publication it accepts only a compatible Original, Prism, Navy & Cream, or prior Gallery release whose recorded upstream app hash matches this reviewed base. Otherwise it stops for reconciliation. It never deploys functions/rules or mutates Firestore data.

## Important

The isolated Aurora prototype's phrases such as "local preview", disabled sync and reference clock are removed in this live adapter. Aurora's layouts are reused, not its isolated storage or fake clock. Likewise, the Navy and Prism standalone choosers are not stacked together; this directory owns the single appearance preference and single popup.
