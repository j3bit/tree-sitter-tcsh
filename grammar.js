// Tree-sitter grammar for tcsh/csh surface syntax.
// Scope: concrete syntax only. Runtime expansion/evaluation is intentionally out of scope.

const PREC = {
  ASSIGN: 1,
  TERNARY: 2,
  OR: 3,
  AND: 4,
  BIT_OR: 5,
  BIT_XOR: 6,
  BIT_AND: 7,
  EQUALITY: 8,
  RELATIONAL: 9,
  SHIFT: 10,
  ADD: 11,
  MULTIPLY: 12,
  PREFIX: 13,
  CALL: 14,
};

function immediateWordFragment($, includeLiteralBang) {
  return choice(
    alias(token.immediate(/[^\s#;|&<>(){}'"`$!\\*?\[\]%]+/), $.bare_word),
    alias(token.immediate(seq('\\', /(.|\r?\n)/)), $.escape_sequence),
    alias($._immediate_single_quoted_string, $.single_quoted_string),
    alias($._immediate_dollar_single_quoted_string, $.dollar_single_quoted_string),
    alias($._immediate_double_quoted_string, $.double_quoted_string),
    alias($._immediate_backtick_command_substitution, $.backtick_command_substitution),
    alias($._immediate_variable_substitution, $.variable_substitution),
    alias($._immediate_history_substitution, $.history_substitution),
    ...(includeLiteralBang ? [alias(token.immediate('!'), $.literal_bang)] : []),
    alias(token.immediate(/\^?[A-Za-z0-9_.\/-]*([*?]|\[[^\]\s\n]+\])[A-Za-z0-9_.\/*?\[\]-]*/), $.glob_pattern),
    alias(token.immediate(/=(?:[0-9]+|-)/), $.directory_stack_reference),
    alias(token.immediate(seq('%', choice('%', '+', '-', /[0-9]+/, seq('?', /[^\s;|&<>(){}'"`]+/), /[A-Za-z_][A-Za-z0-9_-]*/))), $.job_spec),
  );
}

module.exports = grammar({
  name: 'tcsh',

  extras: $ => [/[ \t\r\f]+/, $.line_continuation],

  externals: $ => [
    $.literal_dollar,
    $.literal_bang,
    $.label_name,
    $._backtick_start,
    $._backtick_end,
    $.redirect_operator,
    $._quick_substitution_start,
    $._at_prefix,
    $._bare_at,
    $._heredoc_operator,
    $.heredoc_delimiter,
    $.heredoc_body,
    $.heredoc_end,
  ],

  rules: {
    source_file: $ => seq(
      repeat(choice(
        seq($._statement, optional($.comment), $._terminator),
        seq($.comment, $._terminator),
        $._terminator,
      )),
      optional(choice(seq($._statement, optional($.comment)), $.comment)),
    ),

    _terminator: $ => choice($._newline, ';'),
    line_continuation: _ => token(seq('\\', /\r?\n/)),
    comment: _ => token(seq('#', /[^\n]*/)),

    _statement: $ => choice(
      $.if_statement,
      $.foreach_statement,
      $.while_statement,
      $.switch_statement,
      $.goto_statement,
      $.onintr_statement,
      $.break_statement,
      $.continue_statement,
      $.breaksw_statement,
      $.at_statement,
      $.quick_substitution_statement,
      $.label,
      $.command_list,
    ),

    command_list: $ => prec(-1, seq(
      $.and_or_command,
      repeat(seq('&', $.and_or_command)),
      optional('&'),
    )),

    and_or_command: $ => seq(
      $.and_command,
      repeat(seq('||', $.and_command)),
    ),

    and_command: $ => seq(
      $.pipeline,
      repeat(seq('&&', $.pipeline)),
    ),

    pipeline: $ => seq(
      $.command,
      repeat(seq(choice('|', '|&'), $.command)),
    ),

    command: $ => choice(
      $.parenthesized_command,
      $.source_statement,
      $.set_statement,
      $.exit_statement,
      $.alias_statement,
      alias($._one_line_if_statement, $.if_statement),
      $.repeat_statement,
      $.simple_command,
    ),

    parenthesized_command: $ => prec.right(seq(
      '(',
      repeat(choice($._terminator, $.comment)),
      $._statement,
      repeat(choice($._statement, $._terminator, $.comment)),
      ')',
      repeat($.redirection),
    )),

    simple_command: $ => prec.right(seq(
      repeat(field('redirection', $.redirection)),
      field('name', $.word),
      repeat(choice(
        field('argument', choice($.word, $.reserved_argument_word)),
        field('redirection', $.redirection),
      )),
    )),

    alias_statement: $ => prec.right(seq(
      field('command', $.alias_command),
      optional(seq(
        field('name', $.word),
        repeat(field('argument', choice($.word, $.reserved_argument_word))),
      )),
    )),

    set_statement: $ => prec.right(seq(
      field('command', $.set_command),
      repeat(choice($.set_assignment, $.word, $.redirection)),
    )),

    set_assignment: $ => prec.right(seq(
      field('name', $.identifier),
      optional($.subscript),
      '=',
      optional(choice(field('value', $.word), field('value', $.parenthesized_word_list))),
    )),

    source_statement: $ => prec.right(seq(
      field('command', $.source_command),
      optional(field('option', $.source_option)),
      field('target', $.source_target),
      repeat(choice(
        field('argument', choice($.word, $.reserved_argument_word)),
        field('redirection', $.redirection),
      )),
    )),

    source_target: $ => $.word,
    source_option: _ => token('-h'),

    exit_statement: $ => prec.right(seq(
      field('command', $.exit_command),
      optional(field('value', $.expression)),
    )),

    reserved_argument_word: _ => choice(
      'case',
      'default',
      'else',
      'endif',
      'end',
      'endsw',
      'source',
      'then',
    ),

    alias_command: _ => 'alias',
    set_command: _ => 'set',
    source_command: _ => 'source',
    exit_command: _ => 'exit',

    parenthesized_word_list: $ => seq('(', repeat(choice($.word, $.comment, $._terminator)), ')'),

    redirection: $ => choice(
      $.heredoc_redirect,
      seq(field('operator', $.redirect_operator), field('destination', $.word)),
    ),
    heredoc_redirect: $ => seq(
      field('operator', alias($._heredoc_operator, $.redirect_operator)),
      field('destination', $.heredoc_delimiter),
      $._newline,
      optional(field('body', $.heredoc_body)),
      field('end', $.heredoc_end),
    ),
    _newline: _ => token(/\r?\n/),
    _block_line: $ => choice(
      $._newline,
      seq($.comment, $._newline),
      seq(
        $._statement,
        repeat(seq(';', $._statement)),
        optional(';'),
        optional($.comment),
        $._newline,
      ),
    ),

    if_statement: $ => prec.right(seq(
      'if', '(', optional(field('condition', $.expression)), ')', 'then', $._newline,
      repeat(field('body', $._block_line)),
      repeat(field('alternative', $.else_if_clause)),
      optional(field('alternative', $.else_clause)),
      'endif',
    )),
    _one_line_if_statement: $ => prec.right(seq(
      'if', '(', optional(field('condition', $.expression)), ')',
      field('body', $.command),
    )),
    else_if_clause: $ => prec(2, prec.right(seq(
      'else', 'if', '(', optional(field('condition', $.expression)), ')', 'then', $._newline,
      repeat(field('body', $._block_line)),
    ))),
    else_clause: $ => prec(1, prec.right(seq(
      'else', $._newline,
      repeat(field('body', $._block_line)),
    ))),

    foreach_statement: $ => seq(
      'foreach', field('variable', $.identifier), '(', repeat(field('subject', $.word)), ')', $._newline,
      repeat(field('body', $._block_line)),
      'end',
    ),
    while_statement: $ => seq(
      'while', '(', optional(field('condition', $.expression)), ')', $._newline,
      repeat(field('body', $._block_line)),
      'end',
    ),
    switch_statement: $ => seq(
      'switch', '(', optional(field('subject', $.word)), ')', $._newline,
      repeat(field('body', choice($.case_clause, $.default_clause, $._block_line))),
      'endsw',
    ),
    case_clause: $ => prec.right(seq(
      'case', field('pattern', $.word), token.immediate(':'), $._newline,
      repeat($._block_line),
    )),
    default_clause: $ => prec.right(seq(
      'default', token.immediate(':'), $._newline,
      repeat($._block_line),
    )),
    repeat_statement: $ => prec.right(seq(
      'repeat', field('count', $.word),
      field('body', choice($.source_statement, $.set_statement, $.simple_command)),
    )),
    goto_statement: $ => seq('goto', field('target', $.word)),
    onintr_statement: $ => prec.right(seq('onintr', optional($.word))),
    label: $ => seq(field('name', $.label_name), token.immediate(':')),
    break_statement: _ => 'break',
    continue_statement: _ => 'continue',
    breaksw_statement: _ => 'breaksw',

    quick_substitution_statement: $ => prec(5, seq(
      $._quick_substitution_start,
      field('left', optional(alias(token.immediate(/[^\^\n]+/), $.substitution_lhs))),
      token.immediate('^'),
      field('right', optional(alias(token.immediate(/[^\^\n]+/), $.substitution_rhs))),
      optional(token.immediate('^')),
    )),

    at_statement: $ => prec.right(3, choice(
      $._bare_at,
      seq(
        $._at_prefix,
        field('name', $.identifier),
        optional($.subscript),
        choice(
          $.update_operator,
          seq($.assignment_operator, field('value', $.expression)),
        ),
      ),
    )),

    assignment_operator: _ => choice('=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '^=', '|='),
    update_operator: _ => token.immediate(choice('++', '--')),

    expression: $ => choice(
      $.number,
      alias($._expression_word, $.word),
      $.parenthesized_expression,
      $.command_status_expression,
      $.file_test_expression,
      $.unary_expression,
      $.binary_expression,
    ),

    _expression_word: $ => prec.right(seq(
      choice(
        $.identifier,
        $.bare_word,
        $.single_quoted_string,
        $.dollar_single_quoted_string,
        $.double_quoted_string,
        $.backtick_command_substitution,
        $.variable_substitution,
        $.literal_dollar,
        $.history_substitution,
        $.glob_pattern,
        $.directory_stack_reference,
        $.job_spec,
      ),
      repeat(immediateWordFragment($, false)),
    )),

    parenthesized_expression: $ => seq('(', optional($.expression), ')'),
    command_status_expression: $ => seq('{', repeat(choice($._statement, $._terminator, $.comment)), '}'),
    file_test_expression: $ => prec(PREC.PREFIX, seq(
      field('operator', $.file_test_operator),
      field('operand', $.word),
    )),
    file_test_operator: _ => token(prec(5, /-[rwxXeozsfdlbcpSugktRLAMCDIFNPUGZ]+[0-7]*:?/)),
    unary_expression: $ => prec(PREC.PREFIX, seq(
      field('operator', choice('!', '~', '+', '-')),
      field('operand', $.expression),
    )),
    binary_expression: $ => choice(
      ...[
        ['||', PREC.OR], ['&&', PREC.AND], ['|', PREC.BIT_OR], ['^', PREC.BIT_XOR], ['&', PREC.BIT_AND],
        ['==', PREC.EQUALITY], ['!=', PREC.EQUALITY], ['=~', PREC.EQUALITY], ['!~', PREC.EQUALITY],
        ['<', PREC.RELATIONAL], ['<=', PREC.RELATIONAL], ['>', PREC.RELATIONAL], ['>=', PREC.RELATIONAL],
        ['<<', PREC.SHIFT], ['>>', PREC.SHIFT], ['+', PREC.ADD], ['-', PREC.ADD],
        ['*', PREC.MULTIPLY], ['/', PREC.MULTIPLY], ['%', PREC.MULTIPLY],
      ].map(([operator, precedence]) => prec.left(precedence, seq(
        field('left', $.expression),
        field('operator', operator),
        field('right', $.expression),
      )))
    ),

    word: $ => prec.right(seq(
      $._word_fragment,
      repeat($._immediate_word_fragment),
    )),

    _word_fragment: $ => choice(
      $.identifier,
      $.number,
      $.bare_word,
      $.escape_sequence,
      $.single_quoted_string,
      $.dollar_single_quoted_string,
      $.double_quoted_string,
      $.backtick_command_substitution,
      $.variable_substitution,
      $.literal_dollar,
      $.history_substitution,
      $.literal_bang,
      $.glob_pattern,
      $.directory_stack_reference,
      $.job_spec,
    ),

    _immediate_word_fragment: $ => immediateWordFragment($, true),

    bare_word: _ => token(prec(-1, /[^\s#;|&<>(){}'"`$!\\*?\[\]%]+/)),
    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,
    number: _ => /[0-9]+/,
    escape_sequence: _ => token(seq('\\', /(.|\r?\n)/)),
    string: $ => choice($.single_quoted_string, $.double_quoted_string),
    single_quoted_string: $ => seq("'", repeat(choice(token(/[^'!\\\n]+/), $.escape_sequence, $.history_substitution, $.literal_bang)), token.immediate("'")),
    _immediate_single_quoted_string: $ => seq(token.immediate("'"), repeat(choice(token(/[^'!\\\n]+/), $.escape_sequence, $.history_substitution, $.literal_bang)), token.immediate("'")),
    dollar_single_quoted_string: $ => prec(2, seq($.literal_dollar, token.immediate(seq("'", repeat(choice(/[^'\\\n]+/, /\\./)), "'")))),
    _immediate_dollar_single_quoted_string: $ => prec(2, seq(token.immediate('$'), token.immediate(seq("'", repeat(choice(/[^'\\\n]+/, /\\./)), "'")))),
    double_quoted_string: $ => seq('"', repeat(choice(token(/[^"\\$`!\n]+/), $.escape_sequence, $.variable_substitution, $.literal_dollar, $.history_substitution, $.backtick_command_substitution)), token.immediate('"')),
    _immediate_double_quoted_string: $ => seq(token.immediate('"'), repeat(choice(token(/[^"\\$`!\n]+/), $.escape_sequence, $.variable_substitution, $.literal_dollar, $.history_substitution, $.backtick_command_substitution)), token.immediate('"')),
    backtick_command_substitution: $ => seq(
      $._backtick_start,
      repeat(choice($._statement, $._terminator, $.comment)),
      $._backtick_end,
    ),
    _immediate_backtick_command_substitution: $ => seq(
      $._backtick_start,
      repeat(choice($._statement, $._terminator, $.comment)),
      $._backtick_end,
    ),
    variable_substitution: $ => prec.right(6, seq('$', choice(
      $._modifiable_variable_reference,
      $._nonmodifiable_variable_reference,
      seq(token.immediate('{'), choice($._modifiable_variable_reference, $._nonmodifiable_variable_reference), token.immediate('}')),
    ))),
    _immediate_variable_substitution: $ => prec.right(6, seq(token.immediate('$'), choice(
      $._modifiable_variable_reference,
      $._nonmodifiable_variable_reference,
      seq(token.immediate('{'), choice($._modifiable_variable_reference, $._nonmodifiable_variable_reference), token.immediate('}')),
    ))),
    _modifiable_variable_reference: $ => prec.right(seq(
      choice(
        field('name', alias($._immediate_identifier, $.identifier)),
        field('name', alias($._immediate_number, $.number)),
        field('special', alias(token.immediate('*'), $.special_parameter)),
      ),
      optional(field('selector', $.subscript)),
      repeat(field('modifier', $.substitution_modifier)),
    )),
    _nonmodifiable_variable_reference: $ => choice(
      prec(2, seq(
        field('operator', alias(token.immediate(/[?#%]/), $.special_parameter)),
        field('name', choice(alias($._immediate_identifier, $.identifier), alias($._immediate_number, $.number))),
      )),
      prec(1, field('special', alias(token.immediate(choice('?<', /[?$!<_#]/)), $.special_parameter))),
    ),
    _immediate_identifier: _ => token.immediate(/[A-Za-z_][A-Za-z0-9_]*/),
    _immediate_number: _ => token.immediate(/[0-9]+/),
    special_parameter: _ => token(choice('?<', /[?$!<_#*]/)),
    subscript: $ => prec.right(3, seq(
      token.immediate(prec(2, '[')),
      choice(
        field('all', token.immediate('*')),
        field('start', $.selector_index),
        seq(field('start', $.selector_index), token.immediate('-'), optional(field('end', $.selector_index))),
        seq(token.immediate('-'), field('end', $.selector_index)),
      ),
      token.immediate(']'),
    )),
    selector_index: $ => choice(
      alias($._immediate_number, $.number),
      seq(token.immediate('$'), choice(alias($._immediate_identifier, $.identifier), alias($._immediate_number, $.number), alias(token.immediate('#'), $.special_parameter))),
    ),
    substitution_modifier: _ => token.immediate(prec(5, /:(?:[ag]*(?:[htrueulqx&]|s\/(?:\\.|[^/\n])*\/(?:\\.|[^/\n])*(?:\/)?))/)),
    history_substitution: $ => prec.right(6, seq('!', $._history_reference)),
    _immediate_history_substitution: $ => prec.right(6, seq(token.immediate('!'), $._history_reference)),
    _history_reference: $ => prec.right(choice(
      seq(field('event', $.history_event), optional(field('designator', $.history_word_designator)), repeat(field('modifier', $.history_modifier))),
      seq(field('designator', $.history_word_designator), repeat(field('modifier', $.history_modifier))),
    )),
    history_event: $ => choice(
      alias(token.immediate(/[!#]/), $.history_event_name),
      alias(token.immediate(/-?[0-9]+/), $.history_event_name),
      alias(token.immediate(/[A-Za-z_][A-Za-z0-9_]*/), $.history_event_name),
      seq(token.immediate('?'), field('search', alias(token.immediate(/[^?\n]+/), $.history_search)), optional(token.immediate('?'))),
      seq(token.immediate('{'), field('name', alias(token.immediate(/[^{}\s\n]+/), $.history_event_name)), token.immediate('}')),
    ),
    history_word_designator: _ => token.immediate(prec(5, /:?(?:[0-9]+(?:-[0-9$]*)?|-[0-9$]+|[\^$%*]|[0-9]+\*|[0-9]+-)/)),
    history_modifier: _ => token.immediate(prec(5, /:(?:[ag]*(?:[htrueulqxp&]|s\/(?:\\.|[^/\n])*\/(?:\\.|[^/\n])*(?:\/)?))/)),
    history_event_name: _ => token.immediate(/[^\s:]+/),
    history_search: _ => token.immediate(/[^?\n]+/),
    glob_pattern: $ => choice(
      token(/\^?[A-Za-z0-9_.\/-]*([*?]|\[[^\]\s\n]+\])[A-Za-z0-9_.\/*?\[\]-]*/),
      $.brace_pattern,
    ),
    brace_pattern: _ => token(prec(2, /[A-Za-z0-9_.\/-]*\{(?:[^,{}\s\n]+|\{[^{}\s\n]+\})(?:,(?:[^,{}\s\n]+|\{[^{}\s\n]+\}))+\}[A-Za-z0-9_.\/-]*/)),
    directory_stack_reference: _ => token(/=(?:[0-9]+|-)/),
    job_spec: _ => token(seq('%', choice('%', '+', '-', /[0-9]+/, seq('?', /[^\s;|&<>(){}'"`]+/), /[A-Za-z_][A-Za-z0-9_-]*/))),
  }
});
