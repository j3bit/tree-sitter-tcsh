set x = 1
echo cd foo
echo $x
if (1) echo ok
loop:
goto loop
alias ll 'ls -l'
if (1) then
  echo block
endif
