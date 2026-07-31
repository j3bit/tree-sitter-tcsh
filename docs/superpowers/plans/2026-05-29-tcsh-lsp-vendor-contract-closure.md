# Tcsh Lsp Vendor Contract Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining `tcsh-lsp` syntax vendor contract gaps in `tree-sitter-tcsh` after the initial switch/source fix.

**Architecture:** Keep syntax truth in `tree-sitter-tcsh`: add corpus coverage for every consumer-visible syntax fact, adjust `grammar.js` only where the parse tree does not expose the required fact, regenerate committed artifacts, then guard the exported node API with a small contract check. Downstream `tcsh-lsp` vendoring and analyzer assertions are a separate handoff after this repository is green.

**Tech Stack:** Tree-sitter grammar DSL in CommonJS, `tree-sitter-cli@0.26.8`, corpus fixtures in `test/corpus/surface_syntax.txt`, generated artifacts under `src/`, query files under `queries/`, Node.js validation scripts.

---

## Current State

- Already fixed on `main` at commit `9500494 Fix switch parsing and source targets`:
  - `switch_statement`, `case_clause`, `default_clause`, and `breaksw_statement` parse the `tcsh-lsp` `05_switch.tcsh` shape.
  - `reserved_argument_word` allows `echo default` inside command bodies without turning `default:` clause delimiters into generic command text.
  - `source_statement` exposes `command: (source_command)` and `target: (source_target)`.
  - `src/node-types.json` contains `source_statement`, `source_target`, and the `target` field.
- Targeted corpus checks passed with the real CLI option:
  - `npm exec -- tree-sitter test --include "switch body keyword arguments"`
  - `npm exec -- tree-sitter test --include "structured source targets"`
- The existing plan file uses `--filter`, but `tree-sitter-cli@0.26.8` requires `--include` for corpus-name filtering.
- Cross-repo no-ERROR smoke passed for `tcsh-lsp` valid, dialect, and source-resolution fixtures using:
  - `node scripts/check-no-error.js /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/valid/*.tcsh /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/dialect/*.csh /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/dialect/*.tcsh /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/source-resolution/*.tcsh`
- Remaining confirmed gap:
  - `source ${ROOT}/env.csh` preserves the `source_target` span, but the nested `variable_substitution` for `${ROOT}` currently has no `identifier` child. `tcsh-lsp` requires named or numeric variable references to be reachable from syntax, including braced forms.

## File Structure

- Modify: `grammar.js`
  - Refine `variable_substitution` so braced variable forms expose an `identifier` or `number` child when the name is syntactically identifiable.
- Modify: `test/corpus/surface_syntax.txt`
  - Add braced variable substitution corpus coverage.
  - Add source-target trailing syntax coverage for extra words and redirections.
- Modify: `queries/tags.scm`
  - Add a source target reference capture that stays aligned with `source_statement`.
- Create: `scripts/check-node-contract.js`
  - Assert the node and field names consumed by `tcsh-lsp` are present in `src/node-types.json`.
- Modify: `package.json`
  - Add `check:node-contract` and include it in `npm run check`.
- Modify: `docs/syntax-coverage-matrix.md`
  - Add or tighten rows for braced variable substitutions, source trailing syntax separation, and the node contract gate.
- Regenerate: `src/parser.c`, `src/grammar.json`, `src/node-types.json`
  - Produced by `npm run generate` after grammar changes.
- No direct edits: `/Users/jeongsaebit/Dev/tcsh-lsp/**`
  - Vendoring, analyzer extraction, and legacy-parser removal happen after this repository delivers a verified parser update.

## Success Criteria

- `npm run check` passes from `/Users/jeongsaebit/Dev/tree-sitter-tcsh`.
- `src/node-types.json` still exposes:
  - `simple_command`
  - `set_command`
  - `setenv_command`
  - `alias_command`
  - `foreach_statement` field `variable`
  - `label` field `name`
  - `goto_statement`
  - `variable_substitution` children `identifier` and `number`
  - `source_statement` fields `command` and `target`
  - `source_target`
- Corpus fixtures prove:
  - `echo ${ROOT}` has `variable_substitution (identifier)`.
  - `echo ${1}` has `variable_substitution (number)`.
  - `source ${ROOT}/env.csh` has `source_target` containing `variable_substitution (identifier)` plus `source_path_suffix`.
  - Extra source arguments and redirections remain children of `source_statement`, not part of the `target` field.
- `queries/*.scm` parse cleanly with `npm run check:queries`.
- Cross-repo fixture smoke still passes for `tcsh-lsp` valid, dialect, and source-resolution fixtures before vendoring.
- After vendoring in `tcsh-lsp`, these downstream commands pass:
  - `cargo test --test tree_sitter_fixture_regression -- --include-ignored --nocapture`
  - `./scripts/verify-legacy-syntax-removal.sh`

## Task 1: Add Braced Variable Corpus Coverage

**Files:**
- Modify: `test/corpus/surface_syntax.txt`

- [ ] **Step 1: Add a focused braced-variable corpus case**

Add this block near the existing substitution or word fixture:

```text
==================
braced variable substitution names
==================
echo ${ROOT}
echo ${1}
source ${ROOT}/env.csh
---

(source_file
  (command_list
    (and_or_command
      (pipeline
        (command
          (simple_command
            (builtin_command
              (echo_command))
            (word
              (variable_substitution
                (identifier))))))))
  (command_list
    (and_or_command
      (pipeline
        (command
          (simple_command
            (builtin_command
              (echo_command))
            (word
              (variable_substitution
                (number))))))))
  (command_list
    (and_or_command
      (pipeline
        (command
          (source_statement
            command: (source_command)
            target: (source_target
              (variable_substitution
                (identifier))
              (source_path_suffix))))))))
```

- [ ] **Step 2: Run the focused corpus test and verify the current gap**

Run:

```bash
npm exec -- tree-sitter test --include "braced variable substitution names"
```

Expected before Task 2: FAIL because `${ROOT}` and `${1}` currently parse as `variable_substitution` without the expected `identifier` or `number` child.

## Task 2: Expose Braced Variable Names in the Grammar

**Files:**
- Modify: `grammar.js`
- Regenerate: `src/parser.c`
- Regenerate: `src/grammar.json`
- Regenerate: `src/node-types.json`
- Test: `test/corpus/surface_syntax.txt`

- [ ] **Step 1: Add braced variable name helpers**

In `grammar.js`, add named helper rules near `variable_substitution`:

```js
    variable_substitution: $ => seq(
      '$',
      choice(
        $.identifier,
        $.number,
        $.special_parameter,
        seq('{', $.braced_variable_name, optional($.braced_variable_suffix), '}'),
      ),
      optional($.subscript),
      repeat($.substitution_modifier),
    ),
    braced_variable_name: $ => choice($.identifier, $.number, $.special_parameter),
    braced_variable_suffix: _ => token.immediate(/[^}\n]+/),
    special_parameter: _ => token(/[?#$!<]/),
```

Remove the old anonymous `token(/[?#$!<]/)` and `seq('{', token(/[^}\n]+/), '}')` alternatives from `variable_substitution`.

- [ ] **Step 2: Run generation**

Run:

```bash
npm run generate
```

Expected: generated artifacts update cleanly. `src/node-types.json` now includes `braced_variable_name`, `braced_variable_suffix`, and `special_parameter`.

- [ ] **Step 3: Run the focused braced-variable corpus**

Run:

```bash
npm exec -- tree-sitter test --include "braced variable substitution names"
```

Expected: PASS.

- [ ] **Step 4: Confirm existing substitution coverage still passes**

Run:

```bash
npm test
```

Expected: PASS.

## Task 3: Prove Source Target Boundaries

**Files:**
- Modify: `test/corpus/surface_syntax.txt`
- Modify only if the test fails: `grammar.js`
- Regenerate only if `grammar.js` changes: `src/parser.c`, `src/grammar.json`, `src/node-types.json`

- [ ] **Step 1: Add source trailing syntax corpus coverage**

Add this block near `structured source targets`:

```text
==================
source target excludes trailing syntax
==================
source ./env.csh --verbose >! /tmp/env.log
. "~/quoted env.csh" extra
---

(source_file
  (command_list
    (and_or_command
      (pipeline
        (command
          (source_statement
            command: (source_command)
            target: (source_target
              (word
                (bare_word)))
            (word
              (option_word))
            (redirection
              (redirect_operator)
              (word
                (bare_word))))))))
  (command_list
    (and_or_command
      (pipeline
        (command
          (source_statement
            command: (source_command)
            target: (source_target
              (word
                (double_quoted_string)))
            (word
              (identifier))))))))
```

- [ ] **Step 2: Run the focused source-boundary corpus**

Run:

```bash
npm exec -- tree-sitter test --include "source target excludes trailing syntax"
```

Expected with the current `source_statement` design: PASS. If it fails because trailing words or redirections are inside `source_target`, continue with Step 3.

- [ ] **Step 3: Keep `source_target` single-token or single-compound only if needed**

If Step 2 fails, keep `source_statement` shaped like this so only the first syntactic target is captured:

```js
    source_statement: $ => prec.right(seq(
      field('command', $.source_command),
      field('target', $.source_target),
      repeat(choice($.word, $.reserved_argument_word, $.redirection)),
    )),

    source_target: $ => choice(
      $.word,
      seq($.variable_substitution, repeat1($.source_path_suffix)),
      seq($.backtick_command_substitution, repeat1($.source_path_suffix)),
    ),
```

Then run:

```bash
npm run generate
npm exec -- tree-sitter test --include "source target excludes trailing syntax"
```

Expected: PASS.

## Task 4: Add a Node API Contract Check

**Files:**
- Create: `scripts/check-node-contract.js`
- Modify: `package.json`

- [ ] **Step 1: Create the contract script**

Create `scripts/check-node-contract.js`:

```js
#!/usr/bin/env node
const fs = require('fs');

const nodeTypes = JSON.parse(fs.readFileSync('src/node-types.json', 'utf8'));
const byType = new Map(nodeTypes.map((node) => [node.type, node]));

function fail(message) {
  console.error(`node contract failed: ${message}`);
  process.exitCode = 1;
}

function requireType(type) {
  if (!byType.has(type)) fail(`missing node type ${type}`);
  return byType.get(type) || {};
}

function requireField(type, field, childType) {
  const node = requireType(type);
  const fieldInfo = node.fields && node.fields[field];
  if (!fieldInfo) {
    fail(`${type} missing field ${field}`);
    return;
  }
  const hasChildType = (fieldInfo.types || []).some((entry) => entry.type === childType);
  if (!hasChildType) fail(`${type}.${field} missing child type ${childType}`);
  if (!fieldInfo.required) fail(`${type}.${field} must remain required`);
}

function requireChild(type, childType) {
  const node = requireType(type);
  const children = node.children && node.children.types;
  const hasChildType = (children || []).some((entry) => entry.type === childType);
  if (!hasChildType) fail(`${type} missing child type ${childType}`);
}

[
  'simple_command',
  'set_command',
  'setenv_command',
  'alias_command',
  'foreach_statement',
  'label',
  'goto_statement',
  'variable_substitution',
  'source_statement',
  'source_command',
  'source_target',
].forEach(requireType);

requireField('foreach_statement', 'variable', 'identifier');
requireField('label', 'name', 'identifier');
requireField('source_statement', 'command', 'source_command');
requireField('source_statement', 'target', 'source_target');

requireChild('variable_substitution', 'identifier');
requireChild('variable_substitution', 'number');
requireChild('source_target', 'variable_substitution');
requireChild('source_target', 'backtick_command_substitution');
requireChild('source_target', 'source_path_suffix');
requireChild('source_target', 'word');

if (process.exitCode) process.exit(process.exitCode);
console.log('node contract ok');
```

- [ ] **Step 2: Add package scripts**

In `package.json`, add:

```json
"check:node-contract": "node scripts/check-node-contract.js"
```

Update `check` so it runs after generation and before query validation:

```json
"check": "npm run generate && npm test && npm run check:coverage-matrix && npm run check:coverage-matrix:release && npm run check:node-contract && npm run check:no-error && npm run check:queries && npm run check:c-compile"
```

- [ ] **Step 3: Run the contract check**

Run:

```bash
npm run check:node-contract
```

Expected: `node contract ok`.

## Task 5: Align Tags Query With Source Entries

**Files:**
- Modify: `queries/tags.scm`

- [ ] **Step 1: Add source target reference capture**

Append this query to `queries/tags.scm`:

```scheme
(source_statement
  target: (source_target) @name) @reference.source
```

Keep the existing label and alias captures unchanged.

- [ ] **Step 2: Validate query parsing**

Run:

```bash
npm run check:queries
```

Expected: PASS.

## Task 6: Update Coverage Matrix

**Files:**
- Modify: `docs/syntax-coverage-matrix.md`

- [ ] **Step 1: Add braced variable coverage row**

Add a row near the existing variable substitution rows:

```text
| TC-WORD-006A | REF-MAN-DEBIAN tcsh 6.24.13-2.1 | Substitutions and words | word | REF-MAN-DEBIAN | braced variable substitution `${name}` and `${1}` | tcsh-specific | variable_substitution | tested | test/corpus/surface_syntax.txt | identifier/number children | parser | Braced forms expose the referenced name as a named child when syntactically identifiable. |
```

- [ ] **Step 2: Add source target boundary coverage row**

Add a row near `TC-BLT-012A`:

```text
| TC-BLT-012B | REF-MAN-DEBIAN tcsh 6.24.13-2.1 | Builtin commands | builtin | REF-MAN-DEBIAN | source trailing arguments and redirections | tcsh-specific | source_statement | tested | test/corpus/surface_syntax.txt | source_statement/source_target | parser | Extra source words and redirections remain outside the target field. |
```

- [ ] **Step 3: Run coverage checks**

Run:

```bash
npm run check:coverage-matrix
npm run check:coverage-matrix:release
```

Expected: both PASS.

## Task 7: Run Local and Cross-Repo Verification

**Files:**
- No new file edits expected.

- [ ] **Step 1: Run full local gate**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 2: Run tcsh-lsp fixture smoke from this grammar checkout**

Run:

```bash
node scripts/check-no-error.js /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/valid/*.tcsh /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/dialect/*.csh /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/dialect/*.tcsh /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/source-resolution/*.tcsh
```

Expected: every listed fixture prints `parse smoke ok`.

- [ ] **Step 3: Inspect changed files**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended grammar, corpus, generated artifact, query, coverage, package, and script files changed.

- [ ] **Step 4: Commit the tree-sitter-tcsh contract closure**

Run:

```bash
git add grammar.js test/corpus/surface_syntax.txt queries/tags.scm scripts/check-node-contract.js package.json docs/syntax-coverage-matrix.md src/parser.c src/grammar.json src/node-types.json
git commit -m "Tighten tcsh-lsp vendor syntax contract"
```

Expected: commit succeeds.

## Downstream Handoff

Do this only after Task 7 is green and committed in `tree-sitter-tcsh`.

- Vendor `tree-sitter-tcsh` into `/Users/jeongsaebit/Dev/tcsh-lsp/vendor/tree-sitter-tcsh`.
- Update `/Users/jeongsaebit/Dev/tcsh-lsp/vendor/tree-sitter-tcsh/PROVENANCE.md` with the source checkout path and commit.
- Update `tcsh-lsp` tree-sitter analyzer tests so they assert:
  - static source targets,
  - dynamic source targets from `$VAR/path`,
  - dynamic source targets from `${VAR}/path`,
  - backtick-derived source uncertainty,
  - variable references from braced substitutions.
- Run in `/Users/jeongsaebit/Dev/tcsh-lsp`:

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo test --test tree_sitter_fixture_regression -- --include-ignored --nocapture
./scripts/verify-legacy-syntax-removal.sh
```

Expected: all commands pass before deleting legacy syntax code.

## Self-Review Notes

- Spec coverage: the plan covers parser errors on valid fixtures, source target structure, dynamic/braced variable source targets, stable node fields, byte-range-sensitive named children, query alignment, generated artifacts, coverage docs, and downstream acceptance gates.
- Placeholder scan: every task names exact files, commands, and expected output.
- Type/name consistency: node names are consistent with the current grammar and `tcsh-lsp` requirements: `source_statement`, `source_command`, `source_target`, `source_path_suffix`, `variable_substitution`, `identifier`, and `number`.
- Boundary check: this plan does not patch `tcsh-lsp` with parser heuristics; downstream work only consumes the verified vendor parser.
