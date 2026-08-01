#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
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
};

enum HeredocPhase {
  PHASE_IDLE,
  PHASE_WAITING_FOR_DELIMITER,
  PHASE_WAITING_FOR_BODY,
  PHASE_WAITING_FOR_END,
};

enum {
  SERIALIZATION_VERSION = 1,
  SERIALIZATION_HEADER_SIZE = 5,
  MAX_DELIMITER_SIZE =
      TREE_SITTER_SERIALIZATION_BUFFER_SIZE - SERIALIZATION_HEADER_SIZE,
};

typedef struct {
  enum HeredocPhase phase;
  bool quoted;
  bool in_backtick;
  uint16_t delimiter_length;
  char delimiter[MAX_DELIMITER_SIZE];
} Scanner;

static bool is_variable_start(int32_t character) {
  return (character >= 'A' && character <= 'Z') ||
         (character >= 'a' && character <= 'z') ||
         (character >= '0' && character <= '9') || character == '_' ||
         character == '{' || character == '?' || character == '#' ||
         character == '$' || character == '!' || character == '<' ||
         character == '%' || character == '*';
}

static bool is_history_start(int32_t character) {
  return (character >= 'A' && character <= 'Z') ||
         (character >= 'a' && character <= 'z') ||
         (character >= '0' && character <= '9') || character == '_' ||
         character == '!' || character == '#' || character == '-' ||
         character == '?' || character == '{' || character == ':' ||
         character == '$' || character == '*' || character == '^' ||
         character == '%';
}

static bool is_label_character(int32_t character) {
  return (character >= 'A' && character <= 'Z') ||
         (character >= 'a' && character <= 'z') ||
         (character >= '0' && character <= '9') || character == '_' ||
         character == '.' || character == '-';
}

static void reset_heredoc(Scanner *scanner) {
  scanner->phase = PHASE_IDLE;
  scanner->quoted = false;
  scanner->delimiter_length = 0;
}

void *tree_sitter_tcsh_external_scanner_create(void) {
  return calloc(1, sizeof(Scanner));
}

void tree_sitter_tcsh_external_scanner_destroy(void *payload) {
  free(payload);
}

unsigned tree_sitter_tcsh_external_scanner_serialize(void *payload,
                                                     char *buffer) {
  Scanner *scanner = payload;
  if (scanner == NULL ||
      (scanner->phase == PHASE_IDLE && !scanner->in_backtick)) {
    return 0;
  }

  buffer[0] = SERIALIZATION_VERSION;
  buffer[1] = (char)scanner->phase;
  buffer[2] = (scanner->quoted ? 1 : 0) | (scanner->in_backtick ? 2 : 0);
  buffer[3] = (char)(scanner->delimiter_length & 0xff);
  buffer[4] = (char)(scanner->delimiter_length >> 8);
  memcpy(buffer + SERIALIZATION_HEADER_SIZE, scanner->delimiter,
         scanner->delimiter_length);
  return SERIALIZATION_HEADER_SIZE + scanner->delimiter_length;
}

void tree_sitter_tcsh_external_scanner_deserialize(void *payload,
                                                   const char *buffer,
                                                   unsigned length) {
  Scanner *scanner = payload;
  if (scanner == NULL) {
    return;
  }
  reset_heredoc(scanner);
  scanner->in_backtick = false;

  if (length < SERIALIZATION_HEADER_SIZE ||
      (uint8_t)buffer[0] != SERIALIZATION_VERSION) {
    return;
  }

  const uint8_t phase = (uint8_t)buffer[1];
  const uint16_t delimiter_length =
      (uint8_t)buffer[3] | ((uint16_t)(uint8_t)buffer[4] << 8);
  const bool in_backtick = ((uint8_t)buffer[2] & 2) != 0;
  if ((phase != PHASE_IDLE && phase != PHASE_WAITING_FOR_DELIMITER &&
       phase != PHASE_WAITING_FOR_BODY && phase != PHASE_WAITING_FOR_END) ||
      delimiter_length > MAX_DELIMITER_SIZE ||
      ((phase == PHASE_WAITING_FOR_BODY || phase == PHASE_WAITING_FOR_END) &&
       delimiter_length == 0) ||
      (phase == PHASE_IDLE && !in_backtick) ||
      length != SERIALIZATION_HEADER_SIZE + delimiter_length) {
    return;
  }

  scanner->phase = (enum HeredocPhase)phase;
  scanner->quoted = ((uint8_t)buffer[2] & 1) != 0;
  scanner->in_backtick = in_backtick;
  scanner->delimiter_length = delimiter_length;
  memcpy(scanner->delimiter, buffer + SERIALIZATION_HEADER_SIZE,
         delimiter_length);
}

static bool scan_heredoc_delimiter(Scanner *scanner, TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
         lexer->lookahead == '\r' || lexer->lookahead == '\f') {
    lexer->advance(lexer, true);
  }

  uint16_t length = 0;
  bool consumed = false;
  int32_t quote = 0;
  while (!lexer->eof(lexer)) {
    const int32_t character = lexer->lookahead;
    if (quote == 0 && (character == ' ' || character == '\t' ||
                       character == '\r' || character == '\n' ||
                       character == ';' || character == '|' ||
                       character == '&' || character == '<' ||
                       character == '>')) {
      break;
    }

    consumed = true;
    lexer->advance(lexer, false);
    if (character == '\\') {
      scanner->quoted = true;
      if (lexer->eof(lexer) || lexer->lookahead == '\n') {
        reset_heredoc(scanner);
        return false;
      }
      if (length == MAX_DELIMITER_SIZE) {
        reset_heredoc(scanner);
        return false;
      }
      scanner->delimiter[length++] = (char)lexer->lookahead;
      lexer->advance(lexer, false);
      continue;
    }
    if (character == '\'' || character == '"') {
      scanner->quoted = true;
      if (quote == 0) {
        quote = character;
        continue;
      }
      if (quote == character) {
        quote = 0;
        continue;
      }
    }
    if (length == MAX_DELIMITER_SIZE) {
      reset_heredoc(scanner);
      return false;
    }
    scanner->delimiter[length++] = (char)character;
  }

  if (!consumed || quote != 0 || length == 0) {
    reset_heredoc(scanner);
    return false;
  }

  lexer->mark_end(lexer);
  scanner->delimiter_length = length;
  scanner->phase = PHASE_WAITING_FOR_BODY;
  lexer->result_symbol = HEREDOC_DELIMITER;
  return true;
}

static bool scan_exact_heredoc_end(Scanner *scanner, TSLexer *lexer) {
  for (uint16_t index = 0; index < scanner->delimiter_length; index++) {
    if (lexer->lookahead != (unsigned char)scanner->delimiter[index]) {
      return false;
    }
    lexer->advance(lexer, false);
  }

  if (lexer->lookahead != '\r' && lexer->lookahead != '\n' &&
      !lexer->eof(lexer)) {
    return false;
  }

  lexer->mark_end(lexer);
  reset_heredoc(scanner);
  lexer->result_symbol = HEREDOC_END;
  return true;
}

static bool scan_heredoc_body(Scanner *scanner, TSLexer *lexer) {
  bool consumed_body = false;
  lexer->mark_end(lexer);

  while (!lexer->eof(lexer)) {
    bool matches = true;
    for (uint16_t index = 0; index < scanner->delimiter_length; index++) {
      if (lexer->lookahead != (unsigned char)scanner->delimiter[index]) {
        matches = false;
        break;
      }
      lexer->advance(lexer, false);
    }

    if (matches && (lexer->lookahead == '\n' || lexer->lookahead == '\r' ||
                    lexer->eof(lexer))) {
      if (!consumed_body) {
        if (matches) {
          lexer->mark_end(lexer);
          reset_heredoc(scanner);
          lexer->result_symbol = HEREDOC_END;
          return true;
        }
      }
      if (matches) {
        scanner->phase = PHASE_WAITING_FOR_END;
        lexer->result_symbol = HEREDOC_BODY;
        return true;
      }
    }

    while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
      lexer->advance(lexer, false);
    }
    if (lexer->lookahead == '\n') {
      lexer->advance(lexer, false);
    }
    consumed_body = true;
    lexer->mark_end(lexer);
  }

  if (consumed_body) {
    scanner->phase = PHASE_WAITING_FOR_END;
    lexer->result_symbol = HEREDOC_BODY;
    return true;
  }
  return false;
}

bool tree_sitter_tcsh_external_scanner_scan(void *payload, TSLexer *lexer,
                                           const bool *valid_symbols) {
  Scanner *scanner = payload;
  if (scanner == NULL) {
    return false;
  }

  if (scanner->phase == PHASE_WAITING_FOR_END &&
      valid_symbols[HEREDOC_END]) {
    return scan_exact_heredoc_end(scanner, lexer);
  }
  if (scanner->phase == PHASE_WAITING_FOR_BODY &&
      (valid_symbols[HEREDOC_BODY] || valid_symbols[HEREDOC_END])) {
    return scan_heredoc_body(scanner, lexer);
  }
  if (valid_symbols[HEREDOC_DELIMITER] &&
      scanner->phase == PHASE_WAITING_FOR_DELIMITER) {
    return scan_heredoc_delimiter(scanner, lexer);
  }
  if (valid_symbols[BACKTICK_END] && scanner->in_backtick &&
      lexer->lookahead == '`') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    scanner->in_backtick = false;
    lexer->result_symbol = BACKTICK_END;
    return true;
  }
  if (valid_symbols[QUICK_SUBSTITUTION_START] && lexer->get_column(lexer) == 0 &&
      lexer->lookahead == '^') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
      if (lexer->lookahead == '^') {
        lexer->result_symbol = QUICK_SUBSTITUTION_START;
        return true;
      }
      lexer->advance(lexer, false);
    }
    return false;
  }
  if (!valid_symbols[LITERAL_DOLLAR] && !valid_symbols[LITERAL_BANG] &&
      !valid_symbols[LABEL_NAME] && !valid_symbols[BACKTICK_START] &&
      !valid_symbols[BACKTICK_END] && !valid_symbols[REDIRECT_OPERATOR] &&
      !valid_symbols[QUICK_SUBSTITUTION_START] &&
      !valid_symbols[AT_PREFIX] &&
      !valid_symbols[BARE_AT] && !valid_symbols[HEREDOC_OPERATOR]) {
    return false;
  }

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
         lexer->lookahead == '\r' || lexer->lookahead == '\f') {
    lexer->advance(lexer, true);
  }

  if ((valid_symbols[HEREDOC_OPERATOR] || valid_symbols[REDIRECT_OPERATOR]) &&
      lexer->lookahead == '<') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == '<') {
      if (!valid_symbols[HEREDOC_OPERATOR]) {
        return false;
      }
      lexer->advance(lexer, false);
      lexer->mark_end(lexer);
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
             lexer->lookahead == '\r' || lexer->lookahead == '\f') {
        lexer->advance(lexer, true);
      }
      if (lexer->eof(lexer) || lexer->lookahead == '\n' ||
          lexer->lookahead == ';' || lexer->lookahead == '|' ||
          lexer->lookahead == '&' || lexer->lookahead == '<' ||
          lexer->lookahead == '>') {
        return false;
      }
      reset_heredoc(scanner);
      scanner->phase = PHASE_WAITING_FOR_DELIMITER;
      lexer->result_symbol = HEREDOC_OPERATOR;
      return true;
    }
    if (!valid_symbols[REDIRECT_OPERATOR]) {
      return false;
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = REDIRECT_OPERATOR;
    return true;
  }

  if (valid_symbols[REDIRECT_OPERATOR] && lexer->lookahead == '>') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == '>') {
      lexer->advance(lexer, false);
    }
    if (lexer->lookahead == '&') {
      lexer->advance(lexer, false);
    }
    if (lexer->lookahead == '!') {
      lexer->advance(lexer, false);
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = REDIRECT_OPERATOR;
    return true;
  }

  if (valid_symbols[BACKTICK_START] && !scanner->in_backtick &&
      lexer->lookahead == '`') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    scanner->in_backtick = true;
    lexer->result_symbol = BACKTICK_START;
    return true;
  }

  if (valid_symbols[LABEL_NAME] && is_label_character(lexer->lookahead)) {
    char keyword[8] = {0};
    size_t length = 0;
    do {
      if (length < sizeof(keyword)) {
        keyword[length] = (char)lexer->lookahead;
      }
      length++;
      lexer->advance(lexer, false);
    } while (is_label_character(lexer->lookahead));
    if (lexer->lookahead == ':') {
      if ((length == 4 && memcmp(keyword, "case", 4) == 0) ||
          (length == 7 && memcmp(keyword, "default", 7) == 0)) {
        return false;
      }
      lexer->mark_end(lexer);
      lexer->result_symbol = LABEL_NAME;
      return true;
    }
    return false;
  }

  if (valid_symbols[LITERAL_DOLLAR] && lexer->lookahead == '$') {
    lexer->advance(lexer, false);
    if (is_variable_start(lexer->lookahead)) {
      return false;
    }
    lexer->result_symbol = LITERAL_DOLLAR;
    return true;
  }

  if (valid_symbols[LITERAL_BANG] && lexer->lookahead == '!') {
    lexer->advance(lexer, false);
    if (is_history_start(lexer->lookahead)) {
      return false;
    }
    lexer->result_symbol = LITERAL_BANG;
    return true;
  }

  if ((valid_symbols[AT_PREFIX] || valid_symbols[BARE_AT]) &&
      lexer->lookahead == '@') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);

    bool has_space = false;
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
      has_space = true;
      lexer->advance(lexer, true);
    }

    const bool at_end = lexer->eof(lexer) || lexer->lookahead == '\n' ||
                        lexer->lookahead == ';' || lexer->lookahead == '#';
    if (valid_symbols[BARE_AT] && at_end) {
      lexer->result_symbol = BARE_AT;
      return true;
    }
    if (valid_symbols[AT_PREFIX] && has_space && !at_end) {
      lexer->result_symbol = AT_PREFIX;
      return true;
    }
  }

  return false;
}
