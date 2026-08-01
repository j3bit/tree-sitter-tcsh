#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  cli,
  languageArgs,
  repositoryRoot,
  withParserLibrary,
} = require('./lib/tree-sitter-runtime');

const matrixPath = path.join('docs', 'syntax-coverage-matrix.md');
const text = fs.readFileSync(matrixPath, 'utf8');
const lines = text.split(/\r?\n/).filter((line) => /^\|\s*TC-/.test(line));
const required = [
  'id', 'reference_version', 'section', 'syntax_family', 'manual_reference',
  'syntax_item', 'compat', 'parser_node_rule', 'status', 'fixture_path',
  'expected_node', 'coverage_owner', 'notes_reason',
];
const headerLine = text.split(/\r?\n/).find((line) => line.startsWith('| id |'));
if (!headerLine) throw new Error('missing matrix header');
const headers = headerLine.split('|').slice(1, -1).map((value) => value.trim());
for (const header of required) {
  if (!headers.includes(header)) throw new Error(`missing column ${header}`);
}

const statuses = new Set(['implemented', 'tested', 'unsupported-with-reason']);
const placeholders = /^(|TBD|unknown|n\/a)$/i;
const fixtureCache = new Map();
const positiveSources = new Map();
const nonCorpusExpectations = [];
const errors = [];

function loadFixture(fixture) {
  if (fixtureCache.has(fixture)) return fixtureCache.get(fixture);
  const raw = fs.readFileSync(fixture, 'utf8');
  if (!fixture.includes('/corpus/')) {
    const info = { evidence: null, nonCorpus: true };
    positiveSources.set(`file:${fixture}`, { label: fixture, source: raw });
    fixtureCache.set(fixture, info);
    return info;
  }

  const expectations = [];
  const sectionPattern = /=+\n([^\n]+)\n=+\n([\s\S]*?)\n---\n\n([\s\S]*?)(?=\n=+\n|$)/g;
  let match;
  let section = 0;
  while ((match = sectionPattern.exec(raw))) {
    section += 1;
    const title = match[1].trim();
    const source = match[2];
    const expected = match[3];
    expectations.push(expected);
    if (!/\b(ERROR|MISSING)\b/.test(expected)) {
      positiveSources.set(`corpus:${fixture}:${section}`, {
        label: `${fixture} (${title})`,
        source,
      });
    }
  }
  if (expectations.length === 0) throw new Error(`no corpus sections found in ${fixture}`);

  const info = { evidence: expectations.join('\n'), nonCorpus: false };
  fixtureCache.set(fixture, info);
  return info;
}

function validatePositiveSources(library) {
  if (positiveSources.size === 0) return;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-sitter-tcsh-matrix-'));
  try {
    const labels = new Map();
    const files = [...positiveSources.values()].map((entry, index) => {
      const file = path.join(directory, `source-${index}.tcsh`);
      fs.writeFileSync(file, entry.source);
      labels.set(path.resolve(file), entry.label);
      return file;
    });
    const result = spawnSync(cli, [
      'parse', ...languageArgs(library), '--no-ranges', '--json-summary', ...files,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    if (result.error) throw result.error;
    if (result.signal) throw new Error(`positive fixture batch terminated by ${result.signal}`);

    let summary;
    try {
      summary = JSON.parse(result.stdout || '');
    } catch {
      throw new Error(`could not decode positive fixture parse summary: ${result.stderr || result.stdout}`);
    }
    if (!Array.isArray(summary.parse_summaries) || summary.parse_summaries.length !== files.length) {
      throw new Error(`expected ${files.length} positive parse summaries`);
    }
    for (const parsed of summary.parse_summaries) {
      if (!parsed.successful) {
        const label = labels.get(path.resolve(parsed.file)) || parsed.file;
        errors.push(`positive fixture section failed to parse in ${label}`);
      }
    }
    if (result.status !== 0 && summary.parse_summaries.every((parsed) => parsed.successful)) {
      throw new Error(`positive fixture batch failed with status ${result.status}: ${result.stderr}`);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function parseNonCorpusFixture(library, fixture) {
  const result = spawnSync(cli, [
    'parse', ...languageArgs(library), '--no-ranges', fixture,
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0 || /\b(ERROR|MISSING)\b/.test(output)) {
    throw new Error(`positive fixture failed to parse in ${fixture}: ${output}`);
  }
  return result.stdout;
}

let tested = 0;
let implemented = 0;
let unsupported = 0;
for (const line of lines) {
  const cells = line.split(/(?<!\\)\|/).slice(1, -1)
    .map((value) => value.trim().replace(/\\\|/g, '|'));
  const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  if (!statuses.has(row.status)) errors.push(`${row.id}: invalid status ${row.status}`);
  if (row.status === 'tested') tested += 1;
  if (row.status === 'implemented') implemented += 1;
  if (row.status === 'unsupported-with-reason') unsupported += 1;

  if (row.status === 'unsupported-with-reason') {
    if (row.syntax_family !== 'runtime-only') {
      errors.push(`${row.id}: unsupported-with-reason only allowed for runtime-only`);
    }
    if (!row.notes_reason || placeholders.test(row.notes_reason)) {
      errors.push(`${row.id}: unsupported row needs notes_reason`);
    }
  } else {
    for (const column of ['parser_node_rule', 'fixture_path', 'expected_node']) {
      if (!row[column] || placeholders.test(row[column])) errors.push(`${row.id}: missing ${column}`);
    }
    if (row.status === 'tested' && !fs.existsSync(row.fixture_path)) {
      errors.push(`${row.id}: fixture does not exist: ${row.fixture_path}`);
    }
    if (row.status === 'tested' && fs.existsSync(row.fixture_path)) {
      try {
        const fixture = loadFixture(row.fixture_path);
        if (fixture.nonCorpus) {
          nonCorpusExpectations.push({
            id: row.id,
            fixture: row.fixture_path,
            expectedNode: row.expected_node,
          });
        } else if (!fixture.evidence.includes(`(${row.expected_node}`)) {
          errors.push(`${row.id}: expected node ${row.expected_node} not found in ${row.fixture_path}`);
        }
      } catch (error) {
        errors.push(`${row.id}: ${error.message}`);
      }
    }
  }
  if (/TBD|unknown/i.test(line)) errors.push(`${row.id}: forbidden placeholder`);
}

if (process.argv.includes('--release') && implemented > 0) {
  errors.push(`release check failed: ${implemented} parser-readable rows are implemented but not tested`);
}
if (lines.length < 80) errors.push(`expected substantial manual surface inventory, got ${lines.length}`);

try {
  withParserLibrary((library) => {
    validatePositiveSources(library);
    const parsed = new Map();
    for (const expectation of nonCorpusExpectations) {
      if (!parsed.has(expectation.fixture)) {
        parsed.set(expectation.fixture, parseNonCorpusFixture(library, expectation.fixture));
      }
      if (!parsed.get(expectation.fixture).includes(`(${expectation.expectedNode}`)) {
        errors.push(`${expectation.id}: expected node ${expectation.expectedNode} not found in ${expectation.fixture}`);
      }
    }
  });
} catch (error) {
  errors.push(error.message);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`coverage matrix ok: ${lines.length} rows (${tested} tested, ${implemented} implemented, ${unsupported} runtime-only unsupported)`);
