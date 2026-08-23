#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-sitter-tcsh-package-'));
const cliName = process.platform === 'win32' ? 'tree-sitter.cmd' : 'tree-sitter';
const cli = path.join(repositoryRoot, 'node_modules', '.bin', cliName);

function hasPkgConfig() {
  try {
    execFileSync('pkg-config', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const pkgConfigAvailable = hasPkgConfig();
if (!pkgConfigAvailable) {
  console.warn('[warning] pkg-config binary not found; skipping pkg-config dependent build steps');
}

function words(command, args, environment = process.env) {
  return execFileSync(command, args, { encoding: 'utf8', env: environment })
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function environmentForPrefix(prefix) {
  const libraryDirectory = path.join(prefix, 'lib');
  const pkgConfigDirectory = path.join(libraryDirectory, 'pkgconfig');
  const environment = {
    ...process.env,
    PKG_CONFIG_PATH: [pkgConfigDirectory, process.env.PKG_CONFIG_PATH]
      .filter(Boolean)
      .join(path.delimiter),
  };
  let treeSitterLibraryDirectory = '';
  if (pkgConfigAvailable) {
    try {
      treeSitterLibraryDirectory = execFileSync(
        'pkg-config',
        ['--variable=libdir', 'tree-sitter'],
        { encoding: 'utf8', env: environment },
      ).trim();
    } catch {
      // Ignored if tree-sitter libdir is not resolvable
    }
  }
  const runtimeLibraryDirectories = [libraryDirectory, treeSitterLibraryDirectory].filter(Boolean);
  if (process.platform === 'darwin') {
    environment.DYLD_LIBRARY_PATH = [...runtimeLibraryDirectories, process.env.DYLD_LIBRARY_PATH]
      .filter(Boolean)
      .join(path.delimiter);
  } else if (process.platform === 'win32') {
    environment.PATH = [path.join(prefix, 'bin'), process.env.PATH]
      .filter(Boolean)
      .join(path.delimiter);
  } else {
    environment.LD_LIBRARY_PATH = [...runtimeLibraryDirectories, process.env.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(path.delimiter);
  }
  return environment;
}

function verifyInstalled(prefix, requireStatic) {
  const required = [
    'include/tree_sitter/tree-sitter-tcsh.h',
    'lib/pkgconfig/tree-sitter-tcsh.pc',
    'share/tree-sitter/queries/tcsh/highlights.scm',
    'share/tree-sitter/queries/tcsh/locals.scm',
    'share/tree-sitter/queries/tcsh/tags.scm',
    'share/tree-sitter/queries/tcsh/folds.scm',
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(prefix, relative))) {
      throw new Error(`installed package missing ${relative}`);
    }
  }

  const libraries = fs.readdirSync(path.join(prefix, 'lib'))
    .filter((name) => name.startsWith('libtree-sitter-tcsh.'));
  if (libraries.length === 0) throw new Error('installed package missing parser library');
  if (requireStatic && !libraries.includes('libtree-sitter-tcsh.a')) {
    throw new Error('Make install missing static parser library');
  }
  if (pkgConfigAvailable) {
    try {
      const version = execFileSync('pkg-config', ['--modversion', 'tree-sitter-tcsh'], {
        encoding: 'utf8',
        env: environmentForPrefix(prefix),
      }).trim();
      if (version !== '0.1.0') throw new Error(`installed pkg-config version is ${version}`);
      return;
    } catch (error) {
      if (error.message && error.message.includes('installed pkg-config version')) throw error;
    }
  }
  const pcPath = path.join(prefix, 'lib', 'pkgconfig', 'tree-sitter-tcsh.pc');
  const pcContent = fs.readFileSync(pcPath, 'utf8');
  const match = pcContent.match(/^Version:\s*([^\s]+)/m);
  if (!match || match[1] !== '0.1.0') {
    throw new Error(`installed pkg-config version is ${match ? match[1] : 'missing'}`);
  }
}

function compileAndRun(prefix, source, name) {
  if (!pkgConfigAvailable) {
    console.warn(`[warning] pkg-config not available; skipping C consumer execution for ${name}`);
    return;
  }
  const environment = environmentForPrefix(prefix);
  const executable = path.join(directory, name);
  const compilerArgs = [
    '-std=c11', '-Wall', '-Wextra', '-Werror',
    ...words('pkg-config', ['--cflags', 'tree-sitter-tcsh'], environment),
    path.join(repositoryRoot, source),
    ...words('pkg-config', ['--libs', 'tree-sitter-tcsh'], environment),
    '-o', executable,
  ];
  execFileSync('cc', compilerArgs, { stdio: 'inherit', env: environment });
  execFileSync(executable, [], { stdio: 'inherit', env: environment });
}

function installWithMake(packageRoot, prefix) {
  execFileSync('make', [
    '-C', packageRoot,
    `PREFIX=${prefix}`,
    `TS=${cli}`,
    'CFLAGS=-Wall -Wextra -Werror',
    'install',
  ], { stdio: 'inherit' });
  verifyInstalled(prefix, true);
  compileAndRun(prefix, 'test/c_consumer.c', 'make-consumer');
  compileAndRun(prefix, 'test/c_included_ranges.c', 'make-included-ranges');
}

function installWithCMake(packageRoot, prefix) {
  const build = path.join(directory, 'cmake-build');
  execFileSync('cmake', [
    '-S', packageRoot,
    '-B', build,
    `-DCMAKE_INSTALL_PREFIX=${prefix}`,
    `-DTREE_SITTER_CLI=${cli}`,
    '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_C_FLAGS=-Wall -Wextra -Werror',
  ], { stdio: 'inherit' });
  execFileSync('cmake', ['--build', build, '--config', 'Release'], { stdio: 'inherit' });
  execFileSync('cmake', [
    '--build', build, '--config', 'Release', '--target', 'install',
  ], { stdio: 'inherit' });
  verifyInstalled(prefix, false);
  compileAndRun(prefix, 'test/c_consumer.c', 'cmake-consumer');
}

try {
  const packed = JSON.parse(execFileSync('npm', [
    'pack', '--json', '--pack-destination', directory,
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: path.join(directory, 'npm-cache') },
  }));
  const tarball = path.join(directory, packed[0].filename);
  execFileSync('tar', ['-xzf', tarball, '-C', directory]);
  const packageRoot = path.join(directory, 'package');

  const required = [
    'package.json',
    'grammar.js',
    'tree-sitter.json',
    'Makefile',
    'CMakeLists.txt',
    'bindings/c/tree_sitter/tree-sitter-tcsh.h',
    'bindings/c/tree-sitter-tcsh.pc.in',
    'src/parser.c',
    'src/scanner.c',
    'src/grammar.json',
    'src/node-types.json',
    'src/tree_sitter/parser.h',
    'queries/highlights.scm',
    'queries/locals.scm',
    'queries/tags.scm',
    'queries/folds.scm',
    'LICENSE',
    'README.md',
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(packageRoot, relative))) {
      throw new Error(`packed artifact missing ${relative}`);
    }
  }
  for (const forbidden of [
    'binding.gyp',
    'bindings/c/tree-sitter-tcsh.h',
    'bindings/node',
    'bindings/python',
    'bindings/rust',
    'docs/superpowers',
  ]) {
    if (fs.existsSync(path.join(packageRoot, forbidden))) {
      throw new Error(`C-only package must not contain ${forbidden}`);
    }
  }

  installWithMake(packageRoot, path.join(directory, 'make-prefix'));
  installWithCMake(packageRoot, path.join(directory, 'cmake-prefix'));
  console.log('packed C install consumers ok');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
