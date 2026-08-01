#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include <tree_sitter/api.h>
#include <tree-sitter-tcsh.h>

int main(void) {
  const char *source = "echo packed_consumer\n";
  TSParser *parser = ts_parser_new();
  if (parser == NULL || !ts_parser_set_language(parser, tree_sitter_tcsh())) {
    return 1;
  }

  TSTree *tree = ts_parser_parse_string(parser, NULL, source, strlen(source));
  TSNode root = ts_tree_root_node(tree);
  const bool valid = strcmp(ts_node_type(root), "source_file") == 0 &&
                     !ts_node_has_error(root);

  ts_tree_delete(tree);
  ts_parser_delete(parser);
  if (!valid) {
    fputs("packed parser returned an invalid tree\n", stderr);
    return 1;
  }
  return 0;
}
