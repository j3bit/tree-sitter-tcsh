#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const matrixPath = path.join('docs', 'syntax-coverage-matrix.md');
const text = fs.readFileSync(matrixPath, 'utf8');
const lines = text.split(/\r?\n/).filter(l => /^\|\s*TC-/.test(l));
const required = ['id','reference_version','section','syntax_family','manual_reference','syntax_item','compat','parser_node_rule','status','fixture_path','expected_node','coverage_owner','notes_reason'];
const headerLine = text.split(/\r?\n/).find(l => l.startsWith('| id |'));
if (!headerLine) throw new Error('missing matrix header');
const headers = headerLine.split('|').slice(1,-1).map(s => s.trim());
for (const h of required) if (!headers.includes(h)) throw new Error(`missing column ${h}`);
const statuses = new Set(['implemented','tested','unsupported-with-reason']);
const placeholders = /^(|TBD|unknown|n\/a)$/i;

const parseCache = new Map();
function parseSource(source, fixture) {
  const directory = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'tcsh-matrix-'));
  const tmp = require('node:path').join(directory, 'fixture.tcsh');
  fs.writeFileSync(tmp, source);
  const r = require('child_process').spawnSync('npm', ['exec', '--', 'tree-sitter', 'parse', '--grammar-path', '.', '--no-ranges', tmp], { encoding: 'utf8' });
  fs.rmSync(directory, { recursive: true, force: true });
  if (r.status !== 0 || /\b(ERROR|MISSING)\b/.test(r.stdout)) {
    throw new Error(`positive fixture section failed to parse in ${fixture}: ${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

function parseFixture(fixture) {
  if (parseCache.has(fixture)) return parseCache.get(fixture);
  const raw = fs.readFileSync(fixture, 'utf8');
  if (!fixture.includes('/corpus/')) {
    const tree = parseSource(raw, fixture);
    parseCache.set(fixture, tree);
    return tree;
  }

  const expectations = [];
  const re = /=+\n[^\n]+\n=+\n([\s\S]*?)\n---\n\n([\s\S]*?)(?=\n=+\n|$)/g;
  let match;
  while ((match = re.exec(raw))) {
    const source = match[1];
    const expected = match[2];
    expectations.push(expected);
    if (!/\b(ERROR|MISSING)\b/.test(expected)) parseSource(source, fixture);
  }
  if (expectations.length === 0) throw new Error(`no corpus sections found in ${fixture}`);
  const evidence = expectations.join('\n');
  parseCache.set(fixture, evidence);
  return evidence;
}

let errors = [];
let tested = 0, implemented = 0, unsupported = 0;
for (const line of lines) {
  const cells = line.split(/(?<!\\)\|/).slice(1,-1).map(s => s.trim().replace(/\\\|/g, '|'));
  const row = Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  if (!statuses.has(row.status)) errors.push(`${row.id}: invalid status ${row.status}`);
  if (row.status === 'tested') tested++;
  if (row.status === 'implemented') implemented++;
  if (row.status === 'unsupported-with-reason') unsupported++;
  if (row.status === 'unsupported-with-reason') {
    if (row.syntax_family !== 'runtime-only') errors.push(`${row.id}: unsupported-with-reason only allowed for runtime-only`);
    if (!row.notes_reason || placeholders.test(row.notes_reason)) errors.push(`${row.id}: unsupported row needs notes_reason`);
  } else {
    for (const col of ['parser_node_rule','fixture_path','expected_node']) {
      if (!row[col] || placeholders.test(row[col])) errors.push(`${row.id}: missing ${col}`);
    }
    if (row.status === 'tested' && !fs.existsSync(row.fixture_path)) errors.push(`${row.id}: fixture does not exist: ${row.fixture_path}`);
    if (row.status === 'tested' && fs.existsSync(row.fixture_path)) {
      try {
        const tree = parseFixture(row.fixture_path);
        if (!tree.includes(`(${row.expected_node}`)) errors.push(`${row.id}: expected node ${row.expected_node} not found in ${row.fixture_path}`);
      } catch (e) { errors.push(`${row.id}: ${e.message}`); }
    }
  }
  if (/TBD|unknown/i.test(line)) errors.push(`${row.id}: forbidden placeholder`);
}
if (process.argv.includes('--release') && implemented > 0) errors.push(`release check failed: ${implemented} parser-readable rows are implemented but not tested`);
if (lines.length < 80) errors.push(`expected substantial manual surface inventory, got ${lines.length}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`coverage matrix ok: ${lines.length} rows (${tested} tested, ${implemented} implemented, ${unsupported} runtime-only unsupported)`);
