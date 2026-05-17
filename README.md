# tree-sitter-tcsh

Tree-sitter grammar for documented tcsh/csh **surface syntax**.

## Scope

- Goal: parse every documented tcsh/csh parser-readable surface syntax item listed in `docs/syntax-coverage-matrix.md`.
- Non-goal: execute or validate runtime semantics such as alias expansion, variable values, glob filesystem results, job control, prompt rendering, or command side effects.
- Release gate: the initial release is not complete until every parser-readable matrix row is `tested`; `unsupported-with-reason` is allowed only for runtime-only semantics.

## Setup

```sh
npm install
npm run generate
npm test
npm run check
# optional focused C parser compile smoke
npm run check:c-compile
```

All scripts use the pinned local `tree-sitter-cli` dependency (`0.26.8`) through npm scripts; a global `tree-sitter` binary is not required for reproducible validation.

## Files

- `grammar.js` — grammar DSL.
- `src/parser.c`, `src/grammar.json`, `src/node-types.json` — generated parser artifacts.
- `binding.gyp` — C parser build scaffold; `npm run check:c-compile` verifies `src/parser.c` compiles. Node binding publication is intentionally disabled until a real Tree-sitter Language export is implemented.
- `test/corpus/surface_syntax.txt` — corpus snapshots.
- `docs/reference-ledger.md` — reference/provenance ledger.
- `docs/syntax-coverage-matrix.md` — syntax coverage release gate.
- `docs/scanner-design.md` — external scanner admission gate.
- `docs/builtin-index.md` — builtin coverage index.

## File detection

`tree-sitter.json` declares scope `source.tcsh`, extensions/filenames for tcsh/csh startup files, and shebang detection for `tcsh`/`csh`.

## Current limitations

The grammar is intentionally syntactic. The current matrix has no in-progress `implemented` rows; parser-readable release rows are `tested`, while runtime-only rows use `unsupported-with-reason`.


## Syntax node examples

Named syntax nodes include `simple_command`, `pipeline`, `redirection`, `variable_substitution`, `history_substitution`, `if_statement`, `foreach_statement`, `switch_statement`, `at_statement`, and builtin command nodes such as `alias_command` and `set_command`.

## Queries

`queries/highlights.scm` provides baseline highlighting for comments, keywords, operators, builtins, labels, strings, variables, substitutions, glob patterns, job specs, and file-test operators. `queries/folds.scm` provides Neovim-compatible `@fold` captures for block/control-flow and grouped command nodes. `queries/locals.scm` and `queries/tags.scm` provide starter editor integration queries.
