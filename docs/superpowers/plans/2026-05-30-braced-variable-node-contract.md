# Braced Variable Node Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make braced variable substitutions such as `${foo}` and `${ROOT}/env.csh` expose parser-owned variable-name nodes that `tcsh-lsp` can consume without string slicing.

**Architecture:** Keep the syntax fix in `tree-sitter-tcsh`, because `tcsh-lsp` treats this parser as the syntax source of truth. Add failing corpus and contract checks first, then minimally refine `variable_substitution` so braced forms produce the same named child shape as `$foo` and `$1`. Preserve the already-fixed `switch_statement`, `source_statement`, and `source_target` contracts while regenerating committed Tree-sitter artifacts.

**Tech Stack:** Tree-sitter grammar DSL in CommonJS, `tree-sitter-cli@0.26.8`, corpus fixtures in `test/corpus/surface_syntax.txt`, generated artifacts under `src/`, Node.js validation scripts, downstream Rust tests in `tcsh-lsp` after vendoring.

---

## Current State From Requirements and Code

The downstream requirement file is `/Users/jeongsaebit/Dev/tcsh-lsp/docs/tree-sitter-tcsh-requirements.md`. It says the previous `switch` and `source` blockers are no longer the active blocker, and the remaining gate is braced variable substitution node shape:

- `${foo}` must expose `foo` as a named parser node.
- The node range must cover only `foo`, not `$`, `{`, `}`, or the full `${foo}` span.
- The same must work inside words and source targets, especially `source ${ROOT}/env.csh`.
- Numeric and special variables must not regress.

The current `tree-sitter-tcsh` codebase only partially satisfies that contract:

- `grammar.js` already has `source_statement`, `source_target`, and `source_path_suffix`.
- `src/node-types.json` already exposes `source_statement.target: source_target`.
- `grammar.js` still defines braced variables as `seq('{', token(/[^}\n]+/), '}')` inside `variable_substitution`.
- Because that braced content is anonymous token text, `${foo}` has no `identifier` child and `${1}` has no `number` child.
- `tcsh-lsp/src/semantics/tree_sitter.rs` currently records variable substitutions by looking for a direct named child of kind `identifier` or `number` under `variable_substitution`; wrapper nodes would not satisfy this gate without downstream analyzer changes.

Assumption for this plan: do not edit `tcsh-lsp` in this implementation pass. The downstream acceptance commands run only after the fixed parser is vendored.

## File Structure

- Modify: `grammar.js`
  - Refine `variable_substitution` so braced identifier and numeric forms expose direct named children under `variable_substitution`.
  - Add `special_parameter` for `$?`, `$$`, `$!`, `$<`, and related existing special forms without turning them into anonymous grammar fragments.
  - Keep any helper used only for braced names inline so it does not create a visible wrapper node.
- Modify: `test/corpus/surface_syntax.txt`
  - Add braced variable fixtures for `${ROOT}`, `${1}`, special forms, and `${ROOT}` inside `source_target`.
  - Update the existing `$?prompt` expectation after `special_parameter` becomes a named node.
  - Add or preserve source target boundary coverage proving only the first source argument is the `target`.
- Create: `scripts/check-node-contract.js`
  - Guard the exported node API consumed by `tcsh-lsp`, especially `variable_substitution` children and `source_statement` fields.
- Modify: `package.json`
  - Add `check:node-contract`.
  - Include it in `npm run check`.
- Modify: `docs/syntax-coverage-matrix.md`
  - Add coverage rows for braced variable-name exposure and source-target boundary preservation.
- Regenerate: `src/parser.c`
- Regenerate: `src/grammar.json`
- Regenerate: `src/node-types.json`
- No direct edits: `/Users/jeongsaebit/Dev/tcsh-lsp/**`
  - Vendoring and Rust test execution are downstream handoff work.

## Success Criteria

- `npm exec -- tree-sitter test --include "braced variable substitution names"` passes.
- `npm exec -- tree-sitter test --include "source target excludes trailing syntax"` passes.
- `npm run check:node-contract` prints `node contract ok`.
- `npm run check` passes from `/Users/jeongsaebit/Dev/tree-sitter-tcsh`.
- `src/node-types.json` shows `variable_substitution` can have direct `identifier`, `number`, `special_parameter`, `subscript`, and `substitution_modifier` children.
- `source ${ROOT}/env.csh` parses as `source_statement` with `target: (source_target (variable_substitution (identifier)) (source_path_suffix))`.
- Existing `$foo`, `$1`, `$?prompt`, `$argv[1-2]`, `switch`, and `source` corpus behavior does not regress.
- After vendoring into `tcsh-lsp`, these downstream commands are expected to pass:

```sh
cargo test --test tree_sitter_fixture_regression -- --include-ignored --nocapture
cargo test --test tree_sitter_analysis -- --nocapture
cargo test features::edits::tests::prepare_and_rename_variable_use_without_replacing_dollar_prefix -- --nocapture
```

## Task 1: Add Failing Braced Variable Corpus Coverage

**Files:**
- Modify: `test/corpus/surface_syntax.txt`

- [ ] **Step 1: Add a braced-variable corpus fixture near the existing substitution fixture**

Insert this block after `quoting substitutions and patterns` or another nearby word/substitution fixture:

```text
==================
braced variable substitution names
==================
echo ${ROOT}
echo ${1}
echo ${?prompt}
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
          (simple_command
            (builtin_command
              (echo_command))
            (word
              (variable_substitution
                (special_parameter)
                (identifier))))))))
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

- [ ] **Step 2: Run the focused corpus test to verify the current gap**

Run:

```sh
npm exec -- tree-sitter test --include "braced variable substitution names"
```

Expected before grammar changes: FAIL. `${ROOT}` and `${1}` currently parse as `variable_substitution` without the expected `identifier` or `number` child.

- [ ] **Step 3: After Task 2, update the existing `$?prompt` expectation**

In the existing `quoting substitutions and patterns` fixture, change the `$?prompt` expected tree from:

```text
            (word
              (variable_substitution))
```

to:

```text
            (word
              (variable_substitution
                (special_parameter)
                (identifier)))
```

Expected: the existing fixture stays aligned with the new named `special_parameter` node instead of silently treating `$?prompt` as anonymous substitution text.

## Task 2: Expose Braced Variable Names Without Wrapper Nodes

**Files:**
- Modify: `grammar.js`
- Regenerate: `src/parser.c`
- Regenerate: `src/grammar.json`
- Regenerate: `src/node-types.json`
- Test: `test/corpus/surface_syntax.txt`

- [ ] **Step 1: Add an inline helper for braced variable names**

In `grammar.js`, add an `inline` property at the top level of the grammar object, next to `extras` and `conflicts`:

```js
  inline: $ => [
    $.braced_variable_name,
  ],
```

Expected effect: `braced_variable_name` can keep the grammar readable, but it will not appear as a visible wrapper node in the parse tree or `src/node-types.json`.

- [ ] **Step 2: Replace the current `variable_substitution` rule**

Replace the current one-line rule:

```js
    variable_substitution: $ => seq('$', choice($.identifier, $.number, token(/[?#$!<]/), seq('{', token(/[^}\n]+/), '}')), optional($.subscript), repeat($.substitution_modifier)),
```

with:

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

    braced_variable_name: $ => choice(
      $.identifier,
      $.number,
      seq($.special_parameter, optional($.identifier)),
    ),

    braced_variable_suffix: _ => token.immediate(/[^}\n]+/),

    special_parameter: _ => token(/[?#$!<]/),
```

This keeps `${ROOT}` as `variable_substitution -> identifier`, `${1}` as `variable_substitution -> number`, and `${?prompt}` as `variable_substitution -> special_parameter identifier`. The suffix remains available for braced forms that include tcsh modifiers or other documented suffix text, without blocking the basic parser-owned name contract.

- [ ] **Step 3: Generate parser artifacts**

Run:

```sh
npm run generate
```

Expected: PASS. `src/parser.c`, `src/grammar.json`, and `src/node-types.json` update.

- [ ] **Step 4: Run the focused braced-variable corpus test**

Run:

```sh
npm exec -- tree-sitter test --include "braced variable substitution names"
```

Expected: PASS.

- [ ] **Step 5: Run all corpus tests**

Run:

```sh
npm test
```

Expected: PASS.

## Task 3: Prove Source Target Boundaries Still Hold

**Files:**
- Modify: `test/corpus/surface_syntax.txt`
- Modify only if the new fixture fails: `grammar.js`
- Regenerate only if `grammar.js` changes: `src/parser.c`, `src/grammar.json`, `src/node-types.json`

- [ ] **Step 1: Add a source boundary corpus fixture near `structured source targets`**

Insert:

```text
==================
source target excludes trailing syntax
==================
source ./env.csh --verbose >! /tmp/env.log
. "~/quoted env.csh" extra
source ${ROOT}/env.csh >& /tmp/source.log
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
              (identifier)))))))
  (command_list
    (and_or_command
      (pipeline
        (command
          (source_statement
            command: (source_command)
            target: (source_target
              (variable_substitution
                (identifier))
              (source_path_suffix))
            (redirection
              (redirect_operator)
              (word
                (bare_word))))))))
```

- [ ] **Step 2: Run the focused source-boundary corpus test**

Run:

```sh
npm exec -- tree-sitter test --include "source target excludes trailing syntax"
```

Expected: PASS. If it fails, inspect whether trailing words or redirections were absorbed into `source_target`. Keep `source_target` limited to one syntactic target and keep extras in `source_statement`:

```js
    source_statement: $ => prec.right(seq(
      field('command', $.source_command),
      field('target', $.source_target),
      repeat(choice($.word, $.reserved_argument_word, $.redirection)),
    )),
```

## Task 4: Add a Node API Contract Check

**Files:**
- Create: `scripts/check-node-contract.js`
- Modify: `package.json`

- [ ] **Step 1: Create `scripts/check-node-contract.js`**

Create the file with:

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
requireChild('variable_substitution', 'special_parameter');
requireChild('source_target', 'variable_substitution');
requireChild('source_target', 'backtick_command_substitution');
requireChild('source_target', 'source_path_suffix');
requireChild('source_target', 'word');

if (process.exitCode) process.exit(process.exitCode);
console.log('node contract ok');
```

- [ ] **Step 2: Add npm script entries**

In `package.json`, add:

```json
"check:node-contract": "node scripts/check-node-contract.js"
```

Update `check` to:

```json
"check": "npm run generate && npm test && npm run check:coverage-matrix && npm run check:coverage-matrix:release && npm run check:node-contract && npm run check:no-error && npm run check:queries && npm run check:c-compile"
```

- [ ] **Step 3: Run the contract check**

Run:

```sh
npm run check:node-contract
```

Expected: `node contract ok`.

## Task 5: Update Coverage Matrix

**Files:**
- Modify: `docs/syntax-coverage-matrix.md`

- [ ] **Step 1: Add braced variable coverage row near existing `TC-WORD-006` rows**

Add:

```text
| TC-WORD-006A | REF-MAN-DEBIAN tcsh 6.24.13-2.1 | Substitutions and words | word | REF-MAN-DEBIAN | braced variable substitution `${name}`, `${1}`, and `${?name}` | tcsh-specific | variable_substitution | tested | test/corpus/surface_syntax.txt | identifier/number/special_parameter children | parser | Braced forms expose parser-owned referenced-name nodes for LSP rename and reference analysis. |
```

- [ ] **Step 2: Add source target boundary coverage row near `TC-BLT-012A`**

Add:

```text
| TC-BLT-012B | REF-MAN-DEBIAN tcsh 6.24.13-2.1 | Builtin commands | builtin | REF-MAN-DEBIAN | source trailing arguments and redirections | tcsh-specific | source_statement | tested | test/corpus/surface_syntax.txt | source_statement/source_target | parser | Extra source words and redirections remain outside the target field. |
```

- [ ] **Step 3: Run coverage checks**

Run:

```sh
npm run check:coverage-matrix
npm run check:coverage-matrix:release
```

Expected: both PASS.

## Task 6: Run Local and Cross-Repo Verification

**Files:**
- No new file edits expected.

- [ ] **Step 1: Run the full local gate**

Run:

```sh
npm run check
```

Expected: PASS. If Tree-sitter reports warnings about parser directories but exits zero, record them as non-blocking.

- [ ] **Step 2: Run cross-repo parser smoke against tcsh-lsp fixtures**

Run from `/Users/jeongsaebit/Dev/tree-sitter-tcsh`:

```sh
node scripts/check-no-error.js /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/valid/*.tcsh /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/dialect/*.csh /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/dialect/*.tcsh /Users/jeongsaebit/Dev/tcsh-lsp/fixtures/corpus/parser/source-resolution/*.tcsh
```

Expected: every fixture reports parse success with no `ERROR` or `MISSING`.

- [ ] **Step 3: Inspect changed files**

Run:

```sh
git status --short
git diff --stat
git diff --check
```

Expected: only these intended files are changed:

```text
grammar.js
test/corpus/surface_syntax.txt
scripts/check-node-contract.js
package.json
docs/syntax-coverage-matrix.md
src/parser.c
src/grammar.json
src/node-types.json
```

- [ ] **Step 4: Commit the grammar-side fix**

Run:

```sh
git add grammar.js test/corpus/surface_syntax.txt scripts/check-node-contract.js package.json docs/syntax-coverage-matrix.md src/parser.c src/grammar.json src/node-types.json
git commit -m "Expose braced variable names"
```

Expected: commit succeeds.

## Downstream Handoff After This Repo Is Green

Do this only after Task 6 passes and the grammar-side commit exists.

- Vendor the new `tree-sitter-tcsh` commit into `/Users/jeongsaebit/Dev/tcsh-lsp`.
- Update the vendor provenance file in `tcsh-lsp`.
- Run from `/Users/jeongsaebit/Dev/tcsh-lsp`:

```sh
cargo test --test tree_sitter_fixture_regression -- --include-ignored --nocapture
cargo test --test tree_sitter_analysis -- --nocapture
cargo test features::edits::tests::prepare_and_rename_variable_use_without_replacing_dollar_prefix -- --nocapture
```

Expected: PASS after vendoring. If these fail after `tree-sitter-tcsh` passes its local gates, inspect whether `tcsh-lsp` still stores rename spans as the full `variable_substitution` node instead of the child name node.

## Self-Review Notes

- Spec coverage: the plan maps every requirement from `tree-sitter-tcsh-requirements.md` to a corpus fixture, grammar change, node contract check, and downstream acceptance command.
- Placeholder scan: no steps use TBD, TODO, or vague "add tests" wording; each code or command step includes exact content.
- Type consistency: node names match the current grammar and consumer contract: `variable_substitution`, `identifier`, `number`, `special_parameter`, `source_statement`, `source_target`, and `source_path_suffix`.
- Boundary check: the plan deliberately avoids `tcsh-lsp` string heuristics and keeps the fix in `tree-sitter-tcsh`.
