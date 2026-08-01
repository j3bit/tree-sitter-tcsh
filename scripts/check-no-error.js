#!/usr/bin/env node

const { spawnSync } = require('child_process');
const {
  cli,
  languageArgs,
  repositoryRoot,
  withParserLibrary,
} = require('./lib/tree-sitter-runtime');

const defaultFiles = [
  'examples/sample.tcsh',
  'examples/showcase.tcsh',
  'examples/p2-boundaries.tcsh',
  'examples/heredoc.tcsh',
  'examples/p4-substitutions.tcsh',
  'examples/p5-statements.tcsh',
];
const files = process.argv.length > 2 ? process.argv.slice(2) : defaultFiles;

function parse(library, targets, jsonSummary) {
  const args = ['parse', ...languageArgs(library), '--no-ranges'];
  if (jsonSummary) args.push('--json-summary');
  args.push(...targets);
  return spawnSync(cli, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

function failed(result) {
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  return result.error || result.signal || result.status !== 0 || /\b(ERROR|MISSING)\b/.test(output);
}

try {
  withParserLibrary((library) => {
    const batch = parse(library, files, true);
    let summaries;
    try {
      summaries = JSON.parse(batch.stdout || '');
    } catch {
      summaries = null;
    }

    const batchFailed = failed(batch) || !Array.isArray(summaries?.parse_summaries) ||
      summaries.parse_summaries.length !== files.length ||
      summaries.parse_summaries.some((summary) => !summary.successful);

    if (!batchFailed) {
      for (const file of files) console.log(`parse smoke ok: ${file}`);
      return;
    }

    let anyFailed = false;
    for (const file of files) {
      const result = parse(library, [file], false);
      if (failed(result)) {
        console.error(`parse smoke failed: ${file}`);
        console.error(`${result.stdout || ''}\n${result.stderr || ''}`);
        anyFailed = true;
      } else {
        console.log(`parse smoke ok: ${file}`);
      }
    }
    if (anyFailed) process.exitCode = 1;
    else throw new Error('batched parse failed although all individual parses passed');
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
