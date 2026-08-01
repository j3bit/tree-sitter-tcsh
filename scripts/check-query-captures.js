#!/usr/bin/env node

const { spawnSync } = require('child_process');
const {
  cli,
  languageArgs,
  repositoryRoot,
  withParserLibrary,
} = require('./lib/tree-sitter-runtime');
const fixture = 'examples/query-contract.tcsh';

function captures(library, query) {
  const result = spawnSync(cli, [
    'query', ...languageArgs(library), '--captures', query, fixture,
  ], { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0) {
    throw new Error(`query capture failed: ${query}\n${result.stdout || ''}${result.stderr || ''}`);
  }
  const output = result.stdout || '';
  return [...output.matchAll(/capture:\s+\d+ - ([\w.]+), start: \((\d+), \d+\), end: \((\d+), \d+\), text: `([^`]*)`/g)]
    .map((match) => ({
      name: match[1],
      startRow: Number(match[2]),
      endRow: Number(match[3]),
      text: match[4],
    }));
}

function fail(message) {
  console.error(`query capture contract failed: ${message}`);
  process.exitCode = 1;
}

function texts(items, name) {
  return items.filter((item) => item.name === name).map((item) => item.text);
}

try {
  withParserLibrary((library) => {
    const highlights = captures(library, 'queries/highlights.scm');
    const builtins = texts(highlights, 'function.builtin');
    if (builtins.includes('cd')) fail('argument-position cd was captured as a builtin');
    if (builtins.filter((text) => text === 'echo').length !== 4) {
      fail('expected four command-position echo builtin captures');
    }
    if (texts(highlights, 'keyword').filter((text) => text === 'if').length !== 2) {
      fail('expected only the two if tokens to be captured as if keywords');
    }

    const locals = captures(library, 'queries/locals.scm');
    if (texts(locals, 'local.definition').join(',') !== 'x') {
      fail('expected exactly one local definition named x');
    }
    if (texts(locals, 'local.reference').join(',') !== 'x') {
      fail('expected exactly one local reference named x');
    }

    const tags = captures(library, 'queries/tags.scm');
    if (!texts(tags, 'definition.label').includes('loop:')) fail('missing label definition');
    if (!texts(tags, 'definition.function').includes("alias ll 'ls -l'")) fail('missing alias definition');
    if (!texts(tags, 'reference.label').includes('goto loop')) fail('missing goto reference');

    const folds = captures(library, 'queries/folds.scm').filter((item) => item.name === 'fold');
    if (folds.length !== 1 || folds[0].startRow !== 7 || folds[0].endRow !== 9) {
      fail('fold query must capture only the multiline if block');
    }
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
console.log('query capture contract ok');
