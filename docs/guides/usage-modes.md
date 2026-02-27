# Memory Bank MCP Usage Modes

## Overview

Memory Bank MCP offers different operation modes inspired by [Roo Code Memory Bank](https://github.com/GreatScottyMac/roo-code-memory-bank), allowing you to adapt the AI assistant's behavior for specific tasks. Each mode is configured through rule files (`.clinerules-[mode]`) that can be written in JSON, YAML, or TOML.

## Common Features Across All Modes

### Status Prefix System

All modes in Memory Bank MCP implement a status prefix system that provides immediate visibility into the operational state of the Memory Bank. Every response from the AI assistant begins with one of these status indicators:

- **`[MEMORY BANK: ACTIVE]`**: The Memory Bank is available and being used to provide context-aware responses
- **`[MEMORY BANK: INACTIVE]`**: The Memory Bank is not available or not properly configured
- **`[MEMORY BANK: UPDATING]`**: The Memory Bank is currently being updated (during UMB command execution)

This system ensures users always know whether the AI assistant is operating with full context awareness or limited information. For more details, see [Memory Bank Status Prefix System](memory-bank-status-prefix.md).

### UMB Command Support

All modes support the Update Memory Bank (UMB) command, which allows temporary updates to Memory Bank files during a session. When triggered with `Update Memory Bank` or `UMB`, the AI assistant will:

1. Halt the current task
2. Change status to `[MEMORY BANK: UPDATING]`
3. Review the chat history for relevant updates
4. Update appropriate Memory Bank files
5. Return to the previous status and continue the task

## Available Modes

### 1. Architect Mode

Architect mode is designed for high-level planning, system design, and project organization. This mode focuses on architectural decisions, system structure, and maintaining consistency throughout the project.

#### Key Capabilities

- 🏗️ **System Design**: Create and maintain architecture
- 📐 **Pattern Definition**: Establish coding patterns and standards
- 🔄 **Project Structure**: Organize code and resources
- 📋 **Documentation**: Maintain technical documentation
- 🤝 **Team Collaboration**: Guide implementation standards

#### Rules File Example (YAML)

```yaml
# .clinerules-architect.yaml
mode: architect
instructions:
  general:
    - "Act as an experienced software architect"
    - "Provide high-level guidance on code structure"
    - "Suggest appropriate design patterns"
    - "Consider scalability, maintenance, and security in all recommendations"
  umb:
    trigger: architect
    instructions:
      - "Analyze the project structure in the Memory Bank"
      - "Suggest architectural improvements based on the current context"
      - "Update the system-patterns.md file with newly identified patterns"
    override_file_restrictions: true
mode_triggers:
  architect:
    - condition: "How should we structure"
    - condition: "What is the best architecture"
    - condition: "Design pattern for"
    - condition: "Project organization"
```

### 2. Code Mode

Code mode is your primary interface for implementation and development. This mode specializes in writing, modifying, and maintaining code following established patterns.

#### Key Capabilities

- 💻 **Code Creation**: Write new code and features
- 🔧 **Code Modification**: Update existing implementations
- 📚 **Documentation**: Add code comments and docs
- ✨ **Quality Control**: Maintain code standards
- 🔄 **Refactoring**: Improve code structure

#### Rules File Example (JSON)

```json
{
  "mode": "code",
  "instructions": {
    "general": [
      "Act as an experienced developer",
      "Write clean, efficient, and well-documented code",
      "Follow programming best practices",
      "Consider error handling and edge cases"
    ],
    "umb": {
      "trigger": "code",
      "instructions": [
        "Analyze existing code in the Memory Bank",
        "Maintain consistency with existing code style",
        "Update the progress.md file with implementations made"
      ],
      "override_file_restrictions": true
    }
  },
  "mode_triggers": {
    "code": [
      { "condition": "Implement" },
      { "condition": "Code" },
      { "condition": "Develop" },
      { "condition": "Write function" }
    ]
  }
}
```

### 3. Ask Mode

Ask mode serves as your knowledge base interface and documentation assistant. This mode excels at providing information, explaining concepts, and maintaining project knowledge.

#### Key Capabilities

- 💡 **Knowledge Sharing**: Access project insights
- 📚 **Documentation**: Create and update docs
- 🔍 **Code Explanation**: Clarify implementations
- 🤝 **Collaboration**: Share understanding
- 📖 **Pattern Education**: Explain system patterns

#### Rules File Example (TOML)

```toml
# .clinerules-ask.toml
mode = "ask"

[instructions]
general = [
  "Act as a project expert",
  "Provide clear and concise explanations",
  "Use examples when appropriate",
  "Reference existing documentation when relevant"
]

[instructions.umb]
trigger = "ask"
instructions = [
  "Consult the Memory Bank for accurate information",
  "Update the active-context.md file with new topics discussed",
  "Suggest additional documentation when needed"
]
override_file_restrictions = true

[mode_triggers.ask]
condition = [
  { condition = "How does" },
  { condition = "Explain" },
  { condition = "What is" },
  { condition = "Why" }
]
```

### 4. Debug Mode

Debug mode specializes in systematic problem-solving and troubleshooting. This mode employs strategic analysis and verification to identify and resolve issues.

#### Key Capabilities

- 🔍 **Issue Investigation**: Analyze problems systematically
- 📊 **Error Analysis**: Track error patterns
- 🎯 **Root Cause Finding**: Identify core issues
- ✅ **Solution Verification**: Validate fixes
- 📝 **Problem Documentation**: Record findings

#### Rules File Example (YAML)

```yaml
# .clinerules-debug.yaml
mode: debug
instructions:
  general:
    - "Act as a debugging expert"
    - "Use a systematic approach to identify problems"
    - "Suggest practical and testable solutions"
    - "Consider possible side effects of solutions"
  umb:
    trigger: debug
    instructions:
      - "Consult the Memory Bank to understand the problem context"
      - "Update the active-context.md file with identified issues"
      - "Record solutions in the decision-log.md file"
    override_file_restrictions: true
mode_triggers:
  debug:
    - condition: "Error"
    - condition: "Bug"
    - condition: "Not working"
    - condition: "Problem with"
    - condition: "Failure in"
```

### 5. Test Mode

Test mode is designed for test-driven development and quality assurance. This mode operates with a focus on test creation, execution, and validation while maintaining code quality.

#### Key Capabilities

- 🧪 **Test-Driven Development**: Write tests before implementation
- 📊 **Test Execution**: Run and monitor test suites
- 🔍 **Coverage Analysis**: Track and improve test coverage
- 🎯 **Quality Assurance**: Validate code against requirements
- ✅ **Test Result Management**: Track and report test outcomes

#### Rules File Example (TOML)

```toml
# .clinerules-test.toml
mode = "test"

[instructions]
general = [
  "Act as a testing expert",
  "Prioritize code coverage and edge cases",
  "Suggest efficient testing approaches",
  "Consider unit, integration, and end-to-end tests"
]

[instructions.umb]
trigger = "test"
instructions = [
  "Consult the Memory Bank to understand the context of the code to be tested",
  "Update the progress.md file with implemented tests",
  "Record testing strategies in the system-patterns.md file"
]
override_file_restrictions = true

[mode_triggers.test]
condition = [
  { condition = "Test" },
  { condition = "Create tests" },
  { condition = "Test coverage" },
  { condition = "TDD" }
]
```

## Memory Bank Integration

Each mode automatically updates Memory Bank files based on interactions:

### Architect Mode

- **active-context.md**: Current design status
- **progress.md**: Architecture progress
- **decision-log.md**: Design decisions
- **system-patterns.md**: Defined system patterns

### Code Mode

- **active-context.md**: Current tasks
- **progress.md**: Code progress
- **decision-log.md**: Implementation decisions

### Ask Mode

- **active-context.md**: Current topics
- **progress.md**: Documentation progress
- **decision-log.md**: Knowledge decisions

### Debug Mode

- **active-context.md**: Current issues
- **progress.md**: Debug progress
- **decision-log.md**: Solution decisions

### Test Mode

- **active-context.md**: Test status
- **progress.md**: Test progress
- **decision-log.md**: Test decisions

## Session Management

- ⚡ **Real-time Updates**: Memory Bank is automatically synchronized with your work
- 💾 **Manual Updates**: Use "UMB" or "update memory bank" as a fallback when:
  - Ending a session unexpectedly
  - Halting a task midway
  - Recovering from connection issues
  - Forcing a full synchronization

## Creating Your Own Modes

You can create custom modes by creating `.clinerules-[your-mode]` files in JSON, YAML, or TOML. Follow the structure of the examples above and adapt them to your specific needs.

---

_Inspired by [Roo Code Memory Bank](https://github.com/GreatScottyMac/roo-code-memory-bank)_
