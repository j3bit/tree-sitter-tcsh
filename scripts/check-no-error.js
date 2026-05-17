#!/usr/bin/env node
const { spawnSync } = require('child_process');
const files = process.argv.slice(2);
if (!files.length) throw new Error('usage: check-no-error.js <files...>');
let failed = false;
for (const file of files) {
  const r = spawnSync('npm', ['exec', '--', 'tree-sitter', 'parse', '--grammar-path', '.', file], { encoding: 'utf8' });
  const out = `${r.stdout}\n${r.stderr}`;
  if (r.status !== 0 || /\b(ERROR|MISSING)\b/.test(out)) {
    console.error(`parse smoke failed: ${file}`);
    console.error(out);
    failed = true;
  } else {
    console.log(`parse smoke ok: ${file}`);
  }
}
process.exit(failed ? 1 : 0);
