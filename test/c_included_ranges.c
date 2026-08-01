#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <tree_sitter/api.h>
#include <tree-sitter-tcsh.h>

static TSPoint point_for_byte(const char *source, uint32_t byte) {
  TSPoint point = {0, 0};
  for (uint32_t index = 0; index < byte; index++) {
    if (source[index] == '\n') {
      point.row++;
      point.column = 0;
    } else {
      point.column++;
    }
  }
  return point;
}

static TSRange range_for_bytes(const char *source, uint32_t start,
                               uint32_t end) {
  return (TSRange){
      .start_point = point_for_byte(source, start),
      .end_point = point_for_byte(source, end),
      .start_byte = start,
      .end_byte = end,
  };
}

static uint32_t byte_for(const char *source, const char *text,
                         unsigned occurrence) {
  const char *cursor = source;
  for (unsigned index = 0; index <= occurrence; index++) {
    cursor = strstr(cursor, text);
    if (cursor == NULL) return UINT32_MAX;
    if (index < occurrence) cursor++;
  }
  return (uint32_t)(cursor - source);
}

static unsigned count_present_nodes(TSNode node, const char *type) {
  unsigned count = 0;
  if (!ts_node_is_missing(node) && strcmp(ts_node_type(node), type) == 0) {
    count++;
  }
  const uint32_t child_count = ts_node_named_child_count(node);
  for (uint32_t index = 0; index < child_count; index++) {
    count += count_present_nodes(ts_node_named_child(node, index), type);
  }
  return count;
}

static TSTree *parse_ranges(TSParser *parser, const TSTree *old_tree,
                            const char *source, const TSRange *ranges,
                            uint32_t range_count) {
  if (!ts_parser_set_included_ranges(parser, ranges, range_count)) return NULL;
  return ts_parser_parse_string(parser, old_tree, source, strlen(source));
}

static bool check_complete_heredoc_range(TSParser *parser) {
  const char *source = "ignored before\ncat <<EOF\nbody\nEOF\nignored after\n";
  const uint32_t start = byte_for(source, "cat <<EOF\n", 0);
  const uint32_t end = byte_for(source, "ignored after\n", 0);
  const TSRange range = range_for_bytes(source, start, end);
  TSTree *tree = parse_ranges(parser, NULL, source, &range, 1);
  if (tree == NULL) return false;

  const TSNode root = ts_tree_root_node(tree);
  const bool valid = !ts_node_has_error(root) &&
                     count_present_nodes(root, "heredoc_redirect") == 1 &&
                     count_present_nodes(root, "heredoc_delimiter") == 1 &&
                     count_present_nodes(root, "heredoc_body") == 1 &&
                     count_present_nodes(root, "heredoc_end") == 1;
  ts_tree_delete(tree);
  if (!valid) fputs("complete included heredoc range was not attached\n", stderr);
  return valid;
}

static bool check_opaque_range_starts(TSParser *parser) {
  const char *source = "cat <<EOF\nbody\nEOF\necho after\n";
  const uint32_t source_end = (uint32_t)strlen(source);
  const uint32_t starts[] = {
      byte_for(source, "body\n", 0),
      byte_for(source, "EOF\n", 1),
  };

  for (unsigned index = 0; index < sizeof(starts) / sizeof(starts[0]); index++) {
    const TSRange range = range_for_bytes(source, starts[index], source_end);
    TSTree *tree = parse_ranges(parser, NULL, source, &range, 1);
    if (tree == NULL) return false;
    const TSNode root = ts_tree_root_node(tree);
    const bool safe = count_present_nodes(root, "heredoc_redirect") == 0 &&
                      count_present_nodes(root, "heredoc_delimiter") == 0 &&
                      count_present_nodes(root, "heredoc_body") == 0 &&
                      count_present_nodes(root, "heredoc_end") == 0;
    ts_tree_delete(tree);
    if (!safe) {
      fputs("included range synthesized heredoc state outside its bytes\n", stderr);
      return false;
    }
  }
  return true;
}

static bool check_disjoint_command_ranges(TSParser *parser) {
  const char *source = "echo first\nignored\necho second\n";
  const uint32_t second = byte_for(source, "echo second\n", 0);
  const TSRange ranges[] = {
      range_for_bytes(source, 0, byte_for(source, "ignored\n", 0)),
      range_for_bytes(source, second, (uint32_t)strlen(source)),
  };
  TSTree *tree = parse_ranges(parser, NULL, source, ranges, 2);
  if (tree == NULL) return false;

  const TSNode root = ts_tree_root_node(tree);
  const bool valid = !ts_node_has_error(root) &&
                     count_present_nodes(root, "simple_command") == 2 &&
                     count_present_nodes(root, "heredoc_redirect") == 0;
  ts_tree_delete(tree);
  if (!valid) fputs("disjoint command ranges parsed incorrectly\n", stderr);
  return valid;
}

static void edit_same_length(TSTree *tree, const char *before,
                             const char *after) {
  const uint32_t length = (uint32_t)strlen(before);
  uint32_t start = 0;
  while (start < length && before[start] == after[start]) start++;
  uint32_t end = length;
  while (end > start && before[end - 1] == after[end - 1]) end--;
  const TSInputEdit edit = {
      .start_byte = start,
      .old_end_byte = end,
      .new_end_byte = end,
      .start_point = point_for_byte(before, start),
      .old_end_point = point_for_byte(before, end),
      .new_end_point = point_for_byte(after, end),
  };
  ts_tree_edit(tree, &edit);
}

static bool check_edit(TSParser *parser, const char *before, const char *after,
                       bool expect_clean, bool expect_heredoc,
                       bool expect_present_end, const char *label) {
  const TSRange before_range = range_for_bytes(before, 0, strlen(before));
  TSTree *before_tree = parse_ranges(parser, NULL, before, &before_range, 1);
  if (before_tree == NULL || ts_node_has_error(ts_tree_root_node(before_tree))) {
    if (before_tree != NULL) ts_tree_delete(before_tree);
    fputs("initial edit tree was invalid\n", stderr);
    return false;
  }

  edit_same_length(before_tree, before, after);
  const TSRange after_range = range_for_bytes(after, 0, strlen(after));
  TSTree *after_tree = parse_ranges(parser, before_tree, after, &after_range, 1);
  ts_tree_delete(before_tree);
  if (after_tree == NULL) return false;

  const TSNode root = ts_tree_root_node(after_tree);
  const bool clean = !ts_node_has_error(root);
  const bool has_heredoc = count_present_nodes(root, "heredoc_redirect") > 0;
  const bool has_end = count_present_nodes(root, "heredoc_end") > 0;
  const bool valid = clean == expect_clean && has_heredoc == expect_heredoc &&
                     has_end == expect_present_end;
  ts_tree_delete(after_tree);
  if (!valid) fprintf(stderr, "included-range reparse failed after %s edit\n", label);
  return valid;
}

static bool check_reparse_after_edits(TSParser *parser) {
  const char *before = "cat <<EOF\nold\nEOF\n";
  return check_edit(parser, before, "cat <>EOF\nold\nEOF\n", false, false,
                    false, "operator") &&
         check_edit(parser, before, "cat <<END\nold\nEOF\n", false, true,
                    false, "delimiter") &&
         check_edit(parser, before, "cat <<EOF\nnew\nEOF\n", true, true,
                    true, "body") &&
         check_edit(parser, before, "cat <<EOF\nold\nEND\n", false, true,
                    false, "terminator");
}

int main(void) {
  TSParser *parser = ts_parser_new();
  if (parser == NULL || !ts_parser_set_language(parser, tree_sitter_tcsh())) {
    return 1;
  }

  const bool valid = check_complete_heredoc_range(parser) &&
                     check_opaque_range_starts(parser) &&
                     check_disjoint_command_ranges(parser) &&
                     check_reparse_after_edits(parser);
  ts_parser_delete(parser);
  if (!valid) return 1;
  puts("included range contract ok");
  return 0;
}
