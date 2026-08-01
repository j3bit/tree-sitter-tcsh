#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  cli,
  languageArgs,
  repositoryRoot,
  withParserLibrary,
} = require('./lib/tree-sitter-runtime');

const upstreamCommit = 'f773aba56aa128a38712987b1b8bdbc393d1e4d0';
const samplePaths = [
  'complete.tcsh',
  'dot.tcshrc',
  'dot.login',
  'cygwin/bindkey.tcsh',
  'cygwin/csh.cshrc',
  'cygwin/csh.login',
  'debian/csh.cshrc',
  'debian/csh.login',
  'win32/example.tcshrc',
];

function fail(message) {
  throw new Error(`upstream sample check failed: ${message}`);
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--upstream-root') {
    fail('usage: check-upstream-samples.js --upstream-root /absolute/path');
  }
  if (!path.isAbsolute(argv[1])) fail('--upstream-root must be an absolute path');
  return fs.realpathSync(argv[1]);
}

function verifyCommit(upstreamRoot) {
  const result = spawnSync('git', ['-C', upstreamRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.signal) fail(`git rev-parse terminated by ${result.signal}`);
  if (result.status !== 0) fail('upstream root must be a Git checkout');

  const actualCommit = result.stdout.trim();
  if (actualCommit !== upstreamCommit) {
    fail(`expected commit ${upstreamCommit}, got ${actualCommit || '(empty)'}`);
  }
}

function resolveSamples(upstreamRoot) {
  const missing = [];
  const samples = samplePaths.map((relativePath) => {
    const absolutePath = path.join(upstreamRoot, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      missing.push(relativePath);
    }
    return { relativePath, absolutePath };
  });
  if (missing.length > 0) fail(`missing files: ${missing.join(', ')}`);
  return samples;
}

function parseSamples(library, samples) {
  const result = spawnSync(cli, [
    'parse',
    ...languageArgs(library),
    '--no-ranges',
    '--json-summary',
    ...samples.map((sample) => sample.absolutePath),
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.signal) fail(`tree-sitter parse terminated by ${result.signal}`);

  let summary;
  try {
    const summaryStart = result.stdout.indexOf('{\n  "parse_summaries"');
    summary = JSON.parse(summaryStart >= 0 ? result.stdout.slice(summaryStart) : result.stdout);
  } catch {
    fail(`tree-sitter returned invalid JSON summary\n${result.stdout}\n${result.stderr}`);
  }

  const parseSummaries = summary?.parse_summaries;
  if (!Array.isArray(parseSummaries) || parseSummaries.length !== samples.length) {
    fail(`expected ${samples.length} parse summaries, got ${parseSummaries?.length ?? 0}`);
  }

  let failed = false;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const parseSummary = parseSummaries[index];
    if (parseSummary.successful) {
      console.log(`upstream sample ok: ${sample.relativePath}`);
    } else {
      console.error(`upstream sample failed: ${sample.relativePath}`);
      failed = true;
    }
  }

  if (result.status !== 0 && !failed) {
    fail(`tree-sitter parse failed with status ${result.status}\n${result.stderr}`);
  }
  if (failed) process.exitCode = 1;
}

try {
  const upstreamRoot = parseArguments(process.argv.slice(2));
  verifyCommit(upstreamRoot);
  const samples = resolveSamples(upstreamRoot);
  withParserLibrary((library) => parseSamples(library, samples));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
