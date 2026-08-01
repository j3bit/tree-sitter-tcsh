#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const {
  cli,
  languageArgs,
  repositoryRoot,
  withParserLibrary,
} = require('./lib/tree-sitter-runtime');
const fixture = 'examples/query-contract.tcsh';
const sourceLines = fs.readFileSync(fixture, 'utf8').split(/\r?\n/);

const ordinaryBuiltins = [
  ':', 'alloc', 'bg', 'bindkey', 'bs2cmd', 'builtins', 'bye', 'cd', 'chdir',
  'complete', 'dirs', 'echo', 'echotc', 'eval', 'exec', 'fg', 'filetest',
  'getspath', 'getxvers', 'glob', 'hashstat', 'history', 'hup', 'inlib', 'jobs',
  'kill', 'limit', 'log', 'login', 'logout', 'ls-F', 'migrate', 'newgrp', 'nice',
  'nohup', 'notify', 'popd', 'printenv', 'pushd', 'rehash', 'rootnode', 'sched',
  'setenv', 'setpath', 'setspath', 'settc', 'setty', 'setxvers', 'shift', 'stop',
  'suspend', 'telltc', 'termname', 'time', 'umask', 'unalias', 'uncomplete',
  'unhash',
  'universe', 'unlimit', 'unset', 'unsetenv', 'ver', 'wait', 'warp', 'where',
  'which',
];

const operatorCases = [
  ['if (1 || 0) echo binary', '||'],
  ['if (1 && 0) echo binary', '&&'],
  ['if (1 | 0) echo binary', '|'],
  ['if (1 ^ 0) echo binary', '^'],
  ['if (1 & 0) echo binary', '&'],
  ['if (1 == 0) echo binary', '=='],
  ['if (1 != 0) echo binary', '!='],
  ['if (1 =~ 0) echo binary', '=~'],
  ['if (1 !~ 0) echo binary', '!~'],
  ['if (1 < 0) echo binary', '<'],
  ['if (1 <= 0) echo binary', '<='],
  ['if (1 > 0) echo binary', '>'],
  ['if (1 >= 0) echo binary', '>='],
  ['if (1 << 0) echo binary', '<<'],
  ['if (1 >> 0) echo binary', '>>'],
  ['if (1 + 0) echo binary', '+'],
  ['if (1 - 0) echo binary', '-'],
  ['if (1 * 1) echo binary', '*'],
  ['if (1 / 1) echo binary', '/'],
  ['if (1 % 1) echo binary', '%'],
  ['if (! 0) echo unary', '!'],
  ['if (~ 0) echo unary', '~'],
  ['if (+ 1) echo unary', '+'],
  ['if (- 1) echo unary', '-'],
  ['@ assign_eq = 1', '='],
  ['@ assign_add += 1', '+='],
  ['@ assign_sub -= 1', '-='],
  ['@ assign_mul *= 1', '*='],
  ['@ assign_div /= 1', '/='],
  ['@ assign_mod %= 1', '%='],
  ['@ assign_left <<= 1', '<<='],
  ['@ assign_right >>= 1', '>>='],
  ['@ assign_and &= 1', '&='],
  ['@ assign_xor ^= 1', '^='],
  ['@ assign_or |= 1', '|='],
  ['@ increment++', '++'],
  ['@ decrement--', '--'],
  ['echo redirected >&! /dev/null', '>&!'],
  ['if (-e /tmp) echo filetest', '-e'],
  ['echo $path:h', ':h'],
  ['echo !!:h', ':h'],
];

function captures(library, query) {
  const result = spawnSync(cli, [
    'query', ...languageArgs(library), '--captures', query, fixture,
  ], { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0) {
    throw new Error(`query capture failed: ${query}\n${result.stdout || ''}${result.stderr || ''}`);
  }
  const output = result.stdout || '';
  return [...output.matchAll(/capture:\s+\d+ - ([\w.]+), start: \((\d+), (\d+)\), end: \((\d+), (\d+)\), text: `([^`]*)`/g)]
    .map((match) => ({
      name: match[1],
      startRow: Number(match[2]),
      startColumn: Number(match[3]),
      endRow: Number(match[4]),
      endColumn: Number(match[5]),
      text: match[6],
    }));
}

function fail(message) {
  console.error(`query capture contract failed: ${message}`);
  process.exitCode = 1;
}

function texts(items, name) {
  return items.filter((item) => item.name === name).map((item) => item.text);
}

function rowFor(line) {
  const row = sourceLines.indexOf(line);
  if (row < 0) fail(`fixture line is missing: ${line}`);
  return row;
}

function requireCapture(items, name, line, text) {
  const row = rowFor(line);
  const column = line.indexOf(text);
  const matches = items.filter((item) => item.name === name &&
    item.text === text && item.startRow === row && item.startColumn === column &&
    item.endRow === row && item.endColumn === column + text.length);
  if (matches.length !== 1) {
    fail(`expected one ${name} capture for ${JSON.stringify(text)} on row ${row}`);
  }
}

try {
  withParserLibrary((library) => {
    const highlights = captures(library, 'queries/highlights.scm');
    for (const builtin of ordinaryBuiltins) {
      requireCapture(highlights, 'function.builtin', builtin, builtin);
    }
    for (const [line, builtin] of [
      ['alias query_alias echo', 'alias'],
      ['set x = 1', 'set'],
      ['source /dev/null', 'source'],
      ['exit 0', 'exit'],
    ]) {
      requireCapture(highlights, 'function.builtin', line, builtin);
    }

    const negativeRow = rowFor('echo cd ls-F alloc set source if');
    const negativeCaptures = highlights.filter((item) =>
      item.name === 'function.builtin' && item.startRow === negativeRow);
    if (negativeCaptures.length !== 1 || negativeCaptures[0].text !== 'echo' ||
        negativeCaptures[0].startColumn !== 0) {
      fail('argument-position builtin names must not be captured');
    }
    const dynamicRow = rowFor('$cmd dynamic');
    if (highlights.some((item) => item.name === 'function.builtin' &&
        item.startRow === dynamicRow)) {
      fail('dynamic command names must not be captured as builtins');
    }
    if (highlights.some((item) => item.name === 'keyword' &&
        item.startRow === negativeRow)) {
      fail('argument-position if must not be captured as a keyword');
    }
    for (const [line, operator] of operatorCases) {
      requireCapture(highlights, 'operator', line, operator);
    }

    const locals = captures(library, 'queries/locals.scm');
    if (texts(locals, 'local.definition').filter((text) => text === 'x').length !== 1) {
      fail('expected one local definition named x');
    }
    if (texts(locals, 'local.reference').filter((text) => text === 'x').length !== 1) {
      fail('expected one local reference named x');
    }

    const tags = captures(library, 'queries/tags.scm');
    if (!texts(tags, 'definition.label').includes('loop:')) fail('missing label definition');
    if (!texts(tags, 'definition.function').includes('alias query_alias echo')) fail('missing alias definition');
    if (!texts(tags, 'reference.label').includes('goto loop')) fail('missing goto reference');

    const folds = captures(library, 'queries/folds.scm').filter((item) => item.name === 'fold');
    const foldStart = rowFor('if (1) then');
    if (folds.length !== 1 || folds[0].startRow !== foldStart ||
        folds[0].endRow !== foldStart + 2) {
      fail('fold query must capture only the multiline if block');
    }
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
console.log('query capture contract ok');
