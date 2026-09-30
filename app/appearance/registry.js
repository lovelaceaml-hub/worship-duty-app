/* The four appearances. Each is a stylesheet over the same screens, plus
   the Schedule layout it uses (screens/schedule). Prism and Aurora follow
   the device's dark mode. */
export const APPEARANCES = {
  classic: { name: 'Original', note: 'The list of services, in blue and white.', schedule: 'list', color: '#2383c6' },
  prism: { name: 'Prism', note: 'A month calendar. Follows dark mode.', schedule: 'calendar', color: '#3348e3' },
  navy: { name: 'Navy & Cream', note: 'A rail of service days, in navy and cream.', schedule: 'rail', color: '#23343f' },
  aurora: { name: 'Aurora', note: 'A strip of service days and a side menu. Follows dark mode.', schedule: 'strip', color: '#3d3f8f' }
};

export const DEFAULT_APPEARANCE = 'classic';

export function stylesheetFor(id) {
  return id === DEFAULT_APPEARANCE ? '' : 'styles/themes/' + id + '.css';
}
