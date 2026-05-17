# tcsh/csh Reference Ledger

This repository targets documented **surface syntax** for tcsh/csh. It parses syntax into a concrete tree and does not execute runtime semantics.

## Reference set

| ID | Source | Version / snapshot | Use |
|---|---|---|---|
| REF-TCSH-ORG | https://www.tcsh.org/ | fetched during project bootstrap on 2026-05-17 | Official project/source entry point. |
| REF-MAN-DEBIAN | https://manpages.debian.org/testing/tcsh/tcsh.1.en.html | Debian testing manpage sourced from tcsh 6.24.13-2.1, fetched 2026-05-17 | Primary manual surface-syntax inventory. |
| REF-SRC-PARSE | https://github.com/tcsh-org/tcsh/blob/master/sh.parse.c | upstream master, fetched 2026-05-17 | Parser ambiguity reference only. |
| REF-SRC-LEX | https://github.com/tcsh-org/tcsh/blob/master/sh.lex.c | upstream master, fetched 2026-05-17 | Lexer ambiguity reference only. |
| REF-THIRD-PARTY | https://github.com/hyperupcall-projects/tree-sitter-tcsh | surveyed only | Existing BSD-3-Clause grammar; default policy is clean-room rebuild/reference-only notes. |

## Scope rules

- `common-csh`: syntax inherited from csh or common to csh/tcsh.
- `tcsh-specific`: tcsh extensions or tcsh-documented behavior.
- `runtime-only`: documented behavior that has no additional parser-readable surface syntax obligation.
- `unsupported-with-reason` is only valid for `runtime-only` rows.

## Provenance policy

Implementation is clean-room by default. Third-party grammar code is not copied unless a future change records license, exact commit, copied files, and rationale.
