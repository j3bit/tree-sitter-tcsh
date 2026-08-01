# Builtin Surface Syntax Index

This manually audited initial index is derived from the tcsh manual builtins section. The coverage matrix is the release gate; this file explains why a builtin is specialized or generic.

| builtin/form | matrix IDs | coverage approach |
|---|---|---|
| alias | TC-BLT-001 | `alias_statement` exposes the alias name because it is a consumer-visible definition |
| set | TC-BLT-003 | `set_statement`/`set_assignment` preserve assignment boundaries and empty values |
| source | TC-BLT-012 | `source_statement` separates `-h`, target, and trailing arguments; `.` is not a tcsh source alias |
| exit | TC-BLT-037 | `exit_statement` owns the optional expression surface |
| all other documented command-word builtins | TC-BLT-002, TC-BLT-004..011, TC-BLT-013..036, TC-BLT-039..999 | parsed as an ordinary `simple_command` name; highlighting is command-position text matching |
| simple command-word builtins not otherwise listed | TC-BLT-999 | covered by `simple_command`; runtime effects are out of scope |


## Highlight query contract

Specialized command nodes capture `alias`, `set`, `source`, and `exit` as
`@function.builtin`. Control-flow forms remain `@keyword`. The ordinary
command-position query matches the complete static `word` for exactly these
audited names:

`:`; `alloc`; `bg`; `bindkey`; `bs2cmd`; `builtins`; `bye`; `cd`; `chdir`;
`complete`; `dirs`; `echo`; `echotc`; `eval`; `exec`; `fg`; `filetest`;
`getspath`; `getxvers`; `glob`; `hashstat`; `history`; `hup`; `inlib`; `jobs`;
`kill`; `limit`; `log`; `login`; `logout`; `ls-F`; `migrate`; `newgrp`; `nice`;
`nohup`; `notify`; `popd`; `printenv`; `pushd`; `rehash`; `rootnode`; `sched`;
`setenv`; `setpath`; `setspath`; `settc`; `setty`; `setxvers`; `shift`; `stop`;
`suspend`; `telltc`; `termname`; `time`; `umask`; `unalias`; `uncomplete`;
`unhash`; `universe`; `unlimit`; `unset`; `unsetenv`; `ver`; `wait`; `warp`;
`where`; and `which`.

`%job` remains a `job_spec` capture rather than a static builtin name. Options
such as `jobs -Z` and `kill -l`/`-s` do not change command-name classification.
`printf`, `return`, and `.` are deliberately not classified as tcsh builtins.
Runtime effects remain out of scope.
