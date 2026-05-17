{
  "targets": [
    {
      "target_name": "tree_sitter_tcsh_binding",
      "include_dirs": ["src"],
      "sources": ["src/parser.c"],
      "cflags_c": ["-std=c11"],
      "defines": ["TREE_SITTER_HIDE_SYMBOLS"]
    }
  ]
}
