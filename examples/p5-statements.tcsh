set foo=
@
@ x <<= 1
source -h pre${dir}/file
if (-fx file) echo executable
if (-lLo link) echo owned_link
if (-P22 file) echo writable
( echo ok ) >& err
echo force >! file
echo append_force >>! file
123:
goto 123
build.step:
goto build.step
retry-later:
goto retry-later
exit 1 + 2
echo `echo nested; echo again`
