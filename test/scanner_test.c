#include "tree_sitter/parser.h"

#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

enum TokenType {
  LITERAL_DOLLAR,
  LITERAL_BANG,
  LABEL_NAME,
  BACKTICK_START,
  BACKTICK_END,
  REDIRECT_OPERATOR,
  QUICK_SUBSTITUTION_START,
  AT_PREFIX,
  BARE_AT,
  HEREDOC_OPERATOR,
  HEREDOC_DELIMITER,
  HEREDOC_BODY,
  HEREDOC_END,
  TOKEN_COUNT,
};

void *tree_sitter_tcsh_external_scanner_create(void);
void tree_sitter_tcsh_external_scanner_destroy(void *payload);
unsigned tree_sitter_tcsh_external_scanner_serialize(void *payload,
                                                     char *buffer);
void tree_sitter_tcsh_external_scanner_deserialize(void *payload,
                                                   const char *buffer,
                                                   unsigned length);
bool tree_sitter_tcsh_external_scanner_scan(void *payload, TSLexer *lexer,
                                            const bool *valid_symbols);

typedef struct {
  TSLexer lexer;
  const char *input;
  size_t length;
  size_t position;
  size_t mark;
} MockLexer;

static void refresh(MockLexer *mock) {
  mock->lexer.lookahead = mock->position < mock->length
                              ? (unsigned char)mock->input[mock->position]
                              : 0;
}

static void advance(TSLexer *lexer, bool skip) {
  (void)skip;
  MockLexer *mock = (MockLexer *)lexer;
  if (mock->position < mock->length) {
    mock->position++;
  }
  refresh(mock);
}

static void mark_end(TSLexer *lexer) {
  MockLexer *mock = (MockLexer *)lexer;
  mock->mark = mock->position;
}

static uint32_t get_column(TSLexer *lexer) {
  MockLexer *mock = (MockLexer *)lexer;
  size_t column = 0;
  for (size_t index = mock->position; index > 0; index--) {
    if (mock->input[index - 1] == '\n') {
      break;
    }
    column++;
  }
  return (uint32_t)column;
}

static bool is_at_included_range_start(const TSLexer *lexer) {
  (void)lexer;
  return false;
}

static bool eof(const TSLexer *lexer) {
  const MockLexer *mock = (const MockLexer *)lexer;
  return mock->position >= mock->length;
}

static MockLexer mock_lexer(const char *input) {
  MockLexer mock = {
      .lexer = {.advance = advance,
                .mark_end = mark_end,
                .get_column = get_column,
                .is_at_included_range_start = is_at_included_range_start,
                .eof = eof},
      .input = input,
      .length = strlen(input),
  };
  refresh(&mock);
  return mock;
}

static bool scan(void *scanner, MockLexer *mock, enum TokenType first,
                 enum TokenType second) {
  bool valid[TOKEN_COUNT] = {false};
  valid[first] = true;
  valid[second] = true;
  const size_t start = mock->position;
  const bool result = tree_sitter_tcsh_external_scanner_scan(
      scanner, &mock->lexer, valid);
  if (result) {
    assert(mock->mark > start);
    mock->position = mock->mark;
    refresh(mock);
  }
  return result;
}

static void scan_delimiter(void *scanner, const char *input) {
  MockLexer operator = mock_lexer("<< EOF");
  assert(scan(scanner, &operator, HEREDOC_OPERATOR, HEREDOC_OPERATOR));
  assert(operator.lexer.result_symbol == HEREDOC_OPERATOR);
  MockLexer mock = mock_lexer(input);
  assert(scan(scanner, &mock, HEREDOC_DELIMITER, HEREDOC_DELIMITER));
  assert(mock.lexer.result_symbol == HEREDOC_DELIMITER);
}

int main(void) {
  char serialized[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  void *scanner = tree_sitter_tcsh_external_scanner_create();
  void *resumed = tree_sitter_tcsh_external_scanner_create();
  assert(scanner != NULL && resumed != NULL);

  MockLexer invalid_operator = mock_lexer("<<&");
  assert(!scan(scanner, &invalid_operator, HEREDOC_OPERATOR,
               REDIRECT_OPERATOR));
  MockLexer input_redirect = mock_lexer("< file");
  assert(scan(scanner, &input_redirect, REDIRECT_OPERATOR,
              HEREDOC_OPERATOR));
  assert(input_redirect.lexer.result_symbol == REDIRECT_OPERATOR);
  MockLexer force_redirect = mock_lexer(">&! file");
  assert(scan(scanner, &force_redirect, REDIRECT_OPERATOR,
              REDIRECT_OPERATOR));
  assert(force_redirect.lexer.result_symbol == REDIRECT_OPERATOR);
  MockLexer quick = mock_lexer("^old^new^");
  assert(scan(scanner, &quick, QUICK_SUBSTITUTION_START,
              QUICK_SUBSTITUTION_START));
  assert(quick.lexer.result_symbol == QUICK_SUBSTITUTION_START);
  MockLexer incomplete_quick = mock_lexer("^old");
  assert(!scan(scanner, &incomplete_quick, QUICK_SUBSTITUTION_START,
               QUICK_SUBSTITUTION_START));

  scan_delimiter(scanner, "EOF\n");
  const unsigned length = tree_sitter_tcsh_external_scanner_serialize(
      scanner, serialized);
  assert(length == 8);
  tree_sitter_tcsh_external_scanner_deserialize(resumed, serialized, length);

  MockLexer body = mock_lexer("inside\nEOF\n");
  assert(scan(resumed, &body, HEREDOC_BODY, HEREDOC_END));
  assert(body.lexer.result_symbol == HEREDOC_BODY);

  const unsigned before_end = tree_sitter_tcsh_external_scanner_serialize(
      resumed, serialized);
  assert(before_end == length);
  tree_sitter_tcsh_external_scanner_deserialize(scanner, serialized,
                                                before_end);
  MockLexer end = mock_lexer("EOF\n");
  assert(scan(scanner, &end, HEREDOC_END, HEREDOC_END));
  assert(end.lexer.result_symbol == HEREDOC_END);
  assert(tree_sitter_tcsh_external_scanner_serialize(scanner, serialized) == 0);

  scan_delimiter(scanner, "EMPTY\n");
  MockLexer empty = mock_lexer("EMPTY\n");
  assert(scan(scanner, &empty, HEREDOC_BODY, HEREDOC_END));
  assert(empty.lexer.result_symbol == HEREDOC_END);

  scan_delimiter(scanner, "'QUOTED'\n");
  assert(tree_sitter_tcsh_external_scanner_serialize(scanner, serialized) == 11);
  assert((serialized[2] & 1) == 1);

  tree_sitter_tcsh_external_scanner_destroy(resumed);
  resumed = tree_sitter_tcsh_external_scanner_create();
  assert(resumed != NULL);
  scan_delimiter(resumed, "NEW\n");
  MockLexer edited = mock_lexer("OLD\nNEW\n");
  assert(scan(resumed, &edited, HEREDOC_BODY, HEREDOC_END));
  assert(edited.lexer.result_symbol == HEREDOC_BODY);
  assert(scan(resumed, &edited, HEREDOC_END, HEREDOC_END));
  assert(edited.lexer.result_symbol == HEREDOC_END);

  scan_delimiter(resumed, "EOF\n");
  MockLexer unterminated = mock_lexer("body without end");
  assert(scan(resumed, &unterminated, HEREDOC_BODY, HEREDOC_END));
  assert(unterminated.lexer.result_symbol == HEREDOC_BODY);
  assert(!scan(resumed, &unterminated, HEREDOC_END, HEREDOC_END));

  tree_sitter_tcsh_external_scanner_deserialize(resumed, serialized, 4);
  assert(tree_sitter_tcsh_external_scanner_serialize(resumed, serialized) == 0);

  MockLexer backtick_start = mock_lexer("`");
  assert(scan(resumed, &backtick_start, BACKTICK_START, BACKTICK_START));
  assert(backtick_start.lexer.result_symbol == BACKTICK_START);
  const unsigned backtick_state = tree_sitter_tcsh_external_scanner_serialize(
      resumed, serialized);
  assert(backtick_state == 5);
  tree_sitter_tcsh_external_scanner_deserialize(scanner, serialized,
                                                backtick_state);
  MockLexer backtick_end = mock_lexer("  `");
  assert(scan(scanner, &backtick_end, BACKTICK_END, BACKTICK_END));
  assert(backtick_end.lexer.result_symbol == BACKTICK_END);

  tree_sitter_tcsh_external_scanner_destroy(scanner);
  tree_sitter_tcsh_external_scanner_destroy(resumed);
  puts("scanner state ok");
  return 0;
}
