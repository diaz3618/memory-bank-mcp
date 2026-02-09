# Memory Bank Server System Patterns

## Architecture Patterns

### MCP Server

The Memory Bank Server is implemented as an MCP (Model Context Protocol) server, which follows a specific communication pattern to interact with MCP clients. This pattern facilitates integration with AI tools and other MCP-compatible systems.

### File Management

The system uses an asynchronous file management pattern, utilizing the fs-extra library for file and directory manipulation.

## Code Patterns

### TypeScript with Strict Types

The code is written in TypeScript with strict type configuration, ensuring greater safety and facilitating maintenance.

### Error Handling

The system uses a consistent error handling pattern, with MCP-specific error classes (McpError) and standardized error codes.

### Asynchronous Functions

I/O operations are implemented as asynchronous functions using async/await, following best practices for non-blocking operations.

### Testing Patterns

The project uses Bun's built-in test runner with a describe/test pattern similar to Jest:

- `describe` blocks for grouping related tests
- `test` blocks for individual test cases
- `beforeEach`/`afterEach` hooks for setup and teardown
- Asynchronous tests using async/await
- Event testing using promises
- Temporary file creation and cleanup for file-based tests

## Documentation Patterns

### Markdown Files

The Memory Bank uses markdown (.md) files for documentation, following a consistent structure:

- Main title (H1)
- Sections (H2)
- Subsections (H3)
- Bulleted or numbered lists
- Tables when appropriate

### Memory Bank Structure

The Memory Bank follows a standardized structure with the following core files:

- `product-context.md` - Project overview
- `active-context.md` - Current project context
- `progress.md` - Project progress
- `decision-log.md` - Decision log
- `system-patterns.md` - System patterns (this file)

### Knowledge Graph Structure

The Knowledge Graph extends the Memory Bank with structured entity storage in the `graph/` subfolder:

- `graph/graph.jsonl` - Append-only event log (source of truth)
- `graph/graph.snapshot.json` - Computed snapshot for fast reads
- `graph/graph.md` - Human-readable Markdown rendering

**Event Types:**
- `entity_upsert` - Create/update entities
- `observation_add` - Add observations to entities
- `relation_add` - Create relations between entities
- `relation_remove` - Remove relations

**Core Types:**
- `Entity` - Named nodes with type and attributes
- `Observation` - Timestamped notes attached to entities
- `Relation` - Typed edges between entities (e.g., "uses", "depends-on")

## MCP Tool Patterns

### Tool Structure

Each MCP tool follows a consistent pattern:

- Unique and descriptive name
- Clear functionality description
- Well-defined JSON input schema
- Proper error handling
- Standardized response

### Input Validation

All tools implement consistent input validation, checking:

- Presence of required parameters
- Correct data types
- Values within acceptable limits
