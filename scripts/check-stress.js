#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { performance } = require('perf_hooks');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-sitter-tcsh-stress-'));
const cli = path.resolve('node_modules/.bin/tree-sitter');

function write(name, content) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, content);
  return file;
}

function parse(file, edits = []) {
  const args = ['parse', '--grammar-path', '.', '--quiet', '--timeout', '10000000'];
  if (edits.length > 0) args.push('--edits', ...edits, '--');
  args.push(file);
  const started = performance.now();
  execFileSync(cli, args, { stdio: 'ignore' });
  return performance.now() - started;
}

function parseRecovering(file, edits) {
  const args = ['parse', '--grammar-path', '.', '--timeout', '10000000', '--edits', ...edits, '--', file];
  const result = spawnSync(cli, args, { encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.signal || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`incremental recovery failed with status ${result.status || result.signal}`);
  }
  if (!/\b(ERROR|MISSING)\b/.test(output)) {
    throw new Error('incremental malformed edit did not expose recovery');
  }
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

try {
  const longWord = write('long.tcsh', `echo ${'x'.repeat(5 * 1024 * 1024)}\n`);
  const manyArguments = write('arguments.tcsh', `echo ${Array(100000).fill('arg').join(' ')}\n`);
  const deep = write('deep.tcsh', `${'('.repeat(50000)}1${')'.repeat(50000)}\n`);
  parse(longWord);
  parse(manyArguments);
  parse(deep);

  const one = write('linear-1.tcsh', `echo ${'x'.repeat(1024 * 1024)}\n`);
  const two = write('linear-2.tcsh', `echo ${'x'.repeat(2 * 1024 * 1024)}\n`);
  parse(one);
  parse(two);
  const oneTimes = Array.from({ length: 5 }, () => parse(one));
  const twoTimes = Array.from({ length: 5 }, () => parse(two));
  if (median(twoTimes) > 3 * median(oneTimes)) {
    throw new Error(`2x median ${median(twoTimes).toFixed(1)}ms exceeds 3x ${median(oneTimes).toFixed(1)}ms`);
  }

  const incremental = write('incremental.tcsh', 'echo word\n');
  parse(incremental, ['0,5 4 changed']);
  const incrementalHeredoc = write('incremental-heredoc.tcsh', 'cat <<EOF\nbody\nEOF\n');
  parseRecovering(incrementalHeredoc, ['0,6 3 NEW']);
  const incrementalBlock = write('incremental-block.tcsh', 'if (1) then\n  echo body\nendif\n');
  parse(incrementalBlock, ['2,0 5 endif']);
  console.log('stress and incremental checks ok');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
