(label name: (label_name) @name) @definition.label
(alias_statement name: (word) @name) @definition.function
(simple_command name: (word) @name) @reference.call
(goto_statement target: (word) @name) @reference.label
