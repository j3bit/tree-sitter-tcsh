(comment) @comment

(if_statement) @keyword
(else_if_clause) @keyword
(else_clause) @keyword
(foreach_statement) @keyword
(while_statement) @keyword
(switch_statement) @keyword
(case_clause) @keyword
(default_clause) @keyword
(repeat_statement) @keyword
(goto_statement) @keyword
(onintr_statement) @keyword
(break_statement) @keyword
(continue_statement) @keyword
(breaksw_statement) @keyword
(at_statement) @keyword

(builtin_command) @function.builtin
(label name: (identifier) @label)
(goto_statement (word) @label)
(identifier) @variable
(number) @number
(single_quoted_string) @string
(double_quoted_string) @string
(backtick_command_substitution) @string.special
(escape_sequence) @escape
(variable_substitution) @variable.parameter
(history_substitution) @constant.macro
(glob_pattern) @string.special
(job_spec) @constant
(file_test_operator) @operator
(redirect_operator) @operator
(substitution_modifier) @operator
