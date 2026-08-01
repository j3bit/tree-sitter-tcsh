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

const timeout = '10000000';
const marker = 'incremental_marker';

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

function duration(output, label) {
  const match = output.match(new RegExp(`\\b${label}:\\s+([0-9.]+)\\s+ms`));
  if (!match) throw new Error(`tree-sitter timing output omitted ${label}: ${output}`);
  return Number(match[1]);
}

try {
  withParserLibrary((library) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-sitter-tcsh-stress-'));

    function write(name, content) {
      const file = path.join(directory, name);
      fs.writeFileSync(file, content);
      return file;
    }

    function runParse(file, extraArgs = []) {
      return spawnSync(cli, [
        'parse', ...languageArgs(library), '--timeout', timeout, ...extraArgs, file,
      ], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      });
    }

    function parseValid(file, edits = []) {
      const args = ['--json-summary'];
      if (edits.length > 0) args.push('--edits', ...edits, '--');
      const result = runParse(file, args);
      if (result.error) throw result.error;
      if (result.signal) throw new Error(`parse terminated by ${result.signal}: ${file}`);
      let summary;
      try {
        summary = JSON.parse(result.stdout || '');
      } catch {
        throw new Error(`could not decode parse summary for ${file}: ${result.stderr || result.stdout}`);
      }
      if (result.status !== 0 || !summary.parse_summaries?.[0]?.successful) {
        throw new Error(`valid stress source failed to parse: ${file}\n${result.stderr || result.stdout}`);
      }
    }

    function timedParse(file, edit) {
      const args = ['--quiet', '--time'];
      if (edit) args.push('--edits', edit, '--');
      const result = runParse(file, args);
      const output = `${result.stdout || ''}${result.stderr || ''}`;
      if (result.error) throw result.error;
      if (result.signal || result.status !== 0) {
        throw new Error(`timed parse failed for ${file}: ${output}`);
      }
      return duration(output, edit ? 'Edit' : 'Parse');
    }

    function parseRecovering(file, edits) {
      const result = runParse(file, ['--edits', ...edits, '--']);
      const output = `${result.stdout || ''}${result.stderr || ''}`;
      if (result.error) throw result.error;
      if (result.signal || (result.status !== 0 && result.status !== 1)) {
        throw new Error(`incremental recovery failed with status ${result.status || result.signal}`);
      }
      if (!/\b(ERROR|MISSING)\b/.test(output)) {
        throw new Error('incremental malformed edit did not expose recovery');
      }
    }

    function representativeSource(minimumBytes) {
      const examples = [
        'echo alpha beta gamma\n',
        'set value = "prefix-$USER"\n',
        '@ count = 1 + 2 * 3\n',
        'source ~/.tcshrc\n',
        'echo $value:q > output.log\n',
        'if ( $count > 0 ) echo ready\n',
        "alias ll 'ls -l'\n",
      ];
      const chunks = [];
      let bytes = 0;
      for (let index = 0; bytes < minimumBytes; index += 1) {
        const example = examples[index % examples.length];
        const chunk = `${example}echo ${marker}\n`;
        chunks.push(chunk);
        bytes += Buffer.byteLength(chunk);
      }
      return chunks.join('');
    }

    function middleMarkerEdit(source) {
      const middle = Math.floor(source.length / 2);
      let markerStart = source.indexOf(marker, middle);
      if (markerStart === -1) markerStart = source.lastIndexOf(marker, middle);
      if (markerStart === -1) throw new Error('representative source has no incremental marker');
      const position = markerStart + marker.length - 1;
      const prefix = source.slice(0, position);
      const row = (prefix.match(/\n/g) || []).length;
      const lastNewline = prefix.lastIndexOf('\n');
      const column = position - lastNewline - 1;
      return `${row},${column} 1 s`;
    }

    try {
      const longWord = write('long.tcsh', `echo ${'x'.repeat(5 * 1024 * 1024)}\n`);
      const manyArguments = write('arguments.tcsh', `echo ${Array(100000).fill('arg').join(' ')}\n`);
      const deep = write('deep.tcsh', `${'('.repeat(50000)}1${')'.repeat(50000)}\n`);
      parseValid(longWord);
      parseValid(manyArguments);
      parseValid(deep);

      const linearOne = write('linear-1.tcsh', `echo ${'x'.repeat(1024 * 1024)}\n`);
      const linearTwo = write('linear-2.tcsh', `echo ${'x'.repeat(2 * 1024 * 1024)}\n`);
      parseValid(linearOne);
      parseValid(linearTwo);
      timedParse(linearOne);
      timedParse(linearTwo);
      const linearOneTimes = Array.from({ length: 5 }, () => timedParse(linearOne));
      const linearTwoTimes = Array.from({ length: 5 }, () => timedParse(linearTwo));
      const linearOneMedian = median(linearOneTimes);
      const linearTwoMedian = median(linearTwoTimes);
      const linearRatio = linearTwoMedian / linearOneMedian;
      if (linearRatio > 3) {
        throw new Error(
          `2 MiB/1 MiB ratio ${linearRatio.toFixed(3)} exceeds 3.0 ` +
          `(${linearTwoMedian.toFixed(2)}ms/${linearOneMedian.toFixed(2)}ms)`,
        );
      }

      const representativeSourceText = representativeSource(1024 * 1024);
      const representative = write('representative.tcsh', representativeSourceText);
      const edit = middleMarkerEdit(representativeSourceText);
      parseValid(representative);
      parseValid(representative, [edit]);
      timedParse(representative);
      timedParse(representative, edit);
      const representativeTimes = Array.from({ length: 7 }, () => timedParse(representative));
      const editTimes = Array.from({ length: 7 }, () => timedParse(representative, edit));
      const representativeMedian = median(representativeTimes);
      const editMedian = median(editTimes);
      const incrementalRatio = editMedian / representativeMedian;
      if (incrementalRatio > 0.30) {
        throw new Error(
          `incremental/full ratio ${incrementalRatio.toFixed(3)} exceeds 0.30 ` +
          `(${editMedian.toFixed(2)}ms/${representativeMedian.toFixed(2)}ms)`,
        );
      }

      const incremental = write('incremental.tcsh', 'echo word\n');
      parseValid(incremental, ['0,5 4 changed']);
      const incrementalHeredoc = write('incremental-heredoc.tcsh', 'cat <<EOF\nbody\nEOF\n');
      parseRecovering(incrementalHeredoc, ['0,6 3 NEW']);
      const incrementalBlock = write('incremental-block.tcsh', 'if (1) then\n  echo body\nendif\n');
      parseValid(incrementalBlock, ['2,0 5 endif']);

      console.log(
        `stress and incremental checks ok: linear=${linearOneMedian.toFixed(2)}ms ` +
        `2x=${linearTwoMedian.toFixed(2)}ms (${linearRatio.toFixed(3)}x) ` +
        `representative=${representativeMedian.toFixed(2)}ms ` +
        `edit=${editMedian.toFixed(2)}ms (${incrementalRatio.toFixed(3)}x)`,
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
