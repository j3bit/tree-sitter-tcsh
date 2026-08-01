# tcsh/csh Reference Ledger

This repository targets documented **surface syntax** for tcsh/csh. It parses syntax into a concrete tree and does not execute runtime semantics.

## Reference set

| ID | Source | Version / snapshot | Use |
|---|---|---|---|
| REF-TCSH-ORG | https://www.tcsh.org/ | fetched during project bootstrap on 2026-05-17 | Official project/source entry point. |
| REF-TCSH-6.24.16 | https://github.com/tcsh-org/tcsh/tree/TCSH6_24_16 | tag `TCSH6_24_16`, commit `f773aba56aa128a38712987b1b8bdbc393d1e4d0`, audited 2026-07-31 | Pinned release source, manual, lexer, parser, and builtin table; primary syntax oracle. |
| REF-MAN-DEBIAN | https://manpages.debian.org/testing/tcsh/tcsh.1.en.html | Debian testing manpage sourced from tcsh 6.24.13-2.1, fetched 2026-05-17 | Historical bootstrap inventory; not the release oracle. |
| REF-SRC-PARSE | https://github.com/tcsh-org/tcsh/blob/master/sh.parse.c | upstream master, fetched 2026-05-17 | Parser ambiguity reference only. |
| REF-SRC-LEX | https://github.com/tcsh-org/tcsh/blob/master/sh.lex.c | upstream master, fetched 2026-05-17 | Lexer ambiguity reference only. |
| REF-TREE-SITTER-BASH-AUDIT | https://github.com/tree-sitter/tree-sitter-bash/tree/a06c2e4415e9bc0346c6b86d401879ffb44058f7 | tag `v0.25.1`, commit `a06c2e4415e9bc0346c6b86d401879ffb44058f7`, audited 2026-07-31 | Architecture and packaging comparison only; no grammar, scanner, query, fixture, or binding code copied. |
| REF-THIRD-PARTY | https://github.com/hyperupcall-projects/tree-sitter-tcsh | surveyed only | Existing BSD-3-Clause grammar; default policy is clean-room rebuild/reference-only notes. |

## Scope rules

- `common-csh`: syntax inherited from csh or common to csh/tcsh.
- `tcsh-specific`: tcsh extensions or tcsh-documented behavior.
- `runtime-only`: documented behavior that has no additional parser-readable surface syntax obligation.
- `unsupported-with-reason` is only valid for `runtime-only` rows.

## Provenance policy

Implementation is clean-room by default. Third-party grammar code is not copied unless a future change records license, exact commit, copied files, and rationale.
