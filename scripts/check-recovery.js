#!/usr/bin/env node

const { spawnSync } = require('child_process');

const result = spawnSync('node_modules/.bin/tree-sitter', [
  'parse', '--grammar-path', '.', '--no-ranges', 'examples/recovery.tcsh',
], { encoding: 'utf8' });
const output = `${result.stdout || ''}${result.stderr || ''}`;

function fail(message) {
  console.error(`recovery check failed: ${message}`);
  process.exitCode = 1;
}

if (!output.includes('(ERROR')) fail('malformed constructs produced no visible ERROR node');
if ((output.match(/\(while_statement/g) || []).length < 1) fail('missing nested block node');
if ((output.match(/\(simple_command/g) || []).length < 5) {
  fail('later top-level commands were not recovered as separate commands');
}

if (process.exitCode) process.exit(process.exitCode);
console.log('recovery structure ok');
