alias query_alias echo
set x = 1
source /dev/null
exit 0
:
alloc
bg
bindkey
bs2cmd
builtins
bye
cd
chdir
complete
dirs
echo
echotc
eval
exec
fg
filetest
getspath
getxvers
glob
hashstat
history
hup
inlib
jobs
kill
limit
log
login
logout
ls-F
migrate
newgrp
nice
nohup
notify
popd
printenv
pushd
rehash
rootnode
sched
setenv
setpath
setspath
settc
setty
setxvers
shift
stop
suspend
telltc
termname
time
umask
unalias
uncomplete
unhash
universe
unlimit
unset
unsetenv
ver
wait
warp
where
which
echo cd ls-F alloc set source if
$cmd dynamic
echo $x
if (1 || 0) echo binary
if (1 && 0) echo binary
if (1 | 0) echo binary
if (1 ^ 0) echo binary
if (1 & 0) echo binary
if (1 == 0) echo binary
if (1 != 0) echo binary
if (1 =~ 0) echo binary
if (1 !~ 0) echo binary
if (1 < 0) echo binary
if (1 <= 0) echo binary
if (1 > 0) echo binary
if (1 >= 0) echo binary
if (1 << 0) echo binary
if (1 >> 0) echo binary
if (1 + 0) echo binary
if (1 - 0) echo binary
if (1 * 1) echo binary
if (1 / 1) echo binary
if (1 % 1) echo binary
if (! 0) echo unary
if (~ 0) echo unary
if (+ 1) echo unary
if (- 1) echo unary
@ assign_eq = 1
@ assign_add += 1
@ assign_sub -= 1
@ assign_mul *= 1
@ assign_div /= 1
@ assign_mod %= 1
@ assign_left <<= 1
@ assign_right >>= 1
@ assign_and &= 1
@ assign_xor ^= 1
@ assign_or |= 1
@ increment++
@ decrement--
echo redirected >&! /dev/null
if (-e /tmp) echo filetest
echo $path:h
echo !!:h
loop:
goto loop
if (1) then
  echo block
endif
