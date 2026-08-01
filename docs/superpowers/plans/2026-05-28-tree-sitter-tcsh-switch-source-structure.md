# Tree Sitter Tcsh Switch and Source Structure Implementation Plan

**Status:** Completed in `9500494`. Superseded as an active roadmap by the
[stable release readiness plan](./2026-08-01-tree-sitter-tcsh-stable-release-readiness.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `tree-sitter-tcsh` provide parser-owned syntax facts for switch clause bodies and source targets without adding tcsh-lsp-side parser heuristics.

**Architecture:** Keep the grammar changes local to `grammar.js`, prove the new shapes with corpus fixtures, then regenerate committed Tree-sitter artifacts. `tcsh-lsp` LSP behavior and downstream Rust tests are explicitly out of scope for this plan; this repository only proves grammar, corpus, generated artifacts, query validity, and no-ERROR smoke parsing.

**Tech Stack:** Tree-sitter grammar DSL in CommonJS, `tree-sitter-cli` via npm scripts, corpus tests in `test/corpus/surface_syntax.txt`, generated artifacts under `src/`.

---

## File Structure

- Modify: `grammar.js`
  - Add a command-argument-only reserved keyword node so `echo default` and `echo endsw` can parse without letting standalone `default:` or `endsw` disappear into switch bodies.
  - Add a parser-owned source invocation shape with a `target` field.
- Modify: `test/corpus/surface_syntax.txt`
  - Add a switch regression matching the tcsh-lsp `05_switch.tcsh` shape.
  - Add source target corpus entries for static, dot shorthand, variable, glob, and backtick targets.
- Modify: `docs/syntax-coverage-matrix.md`
  - Update the source row from keyword-only `source_command` coverage to structured source invocation/target coverage.
  - Keep existing switch rows tested.
- Regenerate: `src/parser.c`, `src/grammar.json`, `src/node-types.json`
  - Produced by `npm run generate`.
- No changes in this plan: `/Users/jeongsaebit/Dev/tcsh-lsp/**`
  - Downstream vendoring, analyzer extraction, source-edge tests, and all LSP-facing tests are delegated to the tcsh-lsp project.

## Success Criteria

- `switch ( $mode ) ... case fast: echo fast; breaksw; default: echo default; endsw` parses with:
  - root kind `source_file`
  - no `ERROR` or `MISSING`
  - one `switch_statement`
  - one `case_clause`
  - one `default_clause`
  - `breaksw_statement` inside the case body
  - `echo default` represented as a normal command in the default body
- Source invocations parse with a grammar-owned target field:
  - `source ~/.tcshrc`
  - `. ./common.csh`
  - `source $HOME/.tcshrc`
  - `source *.csh`
  - ``source `pwd`/common.csh``
- `source_target` preserves dynamic syntax evidence as named descendants where applicable:
  - `variable_substitution` for `$HOME/.tcshrc`
  - `glob_pattern` for `*.csh`
  - `backtick_command_substitution` for `` `pwd`/common.csh ``
- Local grammar verification passes:
  - `npm run generate`
  - `npm test`
  - `npm run check:coverage-matrix:release`
  - `npm run check:no-error`
  - `npm run check:queries`
  - `npm run check:c-compile`

## Task 1: Add Failing Switch Corpus Before Grammar Changes

**Files:**
- Modify: `test/corpus/surface_syntax.txt`

- [ ] **Step 1: Add a focused switch regression corpus case**

Add this corpus block near the existing control-flow fixture:

```text
==================
switch body keyword arguments
==================
switch ( $mode )
case fast:
  echo fast
  breaksw
default:
  echo default
endsw
---

(source_file
  (switch_statement
    (expression
      (word
        (variable_substitution
          (identifier))))
    (case_clause
      pattern: (word
        (identifier))
      (command_list
        (and_or_command
          (pipeline
            (command
              (simple_command
                (builtin_command
                  (echo_command))
                (word
                  (identifier)))))))
      (breaksw_statement))
    (default_clause
      (command_list
        (and_or_command
          (pipeline
            (command
              (simple_command
                (builtin_command
                  (echo_command))
                (reserved_argument_word)))))))))
```

- [ ] **Step 2: Run the corpus test and verify it fails**

Run:

```bash
npm test -- --filter "switch body keyword arguments"
```

Expected before implementation: FAIL. The useful failure is either an `ERROR` near `echo default` or an expected-tree mismatch because `reserved_argument_word` is not defined yet.

- [ ] **Step 3: Do not edit tcsh-lsp**

No command is needed. Confirm no downstream files are touched:

```bash
git status --short
```

Expected: only `test/corpus/surface_syntax.txt` is modified at this point.

## Task 2: Fix Switch Clause Body Parsing Without Broad Keyword Reclassification

**Files:**
- Modify: `grammar.js`
- Test: `test/corpus/surface_syntax.txt`

- [ ] **Step 1: Add command-argument-only reserved words**

In `grammar.js`, update `simple_command` so reserved control words are accepted only after the command head, not as standalone command heads:

```js
    simple_command: $ => prec.right(seq(
      repeat($.redirection),
      choice($.builtin_command, $.word),
      repeat(choice($.word, $.reserved_argument_word, $.builtin_command, $.assignment_word, $.redirection)),
    )),

    reserved_argument_word: _ => choice(
      'case',
      'default',
      'else',
      'endif',
      'end',
      'endsw',
      'then',
    ),
```

Keep `case_clause`, `default_clause`, and `switch_statement` names unchanged.

- [ ] **Step 2: Run the focused switch corpus**

Run:

```bash
npm test -- --filter "switch body keyword arguments"
```

Expected after implementation: PASS.

- [ ] **Step 3: Run the full corpus**

Run:

```bash
npm test
```

Expected: PASS. If a switch fixture now consumes a standalone `default:` or `endsw` as a command argument, undo the broadening and keep reserved words argument-only as shown above.

- [ ] **Step 4: Parse a tcsh-lsp-equivalent switch sample from this repo only**

Create a temporary sample outside the repo and parse it:

```bash
printf 'switch ( $mode )\ncase fast:\n  echo fast\n  breaksw\ndefault:\n  echo default\nendsw\n' > /private/tmp/tree-sitter-tcsh-switch-regression.tcsh
npm run parse -- /private/tmp/tree-sitter-tcsh-switch-regression.tcsh
```

Expected: parse output contains `switch_statement`, `case_clause`, `default_clause`, and `breaksw_statement`, with no `ERROR` or `MISSING`.

- [ ] **Step 5: Commit the switch grammar and corpus change**

Run:

```bash
git add grammar.js test/corpus/surface_syntax.txt
git commit -m "Fix switch keyword arguments"
```

Expected: commit succeeds. If this work is being batched with Task 3 by user preference, skip this commit and commit both grammar changes together after Task 3.

## Task 3: Add Failing Source Target Corpus Before Grammar Changes

**Files:**
- Modify: `test/corpus/surface_syntax.txt`

- [ ] **Step 1: Add structured source invocation corpus**

Add this block near the existing builtin surface forms:

```text
==================
structured source targets
==================
source ~/.tcshrc
. ./common.csh
source $HOME/.tcshrc
source *.csh
source `pwd`/common.csh
---

(source_file
  (source_statement
    (source_command)
    target: (source_target
      (word
        (bare_word))))
  (source_statement
    (source_command)
    target: (source_target
      (word
        (bare_word))))
  (source_statement
    (source_command)
    target: (source_target
      (variable_substitution
        (identifier))
      (source_path_suffix)))
  (source_statement
    (source_command)
    target: (source_target
      (word
        (glob_pattern))))
  (source_statement
    (source_command)
    target: (source_target
      (backtick_command_substitution)
      (source_path_suffix))))
```

- [ ] **Step 2: Run the focused source corpus and verify it fails**

Run:

```bash
npm test -- --filter "structured source targets"
```

Expected before implementation: FAIL because `source_statement`, `source_target`, and `source_path_suffix` do not exist yet.

## Task 4: Introduce Parser-Owned Source Statement and Target Field

**Files:**
- Modify: `grammar.js`
- Test: `test/corpus/surface_syntax.txt`

- [ ] **Step 1: Route source invocations before generic simple commands**

In `grammar.js`, change `command` and `builtin_command` so source forms become structured command nodes while keeping `source_command` as the keyword node:

```js
    command: $ => choice($.parenthesized_command, $.source_statement, $.simple_command),

    source_statement: $ => seq(
      field('command', $.source_command),
      field('target', $.source_target),
      repeat(choice($.word, $.reserved_argument_word, $.redirection)),
    ),

    source_target: $ => choice(
      $.word,
      seq($.variable_substitution, repeat($.source_path_suffix)),
      seq($.backtick_command_substitution, repeat($.source_path_suffix)),
    ),

    source_path_suffix: _ => token.immediate(/[A-Za-z0-9_.\/~-]+/),
```

Then remove `$.source_command` from `builtin_command` so a `source` invocation is not also parsed as a generic `simple_command`:

```js
    builtin_command: $ => choice(
      $.alias_command,
      $.unalias_command,
      $.set_command,
      $.unset_command,
      $.setenv_command,
      $.unsetenv_command,
      $.complete_command,
      $.uncomplete_command,
      $.bindkey_command,
      $.limit_command,
      $.unlimit_command,
      $.eval_command,
      $.exec_command,
      $.time_command,
      $.nice_command,
      $.nohup_command,
      $.cd_command,
      $.pushd_command,
      $.popd_command,
      $.dirs_command,
      $.jobs_command,
      $.fg_command,
      $.bg_command,
      $.kill_command,
      $.wait_command,
      $.which_command,
      $.where_command,
      $.rehash_command,
      $.hashstat_command,
      $.history_command,
      $.echo_command,
      $.printf_command,
      $.glob_command,
      $.logout_command,
      $.login_command,
      $.exit_command,
      $.return_command,
      $.shift_command,
      $.umask_command,
      $.sched_command,
    ),
```

- [ ] **Step 2: Keep the source keyword node stable**

Leave this rule in place:

```js
    source_command: _ => choice('source', '.'),
```

Expected effect: existing query captures for `(source_command)` continue to work, while consumers can now use `source_statement` and its `target` field.

- [ ] **Step 3: Run the focused source corpus**

Run:

```bash
npm test -- --filter "structured source targets"
```

Expected: PASS.

- [ ] **Step 4: Check that ordinary builtin corpus still passes**

Run:

```bash
npm test -- --filter "builtin surface forms"
```

Expected: PASS after updating the existing `source ~/.tcshrc` expectation in that corpus section from generic `simple_command` shape to `source_statement`.

- [ ] **Step 5: Confirm generated node types will expose the target field**

Run generation:

```bash
npm run generate
```

Then inspect:

```bash
rg -n '"type": "source_statement"|"target"|"type": "source_target"' src/node-types.json
```

Expected: `source_statement` appears in `src/node-types.json`, and its `fields` section contains a `target` field of type `source_target`.

- [ ] **Step 6: Commit the source grammar and corpus change**

Run:

```bash
git add grammar.js test/corpus/surface_syntax.txt src/parser.c src/grammar.json src/node-types.json
git commit -m "Expose structured source targets"
```

Expected: commit succeeds. If Task 2 was not committed separately, use a combined commit message such as `Fix switch parsing and source targets`.

## Task 5: Update Coverage Matrix and Generated Artifacts

**Files:**
- Modify: `docs/syntax-coverage-matrix.md`
- Regenerate: `src/parser.c`, `src/grammar.json`, `src/node-types.json`

- [ ] **Step 1: Update source coverage row**

Change the existing source row from keyword-only coverage:

```text
| TC-BLT-012 | REF-MAN-DEBIAN tcsh 6.24.13-2.1 | Builtin commands | builtin | REF-MAN-DEBIAN | builtin/form `source/.` surface syntax | tcsh-specific | source_command | tested | test/corpus/surface_syntax.txt | source_command | builtin-index | specialized command node; runtime behavior out of scope |
```

to structured invocation coverage:

```text
| TC-BLT-012 | REF-MAN-DEBIAN tcsh 6.24.13-2.1 | Builtin commands | builtin | REF-MAN-DEBIAN | builtin/form `source/.` target surface syntax | tcsh-specific | source_statement | tested | test/corpus/surface_syntax.txt | source_statement | builtin-index | structured source invocation with target field; runtime behavior out of scope |
```

- [ ] **Step 2: Add a source target coverage row**

Add this row immediately after `TC-BLT-012` and renumber later builtin rows only if the repository convention requires contiguous IDs:

```text
| TC-BLT-012A | REF-MAN-DEBIAN tcsh 6.24.13-2.1 | Builtin commands | builtin | REF-MAN-DEBIAN | source target word/static/dynamic shape | tcsh-specific | source_target | tested | test/corpus/surface_syntax.txt | source_target | parser | target preserves static, variable, glob, and backtick syntax facts for consumers |
```

- [ ] **Step 3: Regenerate artifacts after all grammar changes**

Run:

```bash
npm run generate
```

Expected: `src/parser.c`, `src/grammar.json`, and `src/node-types.json` are updated if grammar output changed.

- [ ] **Step 4: Run coverage matrix checks**

Run:

```bash
npm run check:coverage-matrix
npm run check:coverage-matrix:release
```

Expected: both PASS.

- [ ] **Step 5: Commit docs and generated artifact updates**

Run:

```bash
git add docs/syntax-coverage-matrix.md src/parser.c src/grammar.json src/node-types.json
git commit -m "Document source target grammar coverage"
```

Expected: commit succeeds. If previous tasks were intentionally batched, make one commit with all grammar, corpus, docs, and generated files.

## Task 6: Run Local Tree-Sitter Verification Only

**Files:**
- No new file edits expected.

- [ ] **Step 1: Run full local grammar gate**

Run:

```bash
npm run check
```

Expected: PASS. This includes generate, corpus tests, coverage matrix checks, no-error smoke tests, query checks, and C compile.

- [ ] **Step 2: Run explicit no-error parse for the switch regression sample**

Run:

```bash
npm run parse -- /private/tmp/tree-sitter-tcsh-switch-regression.tcsh
```

Expected: parse output contains no `ERROR` or `MISSING`.

- [ ] **Step 3: Verify query compatibility**

Run:

```bash
npm run check:queries
```

Expected: PASS. Existing captures such as `(source_command)` and switch fold captures remain valid.

- [ ] **Step 4: Confirm no tcsh-lsp files were modified**

Run:

```bash
git status --short
git -C /Users/jeongsaebit/Dev/tcsh-lsp status --short
```

Expected for this repository: only intended `tree-sitter-tcsh` files are changed or committed. Expected for `tcsh-lsp`: no changes from this plan.

## Downstream Handoff Boundary

Do not run or update tcsh-lsp LSP tests as part of this plan. After the grammar work lands, hand off these facts to the tcsh-lsp project:

- New parser facts:
  - `source_statement`
  - `source_statement` field `target`
  - `source_target`
  - preserved descendants such as `variable_substitution`, `glob_pattern`, and `backtick_command_substitution`
- Expected downstream work:
  - vendor the regenerated `tree-sitter-tcsh` artifacts
  - update `vendor/tree-sitter-tcsh/PROVENANCE.md`
  - add tree-sitter analyzer source edge extraction
  - replace the blocked source-edge test expectation
  - run tcsh-lsp Rust and LSP-facing test suites inside `/Users/jeongsaebit/Dev/tcsh-lsp`

## Self-Review Notes

- Spec coverage: both requested items are covered by isolated tasks. Switch covers clause/body parsing plus `echo default`. Source covers grammar-owned target structure and dynamic syntax preservation.
- Placeholder scan: no implementation step relies on unstated files or unspecified commands.
- Type/name consistency: the plan consistently uses `reserved_argument_word`, `source_statement`, `source_target`, and `source_path_suffix`.
- Boundary check: tcsh-lsp tests and analyzer implementation are delegated and not part of this repository plan.
