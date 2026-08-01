echo one & echo two
echo hi # inline comment
( echo grouped ) >& errors.log
if (0) /usr/bin/false && echo outside
repeat 0 /usr/bin/false && echo outside
if (1) then
  echo yes
else if (0) then
  echo no
else
  echo fallback
endif
foreach item (one two)
  echo $item
end
while (0)
  echo never
end
switch (x)
case x:
  echo yes
  breaksw
default:
  echo no
endsw
# final comment
