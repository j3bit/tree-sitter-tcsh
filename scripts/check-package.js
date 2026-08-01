#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-sitter-tcsh-package-'));

function words(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
}

function compileAndRun(packageRoot, directory, source, name) {
  const executable = path.join(directory, name);
  const compilerArgs = [
    '-std=c11', '-Wall', '-Wextra', '-Werror',
    ...words('pkg-config', ['--cflags', 'tree-sitter']),
    `-I${path.join(packageRoot, 'bindings/c')}`,
    `-I${path.join(packageRoot, 'src')}`,
    source,
    path.join(packageRoot, 'src/parser.c'),
    path.join(packageRoot, 'src/scanner.c'),
    ...words('pkg-config', ['--libs', 'tree-sitter']),
    '-o', executable,
  ];
  execFileSync('cc', compilerArgs, { stdio: 'inherit' });
  execFileSync(executable, [], { stdio: 'inherit' });
}

try {
  const packed = JSON.parse(execFileSync('npm', [
    'pack', '--json', '--pack-destination', directory,
  ], {
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: path.join(directory, 'npm-cache') },
  }));
  const tarball = path.join(directory, packed[0].filename);
  execFileSync('tar', ['-xzf', tarball, '-C', directory]);
  const packageRoot = path.join(directory, 'package');

  const required = [
    'bindings/c/tree-sitter-tcsh.h',
    'src/parser.c',
    'src/scanner.c',
    'src/tree_sitter/parser.h',
    'queries/highlights.scm',
    'queries/locals.scm',
    'queries/tags.scm',
    'queries/folds.scm',
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(packageRoot, relative))) {
      throw new Error(`packed artifact missing ${relative}`);
    }
  }
  if (fs.existsSync(path.join(packageRoot, 'binding.gyp'))) {
    throw new Error('C-only package must not contain binding.gyp');
  }

  compileAndRun(packageRoot, directory, 'test/c_consumer.c', 'consumer');
  compileAndRun(
    packageRoot,
    directory,
    'test/c_included_ranges.c',
    'included-ranges',
  );
  console.log('packed C consumers ok');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
