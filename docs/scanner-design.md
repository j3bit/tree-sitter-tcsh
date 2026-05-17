# Scanner Design Gate

Current status: no external scanner is implemented yet. The grammar intentionally starts with Tree-sitter DSL tokens. Scanner work is admitted only when a syntax row cannot be made reliable in grammar.js.

## Gate checklist

Every proposed external token must document:

1. Token name and exact order in `externals`.
2. Manual/source rows that require it.
3. DSL attempt failed because: concrete reason and failed fixture.
4. State model and serialized fields.
5. EOF and no-zero-width-loop behavior.
6. Error recovery and included-ranges behavior.
7. Binding integration checklist (`binding.gyp` and any enabled binding build files).
8. Tests: heredoc, continuation, EOF, empty body, malformed terminator, serialization/resume. Any omission requires an explicit documented exception.

## Candidate tokens

| token | admitted? | DSL attempt failed because |
|---|---:|---|
| heredoc_body | no | Current release parses heredoc operators/markers and body as ordinary command text; admit only if corpus requires body attachment to the redirection node. |
| line_continuation | no | Current DSL `line_continuation` extra handles backslash-newline. |
| command_substitution_body | no | Current DSL parses backtick command substitution as a delimited node without nested command parsing. |
| comment_newline_sensitive | no | Current DSL comment token is sufficient for tested fixtures. |
