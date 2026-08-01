#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json')));
const treeSitterJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'tree-sitter.json')));

function fail(message) {
  console.error(`release metadata check failed: ${message}`);
  process.exitCode = 1;
}

function parseTag(argv) {
  if (argv.length === 0) {
    return process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : null;
  }
  if (argv.length !== 2 || argv[0] !== '--tag') {
    fail('usage: check-release-metadata.js [--tag vX.Y.Z]');
    return null;
  }
  return argv[1];
}

function requireFiles(relativePaths) {
  for (const relativePath of relativePaths) {
    if (!fs.existsSync(path.join(repositoryRoot, relativePath))) {
      fail(`missing required file ${relativePath}`);
    }
  }
}

function requireExactSet(actual, expected, label) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    fail(`${label} differs: expected ${expectedSorted.join(', ')}, got ${actualSorted.join(', ')}`);
  }
}

function verifyVersions(tag) {
  const version = packageJson.version;
  if (treeSitterJson.metadata?.version !== version) {
    fail('package.json and tree-sitter.json versions differ');
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`stable release version must be X.Y.Z, got ${version}`);
  }

  const makefile = fs.readFileSync(path.join(repositoryRoot, 'Makefile'), 'utf8');
  const makeVersion = makefile.match(/^VERSION := (.+)$/m)?.[1];
  if (makeVersion !== version) fail(`Makefile version is ${makeVersion || '(missing)'}`);

  const cmake = fs.readFileSync(path.join(repositoryRoot, 'CMakeLists.txt'), 'utf8');
  const cmakeVersion = cmake.match(/project\(tree-sitter-tcsh\s+VERSION "([^"]+)"/m)?.[1];
  if (cmakeVersion !== version) fail(`CMake version is ${cmakeVersion || '(missing)'}`);

  if (tag !== null && tag !== `v${version}`) {
    fail(`tag ${tag} does not match package version v${version}`);
  }
}

function verifyBindings() {
  const bindings = treeSitterJson.bindings || {};
  if (bindings.c !== true) fail('C binding must be enabled');
  for (const [name, enabled] of Object.entries(bindings)) {
    if (name !== 'c' && enabled !== false) fail(`undeclared ${name} binding is enabled`);
  }

  const bindingDirectories = fs.readdirSync(path.join(repositoryRoot, 'bindings'), {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  requireExactSet(bindingDirectories, ['c'], 'binding directories');
  if (fs.existsSync(path.join(repositoryRoot, 'binding.gyp'))) {
    fail('C-only release must not contain binding.gyp');
  }
  if (fs.existsSync(path.join(repositoryRoot, 'bindings/c/tree-sitter-tcsh.h'))) {
    fail('obsolete noncanonical C header still exists');
  }
}

function verifyPackageContract() {
  const expectedFiles = [
    'grammar.js',
    'tree-sitter.json',
    'Makefile',
    'CMakeLists.txt',
    'bindings/c/',
    'queries/',
    'src/',
    'docs/builtin-index.md',
    'docs/feature-plan.md',
    'docs/reference-ledger.md',
    'docs/release-checklist.md',
    'docs/scanner-design.md',
    'docs/syntax-coverage-matrix.md',
    'LICENSE',
    'README.md',
  ];
  requireExactSet(packageJson.files || [], expectedFiles, 'package files allowlist');
  for (const dependencyField of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (packageJson[dependencyField] && Object.keys(packageJson[dependencyField]).length > 0) {
      fail(`C-only package must not declare ${dependencyField}`);
    }
  }
  if (packageJson.main || packageJson.exports) {
    fail('C-only package must not expose a Node entry point');
  }
}

function verifyGeneratedArtifacts() {
  const generate = spawnSync('npm', ['run', 'generate'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  if (generate.error) throw generate.error;
  if (generate.signal || generate.status !== 0) {
    fail(`generation failed with status ${generate.status}`);
    return;
  }

  const diff = spawnSync('git', ['diff', '--exit-code', '--stat', 'HEAD', '--', 'src'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (diff.error) throw diff.error;
  if (diff.signal || diff.status !== 0) {
    console.error(diff.stdout || diff.stderr || 'generated src artifacts differ from HEAD');
    fail('generated artifacts are stale');
  }
}

try {
  const tag = parseTag(process.argv.slice(2));
  requireFiles([
    'grammar.js',
    'tree-sitter.json',
    'Makefile',
    'CMakeLists.txt',
    'bindings/c/tree_sitter/tree-sitter-tcsh.h',
    'bindings/c/tree-sitter-tcsh.pc.in',
    'queries/highlights.scm',
    'queries/locals.scm',
    'queries/tags.scm',
    'queries/folds.scm',
    'src/parser.c',
    'src/scanner.c',
    'src/grammar.json',
    'src/node-types.json',
    'LICENSE',
    'README.md',
  ]);
  verifyVersions(tag);
  verifyBindings();
  verifyPackageContract();
  verifyGeneratedArtifacts();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
console.log('release metadata ok');
