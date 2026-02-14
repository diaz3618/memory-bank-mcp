# Rule File Formats

## Overview

This document describes the supported file formats for defining rules in Memory Bank MCP.

## Supported Formats

Memory Bank MCP now supports the following formats for rule files:

1. **JSON** (JavaScript Object Notation)
2. **YAML** (YAML Ain't Markup Language)
3. **TOML** (Tom's Obvious, Minimal Language)

## Format Comparison

### JSON

```json
{
  "mode": "architect",
  "instructions": {
    "general": [
      "Act as a software architect",
      "Provide high-level guidance"
    ],
    "umb": {
      "trigger": "architect",
      "instructions": [
        "Analyze the project structure",
        "Suggest architectural improvements"
      ],
      "override_file_restrictions": true
    }
  },
  "mode_triggers": {
    "architect": [
      {
        "condition": "How should we structure"
      },
      {
        "condition": "What is the best architecture"
      }
    ]
  }
}
```

**Advantages:**
- Widely supported standard format
- Native parsing in JavaScript/TypeScript
- Strict structure

**Disadvantages:**
- Verbose syntax
- No comment support
- Prone to syntax errors (commas, quotes)

### YAML

```yaml
mode: architect
instructions:
  general:
    - Act as a software architect
    - Provide high-level guidance
  umb:
    trigger: architect
    instructions:
      - Analyze the project structure
      - Suggest architectural improvements
    override_file_restrictions: true
mode_triggers:
  architect:
    - condition: How should we structure
    - condition: What is the best architecture
```

**Advantages:**
- Cleaner, more readable syntax
- Supports comments
- Less prone to syntax errors
- Good for complex hierarchical structures

**Disadvantages:**
- Indentation sensitive
- Requires additional library for parsing

### TOML

```toml
mode = "architect"

[instructions]
general = [
  "Act as a software architect",
  "Provide high-level guidance"
]

[instructions.umb]
trigger = "architect"
instructions = [
  "Analyze the project structure",
  "Suggest architectural improvements"
]
override_file_restrictions = true

[mode_triggers]
architect = [
  { condition = "How should we structure" },
  { condition = "What is the best architecture" }
]
```

**Advantages:**
- Clear and intuitive syntax
- Supports comments
- Less sensitive to formatting errors
- Good for configurations

**Disadvantages:**
- Less common than JSON and YAML
- Requires additional library for parsing
- May be less intuitive for deeply nested structures

## Format Detection

Memory Bank MCP automatically detects the rule file format using the following strategies:

1. **File Extension**: If the file has a specific extension (.json, .yaml, .yml, .toml), the corresponding format will be used.
2. **Content Analysis**: If the extension is not specific, the system will try to analyze the content using heuristics to determine the format.
3. **Fallback**: If detection fails, the system will try to parse the content in each supported format until one succeeds.

## Recommended Usage

For best compatibility and clarity, we recommend:

1. Use **YAML** for complex rules with many nesting levels or when you need to include explanatory comments.
2. Use **TOML** for simpler, more linear configurations.
3. Use **JSON** when interoperability with other tools is a priority.

## Examples

### YAML Rule File Example

```yaml
# Rules for architect mode
mode: architect
instructions:
  # General instructions applied to all interactions
  general:
    - Act as an experienced software architect
    - Provide high-level guidance on code structure
    - Suggest appropriate design patterns
  
  # UMB (Universal Memory Bank) specific configuration
  umb:
    trigger: architect
    instructions:
      - Analyze the project structure in the Memory Bank
      - Suggest architectural improvements based on the current context
    override_file_restrictions: true

# Triggers that automatically activate this mode
mode_triggers:
  architect:
    - condition: How should we structure
    - condition: What is the best architecture
    - condition: Design pattern for
```

### TOML Rule File Example

```toml
# Rules for debug mode
mode = "debug"

[instructions]
# General instructions applied to all interactions
general = [
  "Act as a debugging expert",
  "Help identify and fix code issues",
  "Suggest debugging tools and techniques"
]

# UMB (Universal Memory Bank) specific configuration
[instructions.umb]
trigger = "debug"
instructions = [
  "Analyze logs and errors in the Memory Bank context",
  "Suggest debugging strategies based on project history"
]
override_file_restrictions = true

# Triggers that automatically activate this mode
[mode_triggers.debug]
condition = [
  { condition = "How can I debug" },
  { condition = "I'm getting an error" },
  { condition = "The code isn't working" }
]
```

## Format Migration

To migrate existing rules from JSON to YAML or TOML, you can use online conversion tools or specific libraries. Memory Bank MCP will continue to support all formats, so there's no need to migrate existing rules unless you prefer a different format.