(comment) @comment

(if_statement "if" @keyword)
(if_statement "then" @keyword)
(if_statement "endif" @keyword)
(else_if_clause ["else" "if" "then"] @keyword)
(else_clause "else" @keyword)
(foreach_statement ["foreach" "end"] @keyword)
(while_statement ["while" "end"] @keyword)
(switch_statement ["switch" "endsw"] @keyword)
(case_clause "case" @keyword)
(default_clause "default" @keyword)
(repeat_statement "repeat" @keyword)
(goto_statement "goto" @keyword)
(onintr_statement "onintr" @keyword)
[(break_statement) (continue_statement) (breaksw_statement)] @keyword

[
  (alias_command)
  (set_command)
  (source_command)
  (exit_command)
] @function.builtin

(simple_command
  name: (word (identifier) @function.builtin)
  (#match? @function.builtin "^(alias|bg|bindkey|break|breaksw|builtins|bye|cd|chdir|complete|continue|dirs|echo|echotc|eval|exec|exit|fg|filetest|glob|goto|hashstat|history|hup|jobs|kill|limit|login|logout|nice|nohup|notify|onintr|popd|printenv|pushd|rehash|repeat|sched|set|setenv|shift|source|stop|suspend|switch|time|umask|unalias|uncomplete|unhash|unlimit|unset|unsetenv|wait|where|which|while)$"))

(label name: (label_name) @label)
(goto_statement target: (word) @label)
(variable_substitution name: [(identifier) (number)] @variable.parameter)
(at_statement name: (identifier) @variable)
(set_assignment name: (identifier) @variable)
(foreach_statement variable: (identifier) @variable)
(number) @number
[(single_quoted_string) (dollar_single_quoted_string) (double_quoted_string)] @string
(backtick_command_substitution) @string.special
(escape_sequence) @escape
(history_substitution) @constant.macro
[
  (glob_pattern)
  (brace_pattern)
] @string.special
(job_spec) @constant
[(file_test_operator) (redirect_operator) (substitution_modifier)] @operator
