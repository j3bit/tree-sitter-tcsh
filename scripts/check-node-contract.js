#!/usr/bin/env node

const fs = require('fs');

const nodeTypes = JSON.parse(fs.readFileSync('src/node-types.json', 'utf8'));
const byType = new Map(nodeTypes.map((node) => [node.type, node]));

function fail(message) {
  console.error(`node contract failed: ${message}`);
  process.exitCode = 1;
}

function requireType(type) {
  if (!byType.has(type)) fail(`missing node type ${type}`);
  return byType.get(type) || {};
}

function requireField(type, field, childType) {
  const node = requireType(type);
  const fieldInfo = node.fields && node.fields[field];
  if (!fieldInfo) {
    fail(`${type} missing field ${field}`);
    return;
  }

  const hasChildType = (fieldInfo.types || []).some((entry) => entry.type === childType);
  if (!hasChildType) fail(`${type}.${field} missing child type ${childType}`);
  if (!fieldInfo.required) fail(`${type}.${field} must remain required`);
}

function requireFieldType(type, field, childType) {
  const node = requireType(type);
  const fieldInfo = node.fields && node.fields[field];
  if (!fieldInfo) {
    fail(`${type} missing field ${field}`);
    return;
  }
  if (!(fieldInfo.types || []).some((entry) => entry.type === childType)) {
    fail(`${type}.${field} missing child type ${childType}`);
  }
}

function requireFieldShape(type, field, { required, multiple }) {
  const node = requireType(type);
  const fieldInfo = node.fields && node.fields[field];
  if (!fieldInfo) {
    fail(`${type} missing field ${field}`);
    return;
  }
  if (fieldInfo.required !== required) {
    fail(`${type}.${field} required must be ${required}`);
  }
  if (fieldInfo.multiple !== multiple) {
    fail(`${type}.${field} multiple must be ${multiple}`);
  }
}

function requireChild(type, childType) {
  const node = requireType(type);
  const children = node.children && node.children.types;
  const hasChildType = (children || []).some((entry) => entry.type === childType);
  if (!hasChildType) fail(`${type} missing child type ${childType}`);
}

[
  'simple_command',
  'alias_statement',
  'set_statement',
  'set_assignment',
  'set_command',
  'alias_command',
  'foreach_statement',
  'label',
  'goto_statement',
  'variable_substitution',
  'source_statement',
  'source_command',
  'source_target',
  'heredoc_redirect',
  'heredoc_delimiter',
  'heredoc_body',
  'heredoc_end',
  'history_substitution',
  'history_event',
  'history_word_designator',
  'history_modifier',
  'substitution_modifier',
  'subscript',
  'selector_index',
  'dollar_single_quoted_string',
  'brace_pattern',
  'directory_stack_reference',
  'quick_substitution_statement',
].forEach(requireType);

requireField('foreach_statement', 'variable', 'identifier');
requireField('label', 'name', 'label_name');
requireField('goto_statement', 'target', 'word');
requireField('simple_command', 'name', 'word');
requireFieldType('simple_command', 'argument', 'word');
requireFieldType('simple_command', 'redirection', 'redirection');
requireFieldShape('simple_command', 'argument', { required: false, multiple: true });
requireFieldShape('simple_command', 'redirection', { required: false, multiple: true });
requireField('alias_statement', 'command', 'alias_command');
requireFieldType('alias_statement', 'name', 'word');
requireField('source_statement', 'command', 'source_command');
requireField('source_statement', 'target', 'source_target');
requireFieldType('source_statement', 'option', 'source_option');
requireFieldType('source_statement', 'argument', 'word');
requireFieldShape('source_statement', 'argument', { required: false, multiple: true });
requireField('heredoc_redirect', 'operator', 'redirect_operator');
requireField('heredoc_redirect', 'destination', 'heredoc_delimiter');
requireFieldType('heredoc_redirect', 'body', 'heredoc_body');
requireField('heredoc_redirect', 'end', 'heredoc_end');
requireField('binary_expression', 'left', 'expression');
requireField('binary_expression', 'right', 'expression');
requireFieldShape('binary_expression', 'operator', { required: true, multiple: false });
requireFieldType('if_statement', 'condition', 'expression');
requireFieldShape('if_statement', 'body', { required: false, multiple: true });
requireFieldShape('if_statement', 'alternative', { required: false, multiple: true });
requireFieldType('while_statement', 'condition', 'expression');
requireFieldShape('while_statement', 'body', { required: false, multiple: true });
requireFieldType('switch_statement', 'subject', 'word');
requireFieldShape('switch_statement', 'body', { required: false, multiple: true });

requireFieldType('variable_substitution', 'name', 'identifier');
requireFieldType('variable_substitution', 'name', 'number');
requireFieldType('variable_substitution', 'operator', 'special_parameter');
requireFieldType('variable_substitution', 'special', 'special_parameter');
requireFieldType('variable_substitution', 'selector', 'subscript');
requireFieldType('variable_substitution', 'modifier', 'substitution_modifier');
requireFieldType('history_substitution', 'event', 'history_event');
requireFieldType('history_substitution', 'designator', 'history_word_designator');
requireFieldType('history_substitution', 'modifier', 'history_modifier');
requireChild('source_target', 'word');
requireChild('word', 'brace_pattern');
requireChild('brace_pattern', 'brace_pattern');
[
  'if_statement',
  'else_if_clause',
  'else_clause',
  'foreach_statement',
  'while_statement',
  'switch_statement',
  'case_clause',
  'default_clause',
].forEach((type) => requireChild(type, 'comment'));

if (process.exitCode) process.exit(process.exitCode);
console.log('node contract ok');
