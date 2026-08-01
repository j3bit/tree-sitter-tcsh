#!/usr/bin/env node

const { spawnSync } = require('child_process');
const {
  cli,
  languageArgs,
  repositoryRoot,
  withParserLibrary,
} = require('./lib/tree-sitter-runtime');

function fail(message) {
  console.error(`recovery check failed: ${message}`);
  process.exitCode = 1;
}

try {
  withParserLibrary((library) => {
    const result = spawnSync(cli, [
      'parse', ...languageArgs(library), '--no-ranges', 'examples/recovery.tcsh',
    ], { cwd: repositoryRoot, encoding: 'utf8' });
    const output = `${result.stdout || ''}${result.stderr || ''}`;

    if (result.error) throw result.error;
    if (result.signal || (result.status !== 0 && result.status !== 1)) {
      throw new Error(`recovery parse failed with status ${result.status || result.signal}`);
    }
    if (!output.includes('(ERROR')) fail('malformed constructs produced no visible ERROR node');
    if ((output.match(/\(while_statement/g) || []).length < 1) fail('missing nested block node');
    if ((output.match(/\(simple_command/g) || []).length < 5) {
      fail('later top-level commands were not recovered as separate commands');
    }
  });
} catch (error) {
  fail(error.message);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('recovery structure ok');
