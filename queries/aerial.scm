; 1. 함수/명령 매크로 (alias)
(alias_statement
  name: (word) @name
  (#set! "kind" "Function")) @symbol

; 2. 루틴/서브루틴 라벨 (label:)
(label
  name: (label_name) @name
  (#set! "kind" "Interface")) @symbol

; 3. 외부 모듈 include (source)
(source_statement
  target: (source_target) @name
  (#set! "kind" "Module")) @symbol

; 4. 환경 변수 설정 (setenv NAME value)
(simple_command
  name: (word) @_cmd
  .
  argument: (word) @name
  (#match? @_cmd "^setenv$")
  (#set! "kind" "Variable")) @symbol

; 5. 셸 변수/배열 설정 (set name = value)
(set_assignment
  name: (identifier) @name
  (#set! "kind" "Variable")) @symbol
