; Neovim fold queries for tcsh/csh syntax.
; Prefer block/control-flow folds over word or string folds to avoid noisy inline folds.

[
  (if_statement)
  (else_if_clause)
  (else_clause)
  (foreach_statement)
  (while_statement)
  (switch_statement)
  (case_clause)
  (default_clause)
  (repeat_statement)
  (parenthesized_command)
  (command_status_expression)
] @fold
