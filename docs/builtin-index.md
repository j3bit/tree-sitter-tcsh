# Builtin Surface Syntax Index

This manually audited initial index is derived from the tcsh manual builtins section. The coverage matrix is the release gate; this file explains why a builtin is specialized or generic.

| builtin/form | matrix IDs | coverage approach |
|---|---|---|
| alias, unalias | TC-BLT-001, TC-BLT-002 | specialized command nodes plus generic word arguments |
| set, unset, setenv, unsetenv | TC-BLT-003..006 | specialized command nodes; assignment/list syntax tested through `assignment_word` and `parenthesized_word_list` |
| complete, uncomplete | TC-BLT-007..008 | specialized command nodes; completion mini-language remains word syntax |
| bindkey | TC-BLT-009 | specialized command node; editor command names remain word syntax |
| limit, unlimit | TC-BLT-010..011 | specialized command nodes; resource values remain word syntax |
| source, eval, exec, time, nice, nohup | TC-BLT-012..017 | specialized command nodes with generic shell word arguments |
| cd/chdir, pushd, popd, dirs | TC-BLT-018..021 | specialized command nodes with generic words |
| jobs, fg, bg, kill, wait | TC-BLT-022..026 | specialized command nodes; job specs parsed as `job_spec` |
| which, where, rehash, hashstat, history | TC-BLT-027..031 | specialized command nodes with generic words |
| echo, printf, glob | TC-BLT-032..034 | specialized command nodes with generic words/patterns |
| login, logout, exit, return, shift, umask, sched | TC-BLT-035..041 | specialized command nodes where present; expression arguments are parser-readable where grammar supports them |
| simple command-word builtins not otherwise listed | TC-BLT-999 | covered by `simple_command`; runtime effects are out of scope |


## Additional audited manual entries covered generically

The following documented builtin/form entries are present in `test/corpus/surface_syntax.txt` and matrix rows `TC-BLT-042` onward. They are parsed by `simple_command` plus `word`/`job_spec`/redirection syntax because their parser-readable surface is command-word oriented in the grammar scope: `%job`, `:`, alloc, bs2cmd, builtins, bye, echotc, filetest, getspath, getxvers, hup, inlib, jobs -Z, kill -l, kill -s, log, ls-F, migrate, newgrp, notify, printenv, rootnode, setpath, setspath, settc, setty, setxvers, stop, suspend, telltc, termname, unhash, universe, ver, and warp. Runtime effects remain out of scope.
