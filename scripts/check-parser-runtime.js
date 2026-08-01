#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');
const {
  cli,
  languageArgs,
  parserEnvironment,
  repositoryRoot,
  withParserLibrary,
} = require('./lib/tree-sitter-runtime');

const release = process.argv.includes('--release');

function run(label, command, args, environment) {
  console.log(`running ${label}`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${label} terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`${label} failed with status ${result.status}`);
}

function runNode(label, script, args, environment) {
  run(label, process.execPath, [path.join(repositoryRoot, script), ...args], environment);
}

try {
  withParserLibrary((library) => {
    const environment = parserEnvironment(library);
    run('corpus tests', cli, ['test', ...languageArgs(library)], environment);
    runNode(
      'coverage matrix',
      'scripts/check-coverage-matrix.js',
      release ? ['--release'] : [],
      environment,
    );
    runNode('no-error smoke checks', 'scripts/check-no-error.js', [], environment);
    runNode('query syntax checks', 'scripts/check-queries.js', [], environment);
    runNode('query capture contracts', 'scripts/check-query-captures.js', [], environment);
    runNode('recovery contracts', 'scripts/check-recovery.js', [], environment);
    if (release) runNode('stress and incremental checks', 'scripts/check-stress.js', [], environment);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
