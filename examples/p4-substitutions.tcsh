echo $* $%name $< $?<
echo ${name} ${1} ${?prompt} $?prompt
echo $a[1-] $a[-2] $a[$lo-$hi]
echo ${path:h} ${path}:h
echo !!:2 !?text?:h !{event}:$
echo !! !$ !:2
echo $x:s/old/new/
echo 'history !! survives' $'dollar\nquoted'
echo `hostname` ! 'literal !'
echo a{b,{c,d}}e ^temp* file[^0-9]
echo *.c file[0-9].c {a,b}.c
echo =0 =-/tail %?editor %1 %name
^old^new^
