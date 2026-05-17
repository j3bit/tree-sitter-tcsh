# Repository Guidelines

## Project Structure & Module Organization

This repository is a Tree-sitter grammar for documented tcsh/csh surface syntax.

- `grammar.js` contains the authoritative grammar rules.
- `src/parser.c`, `src/grammar.json`, and `src/node-types.json` are generated artifacts committed for consumers.
- `test/corpus/surface_syntax.txt` holds Tree-sitter corpus fixtures and expected parse trees.
- `queries/` contains editor queries: `highlights.scm`, `locals.scm`, `tags.scm`, and `folds.scm`.
- `docs/` records reference provenance, scanner-gate policy, builtin coverage, and the release-blocking syntax coverage matrix.
- `examples/` contains parser smoke-test scripts.
- `scripts/` contains validation helpers used by npm scripts and CI.

## Build, Test, and Development Commands

Run commands from the repository root.

- `npm install` installs the pinned local `tree-sitter-cli`.
- `npm run generate` regenerates parser artifacts from `grammar.js`.
- `npm test` runs Tree-sitter corpus tests.
- `npm run check:coverage-matrix:release` verifies the syntax matrix is release-green.
- `npm run check:no-error` parses smoke examples and fails on `ERROR` or `MISSING` nodes.
- `npm run check:queries` validates all query files against `examples/sample.tcsh`.
- `npm run check` runs the full local/CI gate.
- `npm run parse -- examples/showcase.tcsh` prints a parse tree for manual inspection.

## Coding Style & Naming Conventions

Use CommonJS in `grammar.js` and keep grammar rule names lowercase with underscores, matching existing nodes such as `if_statement` and `variable_substitution`. Prefer explicit named nodes for syntax users need to query. Keep generated files synchronized: after grammar changes, run `npm run generate` and commit resulting `src/` updates. Query captures should follow Tree-sitter/Neovim conventions such as `@keyword`, `@function.builtin`, and `@fold`.

## Testing Guidelines

Every parser-readable syntax addition must be represented in `docs/syntax-coverage-matrix.md` and backed by a fixture or smoke example. Normal fixtures should have no unexpected `ERROR` or `MISSING` nodes. Runtime-only behavior may be documented as `unsupported-with-reason`; parser-readable syntax must not be left untested.

## Commit & Pull Request Guidelines

Use short imperative commit messages, e.g. `Add Neovim fold queries` or `Initial tree-sitter tcsh grammar`. PRs should describe what changed, why it matters, and list validation commands. Before opening a PR, run `npm run check`; include any known warnings, such as local Tree-sitter parser-directory warnings, only if commands still exit successfully.

## Agent-Specific Instructions

Do not copy third-party grammar code without updating `docs/reference-ledger.md` with license, commit, copied files, and rationale. Do not add an external scanner until `docs/scanner-design.md` admits the token and documents state, recovery, serialization, and tests.
