# Memory Bank — Copilot Instructions

This project uses the Memory Bank MCP server to persist context across AI sessions.
You have access to Memory Bank MCP tools. USE THEM — they are not optional.

## Mandatory Workflow (every task, no exceptions)

### START of task
1. Call `get_context_digest` MCP tool to load context (VS Code Copilot users: `memory-bank_get-instructions` also works)
2. Read the returned active-context.md and progress.md
3. Use `graph_search` to find relevant knowledge graph entities

### DURING task
4. Call `track_progress` after completing milestones
5. Call `log_decision` when making architectural/design choices
6. Call `add_session_note` for observations, blockers, or questions

### END of task
7. Call `update_active_context` with updated tasks, issues, and next steps
8. Call `track_progress` with a final summary of what was accomplished
9. Update knowledge graph entities if project structure changed

## If Memory Bank contains placeholder text
If any core file contains `[Project description]` or `[Task 1]` style placeholders,
the Memory Bank has never been initialized. You MUST populate all core files with real
project data from the workspace before doing any other work.

## Available MCP Tools
Context: get_context_digest, get_context_bundle, get_memory_bank_status, read/write_memory_bank_file
Progress: track_progress, add_progress_entry, update_active_context, log_decision, add_session_note
Graph: graph_search, graph_upsert_entity, graph_add_observation, graph_link_entities, graph_open_nodes

## Valid Modes
The ONLY valid modes are: architect, code, ask, debug, test.
There is NO "full" mode. All tools are available in every mode — modes control
behavior guidelines, not tool access. Use `switch_mode` to change modes.
