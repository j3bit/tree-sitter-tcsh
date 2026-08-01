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


## Additional audited manual entries covered generically

The following documented builtin/form entries are present in `test/corpus/surface_syntax.txt` and matrix rows `TC-BLT-042` onward. They are parsed by `simple_command` plus `word`/`job_spec`/redirection syntax because their parser-readable surface is command-word oriented in the grammar scope: `%job`, `:`, alloc, bs2cmd, builtins, bye, echotc, filetest, getspath, getxvers, hup, inlib, jobs -Z, kill -l, kill -s, log, ls-F, migrate, newgrp, notify, printenv, rootnode, setpath, setspath, settc, setty, setxvers, stop, suspend, telltc, termname, unhash, universe, ver, and warp. `printf`, `return`, and `.` are deliberately not classified as tcsh builtins. Runtime effects remain out of scope.
