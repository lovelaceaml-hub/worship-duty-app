#!/usr/bin/env node
'use strict';

/*
 * Read-only local snapshot command.
 *
 * The command intentionally accepts a caller-supplied JSON snapshot only. It
 * does not initialize Firebase, contact a production service, or apply the
 * generated writes. An approved operator can export a read-only snapshot and
 * pass its absolute path here, then review the concrete writes and rollback
 * plan before any separately authorized application step.
 */

const fs = require('node:fs');
const path = require('node:path');
const { dryRunHistorySeed } = require('../department-seed.js');

function usage() {
  return [
    'Usage:',
    '  node functions/scripts/department-seed-dry-run.js --input /absolute/path/snapshot.json',
    '',
    'The snapshot JSON may contain identities, assignments or services, and profiles.',
    'This command is always read-only and never contacts Firebase or applies writes.'
  ].join('\n');
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? '' : args[index + 1] || '';
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--production') || args.includes('--write') || args.includes('--apply')) {
    throw new Error('Production access and write application are not supported by this command.');
  }
  const inputPath = argumentValue(args, '--input');
  if (!inputPath || args.some(arg => arg.startsWith('--') && arg !== '--input')) {
    throw new Error(usage());
  }
  const absolutePath = path.resolve(inputPath);
  const snapshot = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const result = dryRunHistorySeed(snapshot, {
    seededAt: snapshot.seededAt ?? 0,
    seededBy: snapshot.seededBy ?? 'history-seed'
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    process.stderr.write(String(error.message || error) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { main, usage };
