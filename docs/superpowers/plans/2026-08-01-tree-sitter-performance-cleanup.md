# Tree-sitter tcsh P0-P2 Performance and Cleanup Implementation Plan

**Goal:** Preserve every parser-visible tcsh behavior while making the validation pipeline materially faster, adding a representative incremental-performance regression gate, and removing proven grammar ambiguity, duplication, and dead declarations.

**Architecture:** Keep `grammar.js` as the sole syntax source of truth and keep all public CST, query, recovery, scanner, and package contracts unchanged. P0 introduces one validation composition root that builds a parser library once and passes that library to the existing checks. P1 applies two independently verifiable grammar refactors. P2 removes declarations that have no generated-parser or public-node effect. Every grammar step has a stricter artifact-diff allowance than the general test suite.

**Tech Stack:** CommonJS, `tree-sitter-cli@0.26.8`, Node.js validation scripts, Tree-sitter corpus fixtures, generated C/JSON artifacts under `src/`, C scanner and consumer checks.

---

## Priority Map

| Priority | Change | Required behavior |
| --- | --- | --- |
| P0 | Build one parser library per validation run and reuse it | All existing checks remain independently runnable and the aggregate development/release gates remain equivalent or stronger |
| P0 | Replace tiny incremental smoke timing with a representative large-file ratio gate | Valid incremental edits remain correct and their median parser time stays within a hardware-independent budget |
| P1 | Remove the self-conflict from `source_file` and simplify terminator ownership | Corpus trees, example trees, queries, recovery behavior, and public nodes do not change |
| P1 | Extract the duplicated immediate-word fragment choice | All generated files remain byte-identical |
| P2 | Remove unused precedence constants and the unreachable `string` rule | `parser.c` and `node-types.json` remain byte-identical; `grammar.json` only loses the dead rule |

The priorities are implementation order, not permission to combine changes. Each row must be completed and committed independently so that an unexpected generated diff can be attributed and reverted without disturbing the other work.

## Current-State Evidence

- `package.json` invokes `tree-sitter` through `npm exec` for generation, tests, parsing, and four query checks.
- `scripts/check-no-error.js`, `scripts/check-query-captures.js`, `scripts/check-recovery.js`, and `scripts/check-stress.js` use `--grammar-path .`. In CLI 0.26.8 that option implies `--rebuild`.
- `scripts/check-coverage-matrix.js` extracts valid corpus sections into temporary files and invokes a rebuilding parser once per section, even though the corpus suite also verifies those sections.
- The aggregate development gate therefore performs dozens of parser builds and process launches for one generated grammar.
- `scripts/check-stress.js` currently exercises large inputs and basic edit recovery, but its valid incremental fixtures are only a few lines long and their elapsed values are not asserted.
- `grammar.js` declares a self-conflict for `source_file`. Its statement/comment branches consume `repeat1($._terminator)` even though the surrounding `repeat(...)` can consume subsequent terminators.
- The immediate fragment choice in `_expression_word` duplicates the body of `_immediate_word_fragment`, except that expression words intentionally exclude standalone `literal_bang`.
- `PREC.ASSIGN`, `PREC.TERNARY`, and `PREC.CALL` have no consumers. The public `string` rule has no incoming grammar reference and does not appear as a named node in `src/node-types.json`.
- A local exploratory generation with the proposed `source_file` rewrite kept all inspected corpus/example trees and node types unchanged while reducing `STATE_COUNT` from 2441 to 2440 and multi-action entries from 516 to 513. These numbers are observations to reconfirm, not substitutes for the compatibility gates below.
- A local exploratory helper extraction produced byte-identical `src/parser.c`, `src/grammar.json`, and `src/node-types.json`.
- A local exploratory dead-declaration removal kept `src/parser.c` and `src/node-types.json` byte-identical; only the unreachable `string` entry disappeared from `src/grammar.json`.

## Compatibility Contract

The following are invariants for the whole plan:

1. No named node, field, child cardinality, query capture, scanner token, or recovery expectation may change.
2. No valid corpus expectation may be updated to make a refactor pass.
3. No existing `ERROR` or `MISSING` expectation may be removed or relocated as part of cleanup.
4. `npm test`, every existing `npm run check:*` entry point, `npm run check`, and `npm run check:release` remain supported.
5. The development and release aggregate gates retain every current check. The release gate remains a strict superset of the development gate.
6. Standalone parser-backed checks may build one temporary library for themselves. An aggregate gate must build exactly one temporary parser library and share it with all parser-backed child checks.
7. Generated artifacts remain committed and synchronized with `grammar.js`.
8. Temporary libraries and generated benchmark inputs are created below the OS temporary directory and removed in `finally` blocks.

### Allowed generated diffs by phase

| Phase | `src/parser.c` | `src/grammar.json` | `src/node-types.json` |
| --- | --- | --- | --- |
| P0 validation refactor | no change | no change | no change |
| P1 `source_file` simplification | expected parser-table reduction | expected matching rule/conflict change | no change |
| P1 helper extraction | byte-identical | byte-identical | byte-identical |
| P2 dead declarations | byte-identical | only remove `string` | byte-identical |

If a phase exceeds its allowance, stop that phase. Do not update fixtures, queries, or contracts to absorb the difference.

## Non-Goals

- No new tcsh syntax and no coverage-matrix status change.
- No keyword extraction, lexical-regex redesign, hidden-rule inlining, precedence retuning, or broad grammar normalization.
- No external-scanner token addition or scanner-state redesign.
- No Tree-sitter CLI upgrade or dependency addition.
- No benchmark based on absolute milliseconds; CI hardware speed must not determine correctness.
- No third-party grammar code or reference-ledger change.
- No downstream `tcsh-lsp` change. Public parser behavior is explicitly preserved here.

## Planned File Structure

### Create

- `scripts/lib/tree-sitter-runtime.js`
  - Own the direct CLI path, temporary-library build/cleanup, shared-library environment contract, and common `--lib-path` arguments.
- `scripts/check-parser-runtime.js`
  - Compose all parser-backed development checks under one built library; add release-only matrix and stress work with `--release`.
- `scripts/check-queries.js`
  - Replace the four rebuilding shell commands in `package.json` with one Node entry point that reuses a library.

### Modify in P0

- `package.json`
  - Remove unnecessary `npm exec` hops inside npm scripts, retain standalone commands, and route aggregate parser checks through the composition root.
- `scripts/check-coverage-matrix.js`
  - Separate matrix/evidence collection from parsing and batch all unique positive sources into one parser invocation.
- `scripts/check-no-error.js`
  - Parse all smoke examples in one fast-path invocation and preserve per-file diagnostics on failure.
- `scripts/check-query-captures.js`
  - Consume the shared parser library instead of rebuilding for every query.
- `scripts/check-recovery.js`
  - Consume the shared parser library.
- `scripts/check-stress.js`
  - Consume the shared parser library and enforce representative full/incremental ratios.

### Modify in P1/P2

- `grammar.js`
  - Simplify `source_file`, extract one local helper, and remove dead declarations in separate commits.
- `test/corpus/command_boundaries.txt`
  - Add characterization coverage for consecutive top-level terminators and comments before simplifying `source_file`.
- `src/parser.c`
- `src/grammar.json`
- `src/node-types.json`
  - Regenerate after each grammar phase and apply the phase-specific diff allowance above.

No change to `docs/syntax-coverage-matrix.md` is planned because this work adds no syntax and the new characterization case stays in an already-referenced corpus file.

## Success Criteria

- All commands below pass from the repository root:

  ```sh
  npm test
  npm run check
  npm run check:release
  ```

- A successful `npm run check` or `npm run check:release` performs one explicit `tree-sitter build` for all parser-backed checks.
- `scripts/` contains no `npm exec` call and no repeated `--grammar-path` parse/query path.
- Successful no-error validation uses one parse subprocess for all smoke examples; individual retries occur only for failure diagnosis.
- Coverage-matrix validation parses each unique positive source once and performs the normal set in one batched CLI invocation.
- The release stress gate keeps the existing long-token, many-argument, deep-nesting, linearity, and malformed-edit checks.
- A generated representative source of at least 1 MiB parses without `ERROR` or `MISSING`.
- The median one-character middle edit time is at most 30% of the same source's median full-parse time, using CLI-reported parser time rather than process wall time.
- The existing 2 MiB/1 MiB full-parse median ratio remains at most 3.0.
- The P1/P2 generated diffs exactly match the allowed-diff table.
- The optimized aggregate development gate shows a meaningful local wall-time reduction. Treat less than 20% improvement over a three-run baseline as a failed P0 investigation even if functional checks pass.
- `git diff --check` reports no whitespace errors and the final worktree contains no temporary benchmark or library artifact.

## Suggested Commit Sequence

1. `perf(checks): reuse parser library`
2. `test(parser): gate incremental performance`
3. `refactor(grammar): simplify source boundaries`
4. `refactor(grammar): share immediate fragments`
5. `chore(grammar): remove dead declarations`

Do not squash these during implementation review. The artifact allowance differs for each grammar commit.

---

## P0 Task 1: Capture a Reproducible Baseline

**Files:**

- No committed file changes.
- Record results in the implementation handoff or pull-request description.

- [ ] **Step 1: Confirm repository and tool state**

  Run:

  ```sh
  git status --short
  git rev-parse HEAD
  node --version
  npm --version
  node_modules/.bin/tree-sitter --version
  ```

  Expected: unrelated user changes are identified before work begins, the baseline commit SHA is recorded for final diff review, and Tree-sitter reports `0.26.8`. Do not clean or overwrite unrelated changes.

- [ ] **Step 2: Capture the functional baseline**

  Run:

  ```sh
  npm test
  npm run check
  npm run check:release
  ```

  Expected: all commands pass before refactoring. If an environmental package-consumer prerequisite such as `pkg-config` is missing, record that separately; do not treat it as a parser failure or weaken the package check.

- [ ] **Step 3: Record parser-table and validation-call baselines**

  Run:

  ```sh
  rg -n '^#define (STATE_COUNT|LARGE_STATE_COUNT|SYMBOL_COUNT)' src/parser.c
  rg -n -- '--grammar-path|npm.*exec' scripts package.json
  rg -n '^[[:space:]]*(ASSIGN|TERNARY|CALL):|PREC\.(ASSIGN|TERNARY|CALL)|\$\.string\b|^[[:space:]]*string:' grammar.js
  ```

  Expected: the output explains the repeated rebuild paths and shows only the dead declarations identified in this plan.

- [ ] **Step 4: Measure aggregate wall time without adding a benchmark dependency**

  Run `npm run check` three times with `/usr/bin/time -p`, after one unrecorded warm-up. Record the median real time and the machine/OS in the handoff.

  Expected: a stable baseline suitable for a before/after comparison. This wall time is a local optimization metric, not a CI correctness threshold.

- [ ] **Step 5: Preserve the baseline boundary**

  Confirm:

  ```sh
  git status --short
  ```

  Expected: Task 1 created no repository files.

---

## P0 Task 2: Introduce One Parser-Library Owner

**Files:**

- Create: `scripts/lib/tree-sitter-runtime.js`
- Create: `scripts/check-parser-runtime.js`
- Modify: `package.json`

- [ ] **Step 1: Define the internal library-sharing contract**

  Implement `scripts/lib/tree-sitter-runtime.js` with these responsibilities only:

  - Resolve the repository-local CLI as an absolute path under `node_modules/.bin`.
  - Use the task-specific environment variable `TREE_SITTER_TCSH_LIB_PATH` when a parent already owns a parser library.
  - Otherwise create one `tree-sitter-tcsh-runtime-*` temporary directory, choose `.dylib`, `.so`, or `.dll` by platform, and run:

    ```sh
    tree-sitter build --output <absolute-library-path> <absolute-repository-root>
    ```

  - Expose a `withParserLibrary(callback)` helper that always cleans up only the directory it created.
  - Expose `languageArgs(libraryPath)` returning:

    ```text
    --lib-path <absolute-library-path> --lang-name tcsh
    ```

  - Expose a direct CLI runner used by child scripts. Do not place policy for corpus, query, recovery, or stress checks in this helper.

  The helper must fail early when a supplied environment path does not exist. It must never silently fall back to `--grammar-path .`, because that would conceal duplicate builds in the aggregate gate.

- [ ] **Step 2: Add the parser-backed composition root**

  Implement `scripts/check-parser-runtime.js` so the standard mode runs, in order:

  1. `tree-sitter test` with the shared `--lib-path` arguments.
  2. Coverage-matrix validation.
  3. No-ERROR smoke validation.
  4. Query syntax validation.
  5. Query capture contracts.
  6. Recovery structure validation.

  In `--release` mode, run the same list, pass `--release` to the coverage-matrix check, and then run the stress/incremental gate. Spawn Node children with `process.execPath` and pass the absolute library through `TREE_SITTER_TCSH_LIB_PATH`.

  A child failure must preserve its exit status and stop the aggregate gate. The composition root should print one concise build line and one concise line before each check so a review can confirm that exactly one library was built.

- [ ] **Step 3: Restructure package scripts without dropping entry points**

  Make these script-level changes:

  - Use `tree-sitter` directly in npm scripts for `generate`, `test`, `test:update`, and interactive `parse`; npm already adds `node_modules/.bin` to `PATH`.
  - Add `check:parser` for standard composition-root mode.
  - Add `check:parser:release` for `--release` mode.
  - Add `check:static` containing the existing node-contract, scanner, and generated-C compile checks.
  - Define `check` as generate + static checks + standard parser checks.
  - Define `check:release` as generate + the same static checks + release parser checks + package-consumer check.
  - Retain `test`, `check:coverage-matrix`, `check:coverage-matrix:release`, `check:no-error`, `check:queries`, `check:query-captures`, `check:recovery`, `check:stress`, and `check:package` as independently runnable commands.

  Do not implement release mode by calling `npm run check` and then building again for stress. The release composition root must reuse its one library for the development superset and release-only parser work.

- [ ] **Step 4: Verify the composition root's failure propagation**

  Temporarily point one child command at a guaranteed-invalid option, run `npm run check:parser`, and confirm a nonzero exit. Revert the temporary edit immediately with `apply_patch`; do not use a destructive Git restore command.

  Expected: the aggregate command stops at the failing child and returns nonzero.

- [ ] **Step 5: Run the checks that are usable before child migration**

  Run:

  ```sh
  npm run generate
  npm test
  npm run check:static
  ```

  Expected: PASS and no generated-file diff.

  Do not commit Task 2 separately from Task 3 if the new composition root still calls children that ignore the shared-library environment. Commit only when the one-build path is complete.

---

## P0 Task 3: Migrate and Batch Parser-Backed Checks

**Files:**

- Create: `scripts/check-queries.js`
- Modify: `scripts/check-coverage-matrix.js`
- Modify: `scripts/check-no-error.js`
- Modify: `scripts/check-query-captures.js`
- Modify: `scripts/check-recovery.js`
- Modify: `scripts/check-stress.js`
- Modify: `package.json`

- [ ] **Step 1: Batch coverage-matrix parsing without weakening evidence checks**

  Refactor `scripts/check-coverage-matrix.js` into two passes:

  1. Validate headers, statuses, placeholders, fixture existence, release status, expected-node evidence, and the minimum inventory exactly as today. Cache each fixture once.
  2. Collect every unique valid source section into one temporary directory and invoke `tree-sitter parse` once with all paths and the shared library.

  Preserve these semantics:

  - Corpus sections whose expected tree intentionally contains `ERROR` or `MISSING` are not positive parse inputs.
  - Expected-node evidence still comes from the committed corpus expectation, not from substring coincidence in another file.
  - A nonzero parser status or any `ERROR`/`MISSING` in a positive source fails the check.
  - Non-corpus fixture files remain supported.
  - `--release` still fails when a parser-readable row remains only `implemented`.

  On parse failure, rerun only the failed batch's inputs individually with the same library to identify the fixture. Diagnostic retries are allowed on failure; the successful path must remain one parse process.

- [ ] **Step 2: Batch smoke examples on the successful path**

  Update `scripts/check-no-error.js` to parse all requested files in one CLI invocation with `--no-ranges` and the shared library.

  - On success, print the existing per-file success lines.
  - On failure, retry each file with the same library to retain actionable diagnostics.
  - Treat either nonzero status or visible `ERROR`/`MISSING` as failure exactly as today.

- [ ] **Step 3: Replace the inline query shell chain**

  Implement `scripts/check-queries.js` using the shared helper. Validate `highlights.scm`, `locals.scm`, `tags.scm`, and `folds.scm` against `examples/sample.tcsh`, preserving the current `--quiet` behavior.

  One query file per CLI invocation is acceptable because `query` accepts one query path, but all four invocations must use the same already-built library.

- [ ] **Step 4: Migrate capture and recovery checks**

  Replace every `--grammar-path .` in `scripts/check-query-captures.js` and `scripts/check-recovery.js` with the helper's library arguments. Do not change capture assertions, fixtures, regexes, tolerated recovery exit statuses, or success messages.

- [ ] **Step 5: Put stress checks on the same library path**

  Migrate all parse calls in `scripts/check-stress.js` to the helper before changing benchmark content. Keep the current long-token, many-argument, deep-nesting, 2x-linearity, valid-edit, malformed-heredoc recovery, and block-edit checks green.

- [ ] **Step 6: Verify standalone and aggregate command compatibility**

  Run:

  ```sh
  npm test
  npm run check:coverage-matrix
  npm run check:coverage-matrix:release
  npm run check:no-error
  npm run check:queries
  npm run check:query-captures
  npm run check:recovery
  npm run check:stress
  npm run check
  npm run check:release
  ```

  Expected: every prior entry point passes. Standalone commands each own at most one temporary build; each aggregate command logs exactly one parser-library build.

- [ ] **Step 7: Prove forced rebuild paths are gone from validators**

  Run:

  ```sh
  rg -n -- '--grammar-path|npm.*exec' scripts
  rg -n 'tree-sitter.*build|build.*tree-sitter' scripts
  ```

  Expected: the first command prints nothing. The second identifies only the shared runtime helper as the build owner. The interactive `parse` npm script may continue to use `--grammar-path .` because it is outside the aggregate validation loop.

- [ ] **Step 8: Confirm P0 has not touched parser artifacts**

  Run:

  ```sh
  git diff --exit-code -- src/parser.c src/grammar.json src/node-types.json grammar.js queries test/corpus
  git diff --check
  ```

  Expected: no grammar, query, corpus, or generated-artifact diff.

- [ ] **Step 9: Measure the aggregate improvement**

  Repeat the Task 1 timing method after one warm-up. Record the three-run median and percentage change.

  Expected: at least 20% local wall-time reduction. If the improvement is smaller, inspect process/build counts before committing; do not claim a performance win from code shape alone.

- [ ] **Step 10: Commit the build-reuse change**

  Stage only the P0 runtime files and `package.json`, then commit:

  ```text
  perf(checks): reuse parser library
  ```

---

## P0 Task 4: Add a Representative Incremental Regression Gate

**Files:**

- Modify: `scripts/check-stress.js`

- [ ] **Step 1: Generate representative sources at runtime**

  Build a deterministic 1 MiB command-dense source in the existing temporary stress directory by cycling valid command, variable-substitution, assignment, arithmetic, source, redirect, one-line-if, and alias forms already covered by the smoke examples.

  Append `echo incremental_marker` between forms so the generated source contains deterministic, safely editable markers. Keep heredoc and nested-block edits in their dedicated correctness/recovery tripwires; repeating those external-scanner boundaries turns this gate into a worst-case scanner benchmark instead of a representative edit benchmark. Stop only after the target byte size is met. Do not commit megabyte fixtures. Parse the generated file once and fail if its JSON summary is unsuccessful.

- [ ] **Step 2: Define one stable middle edit**

  Locate the `incremental_marker` argument nearest the middle of the 1 MiB file and replace one ASCII character with another ASCII character. Keep the byte length and token class unchanged so the test measures incremental invalidation rather than a deliberate tree-shape change.

  Compute the CLI edit's row/column from the generated content rather than hard-coding a row. Assert after the edit that parsing still succeeds without `ERROR` or `MISSING`.

- [ ] **Step 3: Measure parser time, not process startup**

  Use the pinned CLI's `parse --time` output with the shared library. Implement one strict parser for its reported duration:

  - Fail with an explanatory error if no duration can be extracted; never fall back silently to wall-clock subprocess time.
  - Run one warm-up plus seven measured full parses of the 1 MiB source.
  - Run one warm-up plus seven measured parses with the middle edit.
  - Use medians for the gate and print all medians/ratios in the success message.

- [ ] **Step 4: Enforce hardware-independent ratios**

  Retain the existing 1 MiB/2 MiB long-word full-parse linearity gate. Keep this fixture separate from the representative mixed-syntax input so P0 does not silently redefine the existing complexity baseline:

  ```text
  median(full 2 MiB) / median(full 1 MiB) <= 3.0
  ```

  Add the incremental gate:

  ```text
  median(middle one-character edit) / median(full 1 MiB) <= 0.30
  ```

  The exploratory ratio was approximately 0.115, so 0.30 provides CI headroom without accepting near-full reparses. If two consecutive baseline runs cannot pass 0.30, investigate timing extraction and fixture construction; do not raise the limit above 0.35 as a first response.

- [ ] **Step 5: Preserve adversarial and recovery cases**

  Keep the existing checks for:

  - one 5 MiB word,
  - 100,000 arguments,
  - 50,000 nested parentheses,
  - malformed heredoc incremental recovery with a visible `ERROR` or `MISSING`, and
  - block editing.

  These are correctness/complexity tripwires and must not be replaced by the representative benchmark.

- [ ] **Step 6: Verify the stress gate repeatedly**

  Run:

  ```sh
  npm run check:stress
  npm run check:stress
  npm run check:release
  ```

  Expected: both standalone runs and the aggregate release gate pass; logs include full, 2x, incremental, and ratio measurements.

- [ ] **Step 7: Confirm benchmark artifacts are temporary**

  Run:

  ```sh
  git status --short
  fd 'tree-sitter-tcsh-(stress|runtime)' .
  ```

  Expected: no generated benchmark source or parser library exists in the repository.

- [ ] **Step 8: Commit the regression gate**

  Commit only the stress-check change:

  ```text
  test(parser): gate incremental performance
  ```

---

## P1 Task 5: Remove the Non-Semantic `source_file` Conflict

**Files:**

- Modify: `test/corpus/command_boundaries.txt`
- Modify: `grammar.js`
- Regenerate: `src/parser.c`
- Regenerate: `src/grammar.json`
- Verify unchanged: `src/node-types.json`

- [ ] **Step 1: Add characterization coverage before the grammar edit**

  Add one focused corpus section covering all of these top-level boundaries in a single source:

  - leading standalone semicolons/newlines,
  - consecutive terminators after a command,
  - an inline comment followed by extra terminators,
  - a standalone comment between commands, and
  - trailing terminators/comment at end of file.

  The expected tree should contain only the same named `command_list`, command/word children, and `comment` nodes produced today. Anonymous terminators must not become named API.

- [ ] **Step 2: Prove the characterization test passes before refactoring**

  Run:

  ```sh
  npm test -- --file-name command_boundaries.txt
  ```

  Expected: PASS on the current grammar. This is a refactor characterization test, so it is expected to pass before and after the edit rather than start red.

- [ ] **Step 3: Apply only the local grammar simplification**

  In `grammar.js`:

  - Remove `conflicts: $ => [[$.source_file]]`.
  - In the statement branch of `source_file`, replace `repeat1($._terminator)` with one `$._terminator`.
  - In the comment branch, make the same replacement.
  - Leave the outer `repeat(choice(...))`, standalone `$._terminator` branch, and trailing optional statement/comment unchanged.

  The outer repetition consumes any additional terminators, so this removes duplicate ownership without changing accepted input.

- [ ] **Step 4: Regenerate and inspect the exact artifact boundary**

  Run:

  ```sh
  npm run generate
  git diff -- src/parser.c src/grammar.json src/node-types.json
  git diff --exit-code -- src/node-types.json
  rg -n '^#define (STATE_COUNT|LARGE_STATE_COUNT|SYMBOL_COUNT)' src/parser.c
  rg -c '\.entry = \{\.count = [2-9]' src/parser.c
  ```

  Expected:

  - `src/node-types.json` is byte-identical.
  - `src/grammar.json` reflects only the conflict/terminator grammar rewrite.
  - `src/parser.c` changes only as generated parser-table data.
  - With CLI 0.26.8, reconfirm the exploratory `STATE_COUNT` change from 2441 to 2440 and the multi-action reduction from 516 to 513. If the baseline differs, record both values and require a non-increase rather than editing unrelated grammar to force the exploratory numbers.

- [ ] **Step 5: Run all parser contracts**

  Run:

  ```sh
  npm test
  npm run check:no-error
  npm run check:queries
  npm run check:query-captures
  npm run check:node-contract
  npm run check:recovery
  npm run check:stress
  npm run check
  ```

  Expected: PASS with no corpus expectation update other than the newly added characterization section.

- [ ] **Step 6: Review scope and commit**

  Run:

  ```sh
  git diff --check
  git status --short
  ```

  Expected: only `grammar.js`, `test/corpus/command_boundaries.txt`, and the generated files permitted by this task are changed.

  Commit:

  ```text
  refactor(grammar): simplify source boundaries
  ```

---

## P1 Task 6: Deduplicate Immediate Word Fragments

**Files:**

- Modify: `grammar.js`
- Verify byte-identical after generation: `src/parser.c`
- Verify byte-identical after generation: `src/grammar.json`
- Verify byte-identical after generation: `src/node-types.json`

- [ ] **Step 1: Start from a committed generated baseline**

  Confirm Task 5 is committed and run:

  ```sh
  git status --short
  npm run generate
  git diff --exit-code -- src/parser.c src/grammar.json src/node-types.json
  ```

  Expected: clean generated baseline. This makes byte-identity review unambiguous.

- [ ] **Step 2: Extract one local grammar-construction helper**

  Add this single-purpose helper above `module.exports = grammar(...)`:

  ```js
  function immediateWordFragment($, includeLiteralBang) {
    return choice(
      alias(token.immediate(/[^\s#;|&<>(){}'"`$!\\*?\[\]%]+/), $.bare_word),
      alias(token.immediate(seq('\\', /(.|\r?\n)/)), $.escape_sequence),
      alias($._immediate_single_quoted_string, $.single_quoted_string),
      alias($._immediate_dollar_single_quoted_string, $.dollar_single_quoted_string),
      alias($._immediate_double_quoted_string, $.double_quoted_string),
      alias($._immediate_backtick_command_substitution, $.backtick_command_substitution),
      alias($._immediate_variable_substitution, $.variable_substitution),
      alias($._immediate_history_substitution, $.history_substitution),
      ...(includeLiteralBang ? [alias(token.immediate('!'), $.literal_bang)] : []),
      alias(token.immediate(/\^?[A-Za-z0-9_.\/-]*([*?]|\[[^\]\s\n]+\])[A-Za-z0-9_.\/*?\[\]-]*/), $.glob_pattern),
      alias(token.immediate(/=(?:[0-9]+|-)/), $.directory_stack_reference),
      alias(token.immediate(seq('%', choice('%', '+', '-', /[0-9]+/, seq('?', /[^\s;|&<>(){}'"`]+/), /[A-Za-z_][A-Za-z0-9_-]*/))), $.job_spec),
    );
  }
  ```

  Then:

  - Replace `_expression_word`'s duplicated `repeat(choice(...))` with `repeat(immediateWordFragment($, false))`.
  - Replace `_immediate_word_fragment`'s duplicated `choice(...)` with `immediateWordFragment($, true)`.

  Preserve option order exactly. In particular, expression words must continue to exclude standalone `literal_bang`, while ordinary immediate word fragments include it between history substitution and glob matching.

- [ ] **Step 3: Require generated byte identity**

  Run:

  ```sh
  npm run generate
  git diff --exit-code -- src/parser.c src/grammar.json src/node-types.json
  ```

  Expected: no generated diff. If any file differs, revise the helper shape or option order; do not commit the generated difference.

- [ ] **Step 4: Run word-boundary and full checks**

  Run:

  ```sh
  npm test -- --file-name word_boundaries.txt
  npm test -- --file-name substitutions.txt
  npm run check
  npm run check:stress
  ```

  Expected: PASS.

- [ ] **Step 5: Review the source-only diff and commit**

  Run:

  ```sh
  git diff --check
  git status --short
  ```

  Expected: only `grammar.js` is changed in this task.

  Commit:

  ```text
  refactor(grammar): share immediate fragments
  ```

---

## P2 Task 7: Remove Proven Dead Declarations

**Files:**

- Modify: `grammar.js`
- Verify byte-identical after generation: `src/parser.c`
- Regenerate with one intentional rule deletion: `src/grammar.json`
- Verify byte-identical after generation: `src/node-types.json`

- [ ] **Step 1: Re-prove that the declarations are dead**

  Run:

  ```sh
  rg -n '^[[:space:]]*(ASSIGN|TERNARY|CALL):|PREC\.(ASSIGN|TERNARY|CALL)|\$\.string\b|^[[:space:]]*string:' grammar.js queries test scripts docs/syntax-coverage-matrix.md
  rg -n '"type": "string"' src/node-types.json
  ```

  Expected:

  - `ASSIGN`, `TERNARY`, and `CALL` occur only as keys in `PREC`.
  - `string` occurs only as its own grammar rule, with no `$.string` consumer.
  - `src/node-types.json` has no public node named `string`.

  If any consumer has appeared since this plan was written, stop P2 and reassess rather than deleting it.

- [ ] **Step 2: Remove only the dead declarations**

  In `grammar.js`:

  - Delete `ASSIGN: 1`.
  - Delete `TERNARY: 2`.
  - Delete `CALL: 14`.
  - Delete `string: $ => choice($.single_quoted_string, $.double_quoted_string)`.

  Do not renumber the remaining precedence constants. Their numeric gaps are harmless, and renumbering would risk parser-table changes unrelated to dead-code removal.

- [ ] **Step 3: Regenerate with a narrow diff allowance**

  Run:

  ```sh
  npm run generate
  git diff --exit-code -- src/parser.c src/node-types.json
  git diff -- src/grammar.json
  ```

  Expected:

  - `src/parser.c` is byte-identical.
  - `src/node-types.json` is byte-identical.
  - `src/grammar.json` only removes the top-level `string` rule representation.

  Any other generated change fails this task.

- [ ] **Step 4: Run the complete development and release gates**

  Run:

  ```sh
  npm test
  npm run check
  npm run check:release
  ```

  Expected: PASS.

- [ ] **Step 5: Review and commit**

  Run:

  ```sh
  git diff --check
  git status --short
  ```

  Expected: only `grammar.js` and the intentional `src/grammar.json` regeneration are changed in this task.

  Commit:

  ```text
  chore(grammar): remove dead declarations
  ```

---

## Task 8: Final Cross-Priority Verification and Handoff

**Files:**

- No additional source changes unless a prior task's scoped fix is required.

- [ ] **Step 1: Re-run all aggregate gates from the final tree**

  Run:

  ```sh
  npm run check
  npm run check:release
  ```

  Expected: PASS. The release log shows exactly one parser-library build and includes the incremental ratio.

- [ ] **Step 2: Re-run focused structural assertions**

  Run:

  ```sh
  rg -n -- '--grammar-path|npm.*exec' scripts
  rg -n '^[[:space:]]*(ASSIGN|TERNARY|CALL):|PREC\.(ASSIGN|TERNARY|CALL)|\$\.string\b|^[[:space:]]*string:' grammar.js
  rg -n '^#define (STATE_COUNT|LARGE_STATE_COUNT|SYMBOL_COUNT)' src/parser.c
  git diff --check
  ```

  Expected: no validator rebuild path, no dead declaration, stable parser constants consistent with Task 5, and no whitespace errors.

- [ ] **Step 3: Compare final performance with Task 1**

  Repeat the same three-run `/usr/bin/time -p npm run check` measurement after one warm-up. Report:

  - baseline and final median aggregate wall time,
  - percentage improvement,
  - full 1 MiB median parser time,
  - full 2 MiB median and ratio,
  - incremental median and full/incremental ratio,
  - final `STATE_COUNT`, and
  - whether the exploratory 2441-to-2440 state reduction reproduced.

- [ ] **Step 4: Audit the final changed-file set**

  Run:

  ```sh
  git status --short
  git diff --stat <recorded-baseline-commit>..HEAD
  ```

  Expected: changes trace only to P0-P2 files listed in this plan. Do not include local timing output, temporary libraries, benchmark sources, logs, or unrelated cleanup.

- [ ] **Step 5: Prepare the handoff**

  The handoff must state:

  - which P0-P2 commits were completed,
  - the exact validation commands and results,
  - the before/after aggregate timing,
  - the final benchmark ratios,
  - the generated-artifact diff observed in each grammar commit, and
  - any environmental limitation that prevented a package-consumer check.

## Stop and Rollback Rules

- If P0 changes a parser artifact or parser result, revert only the P0 validation commit and keep the benchmark investigation separate.
- If `source_file` simplification changes any named tree, query capture, recovery assertion, or node type, stop P1 Task 5. Do not add precedence/conflicts elsewhere to compensate.
- If the immediate-fragment helper changes any generated byte, stop P1 Task 6 and keep the duplication; cleanliness is not worth a semantic or generator-shape change.
- If P2 changes `parser.c` or `node-types.json`, restore the declaration and treat it as live until the cause is understood.
- If the incremental gate is flaky, first inspect timing extraction, warm-up, source determinism, and accidental process-wall timing. Do not remove the gate or replace the ratio with a generous absolute timeout.
- Never use fixture expectation updates as evidence that these refactors preserved behavior.

## Self-Review Notes

- P0 improves the dominant repository workflow cost without changing parsing algorithms or adding a runtime dependency.
- The shared library helper is intentionally infrastructure-only; individual validators retain their domain assertions.
- The aggregate release gate is composed directly rather than recursively invoking the development gate, preventing a second parser build while keeping release behavior a strict superset.
- P1's two cleanups have different generated-artifact contracts and therefore must remain separate commits.
- P2 deliberately keeps precedence-number gaps to avoid a cosmetic renumbering with semantic risk.
- No scanner-design or reference-ledger update is needed because this plan adds neither an external token nor third-party grammar code.
