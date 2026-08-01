# tree-sitter-tcsh

[![CI](https://github.com/j3bit/tree-sitter-tcsh/actions/workflows/ci.yml/badge.svg)](https://github.com/j3bit/tree-sitter-tcsh/actions/workflows/ci.yml)

A Tree-sitter grammar for documented `tcsh`/`csh` surface syntax. The grammar is intended for editor tooling, syntax highlighting, code navigation, and structural parsing. It does **not** execute shell semantics.

## Features

- Parses documented parser-readable tcsh/csh surface syntax tracked in `docs/syntax-coverage-matrix.md`.
- Covers commands, lists, pipelines, redirections, quotes, substitutions, globs, expressions, control flow, labels, job specs, and syntactically relevant builtins.
- Provides editor queries for highlights, locals, tags, and Neovim folds.
- Commits generated parser artifacts for downstream consumers.
- Uses a release gate that requires parser-readable matrix rows to be tested.
- Ships a C-only parser contract with a public header; Node and other runtime
  bindings are not claimed by the initial release.

## Scope and Non-goals

This project parses syntax only. Runtime behavior is intentionally out of scope, including alias expansion, variable values, history/glob expansion results, job-control side effects, prompt rendering, and command execution.

Rows marked `unsupported-with-reason` in the coverage matrix are allowed only for runtime-only semantics. Documented parser-readable syntax that cannot be parsed is treated as a release blocker.

## Installation

The npm package is a source-artifact transport; it does not expose a Node
`require()` API. A C consumer needs a C11 compiler, Make or CMake, pkg-config,
and a compatible `libtree-sitter` development package that accepts language ABI
15.

From a repository checkout or unpacked npm tarball, install with Make:

```sh
make
make PREFIX=/desired/prefix install
```

Or install with CMake:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/desired/prefix
cmake --build build
cmake --build build --target install
```

Both paths install the canonical public header at
`include/tree_sitter/tree-sitter-tcsh.h`, a `tree-sitter-tcsh` library,
pkg-config metadata, and editor queries. Unix-like GCC and Clang builds are the
declared stable C scope; Windows/MSVC packaging is not yet release-tested.

Install JavaScript development dependencies only when changing or validating
the grammar:

```sh
npm install
```

The project pins `tree-sitter-cli` in `package.json`, so local validation does not require a global `tree-sitter` binary.

## Usage

Parse the included smoke examples:

```sh
npm run parse -- examples/sample.tcsh
npm run parse -- examples/showcase.tcsh
```

Use `examples/showcase.tcsh` to inspect a broad syntax tree containing control flow, substitutions, redirections, builtins, labels, and foldable blocks.

## Development

Common commands:

```sh
npm run generate                         # regenerate src/parser.c and metadata
npm test                                 # run Tree-sitter corpus tests
npm run check:coverage-matrix:release    # enforce release-green syntax coverage
npm run check:no-error                   # parse smoke examples without ERROR/MISSING
npm run check:queries                    # validate editor query files
npm run check:query-captures             # assert position-sensitive captures
npm run check:c-compile                  # compile the generated C parser
npm run check:recovery                   # verify malformed-input recovery
npm run check:stress                     # run large/incremental performance gates
npm run check:package                    # pack and run a fresh C consumer
npm run check                            # run the development CI/local gate
npm run check:release                    # require every parser-readable row to be release-green
```

After changing `grammar.js`, always run `npm run generate` and commit the updated generated files under `src/`.

## Repository Layout

```text
grammar.js                         Tree-sitter grammar DSL
src/                               generated parser artifacts and headers
test/corpus/surface_syntax.txt      corpus fixtures and expected trees
queries/                           highlights, locals, tags, and folds queries
docs/syntax-coverage-matrix.md      release-blocking syntax coverage matrix
docs/scanner-design.md              external scanner admission gate
docs/reference-ledger.md            reference and provenance policy
examples/                           parser smoke and showcase scripts
scripts/                            validation helpers
```

## Editor Queries

Query files live in `queries/`:

- `highlights.scm` for syntax highlighting captures.
- `locals.scm` for local definitions/references.
- `tags.scm` for labels and navigation-oriented captures.
- `folds.scm` for Neovim-compatible `@fold` captures on block/control-flow nodes.

## Syntax Coverage Policy

The coverage matrix is the source of truth for release readiness. Each parser-readable row must have a parser rule, fixture path, expected node, and `tested` status. The development gate accepts explicitly tracked `implemented` work; the release gate fails if any parser-readable row remains only `implemented`.

```sh
npm run check:release
```

## Scanner Policy

The external scanner implements literal-dollar/history/label/redirect boundaries,
structured backticks, `@` boundaries, and exact heredoc delimiter, opaque body,
and terminator attachment. Its token order, state serialization, recovery
behavior, and scanner tests are specified in `docs/scanner-design.md`.

## C consumer

Include `<tree_sitter/tree-sitter-tcsh.h>` and link the installed grammar plus
the compatible Tree-sitter runtime. The installed pkg-config file carries both
requirements:

```sh
cc -std=c11 consumer.c $(pkg-config --cflags --libs tree-sitter-tcsh) -o consumer
```

`npm run check:package` packs the source artifact, installs it independently
through Make and CMake, and compiles consumers using only the installed headers,
libraries, and pkg-config metadata. It also runs the real included-range C API
contract against the installed package.

## Contributing

Before opening a pull request:

1. Keep changes focused and update documentation when behavior changes.
2. Add or update corpus fixtures and coverage-matrix rows for new syntax.
3. Run `npm run check`; run `npm run check:release` before a release.
4. Use short imperative commit messages, for example `Add Neovim fold queries`.

Do not copy third-party grammar code without recording license, commit, copied files, and rationale in `docs/reference-ledger.md`.

## License

MIT. See `LICENSE`.
