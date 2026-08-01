# Tree-sitter tcsh Stable 0.1.0 Release Readiness Plan

**Status:** Repository implementation complete through `57ccfeb`; branch
protection, tag creation, and registry publication remain maintainer actions.

**Baseline:** `1d7243d8d5a4b54e48221d6b660be2de97ac550d` on 2026-08-01

**Implementation commits:** `2a77cab`, `e575c63`, `d283907`, `cc51d0a`,
`442570f`, `b202632`, `4220be9`, `819e5c8`, and `57ccfeb`. Final documentation
and the operator procedure live in `docs/release-checklist.md`.

**Goal:** Make the first stable `0.1.0` release parse documented default-mode
tcsh/csh surface syntax found in the pinned tcsh 6.24.16 reference samples,
ship an installable and testable C package, and ensure CI blocks publication
when syntax, generated artifacts, scanner behavior, editor queries, or packaging
regress.

**Architecture:** Keep `grammar.js` as the only syntax source of truth. Repair
word composition with recursive grammar fragments rather than a deeper regular
expression, keep the existing external scanner token set unless a documented
grammar-only experiment proves a new token necessary, and make release
validation a strict superset of development validation. The local release gate
must remain deterministic and offline; a separate pinned-upstream CI job provides
real-world differential evidence without vendoring upstream scripts.

**Tech stack:** CommonJS, `tree-sitter-cli@0.26.8`, Tree-sitter corpus tests,
Node.js validation scripts, C11 parser/scanner code, the Tree-sitter C API,
Make, CMake, pkg-config, and GitHub Actions.

---

## Release Decision

Do not publish a stable `0.1.0` from the baseline. A prerelease may be published
only if it is clearly labeled experimental and lists the known syntax and C
installation limitations. Stable publication is allowed only after every exit
criterion in this document is satisfied.

## Priority Map

| Priority | Work | Release requirement |
| --- | --- | --- |
| P0 | Restore truthful coverage and add the four confirmed regressions | Valid tcsh syntax must not remain hidden behind `tested` matrix rows |
| P0 | Repair brace composition, literal bracket words, and block-header comments | All minimal probes and the pinned upstream sample set parse without unexpected `ERROR` or `MISSING` |
| P0 | Add a pinned upstream sample gate | The known 6-of-9 result becomes 9-of-9, with no unexplained exclusions |
| P1 | Verify included-range scanner behavior with the real C API | Heredoc state must not be synthesized or reused incorrectly at range boundaries |
| P1 | Complete builtin and operator query contracts | Editor-query claims must be backed by position-sensitive captures |
| P1 | Add standard C build and install metadata | A packed artifact must install and support a consumer without direct `src/` paths |
| P1 | Make CI run publication-equivalent gates | A green pull request must imply the stable release checks are green |
| P2 | Reconcile metadata and documentation | README, package metadata, historical plans, and release claims must describe the same product |

P0 items are syntax-truth blockers. P1 items are practical distribution
blockers. P2 is completed before tagging but must not delay work on P0 or P1.

## Current-State Evidence

The baseline has unusually strong internal validation:

- `npm run check:release` passes on macOS/Clang.
- All 28 corpus sections pass.
- The coverage matrix reports 158 rows: 151 `tested`, zero `implemented`, and
  seven runtime-only `unsupported-with-reason` rows.
- Scanner state, C11 compilation, node contracts, smoke examples, query syntax,
  query captures, recovery, large-input stress, incremental parsing, and a
  packed-source C consumer all pass.
- Generated artifacts remain synchronized after `npm run generate`.
- The latest Ubuntu/GCC development CI passes after the scanner signedness fix
  in the baseline commit.

Those checks are necessary but not sufficient. A differential audit against the
pinned tcsh 6.24.16 source tree at
`f773aba56aa128a38712987b1b8bdbc393d1e4d0` found:

- six of nine selected official configuration/completion files parse cleanly;
- `complete.tcsh`, `dot.tcshrc`, and `win32/example.tcshrc` produce unexpected
  `ERROR` nodes; and
- the following independently isolated inputs pass `/bin/tcsh -n` but fail the
  Tree-sitter parser:

  ```tcsh
  echo "$HOME/."{,r,ssh/known_}hosts*
  echo {-d,--{de,un}compress}
  bindkey ^[^W kill-region
  if (! $?prompt) then # inline header comment
    echo interactive
  endif
  ```

The failures map to four concrete gaps:

1. `immediateWordFragment` has no immediate brace-pattern fragment, so a brace
   expansion cannot follow a quote or substitution inside one logical word.
2. `brace_pattern` is one finite-depth token. It accepts the existing
   `a{b,{c,d}}e` fixture but not a nested expansion whose nested brace has a
   suffix inside the same alternative.
3. `bare_word` excludes brackets unconditionally. A valid literal control-key
   word such as `^[^W` is therefore rejected even though it is not a complete
   glob character class.
4. line-delimited control-flow headers require `_newline` immediately after the
   header and do not allow a trailing comment.

Additional release gaps are independent of those parser bugs:

- `.github/workflows/ci.yml` runs `npm run check`, not
  `npm run check:release`; stress, release-only matrix enforcement, and the
  packed consumer do not protect pull requests.
- `tree-sitter.json` declares a C binding, but the package has no standard
  Makefile, CMake project, pkg-config metadata, or installed-header layout.
- `docs/scanner-design.md` requires included-range coverage, while the scanner
  unit test's `is_at_included_range_start` callback always returns `false` and
  no real `ts_parser_set_included_ranges` test exists.
- `highlights.scm` recognizes only a subset of the audited builtin names and
  captures few expression or assignment operators.
- the packed-source consumer proves direct compilation from `src/`, but not a
  normal install-and-consume workflow.

## Product Contract

The completed release must satisfy all of these invariants:

1. Every supported parser-readable syntax row is `tested` and names a concrete
   fixture and expected node.
2. A successful parse is not enough: logical word ranges, named descendants,
   fields, and query captures must match the source contract.
3. Valid default-mode tcsh syntax must not produce unexpected `ERROR` or
   `MISSING` nodes.
4. Invalid paired probes must retain visible recovery; grammar broadening must
   not turn invalid redirects, substitutions, block boundaries, or glob forms
   into clean high-level nodes.
5. Existing public node and field contracts remain stable unless this plan
   explicitly admits and tests a pre-`0.1.0` CST migration.
6. Generated `src/parser.c`, `src/grammar.json`, and `src/node-types.json` remain
   committed and synchronized with `grammar.js`.
7. The external scanner token order and serialized-state format remain stable.
   Any new external token requires a separate update to
   `docs/scanner-design.md` before implementation.
8. The npm artifact remains C-only. No Node, Python, Rust, Go, Swift, or Zig
   runtime binding is implied by this work.
9. A C consumer can build against an installed package using documented build
   metadata; direct knowledge of repository `src/` paths is not required.
10. A pull request cannot be green while `npm run check:release` or the pinned
    upstream sample gate is red.

## Non-Goals

- No execution of aliases, substitutions, globs, jobs, builtins, or shell
  commands.
- No support for mutable lexical modes such as custom `histchars` unless a
  separate coverage row and design are approved.
- No Node or other high-level runtime binding.
- No wholesale import of upstream tcsh scripts or third-party grammar code.
- No unrelated grammar cleanup, precedence retuning, Tree-sitter CLI upgrade,
  or parser-table optimization.
- No arbitrary increase in brace-regex nesting depth. Brace nesting must be
  represented recursively in the grammar.
- No absolute performance threshold that depends on CI machine speed; retain
  the current ratio-based stress gates.

## Dependency Order

```text
P0 truthful matrix and failing probes
  -> P0 recursive brace composition
  -> P0 literal bracket/control words
  -> P0 block-header comments
  -> P0 pinned upstream sample audit loop
     -> P1 included-range scanner contract ----+
     -> P1 editor query contract ---------------+-> P1 C distribution
                                                    -> P1 CI/publication gates
                                                       -> P2 docs and stable tag
```

Do not begin publication automation while known syntax rows are still
`implemented`. Scanner, query, and C packaging work may proceed in parallel only
after the public CST produced by the P0 grammar work is stable.

## Planned File Changes

### Create

- `test/corpus/release_regressions.txt`
  - Positive structural fixtures for the four confirmed syntax gaps and paired
    invalid/ambiguity probes.
- `scripts/check-upstream-samples.js`
  - Parse an explicitly supplied tcsh 6.24.16 checkout and report per-file
    `ERROR`/`MISSING` results without downloading or mutating external sources.
- `test/c_included_ranges.c`
  - Exercise heredoc and non-heredoc included ranges through the real
    Tree-sitter C API.
- `Makefile`
- `CMakeLists.txt`
- canonical C public-header and pkg-config template files under `bindings/c/`
  - Use the layout generated by the pinned Tree-sitter CLI as the starting
    point, retaining only the declared C binding.
- `scripts/check-release-metadata.js`
  - Validate version agreement, binding claims, required package files, and
    generated-artifact cleanliness.
- `.github/workflows/release.yml`
  - Run tag/manual publication gates and produce a verified package artifact;
    publishing credentials remain a separate maintainer decision.
- `docs/release-checklist.md`
  - Record the stable tag checklist and the supported C consumer contract.

### Modify

- `grammar.js`
- `src/parser.c`
- `src/grammar.json`
- `src/node-types.json`
- `docs/syntax-coverage-matrix.md`
- `docs/reference-ledger.md`
- `docs/scanner-design.md`
- `docs/builtin-index.md`
- `docs/feature-plan.md`
- `test/scanner_test.c`
- `test/c_consumer.c`
- `queries/highlights.scm`
- `examples/query-contract.tcsh`
- `scripts/check-node-contract.js`
- `scripts/check-parser-runtime.js`
- `scripts/check-package.js`
- `scripts/check-query-captures.js`
- `package.json`
- `tree-sitter.json`
- `.github/workflows/ci.yml`
- `README.md`

Only touch a listed file when its task requires it. Do not reformat adjacent
grammar, query, script, or documentation content.

## Global Success Criteria

- The four confirmed minimal probes parse without unexpected `ERROR` or
  `MISSING` and expose the expected `word`, `brace_pattern`, `bare_word`,
  `if_statement`, and `comment` structure.
- Existing valid glob classes such as `file[0-9]` remain `glob_pattern` nodes;
  literal/incomplete bracket words do not steal valid class patterns.
- Nested brace patterns are recursive and support empty alternatives, nested
  alternatives with prefixes/suffixes, and adjacency to quotes, variables, and
  ordinary text.
- All nine pinned upstream sample files parse successfully. Any additional
  default-mode syntax gap discovered during this loop is added to the matrix and
  corpus before release.
- `docs/syntax-coverage-matrix.md` has zero `implemented` rows at the final gate.
- Included-range tests demonstrate correct behavior before a heredoc, inside a
  heredoc body, and after an edit that changes its delimiter or terminator.
- Query tests cover the complete audited builtin-name set in command position,
  reject the same names in argument position, and capture every documented
  expression/assignment/redirect operator category intended for highlighting.
- Make and CMake builds succeed from the npm tarball. A temporary installation
  exposes the public header and pkg-config metadata, and a fresh consumer links
  without direct source-tree include paths.
- Linux/GCC, macOS/Clang, and the declared CMake portability target compile the
  generated parser and scanner with warnings treated as errors.
- Pull-request CI runs the full release gate and the pinned upstream sample job.
- A tag workflow verifies version synchronization, a clean regeneration diff,
  package contents, and `npm publish --dry-run` before producing an artifact.
- `npm run check`, `npm run check:release`, `git diff --check`, and the final
  package audit pass from a clean worktree.

---

## P0 Task 1: Restore a Truthful Coverage Baseline

**Files:**

- Modify: `docs/syntax-coverage-matrix.md`
- Create: `test/corpus/release_regressions.txt`
- Modify: `docs/reference-ledger.md`

- [ ] **Step 1: Record the implementation baseline**

  Run:

  ```sh
  git status --short
  git rev-parse HEAD
  node_modules/.bin/tree-sitter --version
  npm run check:release
  ```

  Expected: record the exact commit and tool version. Existing unrelated changes
  must be preserved and kept outside this work.

- [ ] **Step 2: Make the matrix precise before fixing the grammar**

  Add or split rows so these obligations are independently observable:

  - adjacent brace expansion as one logical word (`TC-WORD-000A`);
  - nested brace alternative with a suffix-bearing nested expansion
    (`TC-WORD-015A`);
  - literal/incomplete bracket text in a command argument (`TC-WORD-022`);
  - trailing comment on a line-delimited block header (`TC-CTRL-016`).

  Mark each new row `implemented` until its positive fixture passes and its
  expected CST is checked. Narrow any existing row whose wording currently
  claims more than its fixture proves; do not merely add overlapping rows while
  leaving a false broad claim.

- [ ] **Step 3: Record upstream provenance without copying files**

  Update `docs/reference-ledger.md` with:

  - tag `TCSH6_24_16` and commit
    `f773aba56aa128a38712987b1b8bdbc393d1e4d0`;
  - the nine audited sample paths;
  - the audit date and initial 6-of-9 result; and
  - a statement that only independently authored minimal fixtures are committed.

- [ ] **Step 4: Add the positive and paired probes**

  `test/corpus/release_regressions.txt` must include the four confirmed valid
  inputs and enough paired cases to protect lexical boundaries:

  ```tcsh
  echo "$HOME/."{,r,ssh/known_}hosts*
  echo {-d,--{de,un}compress}
  bindkey ^[^W kill-region
  if (! $?prompt) then # inline header comment
    echo interactive
  endif
  echo file[0-9] file[^0-9]
  ```

  Determine literal-brace and malformed-class expectations from the pinned
  manual/source and `/bin/tcsh -n`; do not infer them from the current parser.

- [ ] **Step 5: Confirm tests fail for the intended reasons**

  Run the focused corpus filter before editing `grammar.js`.

  ```sh
  npm test -- --filter 'release regressions'
  npm run check:coverage-matrix
  npm run check:coverage-matrix:release
  ```

  Expected: the focused corpus test and release matrix are red, while the
  non-release matrix accepts honestly tracked `implemented` work. Do not commit
  a permanently red intermediate tree; keep each fixture and its minimal fix in
  the same implementation commit.

## P0 Task 2: Replace the Brace Token with Recursive Word Fragments

**Files:**

- Modify: `grammar.js`
- Modify: `test/corpus/release_regressions.txt`
- Modify: `test/corpus/substitutions.txt`
- Modify: `scripts/check-node-contract.js`
- Modify: `docs/syntax-coverage-matrix.md`
- Regenerate: `src/parser.c`, `src/grammar.json`, `src/node-types.json`

- [ ] **Step 1: Characterize the existing public CST**

  Save parse trees for the existing cases before the change:

  ```tcsh
  echo a{b,{c,d}}e
  echo {a,b}.c
  echo pre"$USER"post
  ```

  Decide the stable pre-`0.1.0` CST deliberately. The recommended contract is
  one outer `word` containing ordered fragments, with a named recursive
  `brace_pattern` fragment and nested `brace_pattern` descendants. Prefix and
  suffix text belong to sibling word fragments rather than being swallowed by
  one monolithic brace token.

- [ ] **Step 2: Implement a recursive brace grammar**

  Replace the finite-depth `brace_pattern` regex with grammar rules that:

  - require at least one comma at each brace-expansion level;
  - allow empty alternatives such as `{,r}`;
  - allow an alternative to contain ordered literal and nested brace fragments;
  - preserve byte adjacency with `token.immediate` inside one logical word;
  - allow brace fragments in both initial and immediate word-fragment positions;
  - support adjacency to quoted strings, substitutions, globs, and ordinary
    text; and
  - expose no zero-width named token or repeatable empty rule.

  Do not implement a fixed second or third nesting level. Do not add an external
  scanner token for brace nesting.

- [ ] **Step 3: Protect ambiguity boundaries**

  Add positive and negative fixtures for:

  - standalone, adjacent, and nested brace expansions;
  - nested braces with text before and after the nested expansion;
  - empty alternatives;
  - literal braces when the pinned syntax says they are literal; and
  - whitespace around braces or commas where it changes word boundaries.

- [ ] **Step 4: Regenerate and inspect the CST migration**

  Run:

  ```sh
  npm run generate
  git diff -- src/node-types.json
  rg -n 'brace_pattern|word' src/node-types.json
  npm test -- --filter 'structured substitutions and patterns|release regressions'
  npm run check:node-contract
  ```

  Expected: only the approved brace/word node-shape change appears. Update the
  node contract and downstream-facing documentation in the same commit. Stop if
  unrelated command, expression, substitution, or glob nodes change.

- [ ] **Step 5: Promote precise matrix rows**

  Set the adjacent and nested-brace rows to `tested` only after their exact
  expected nodes are present in the corpus fixture.

## P0 Task 3: Preserve Literal Bracket and Control-Key Words

**Files:**

- Modify: `grammar.js`
- Modify: `test/corpus/release_regressions.txt`
- Modify: `test/corpus/word_boundaries.txt`
- Modify: `docs/syntax-coverage-matrix.md`
- Regenerate: `src/parser.c`, `src/grammar.json`, `src/node-types.json`

- [ ] **Step 1: Establish the lexical contract**

  Use the pinned tcsh source/manual and `/bin/tcsh -n` to classify:

  ```tcsh
  bindkey ^[^W kill-region
  echo file[0-9]
  echo file[^0-9]
  echo file[abc
  echo file]
  ```

  Record which forms are literal words, valid glob classes, or invalid syntax.

- [ ] **Step 2: Prefer valid glob tokens and fall back to literal text**

  Adjust lexical precedence and the initial/immediate bare-word regexes so a
  complete glob class remains a `glob_pattern`, while bracket text that cannot
  form a complete class may remain a lower-precedence literal `bare_word` when
  tcsh accepts it.

  Keep the initial and immediate word-fragment contracts symmetrical. Do not
  broadly admit whitespace, command separators, substitutions, quotes, or
  redirects into `bare_word`.

- [ ] **Step 3: Use the scanner gate if grammar-only lexing is insufficient**

  If lexical precedence cannot distinguish the valid and literal forms without
  corrupting existing globs, stop. Document the demonstrated failure in
  `docs/scanner-design.md`, specify token state/recovery/serialization tests, and
  obtain a separate scanner-token decision before modifying `src/scanner.c`.

- [ ] **Step 4: Verify focused and full boundaries**

  Run:

  ```sh
  npm run generate
  npm test -- --filter 'compositional word boundaries|release regressions'
  npm run check:no-error
  npm run check:recovery
  ```

  Expected: `^[^W` is one argument word, valid glob classes remain named glob
  nodes, and invalid paired cases retain visible recovery.

## P0 Task 4: Allow Comments on Line-Delimited Block Headers

**Files:**

- Modify: `grammar.js`
- Modify: `test/corpus/release_regressions.txt`
- Modify: `test/corpus/command_boundaries.txt`
- Modify: `docs/syntax-coverage-matrix.md`
- Regenerate: `src/parser.c`, `src/grammar.json`, `src/node-types.json`

- [ ] **Step 1: Inventory newline-owning headers**

  Review `if`/`else if`/`else`, `foreach`, `while`, `switch`, `case`, and
  `default` forms that currently consume `_newline` directly. Confirm the
  trailing-comment rule for each against tcsh 6.24.16 before changing it.

- [ ] **Step 2: Introduce one hidden line-end helper**

  Add the smallest hidden helper representing `optional(comment) + newline` and
  use it only in line-delimited header/branch rules that share that syntax. Do
  not make comments global extras; their newline-sensitive ownership must remain
  explicit.

- [ ] **Step 3: Add position-sensitive fixtures**

  Cover a comment after an `if ... then` header plus representative branch and
  loop/switch headers confirmed by the reference. Pair them with same-line forms
  where `#` is not a comment or where a required newline is absent.

- [ ] **Step 4: Verify CST and queries**

  Run:

  ```sh
  npm run generate
  npm test -- --filter 'command and line boundaries|release regressions'
  npm run check:queries
  npm run check:query-captures
  npm run check:recovery
  ```

  Expected: the comment remains a named `comment` child, block body and
  alternatives keep their existing fields, and later top-level statements still
  recover independently.

## P0 Task 5: Gate the Pinned Upstream Sample Set

**Files:**

- Create: `scripts/check-upstream-samples.js`
- Modify: `scripts/check-parser-runtime.js`
- Modify: `package.json`
- Modify: `docs/reference-ledger.md`
- Modify as discoveries require: grammar, corpus, matrix, generated artifacts

- [ ] **Step 1: Define an explicit external-source interface**

  The script must require an absolute `--upstream-root` argument. It must not
  clone, fetch, modify, or execute upstream files. Reuse the shared parser
  library contract and batch all selected files into one
  `tree-sitter parse --json-summary` invocation.

- [ ] **Step 2: Pin the initial sample manifest**

  Start with these tcsh 6.24.16 paths:

  ```text
  complete.tcsh
  dot.tcshrc
  dot.login
  cygwin/bindkey.tcsh
  cygwin/csh.cshrc
  cygwin/csh.login
  debian/csh.cshrc
  debian/csh.login
  win32/example.tcshrc
  ```

  Fail on a missing file, wrong upstream commit, parser process error, or any
  unsuccessful parse summary. Report every failing file rather than stopping at
  the first one.

- [ ] **Step 3: Close every remaining valid-syntax failure**

  Re-run the nine-file audit after Tasks 2-4. For every remaining unexpected
  error:

  1. isolate the smallest source form;
  2. confirm it against the pinned source/manual and `tcsh -n`;
  3. add or refine a matrix row;
  4. add a structural corpus fixture and paired boundary case;
  5. apply the smallest grammar/scanner fix; and
  6. rerun the focused, upstream, and full release gates.

  No file that is valid in the pinned default syntax may be excluded merely to
  make the gate green. Platform-specific runtime behavior is not a reason to
  exclude parser-readable syntax.

- [ ] **Step 4: Keep local validation offline**

  Add a standalone command such as:

  ```sh
  npm run check:upstream -- --upstream-root /absolute/path/to/tcsh-6.24.16
  ```

  Do not make `npm run check:release` download external content. The CI upstream
  job in Task 9 supplies the pinned checkout explicitly.

## P1 Task 6: Test Included Ranges Through the Real C API

**Files:**

- Create: `test/c_included_ranges.c`
- Modify: `test/scanner_test.c`
- Modify: `scripts/check-package.js`
- Modify: `package.json`
- Modify: `docs/scanner-design.md`

- [ ] **Step 1: Turn the documented behavior into assertions**

  Use `ts_parser_set_included_ranges` with byte-accurate `TSRange` values to test:

  - a range beginning before a complete heredoc redirect;
  - a range beginning inside an opaque heredoc body with no visible opener;
  - a range beginning at the terminator line;
  - disjoint non-heredoc ranges; and
  - reparsing after an edit changes the operator, delimiter, body, or terminator.

- [ ] **Step 2: Assert structural safety, not one recovery layout**

  A complete visible heredoc must attach its delimiter/body/end correctly. A
  range that begins inside the body must not synthesize a delimiter or end token
  from bytes outside the range and must not reuse stale serialized state. Permit
  documented recovery variation, but assert the absence of a false clean
  high-level heredoc.

- [ ] **Step 3: Keep the scanner unit test focused**

  Extend the mock test only for scanner-local range-start signals if the scanner
  consumes them. The real parser/range contract belongs in the C API test; do not
  pretend that a hard-coded callback alone covers integration.

- [ ] **Step 4: Integrate with release/package validation**

  Compile and execute the included-range consumer against the same installed C
  artifact used by the package test. Add a standalone `check:included-ranges`
  entry only if it can share the pinned runtime prerequisite without duplicating
  build logic.

## P1 Task 7: Complete Editor Query Contracts

**Files:**

- Modify: `queries/highlights.scm`
- Modify: `examples/query-contract.tcsh`
- Modify: `scripts/check-query-captures.js`
- Modify: `docs/builtin-index.md`

- [ ] **Step 1: Make the audited builtin set executable evidence**

  Enumerate every builtin name claimed by `docs/builtin-index.md`, separating:

  - specialized grammar nodes such as `alias`, `set`, `source`, and `exit`;
  - control-flow keywords represented by statement nodes; and
  - ordinary command-position builtin words, including hyphenated names.

- [ ] **Step 2: Match complete command words, not only identifiers**

  Update the simple-command highlight pattern so audited names represented by a
  `bare_word` or other single static word fragment can be captured. Keep the
  command-position constraint and an anchored text predicate. Do not capture the
  same text in argument position or dynamic command names.

- [ ] **Step 3: Capture the supported operator surface**

  Add explicit `@operator` captures for the documented binary, unary,
  assignment, update, redirect, file-test, substitution, and history-modifier
  categories represented by the CST. Do not use a broad wildcard that captures
  parentheses, separators, or unrelated punctuation.

- [ ] **Step 4: Strengthen position-sensitive tests**

  Generate or list every audited builtin once in command position and once for a
  representative argument-position negative check. Assert operator capture text
  and source positions for each category. Keep syntax-compilation checks for all
  four query files.

- [ ] **Step 5: Verify query behavior after the final grammar**

  Run:

  ```sh
  npm run check:queries
  npm run check:query-captures
  npm run check:no-error
  ```

  Expected: complete, non-duplicated captures with no argument-position builtin
  false positives.

## P1 Task 8: Ship a Standard Installable C Package

**Files:**

- Create/modify: `Makefile`, `CMakeLists.txt`, canonical `bindings/c/` headers
  and pkg-config template
- Modify: `scripts/check-package.js`
- Modify: `test/c_consumer.c`
- Modify: `package.json`, `tree-sitter.json`, `README.md`

- [ ] **Step 1: Derive the C layout from the pinned CLI**

  Generate a temporary C-only parser skeleton with `tree-sitter-cli@0.26.8` and
  use its Make, CMake, installed-header, and pkg-config conventions as the
  baseline. Copy no other language binding and retain `node: false`,
  `python: false`, `rust: false`, `go: false`, `swift: false`, and `zig: false`.

- [ ] **Step 2: Choose the public-header migration explicitly**

  The current package exposes `bindings/c/tree-sitter-tcsh.h`. Before the first
  stable release, either make that path canonical or replace it with the CLI
  standard path and update every consumer/test/document in one commit. Do not
  ship two undocumented competing headers.

- [ ] **Step 3: Build and install both supported paths**

  Make and CMake must compile `src/parser.c` and `src/scanner.c`, expose the
  `tree_sitter_tcsh` symbol, install the public header and library, and emit
  usable pkg-config metadata with the package version.

- [ ] **Step 4: Replace the direct-source package smoke with install-and-consume**

  From `npm pack` in a temporary directory:

  1. assert all grammar, scanner, query, build, header, and metadata files exist;
  2. configure and install to a temporary prefix;
  3. compile `test/c_consumer.c` using only the installed header/library and
     pkg-config or documented CMake package interface;
  4. register the language and parse a representative sample;
  5. run the included-range consumer; and
  6. fail if Node build metadata or an undeclared binding is present.

- [ ] **Step 5: Complete npm metadata without implying Node usage**

  Add repository/homepage/bugs metadata, preserve the C-only description, keep
  runtime dependencies empty, and verify the `files` allowlist contains exactly
  the consumer-facing source, queries, build metadata, public headers, license,
  and concise documentation. Historical implementation plans need not ship in
  the npm tarball.

- [ ] **Step 6: Document the consumer contract**

  README installation examples must distinguish:

  - npm as a source-artifact transport;
  - Make/CMake installation;
  - the required compatible `libtree-sitter` runtime; and
  - the deliberate absence of a Node `require()` API.

## P1 Task 9: Make CI and Tag Workflows Publication-Equivalent

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `scripts/check-release-metadata.js`
- Modify: `package.json`

- [ ] **Step 1: Make the protected pull-request job run the full gate**

  Install the pinned C runtime/build prerequisites and run
  `npm run check:release`, not only `npm run check`. Avoid two jobs that duplicate
  the complete parser build unless they test different compilers/platforms.

- [ ] **Step 2: Add portability compilation**

  Add a small matrix that compiles the parser, scanner, and CMake package with
  warnings as errors on the declared platforms. At minimum retain Ubuntu/GCC and
  macOS/Clang. Add Windows/MSVC only if the README claims Windows C builds; if it
  is deferred, state that scope explicitly instead of silently implying it.

- [ ] **Step 3: Add the pinned upstream job**

  Check out `tcsh-org/tcsh` at exact commit
  `f773aba56aa128a38712987b1b8bdbc393d1e4d0` into a separate workspace path and
  pass that absolute path to `check-upstream-samples.js`. Verify the checked-out
  SHA before parsing.

- [ ] **Step 4: Detect stale generated files and metadata**

  `check-release-metadata.js` must verify:

  - `package.json` and `tree-sitter.json` versions agree;
  - only declared bindings are packaged;
  - required C/query/parser/scanner files exist;
  - generation followed by `git diff --exit-code -- src` is clean; and
  - the stable version is not a prerelease when a stable tag is requested.

- [ ] **Step 5: Add a non-publishing tag workflow first**

  On `v*` tags and manual dispatch:

  ```text
  full release gate
    -> pinned upstream gate
    -> version/tag agreement
    -> npm pack and install-consumer audit
    -> npm publish --dry-run
    -> upload verified tarball artifact
  ```

  Do not add an automatic `npm publish` step until maintainers explicitly choose
  registry credentials, provenance settings, and approval protection.

- [ ] **Step 6: Require the publication-equivalent job**

  Configure branch protection so the full release job, not the old development
  subset, is required before merge. Record this repository setting in the release
  checklist because it cannot be enforced by committed workflow YAML alone.

## P2 Task 10: Reconcile Documentation and Perform the Final Audit

**Files:**

- Create: `docs/release-checklist.md`
- Modify: `README.md`
- Modify: `docs/feature-plan.md`
- Modify: `docs/reference-ledger.md`
- Modify: `docs/scanner-design.md`
- Modify: `docs/syntax-coverage-matrix.md`
- Modify: `docs/builtin-index.md`

- [ ] **Step 1: Separate historical plans from current product truth**

  Mark the earlier parser-correctness and performance plans with their completion
  commits and link this remediation plan as the active stable-release plan. Do
  not leave a document labeled `implemented` while its “current baseline” text
  describes a superseded repository state.

- [ ] **Step 2: Update the user-facing scope**

  README must state:

  - the pinned syntax reference;
  - the C-only install and usage path;
  - the exact non-goals for runtime and mutable lexical behavior;
  - the upstream sample gate and release commands; and
  - any platform intentionally outside the initial C build claim.

- [ ] **Step 3: Write the stable release checklist**

  Include exact commands, expected artifacts, required CI jobs, upstream commit,
  package-name ownership check, version synchronization, clean-worktree check,
  tag format, and manual registry approval.

- [ ] **Step 4: Run the final validation from a clean tree**

  ```sh
  npm ci
  npm run check
  npm run check:release
  npm run check:upstream -- --upstream-root /absolute/path/to/tcsh-6.24.16
  npm pack --dry-run --json
  git diff --check
  git status --short
  ```

  Expected: every command passes; the upstream summary is 9-of-9; the matrix has
  151 or more tested parser-readable rows, zero implemented rows, and only
  justified runtime-only unsupported rows; the worktree is clean after
  generation.

- [ ] **Step 5: Inspect the final artifact manually**

  Confirm that the tarball contains no tests, temporary files, local plans that
  are not consumer documentation, Node build metadata, caches, or unrelated
  repository history. Confirm the installed C consumer and editor queries use
  only packaged paths.

## Suggested Commit Sequence

1. `docs(coverage): record release syntax gaps`
2. `fix(grammar): compose recursive brace patterns`
3. `fix(grammar): preserve literal bracket words`
4. `fix(grammar): allow block header comments`
5. `test(parser): gate pinned tcsh samples`
6. `test(scanner): cover included ranges`
7. `fix(queries): complete editor captures`
8. `build(c): add standard install metadata`
9. `ci(release): enforce publication gates`
10. `docs(release): define stable c contract`

Keep syntax fixes separate so generated-parser and CST changes can be reviewed
independently. Each syntax commit includes its focused fixture, generated files,
matrix status promotion, and node-contract update. Do not squash unrelated P0,
P1, and P2 work during review.

## Stop and Rollback Rules

- If a grammar fix changes unrelated named nodes, fields, query captures, or
  recovery structure, stop and reduce its scope before updating expectations.
- Never update a positive fixture to contain `ERROR` or `MISSING` merely to make
  the suite pass.
- Do not let a broader `bare_word` token consume valid variable, history, glob,
  quote, redirect, separator, or comment syntax.
- If recursive brace rules introduce unresolved conflicts or pathological state
  growth, inspect rule factoring and adjacency first. Do not fall back to an
  arbitrary finite-depth regex.
- No new scanner token may be implemented before its DSL failure, valid-symbol
  behavior, state, serialization, recovery, included-range, and incremental
  tests are admitted in `docs/scanner-design.md`.
- An upstream sample exclusion requires a pinned-reference explanation and a
  matrix classification. “Complex file” or “platform-specific runtime” is not
  sufficient for parser-readable syntax.
- Do not weaken stress ratios, skip release checks, or make failures
  `continue-on-error` to stabilize CI.
- If the installed-package consumer fails while direct source compilation passes,
  fix build/install metadata rather than restoring the direct-source smoke as the
  only gate.
- Do not enable an automatic registry publish until the dry-run workflow and
  manual artifact verification have succeeded on the intended tag.

## Completion Definition

This plan is complete when the parser has no known default-mode syntax errors on
the pinned sample set, every claim has structural evidence, included-range and
incremental scanner behavior are verified, editor queries match the documented
contract, a fresh consumer can install and use the packed C artifact, and the
same gates protect pull requests and tags. At that point—and only then—the
repository may remove the prerelease warning and tag stable `0.1.0`.
