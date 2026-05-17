# tree-sitter-tcsh

[![CI](https://github.com/j3bit/tree-sitter-tcsh/actions/workflows/ci.yml/badge.svg)](https://github.com/j3bit/tree-sitter-tcsh/actions/workflows/ci.yml)

A Tree-sitter grammar for documented `tcsh`/`csh` surface syntax. The grammar is intended for editor tooling, syntax highlighting, code navigation, and structural parsing. It does **not** execute shell semantics.

## Features

- Parses documented parser-readable tcsh/csh surface syntax tracked in `docs/syntax-coverage-matrix.md`.
- Covers commands, lists, pipelines, redirections, quotes, substitutions, globs, expressions, control flow, labels, job specs, and syntactically relevant builtins.
- Provides editor queries for highlights, locals, tags, and Neovim folds.
- Commits generated parser artifacts for downstream consumers.
- Uses a release gate that requires parser-readable matrix rows to be tested.

## Scope and Non-goals

This project parses syntax only. Runtime behavior is intentionally out of scope, including alias expansion, variable values, history/glob expansion results, job-control side effects, prompt rendering, and command execution.

Rows marked `unsupported-with-reason` in the coverage matrix are allowed only for runtime-only semantics. Documented parser-readable syntax that cannot be parsed is treated as a release blocker.

## Installation

Install development dependencies from the repository root:

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
npm run check:c-compile                  # compile the generated C parser
npm run check                            # run the full CI/local validation gate
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

The coverage matrix is the source of truth for release readiness. Each parser-readable row must have a parser rule, fixture path, expected node, and `tested` status. The release check fails if any parser-readable row remains only `implemented`.

```sh
npm run check:coverage-matrix:release
```

## Scanner Policy

No external scanner is currently implemented. Scanner work must pass the documented gate in `docs/scanner-design.md`, including token order, DSL failure evidence, state/serialization policy, recovery behavior, binding integration, and tests.

## Contributing

Before opening a pull request:

1. Keep changes focused and update documentation when behavior changes.
2. Add or update corpus fixtures and coverage-matrix rows for new syntax.
3. Run `npm run check`.
4. Use short imperative commit messages, for example `Add Neovim fold queries`.

Do not copy third-party grammar code without recording license, commit, copied files, and rationale in `docs/reference-ledger.md`.

## License

MIT. See `LICENSE`.
