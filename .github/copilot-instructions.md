# Memory Bank — Copilot Instructions

This project uses the Memory Bank MCP server to persist context across AI sessions.
You have access to Memory Bank MCP tools. USE THEM — they are not optional.

## Mandatory Workflow (every task, no exceptions)

### START of task
1. ⚠️ CALL THIS FIRST. Call `get_instructions` MCP tool to learn the full tool catalog and workflow (once per session)
2. Call `get_context_digest` to load current project state (tasks, issues, progress, decisions)
3. Read `system-patterns.md` (via `read_memory_bank_file`) to understand project conventions, architecture patterns, and coding standards
4. Use `graph_search` to find relevant knowledge graph entities

### DURING task
4. Call `track_progress` after completing milestones
5. Call `log_decision` when making architectural/design choices
6. Call `add_session_note` for observations, blockers, or questions

### END of task
7. Call `update_active_context` with updated tasks, issues, and next steps
8. Call `track_progress` with a final summary of what was accomplished
9. Update knowledge graph entities if project structure changed
10. Update `system-patterns.md` if new patterns, architecture, or conventions were introduced

## If Memory Bank contains placeholder text
If any core file contains `[Project description]` or `[Task 1]` style placeholders,
the Memory Bank has never been initialized. You MUST populate all core files with real
project data from the workspace before doing any other work.

## Available MCP Tools
Instructions: get_instructions
Context: get_context_digest, get_context_bundle, get_memory_bank_status, read/write_memory_bank_file
Progress: track_progress, add_progress_entry, update_active_context, log_decision, add_session_note
Graph: graph_search, graph_upsert_entity, graph_add_observation, graph_link_entities, graph_open_nodes

## Valid Modes
The ONLY valid modes are: architect, code, ask, debug, test.
There is NO "full" mode. All tools are available in every mode — modes control
behavior guidelines, not tool access. Use `switch_mode` to change modes.

## Important Notes
- Keep you internal thought process private. Do NOT share it in the conversation.

## ⚠️ CRITICAL: Never Access memory-bank/ Directly

AI agents/LLMs must **NEVER** directly edit files in the `memory-bank/` folder
using file editing tools (`replace_string_in_file`, `create_file`, `write_file`)
or terminal commands (`echo`, `sed`, `cat >`).

**All interactions with Memory Bank files MUST go through the MCP server tools:**

| Operation | Tool(s) |
|---|---|
| Read files | `read_memory_bank_file`, `batch_read_files`, `get_context_bundle` |
| Write files | `write_memory_bank_file`, `batch_write_files` |
| Update context | `update_active_context`, `update_tasks` |
| Track progress | `track_progress`, `add_progress_entry` |
| Log decisions | `log_decision` |
| Session notes | `add_session_note` |
| Knowledge graph | `graph_upsert_entity`, `graph_add_observation`, `graph_link_entities`, etc. |
| Search | `search_memory_bank`, `graph_search` |

**Why?** The MCP server guarantees file integrity via ETag concurrency control,
atomic writes, content validation, and event logging. Direct edits bypass all of
these and can corrupt the Memory Bank state.
