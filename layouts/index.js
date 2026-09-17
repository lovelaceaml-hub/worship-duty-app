import original from './original.js';
import prism from './prism.js';
import navy from './navy.js';
import aurora from './aurora.js';

export const layouts = { classic: original, prism, navy, aurora };
export const LAYOUT_IDS = ['classic', 'prism', 'navy', 'aurora'];

const REQUIRED_PHASES = ['locked', 'signin', 'forcedPin', 'loading', 'recovery', 'maintenance'];
const REQUIRED_SCREENS = [
  'schedule', 'duties', 'availability', 'reminders',
  'manageSchedule', 'attention', 'manageMembers', 'manageSettings',
  'songsMyService', 'songsHistory', 'invite',
  'appearance', 'unavailable', 'legacy'
];

/* Checks that all four layouts define every key the renderer contract
   requires, and every screen id shared/screens.js knows about. Missing keys
   are a defect, not a fallback: the gallery build runs this and fails on a
   gap, so a new feature cannot ship with a placement in only some
   appearances. */
export function verifyLayouts() {
  const problems = [];
  LAYOUT_IDS.forEach(id => {
    const layout = layouts[id];
    if (!layout) { problems.push(id + ': missing entirely'); return; }
    if (layout.id !== id) problems.push(id + ': id field is "' + layout.id + '"');
    if (!layout.name) problems.push(id + ': missing name');
    if (!layout.stylesheet) problems.push(id + ': missing stylesheet');
    if (typeof layout.shell !== 'function') problems.push(id + ': missing shell()');
    if (typeof layout.weekGroup !== 'function') problems.push(id + ': missing weekGroup()');
    if (typeof layout.serviceSummary !== 'function') problems.push(id + ': missing serviceSummary()');
    if (!layout.phase) problems.push(id + ': missing phase{}');
    else REQUIRED_PHASES.forEach(p => { if (typeof layout.phase[p] !== 'function') problems.push(id + ': missing phase.' + p + '()'); });
    if (!layout.screens) problems.push(id + ': missing screens{}');
    else REQUIRED_SCREENS.forEach(s => { if (typeof layout.screens[s] !== 'function') problems.push(id + ': missing screens.' + s + '()'); });
  });
  if (problems.length) throw new Error('Layout contract gap:\n' + problems.join('\n'));
  return true;
}
