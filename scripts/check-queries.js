#!/usr/bin/env node

const { spawnSync } = require('child_process');
const {
  cli,
  languageArgs,
  repositoryRoot,
  withParserLibrary,
} = require('./lib/tree-sitter-runtime');

const queries = [
  'queries/highlights.scm',
  'queries/locals.scm',
  'queries/tags.scm',
  'queries/folds.scm',
];

try {
  withParserLibrary((library) => {
    for (const query of queries) {
      const result = spawnSync(cli, [
        'query', ...languageArgs(library), '--quiet', query, 'examples/sample.tcsh',
      ], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      });
      if (result.error) throw result.error;
      if (result.signal || result.status !== 0) {
        const output = `${result.stdout || ''}${result.stderr || ''}`;
        throw new Error(`query syntax failed: ${query}\n${output}`);
      }
      console.log(`query syntax ok: ${query}`);
    }
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
