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

function requireChild(type, childType) {
  const node = requireType(type);
  const children = node.children && node.children.types;
  const hasChildType = (children || []).some((entry) => entry.type === childType);
  if (!hasChildType) fail(`${type} missing child type ${childType}`);
}

[
  'simple_command',
  'set_command',
  'setenv_command',
  'alias_command',
  'foreach_statement',
  'label',
  'goto_statement',
  'variable_substitution',
  'source_statement',
  'source_command',
  'source_target',
].forEach(requireType);

requireField('foreach_statement', 'variable', 'identifier');
requireField('label', 'name', 'identifier');
requireField('source_statement', 'command', 'source_command');
requireField('source_statement', 'target', 'source_target');

requireChild('variable_substitution', 'identifier');
requireChild('variable_substitution', 'number');
requireChild('variable_substitution', 'special_parameter');
requireChild('source_target', 'variable_substitution');
requireChild('source_target', 'backtick_command_substitution');
requireChild('source_target', 'source_path_suffix');
requireChild('source_target', 'word');

if (process.exitCode) process.exit(process.exitCode);
console.log('node contract ok');
