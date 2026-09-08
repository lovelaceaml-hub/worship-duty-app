import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = path.join(root, 'docs/runs/worship-refactor-20260907');
const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows = [];
for (const file of (await fs.readdir(path.join(run, 'lanes'))).filter(f => f.endsWith('.md')).sort()) {
  const source = await fs.readFile(path.join(run, 'lanes', file), 'utf8');
  const field = key => source.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'))?.[1] || '';
  if (!field('lane')) continue;
  rows.push('<tr><td>' + esc(field('lane')) + '</td><td>' + esc(field('title')) + '</td><td>' + esc(field('state')) + '</td><td>' + esc(field('model')) + '</td></tr>');
}
await fs.writeFile(path.join(run, 'board/index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Worship Service delivery board</title><style>body{font:15px/1.5 system-ui;background:#f3f6fa;color:#18324e;max-width:1050px;margin:32px auto;padding:16px}h1{font-size:26px}table{border-collapse:collapse;background:white;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #d4deea}th{background:#e3edf8}.table{overflow:auto}a{color:#0659a9}</style><h1>Worship Service delivery board</h1><p>Current lane records, generated ${esc(new Date().toISOString())}. Astra controls integration. Production delivery is authorized.</p><p>Only sanitized lane information appears here. Member records, credentials, tokens and provider payloads are excluded.</p><div class="table"><table><thead><tr><th>Lane</th><th>Work</th><th>Status</th><th>Model</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p><a href="https://lv-zion-duties.web.app">Worship Service</a></p></html>`);
console.log('Updated sanitized lane board from ' + rows.length + ' records.');
