# Parser Correctness and Release Feature Plan

- Status: implemented; release gates added
- Parser audit baseline: `5392785` on 2026-07-31
- Target reference: documented tcsh 6.24.16 surface syntax
- Initial distribution decision: C-only

## Goal

Make `tree-sitter-tcsh` a syntactically faithful, structurally safe parser for
documented tcsh/csh source files. The next release must preserve logical word,
command, redirection, substitution, and control-flow boundaries; expose a stable
CST contract for editor consumers; and provide at least one coherent consumer
distribution path.

This plan treats `tree-sitter-bash` only as an architecture and packaging
comparison. Bash-only syntax is not a tcsh requirement, and no third-party
grammar or scanner code is to be copied without the provenance update required
by [the reference ledger](./reference-ledger.md).

## Current baseline

The generated parser is synchronized with `grammar.js`, compiles as C11, exports
the expected Tree-sitter language symbol, and parses large and deeply nested
inputs without crashes or pathological scaling. Those properties should be
preserved.

The current documented coverage claims are nevertheless too optimistic:

- A logical shell word is represented as one fragment rather than a composition
  of adjacent literal, quoted, escaped, and substituted fragments.
- Here-document bodies are parsed as ordinary tcsh commands and can silently
  change an enclosing control-flow tree.
- Valid source forms can produce `ERROR`, while invalid forms can produce a clean
  high-level node.
- Successful parses can expose the wrong argument count, variable reference,
  label, source target, or builtin classification.
- Query files compile, but their captures do not consistently describe the CST.
- The declared C-only binding scope and the included, non-functional Node build
  metadata do not form a coherent distribution contract.
- [The syntax coverage matrix](./syntax-coverage-matrix.md) marks several of
  these behaviors `tested`, so the current release gate does not express actual
  parser correctness.

The following plans record earlier consumer-contract work and remain useful
history, but they are not syntax oracles for this roadmap:

- [Switch and source structure](./superpowers/plans/2026-05-28-tree-sitter-tcsh-switch-source-structure.md)
- [tcsh-lsp vendor contract closure](./superpowers/plans/2026-05-29-tcsh-lsp-vendor-contract-closure.md)
- [Braced variable node contract](./superpowers/plans/2026-05-30-braced-variable-node-contract.md)

P0 may correct syntax assumptions in those plans. Valid consumer-facing fields
must either be preserved through the rebuild or changed through one explicit,
versioned CST migration.

## Product scope

### In scope

- Parser-readable tcsh 6.24.16 syntax under documented default behavior.
- Logical words, quoting, variable/history substitution, glob and job syntax.
- Command lists, redirections, control flow, expressions, and builtin surface
  forms.
- Exact here-document delimiter and body attachment.
- Stable named nodes and fields needed by editor and LSP consumers.
- Accurate highlights, locals, tags, and folds.
- Error recovery, incremental parsing, and performance regression protection.
- A working C distribution; a Node binding only if it is explicitly selected
  and implemented as a supported product surface.

### Runtime non-goals

The parser will preserve syntax for these constructs but will not calculate:

- Syntax introduced after alias expansion or by executing `eval`, `source`, or
  command substitution.
- Variable and history values or the runtime validity of selector ranges.
- Filesystem glob matches, sorting, file inquiry results, or directory-stack
  contents.
- Job/process resolution or command execution behavior.
- Every alternate lexical mode produced by mutable options such as `histchars`,
  `backslash_quote`, `csubstnonl`, and `compat_expr`.
- Platform- or build-specific builtin availability beyond the pinned reference.

Bash functions, `[[ ... ]]`, `$(( ... ))`, process substitution, here-strings,
and Bash parameter-expansion operators are explicitly not tcsh feature gaps.

## Expected repository touchpoints

- Modify `grammar.js` for every parser-owned syntax and CST change.
- Create `src/scanner.c` only after the P3 scanner gate is complete.
- Regenerate `src/parser.c`, `src/grammar.json`, and `src/node-types.json`; never
  edit them as source files.
- Extend `test/corpus/surface_syntax.txt`, splitting corpus files only when a
  syntax family becomes difficult to review in the existing file.
- Rebuild `queries/highlights.scm`, `queries/locals.scm`, `queries/tags.scm`, and
  `queries/folds.scm` after the P6 CST contract is stable.
- Extend `scripts/check-coverage-matrix.js` and `scripts/check-node-contract.js`,
  and add narrowly scoped query-capture, recovery/stress, and package-consumer
  checks when their milestones begin.
- Update `package.json`, `tree-sitter.json`, and either remove or complete
  `binding.gyp` according to the P0 distribution decision implemented in P9.
- Update `README.md` only after the selected scanner and distribution claims are
  implemented and verified.

## Delivery rules

Every parser-readable change follows the same evidence loop:

1. Pin the official manual or source behavior in the coverage matrix.
2. Add a positive or negative corpus fixture that demonstrates the boundary.
3. Make the smallest grammar, scanner, or query change that satisfies it.
4. Regenerate and inspect `src/parser.c`, `src/grammar.json`, and
   `src/node-types.json`.
5. Update the node contract and coverage status.
6. Run the focused fixture, the relevant component checks, and
   `npm run check` on every milestone. Run `npm run check:release` when the
   release matrix is expected to be green.

Parsing without `ERROR` is not sufficient. Fixtures must also assert logical
word count, named descendants, fields, and query captures where those are part
of the feature contract. Invalid parser-readable syntax must not produce a clean
high-level node merely because Tree-sitter can recover a tree.

The implementation order is a dependency, not a preference:

```text
P0 truthful reference and release gate
  -> P1 compositional word contract
     -> P2 command, comment, and line boundaries
        -> P3 here-document scanner -----------+
        -> P4 word-level substitutions --------+-> P5 statements, expressions,
                                                    nested commands, redirects
           -> P6 exported CST and builtin classification
              -> P7 editor queries
                 -> P8 recovery and performance
                    -> P9 packaging and release
```

Detailed builtin or query expansion must not precede P1. It would encode more
consumer behavior on top of incorrect word boundaries.

## P0. Re-establish a truthful release gate

Priority: release blocker; required before feature implementation.

### Deliverables

- Pin tcsh 6.24.16 in [the reference ledger](./reference-ledger.md). Record any
  comparison revision separately and state whether code was copied; the default
  remains clean-room implementation.
- Re-audit every parser-readable row in
  [the syntax coverage matrix](./syntax-coverage-matrix.md). A fixture containing
  a token is not evidence that its word boundary or CST shape is correct.
- Move known false-green rows back to the existing in-progress status until the
  corresponding milestone is complete. At minimum, revisit command separators,
  inline comments, parenthesized commands, words, substitutions, heredocs,
  expressions, control statements, redirects, source, and builtin rows.
- Remove unsupported syntax claims such as the general ternary expression and
  the `.` source alias. Correct the `printf` and `return` builtin claims against
  the pinned builtin table.
- Split heredoc coverage into operator/marker recognition, delimiter attachment,
  body attachment, quoted delimiter behavior, malformed EOF, and incremental
  scanner recovery.
- Resolve from the pinned tcsh source whether one command may queue multiple
  pending heredocs. Record either a required queue/serialization contract or a
  required negative fixture; do not defer that decision to scanner implementation.
- Admit the heredoc scanner in
  [the scanner design gate](./scanner-design.md) before creating `src/scanner.c`.
- Select the initial distribution contract: C-only is the recommended minimum;
  C plus Node is allowed only if Node registration and consumer smoke tests are
  part of this plan. P3 must integrate the scanner with every selected binding.
- Split development and release commands so an honest in-progress matrix does
  not make all incremental CI unusable. `npm run check` must run development
  regressions and matrix schema checks; `npm run check:release` must add the
  release-green matrix and final distribution gates.
- Record the current silent-CST and false-accept/false-reject probes as regression
  fixtures. Do not import or compare `tree-sitter-bash` test fixtures.

### Exit criteria

- Every matrix row names a pinned source, actual parser node, fixture, and
  observable expectation.
- Runtime-only rows do not hide parser-readable surface gaps.
- `npm run check` remains green for correctly recorded in-progress work, while
  `npm run check:release` is red for known blockers rather than falsely green.
- The audit probe set can be run independently of a locally installed tcsh;
  optional differential execution against tcsh is a development aid, not the
  only CI oracle.

## P1. Rebuild words as adjacent fragments

Priority: highest release blocker.

### Required behavior

- One outer `word` represents exactly one logical shell word.
- Literal text, quotes, escapes, substitutions, and patterns may appear as
  ordered named fragments inside that word.
- Fragment composition must require byte adjacency; global whitespace extras
  must never combine `$` with a later identifier or combine separate arguments.
- `-`, `+`, and `=` remain ordinary word content unless a more specific syntax
  context consumes them.
- Command names, arguments, redirection destinations, `source` targets, and word
  lists share this contract.
- Bourne-style `assignment_word` must not appear in arbitrary tcsh argument
  position. `set`, `@`, and any other assignment form receive context-specific
  grammar rules.
- `source_target` should become a fielded logical word rather than depending on
  an incomplete path-suffix token.

Implementation may use immediate fragment tokens or a narrowly admitted scanner
token, but a plain `repeat(word_fragment)` is not sufficient if extras allow it
to cross whitespace.

### Acceptance examples

| Input | Required CST fact |
| --- | --- |
| `echo pre"$USER"post` | one argument `word` with three adjacent fragments |
| `echo foo-bar C++ x=y --flag=value` | four arguments; none split at `-`, `+`, or `=` |
| `echo a=b` | an ordinary argument, not an assignment |
| `echo $ foo` | two literal/word arguments, not `$foo` |
| `echo foo\ bar` | one escaped word |
| `source pre${dir}/file` | one `target` word spanning the complete path |
| `echo $a[2]` | one word containing one variable substitution and selector |

### Exit criteria

- All acceptance examples have no unexpected `ERROR` or `MISSING`.
- Outer word byte ranges match logical tcsh arguments exactly.
- Relevant word/identifier conflicts are removed rather than retained as stale
  conflict declarations.
- Generated node types expose the intended fragment contract.

## P2. Correct command, comment, and line boundaries

Priority: release blocker. Depends on P1.

### Deliverables

- Treat `&` as a command terminator/separator so `echo one & echo two` produces
  two commands and backgrounds only the first.
- Represent the documented `&&` and `||` grouping rather than a flat operator
  sequence.
- Allow an inline comment after a command and a comment at EOF without a final
  newline, while keeping the documented file/non-interactive interpretation of
  `#` explicit.
- Reject an empty parenthesized command and allow redirections after a non-empty
  parenthesized command.
- Keep one-line `if` and `repeat` bodies from consuming a following outer command
  list.
- Introduce reusable newline-sensitive forms for `then`, `else`, `endif`, `end`,
  `case`, `default`, and `endsw` placement. Do not treat newline and semicolon as
  interchangeable where tcsh does not.

### Acceptance examples

- `echo one & echo two` has two command nodes.
- `echo hi # comment` has one command followed by one comment.
- `# comment` without a trailing newline parses as a comment.
- `( echo ok ) >& err` has a parenthesized command and postfix redirection.
- `()` and `( ; )` do not produce a clean `parenthesized_command`.
- `if (0) false && echo outside` keeps the outer boolean list outside the
  one-line `if` body.
- Invalid same-line block keywords do not produce a clean block statement.

## P3. Implement exact heredoc boundaries with an external scanner

Priority: release blocker. Depends on P1 and P2.

### Scanner contract

Before implementation, update [the scanner design](./scanner-design.md) with:

- External token names and exact `externals` order.
- The official tcsh syntax rows requiring each token.
- Delimiter bytes and quote/substitution mode stored for each pending heredoc.
- Serialization and deserialization formats, bounds, and truncated-state policy.
- EOF, malformed terminator, error recovery, and included-range behavior.
- A proof that every successful scan consumes input and cannot zero-width loop.
- Parser and every declared binding build integration step.

Do not add Bash-only `<<-` or here-string behavior unless a pinned tcsh source
documents it. A first safe implementation may expose an opaque named
`heredoc_body`, but it must preserve exact boundaries. If unquoted-body
substitutions are exposed, quoted and unquoted behavior must be separate and
documented.

### Acceptance examples

The body below must not close the outer `if` or create a `case_clause` or
`comment`:

```tcsh
if (1) then
cat <<EOF
endif
case x:
# data
EOF
echo after
endif
```

Additional fixtures must cover an empty body, quoted delimiter, a nearly matching
line, missing terminator at EOF, serialization/resume, and an incremental edit to
the delimiter. They must also implement the P0 decision: either prove queued
pending heredocs and their serialized order, or prove the unsupported form is not
silently attached to the wrong redirection.

### Exit criteria

- `redirection` exposes delimiter, body, and terminator boundaries through named
  children or fields.
- Body content cannot alter surrounding command or control-flow structure.
- Malformed EOF cannot hang or repeatedly emit a zero-width token.
- The C compile check builds both `parser.c` and `scanner.c`.

## P4. Complete substitutions, quotes, and patterns

Priority: high. Depends on P1 and P2; may proceed alongside P3 after word and
line boundaries are stable.

### Variable and quote surface

- Add `$*`, `$%name`, `${%name}`, `$?<`, and documented named/numeric/special
  forms.
- Represent selectors, open ranges, expression ranges, and modifiers as named
  structure rather than an arbitrary braced suffix.
- Distinguish `${path:h}` from `${path}:h`.
- Add documented dollar-single-quoted strings.
- Model tcsh history behavior inside single quotes and literal `$` boundaries.

### History surface

- Add search and braced events such as `!?text?` and `!{event}`.
- Attach word designators, ranges, and modifier chains to one history node.
- Represent substitution modifiers such as `:s/old/new/` without splitting them
  into unrelated words.
- Add line-leading quick substitution where the official surface requires it.
- Preserve literal `!` where no valid history reference follows.

### Glob, directory-stack, and job surface

- Add nested brace alternation and distinguish literal braces from patterns.
- Preserve documented negated glob, directory-stack references such as `=0`,
  and the complete job-reference surface including search forms.

### Required structural probes

| Input | Required CST fact |
| --- | --- |
| `echo $* $%name $<` | three separate, named variable/special substitutions |
| `echo $a[1-] $a[-2]` | one variable node per word with an open-range selector |
| `echo ${path:h} ${path}:h` | modifier inside braces only for the first word |
| `echo !!:2 !?text?:h` | one history node per word with designator/modifier children |
| `echo $x:s/old/new/` | one substitution with a complete substitution modifier |
| `echo a{b,{c,d}}e` | one nested brace-pattern word |
| `echo =0 %?editor` | directory-stack and job-search nodes, not generic fragments |

Add paired negative probes for unknown/incomplete modifiers and malformed
selectors so a catch-all suffix cannot produce a clean substitution node.

### Exit criteria

- Every substitution remains inside one logical outer word.
- Names, selectors, designators, and modifiers have stable fields.
- Invalid modifiers are not swallowed by a catch-all token.
- Runtime value validation is not encoded as static syntax validation.

## P5. Correct tcsh statements, expressions, labels, and redirects

Priority: high. Depends on P1-P4.

### Deliverables

- Give `@` its own spacing, assignment, update, and operator grammar. Bare `@`
  is valid; any non-empty form must be a complete assignment/update.
  `@x=1` must remain a command word rather than an `at_statement`.
- Give `set` a context-specific assignment grammar, including an empty value,
  without classifying `echo x=y` as assignment.
- Treat `switch` input as its documented string/word surface, not a general
  arithmetic expression.
- Treat `repeat` count and command boundaries according to the builtin surface.
- Add the `exit` expression surface separately from generic command arguments.
- Remove the unsupported general ternary expression and enforce parser-readable
  expression component boundaries.
- Implement the full documented file inquiry operator surface.
- Accept the documented label word surface, including numeric, dotted, and
  hyphenated labels, and expose consistent label/goto fields.
- Replace the redirect operator plus universal optional `&` construction with
  exact allowed forms, including documented spaced variants.
- Keep empty/missing operands only where the pinned tcsh syntax permits them.
- Parse the command grammar inside backticks sufficiently to expose nested syntax
  errors and useful command nodes after the statement grammar is stable;
  execution output remains out of scope.

### Required positive probes

- `set foo=`
- bare `@`
- `@ x <<= 1`
- `source -h pre${dir}/file`
- documented combined and information-returning file inquiries
- `( echo ok ) >& err`
- numeric, dotted, and hyphenated labels with matching `goto`

### Required negative probes

- `@ foo`, `@ = 1`, and other non-empty incomplete assignment/update forms
- `if (1 ? 2 : 3)` and unseparated expression components where invalid
- `switch (1 + 2)`
- invalid redirects such as `<&`, `<<&`, `>&&`, and `>&!&`
- invalid separated `case`/`default` colon forms

Negative probes must contain an error or recovery node and must not expose the
same clean high-level statement as their valid counterpart.

## P6. Stabilize builtin classification and the exported CST

Priority: required before public consumer migration. Depends on P1-P5.

### Builtin policy

- Only builtins with parser-readable special syntax receive specialized grammar
  nodes.
- Plain command-word builtins remain command names; highlighting may recognize
  their text only in command-name position.
- Builtin-like words in argument position are always arguments.
- Synchronize [the builtin index](./builtin-index.md) with the pinned official
  table. Remove `printf`, `return`, and the `.` source alias unless a selected
  compatibility dialect independently documents them.
- Parse `source` options separately so `source -h file` assigns `file` to the
  target field.

### Minimum field contract

| Construct | Required fields |
| --- | --- |
| command | `name`, repeated `argument`, repeated `redirection` |
| redirection | `operator`, `destination`, optional `body` |
| binary expression | `left`, `operator`, `right` |
| control statement | `condition` or `subject`, `body`, optional `alternative` |
| variable substitution | `name`, optional `selector`, repeated `modifier` |
| source statement | optional `option`, `target`, repeated `argument` |
| label/goto | `name` / `target` |

Add only supertypes that simplify a real consumer query. Update
`scripts/check-node-contract.js` to assert fields and child multiplicity, not just
node-name presence. Treat the P1/P4/P6 CST changes as one documented breaking
contract before the first stable release.

## P7. Rebuild editor queries against the stable CST

Priority: required for editor feature claims. Depends on P6.

### Deliverables

- Capture keyword tokens, not complete statement nodes.
- Capture variables only from variable-name nodes, not every `identifier`.
- Capture builtins only in command-name position.
- Define locals from actual assignment/loop binding syntax and references from
  actual substitutions.
- Capture alias and label names as definitions. Capture command-name calls and
  goto targets as references, but leave the decision that a call resolves to an
  alias to the consumer/runtime layer.
- Fold multiline blocks only; avoid overlapping clause/body folds and one-line
  statements.
- Add query capture assertions. Merely compiling `.scm` files is not a behavioral
  query test.

### Acceptance examples

- In `if (1) echo ok`, only `if` is `@keyword`.
- In `echo cd foo`, only command-position `echo` may be a builtin capture; `cd`
  and `foo` remain arguments.
- In `set x = 1; echo $x`, exactly one definition and one reference are captured.
- In `label:; goto label`, the label definition and goto target are captured.
- An alias tag names the alias, not the literal `alias` keyword.
- A one-line statement does not produce a fold.

## P8. Strengthen recovery and protect performance

Priority: final parser quality gate. Depends on P1-P7.

### Deliverables

- Preserve separate named block nodes when two or more nested terminators are
  missing; do not collapse the remaining file into one undifferentiated error.
- Add malformed quote, substitution, heredoc, redirect, and block fixtures.
- Add deterministic generated stress cases for long words, many arguments, deep
  valid nesting, and incomplete nested blocks.
- Exercise incremental reparsing around words, delimiters, and block boundaries.
- Remove unnecessary conflict declarations reported by generation.

### Exit criteria

- No crash, assertion failure, hang, or zero-width scanner loop.
- Later valid top-level siblings remain recoverable after an earlier malformed
  construct.
- Representative parsing remains approximately linear as input size increases;
  after one warm-up, the median of five runs at 2x input size must be no more
  than 3x the median at 1x.
- Existing successful 5 MB word, 100,000-argument, and 50,000-level stress
  fixtures must each finish within a 10-second CI timeout.
- `npm run generate` emits no known unnecessary-conflict warnings.

## P9. Make distribution claims coherent and release

Priority: release gate. Depends on all parser and query milestones.

### Implement the P0 distribution decision

P0 selects one explicit contract:

1. **C-only first release (recommended minimum):** keep C enabled in
   `tree-sitter.json`, add the expected public header/install metadata and a
   fresh-consumer compile/link smoke test, and remove the non-functional
   `binding.gyp` and any Node runtime implication.
2. **C plus Node:** add a real Node registration layer and JavaScript entry
   point, enable Node in the manifest, and test `require`, `setLanguage`, and a
   sample parse from a packed tarball.

Do not retain the current middle state in which native compilation succeeds but
the module cannot register. Go, Python, Rust, and Swift bindings remain separate
features unless explicitly requested.

### Release exit criteria

- `package.json` has a deliberate initial version and metadata matching actual
  support.
- `npm pack` contains every parser, scanner, query, header, and binding file
  needed by the selected distribution contract.
- For C-only, a clean temporary consumer can unpack the tarball, compile and link
  through the public header, and parse a sample.
- For C plus Node, a clean temporary project can install the tarball and complete
  `require`, `setLanguage`, and sample-parse smoke checks.
- All parser-readable coverage rows are release-green and backed by structural
  fixtures.
- Positive fixtures have no unexpected `ERROR` or `MISSING`; negative fixtures
  cannot silently produce valid high-level nodes.
- Node contract and query capture checks pass.
- Parser/scanner compilation, recovery, stress, and incremental checks pass.
- Generated files are synchronized and both `npm run check` and
  `npm run check:release` pass from a clean tree.

## Release priorities

### Critical: must fix before any public release

- Logical word composition and whitespace adjacency.
- Exact heredoc boundaries.
- Inline comments, command separators, block line boundaries, and postfix
  parenthesized redirects.
- Invalid redirect and statement false accepts that produce clean CSTs.
- Stable command, redirection, variable, and control-flow fields.
- A truthful coverage matrix and coherent distribution contract.

### Required: needed for the documented tcsh syntax claim

- Complete documented variable/history/selector/modifier surface.
- File inquiry, `@`, `set`, `switch`, `repeat`, `exit`, label, and source syntax.
- Accurate highlights, locals, tags, and folds.
- Multi-error recovery and performance regression gates.

### Follow-up features

- Additional bindings beyond the selected initial distribution.
- More detailed CST inside heredoc bodies if exact opaque body preservation is
  initially selected.
- Optional parser configurations for mutable tcsh lexical modes.
- Consumer-specific convenience queries that are not part of core syntax truth.

## Completion definition

The feature plan is complete only when there are no known critical silent CST
corruptions, every supported surface claim maps to a pinned reference and an
observable structural fixture, runtime-only limitations are explicit, and a
fresh consumer can use the declared parser package without repository-local
assumptions.
