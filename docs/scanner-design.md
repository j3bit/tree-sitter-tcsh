# Scanner Design Gate

Current status: the boundary tokens `literal_dollar`, `literal_bang`,
`label_name`, `redirect_operator`, `_quick_substitution_start`, `_at_prefix`, and `_bare_at`, the stateful
backtick pair, and the stateful heredoc tokens are implemented. No other
external token is admitted.

The grammar-only prototype could not associate a dynamically chosen heredoc
delimiter with later input lines and interpreted body data as tcsh commands.
The implemented scanner prevents that structural failure.

## Admitted external tokens

The initial `externals` order is part of the generated-language contract:

1. `literal_dollar`
2. `literal_bang`
3. `label_name`
4. `_backtick_start`
5. `_backtick_end`
6. `redirect_operator`
7. `_quick_substitution_start`
8. `_at_prefix`
9. `_bare_at`
10. `_heredoc_operator`
11. `heredoc_delimiter`
12. `heredoc_body`
13. `heredoc_end`

| token | admitted? | responsibility |
| --- | ---: | --- |
| `literal_dollar` | yes, implemented | Emit `$` as literal only when the following byte cannot begin a documented variable substitution. It carries no state. |
| `literal_bang` | yes, implemented | Emit `!` as literal only when the following byte cannot begin a documented history reference. It carries no state. |
| `label_name` | yes, implemented | Emit a numeric, dotted, hyphenated, or identifier-like name only when the next byte is the required immediate label colon. |
| `_backtick_start` | yes, implemented | Emit an opening backtick and enter command-substitution state. |
| `_backtick_end` | yes, implemented | Emit a closing backtick only in a parser state that expects the end of a structured command substitution, skipping horizontal indentation after a line continuation. |
| `redirect_operator` | yes, implemented | Emit only documented complete input/output operators. Share the `<` lookahead branch with `_heredoc_operator` so `<` and `<<` cannot mask one another, and reject `<<` before an invalid delimiter starter. |
| `_quick_substitution_start` | yes, implemented | Emit the first `^` only at column zero when another `^` exists on the line, preventing the longest generic word token from hiding quick substitution syntax. |
| `_at_prefix` | yes, implemented | Emit `@` only when it is followed by required horizontal whitespace and a non-empty assignment/update form. It carries no state. |
| `_bare_at` | yes, implemented | Emit bare `@` only when the rest of the logical line is empty or a comment. It carries no state. |
| `_heredoc_operator` | yes, implemented | Consume `<<` and enter the delimiter-expected phase, preventing a delimiter token from being synthesized elsewhere during error recovery. |
| `heredoc_delimiter` | yes, implemented | Consume the delimiter word after `<<`, retain its exact comparison text, and retain whether quoting disables body substitution. |
| `heredoc_body` | yes, implemented | Consume one or more body bytes without interpreting control keywords, comments, quotes, or redirects. It is absent for an empty body. |
| `heredoc_end` | yes, implemented | Consume an exact delimiter at the start of a delimiter-only line. Leave its line ending for the grammar's ordinary statement terminator. |
| `line_continuation` | no | The DSL `line_continuation` extra is sufficient. |
| `command_substitution_body` | no | Nested backtick commands remain a grammar task until a concrete scanner-only requirement is demonstrated. |
| `comment_newline_sensitive` | no | File-mode comment boundaries can be expressed in the grammar. |

The implementation must update this document and regenerate artifacts if token
order or names change.

`literal_dollar` was admitted after a grammar-only attempt demonstrated both
failure modes: preferring the literal token changed `${dir}` and `$a[2]` into
literal-plus-glob words, while preferring variable syntax rejected `echo $ foo`.
Tree-sitter's regex lexer cannot express the required negative lookahead without
also consuming the following separator. The scanner checks one lookahead byte,
emits only `$`, and serializes no state.

The two hidden `@` tokens were admitted after an optional grammar repeatedly
reduced bare `@` before `@ x++`, while a mandatory grammar could not retain valid
bare `@` or reject the no-space command name `@x=1`. Both tokens consume only
`@`; horizontal whitespace is lookahead/skip text and is not part of the token.

## Required syntax rows

The scanner owns matrix rows `TC-RED-011` through `TC-RED-015`:

- delimiter attachment;
- body attachment;
- quoted delimiter mode;
- missing terminator at EOF;
- rejection/recovery for a second input heredoc on one command.

The pinned tcsh syntax check reports `Ambiguous input redirect` for two heredoc
input redirects on one command. The grammar therefore does not need a pending
delimiter queue: a second input heredoc is a negative syntax fixture. The
scanner stores at most one pending delimiter.

## Why the DSL is insufficient

A delimiter is selected by source text after `<<`, may be quoted, and must later
match a complete input line. A regex token cannot remember arbitrary delimiter
bytes across intervening command text and cannot prevent body lines such as
`endif`, `case x:`, or `# data` from becoming ordinary syntax. The following
valid shape demonstrates the failure:

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

The current grammar may close the outer `if` with the body text. Exact dynamic
matching requires scanner state.

## State model

The heredoc scanner state contains:

- a format version byte;
- a phase enum: `idle`, `waiting_for_delimiter`, `waiting_for_body`, or `waiting_for_end`;
- a `quoted` flag recording delimiter/body substitution mode;
- an `in_backtick` flag distinguishing opening and closing backticks;
- delimiter length;
- the exact normalized delimiter bytes used for whole-line comparison.

There is no delimiter queue. Encountering a second pending input heredoc must
leave a visible parse error rather than overwrite the first delimiter.

Delimiter normalization must follow the pinned tcsh quote-removal rules. Raw
delimiter bytes remain represented by the `heredoc_delimiter` node range; only
the stored comparison form is normalized.

## Serialization

Serialized state uses this versioned layout:

```text
byte 0      format version
byte 1      phase
byte 2      flags (bit 0: quoted, bit 1: in_backtick)
bytes 3-4   delimiter length, unsigned little-endian
bytes 5..   delimiter bytes
```

Rules:

- `serialize` returns zero bytes only when the heredoc state is idle and no
  structured backtick command is open.
- A delimiter that cannot fit in `TREE_SITTER_SERIALIZATION_BUFFER_SIZE` is not
  truncated. The scanner must refuse the delimiter token so ordinary parser
  recovery remains visible.
- `deserialize` clears all previous state before reading input.
- Unknown versions, invalid phases, inconsistent lengths, and truncated input
  reset to idle.
- A serialize/deserialize round trip must preserve the phase, quote flag,
  backtick flag, and every delimiter byte.

## Scanning and progress rules

- `heredoc_delimiter` succeeds only after the grammar has consumed `<<` and the
  scanner can consume at least one delimiter byte.
- `heredoc_body` is optional and succeeds only after consuming at least one byte.
  An empty heredoc proceeds directly to `heredoc_end`.
- `heredoc_end` succeeds only when it consumes the exact delimiter at the start
  of a line, followed by newline or EOF. It does not consume the newline.
- Prefix, suffix, leading-space, and trailing-space near-matches remain body
  content unless the pinned tcsh rule explicitly says otherwise.
- A missing terminator at EOF may emit the remaining non-empty body once, after
  which scanning fails and lets the grammar recover with a missing/error node.
- No successful scan may leave the lexer at its starting byte.
- A closing backtick may follow skipped horizontal indentation on a continued
  logical line; the indentation is not part of the delimiter token.
- Scanner logging and assertions must not be required for progress.

## Error recovery and included ranges

- On a malformed delimiter, do not create pending state.
- On malformed EOF, retain no pending state after the parser has abandoned the
  heredoc branch.
- On deserialization or included-range re-entry, use only serialized state; do
  not depend on process-global or previous-parser state.
- A range that begins inside a body may expose a body/error node but must never
  synthesize a delimiter from bytes outside the range.
- Incremental edits to the operator, delimiter, body, or terminator must
  invalidate the affected scanner state and must not reuse a stale delimiter.

## Body structure policy

The first safe implementation exposes an opaque named `heredoc_body`. This
preserves exact source ranges and prevents structural corruption. It does not
evaluate substitutions. The `quoted` flag is retained so a later parser-readable
body-fragment feature can distinguish quoted and unquoted bodies without
changing delimiter semantics.

Any later change that exposes variable, history, command, or backslash
substitutions inside an unquoted body requires separate coverage rows and must
leave quoted bodies opaque.

## C-only integration

The initial distribution decision is C-only.

- Keep `src/scanner.c` in the C compile check with `src/parser.c`.
- Regenerate `src/parser.c`, `src/grammar.json`, and `src/node-types.json` after
  adding `externals`.
- Add the scanner to the public C consumer build path in the packaging phase.
- Remove the non-functional Node build metadata in the packaging phase; do not
  add Node-specific scanner glue in this milestone.

## Required fixtures and checks

- ordinary body and exact terminator;
- empty body;
- quoted delimiter;
- body containing `endif`, `case`, `#`, `)`, quotes, and redirect-looking text;
- delimiter prefix/suffix and whitespace near-matches;
- missing terminator at EOF;
- second input heredoc on one command as a negative fixture;
- state serialization and resume before body and before terminator;
- incremental edits to delimiter and terminator;
- included range starting before the delimiter and inside the body;
- C compilation of parser and scanner.

Any omitted case requires an explicit exception in this file before the scanner
can be marked implemented or tested.
