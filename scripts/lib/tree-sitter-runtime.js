#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const executable = process.platform === 'win32' ? 'tree-sitter.cmd' : 'tree-sitter';
const cli = path.join(repositoryRoot, 'node_modules', '.bin', executable);
const libraryEnvironmentVariable = 'TREE_SITTER_TCSH_LIB_PATH';

function libraryExtension() {
  if (process.platform === 'darwin') return '.dylib';
  if (process.platform === 'win32') return '.dll';
  return '.so';
}

function languageArgs(library) {
  return ['--lib-path', library, '--lang-name', 'tcsh'];
}

function parserEnvironment(library) {
  return { ...process.env, [libraryEnvironmentVariable]: library };
}

function withParserLibrary(callback) {
  const supplied = process.env[libraryEnvironmentVariable];
  if (supplied) {
    if (!path.isAbsolute(supplied) || !fs.existsSync(supplied)) {
      throw new Error(`${libraryEnvironmentVariable} must name an existing absolute file`);
    }
    return callback(supplied);
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-sitter-tcsh-runtime-'));
  const library = path.join(directory, `tcsh${libraryExtension()}`);
  try {
    console.log('building shared tcsh parser library');
    execFileSync(cli, ['build', '--output', library, repositoryRoot], {
      cwd: repositoryRoot,
      stdio: 'inherit',
    });
    return callback(library);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = {
  cli,
  languageArgs,
  parserEnvironment,
  repositoryRoot,
  withParserLibrary,
};
