# Memory Bank MCP — Improvement Report (Local + Remote + JSON Augmentation)

> Repo analyzed from: `/mnt/data/memory-bank-mcp` (uploaded as `memory-bank-mcp.zip`)  
> Goal: “great MCP server” that helps agents maintain project context, track progress, survive context-window limits, and work safely/reliably.

---
## Implementation Status

> Last updated: 2026-02-08

| Priority | Item | Status |
|----------|------|--------|
| **P0** | Fix remote exists/directory/file checks + stdout trimming | ✅ Completed |
| **P0** | Make ProgressTracker use FileSystemInterface | ✅ Completed |
| **P0** | Make backups use FileSystemInterface (remote works) | ✅ Completed |
| **P0** | Wire ModeManager (remove stubs) | ✅ Completed |
| **P0** | Add path traversal protection | ✅ Completed |
| **P0** | Remove dummy tool parameters | ✅ Completed |
| **P1** | Atomic writes (local and remote) | ✅ Completed |
| **P1** | ETag-based optimistic concurrency | ✅ Completed |
| **P1** | Basic backup/rollback tooling | ✅ Completed (`create_backup`, `list_backups`, `restore_backup`) |
| **P2** | Structured tools (progress/decision/context) | ✅ Completed (`add_progress_entry`, `add_session_note`, `update_tasks`) |
| **P2** | Context bundle and digest tools/resources | ✅ Completed (`get_context_bundle`, `get_context_digest`) |
| **P2** | Full-text search tool | ✅ Completed (`search_memory_bank`) |
| **P3** | Persistent SSH / ssh2 SFTP | 🔲 Not started |
| **P3** | Read caching + batch operations | 🔲 Not started |
| **P3** | Optional embeddings + semantic search | 🔲 Not started |

### Bug Fixes (Additional)
- ✅ Fixed nested folder creation issue: `LocalFileSystem.getFullPath()` now handles absolute paths correctly
- ✅ Fixed `MemoryBankManager.initialize()` race condition with file system recreation
- ✅ All 66 tests passing

---
## Executive summary

This MCP server already has strong foundations (templates, tools/resources, docs, tests, remote mode concept). The biggest blockers to it becoming “great” are:

1. **Remote mode correctness is broken / incomplete** (existence checks, directory vs file detection, ProgressTracker bypasses remote abstraction, backup uses local FS).
2. **Mode system is effectively disabled in the current snapshot** (`MemoryBankManager.initializeModeManager()` and `getModeManager()` are stubs returning `null`, while tools/events assume a working ModeManager).
3. **Security & safety gaps** (path traversal, SSH options, command construction patterns).
4. **Data integrity & multi-agent concurrency** (non-atomic writes, no ETags/locking/merge strategy).
5. **Agent ergonomics** (dummy tool parameters, missing structured APIs, “read/write raw markdown” encourages brittle edits).

Adding **JSON as a canonical machine state** (without removing Markdown) is one of the highest-leverage upgrades: it enables deterministic updates, validation, and conflict handling, while Markdown remains the human-friendly view.

---

## What’s in scope

- **Corrections**: bugs, broken features, inconsistent abstractions
- **Completion**: features present in code but not wired up
- **Efficiency**: fewer SSH round-trips, caching, batching
- **Additions**: structured APIs, JSON state, concurrency safety
- **Hardening**: security, robustness, predictable behavior for agents

---

## Current architecture (quick map)

- Core:
  - `src/core/MemoryBankManager.ts` — memory bank pathing, initialization, file ops, status
  - `src/core/ProgressTracker.ts` — writes to `progress.md` + `active-context.md`
- Server:
  - `src/server/MemoryBankServer.ts` — MCP server wiring
  - `src/server/tools/*` — tool definitions & handlers
  - `src/server/resources/*` — resource handlers
- Storage:
  - `src/utils/storage/LocalFileSystem.ts`
  - `src/utils/storage/RemoteFileSystem.ts`
  - `src/utils/SshUtils.ts` — SSH command runner
- Modes:
  - `src/utils/ModeManager.ts` — actual mode manager implementation (but not wired)
  - `src/utils/ExternalRulesLoader.ts` — rule discovery/loading

---

# 1) Correctness & completeness fixes (highest priority)

## 1.1 Remote: file existence and directory checks are wrong

### Problem

`RemoteFileSystem.fileExists()` and `RemoteFileSystem.isDirectory()` both call `sshUtils.directoryExists()`:

- `RemoteFileSystem.ts`
  - `fileExists(relativePath)` → `directoryExists(relativePath)` **(wrong)**
  - `isDirectory(relativePath)` → `directoryExists(relativePath)` **(ok for directories, but used as a generic “exists”)**

Additionally, `SshUtils.directoryExists()` compares stdout strictly:

```ts
return result === 'EXISTS';
````

But the SSH output almost always includes a newline (`"EXISTS\n"`), so this can fail.

### Fix

- Add `exists(path)`, `isDirectory(path)`, `isFile(path)` in `SshUtils`.
- Always `trim()` stdout before comparisons.
- Wire RemoteFileSystem accordingly.

**Impact:** Remote mode currently behaves as if most paths do not exist, and files can be misclassified.

---

## 1.2 Remote: MemoryBankManager uses FileSystemInterface sometimes, but not consistently

### Problems

- `MemoryBankManager.createBackup()` reads via `this.readFile()` but writes backups using local `FileUtils.writeFile()` + local `path.join()`. That breaks remote.
- `ProgressTracker` uses **local** filesystem paths (`path.join(this.memoryBankDir, ...)`) and calls `FileUtils.readFile/writeFile` directly. That breaks remote even if `MemoryBankManager` supports remote.

### Fix

- Make `ProgressTracker` depend on `FileSystemInterface` (or accept `MemoryBankManager` as a dependency and call manager methods).
- Make backup creation use `FileSystemInterface` end-to-end.
- Consider adding `copy`/`writeFile` + `ensureDirectory` based backup for remote.

---

## 1.3 Modes: ModeManager is implemented but “disabled” in MemoryBankManager

### Problem

In `MemoryBankManager.ts`, the following are stubbed:

- `initializeModeManager()` logs “skipped”
- `getModeManager()` returns `null`
- `switchMode()` returns `true` without checking
- `activateUmbMode()`, `isUmbModeActive()`, etc. are stubby / inconsistent

But the server still registers:

- mode tools
- mode event listeners in `MemoryBankServer.ts`

So “mode” features will appear available but won’t work reliably.

### Fix

Wire it properly:

- Instantiate `ExternalRulesLoader`
- Instantiate `ModeManager`
- Load rules, set initial mode
- Use `modeManager.getStatusPrefix()` in responses/resources where applicable

**Impact:** Large feature gap; fixing this unlocks “agent mode” workflows and status prefix system.

---

## 1.4 Remote: path joining issues on Windows + remote shells

- `RemoteFileSystem.getFullPath()` uses `path.join(...)` (OS-dependent separators).
  On Windows this can create backslashes, which are wrong for remote POSIX paths.
- For remote paths, use POSIX joining (`path.posix.join`) or manual `/` joining.

---

## 1.5 CLI help flag conflict

`src/index.ts` uses `-h` for help, and docs mention `--remote-host, -h <host>` in help text (but code actually uses `--remote-host` without `-h`).
Fix the help message to avoid misleading users.

---

# 2) Security & safety hardening

## 2.1 Prevent path traversal in “read/write memory bank file” tools

Current tools accept arbitrary `filename` and pass it through. An agent could accidentally do:

- `../../.env`
- `/etc/passwd`
- `../somewhere/outside/memory-bank`

### Fix options

- **Allowlist** only core files + a controlled `docs/` directory.
- Or enforce “relative, no `..`, no absolute paths, no backslashes, no null bytes”.
- Enforce extension (`.md` / `.json`) if you introduce JSON.

---

## 2.2 SSH security defaults: `StrictHostKeyChecking=no` is risky

`SshUtils.executeCommand()` uses:

- `-o StrictHostKeyChecking=no`
- `ssh -v` (verbose)

Risks:

- MITM vulnerability if host keys are not verified.
- Verbose output can leak environment details and increases noise.

### Fix

- Default to host key checking on.
- Provide a config flag (explicit opt-out) for those who want “unsafe but convenient”.
- Use `-v` only when `debugMode` is on.

---

## 2.3 SSH command construction: injection & quoting

Many commands interpolate paths directly into shell strings. While you do quote with `"..."`, you still want:

- consistent escaping (`printf %q` style is not portable, but you can robustly quote)
- avoid `echo "base64..."` when the base64 string might include characters that interact with shells (it’s generally safe, but large strings and quoting edge cases happen)
- prefer `cat > file << 'EOF'` heredocs (careful with size) or SFTP for binary-safe transfer

**Best upgrade:** use `ssh2` with SFTP; it removes a whole class of shell quoting bugs.

---

## 2.4 Permissions: avoid writing outside memory bank root

Even if you validate filenames, enforce a **root constraint**:

- Resolve requested path
- Ensure it stays inside `<memory-bank-root>`
- Reject otherwise

Do this for both local and remote.

---

# 3) Reliability, data integrity, and multi-agent concurrency

## 3.1 Atomic writes

`FileUtils.writeFile()` writes directly. If the process crashes mid-write, files can be corrupted.

### Fix

- Write to `file.tmp` then rename (atomic on most OS/filesystems).
- For remote: write to temp then `mv`.

---

## 3.2 ETags / optimistic concurrency

Agents often read-modify-write. Without concurrency control, later writes can overwrite earlier work.

### Add

- `read_*` tools optionally return `{content, etag}` where `etag = sha256(content)` or `mtime+size`.
- `write_*` tools accept optional `ifMatchEtag`.
- Reject (or auto-merge) if ETag mismatches.

This is one of the most practical upgrades for multi-agent scenarios.

---

## 3.3 File locking (optional)

If you expect many agents, implement:

- local: lockfile with `fs.open(lock, 'wx')`
- remote: `mkdir lockdir` pattern (atomic) or `flock` if available

---

## 3.4 Backups & rollback

There’s a backup function, but:

- it doesn’t work remote
- it’s not tied to write operations

Upgrades:

- automatic “snapshot before write” (configurable)
- `restore_backup(backup_id)` tool
- keep limited retention (e.g., last 20 backups)

---

# 4) Performance & efficiency

## 4.1 Remote performance: too many SSH round-trips

Current remote mode likely spawns a new `ssh` process per call. That’s expensive.

### Options

1. **Persistent connection** via `ssh2` (best).
2. SSH multiplexing (ControlMaster/ControlPath).
3. **Batch tools**: read many files at once; write many updates at once.

---

## 4.2 Caching reads

For agents that repeatedly read the same context:

- keep in-memory cache of file content + etag
- invalidate cache on writes
- expose `get_context_bundle()` that returns all core files in one response

---

## 4.3 Reduce unnecessary logging

Verbose logs on stderr can slow down and clutter MCP clients.

- Make logs structured + level-based.
- Default to INFO/WARN/ERROR only.
- Put “debug trace” behind a flag.

---

# 5) Agent ergonomics (tool design)

## 5.1 Remove “dummy params” like `random_string`

Tools like `list_memory_bank_files` require `random_string` purely to satisfy schema. That harms agent usability.

### Fix

Use:

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

and accept `{}`.

---

## 5.2 Add structured tools (avoid brittle markdown regex edits)

Right now, the system encourages agents to rewrite Markdown sections directly. That’s fragile.

Introduce tools that express intent:

- `progress.addEntry({type, summary, details, files, tags, timestamp})`
- `decision.add({title, context, decision, alternatives, consequences, tags})`
- `activeContext.set({tasks, issues, nextSteps, sessionNotes})`
- `activeContext.appendSessionNote({text, timestamp, user})`
- `systemPatterns.upsert({patternId, summary, rationale, examples})`

Server owns formatting in Markdown.

---

## 5.3 Provide “context packing” tools for when LLMs run out of context

Add tools that return compact, structured summaries:

- `get_context_digest({maxTokens?, sections?})`
- `get_recent_progress({limit, sinceDate?})`
- `search_decisions({query, tags?, sinceDate?})`
- `get_open_tasks()` (from JSON state)
- `get_project_state_snapshot()` (single combined object)

This is the #1 operational use-case for memory banks.

---

## 5.4 Add a “read-only safe mode” or capability flags

Let users configure:

- allow raw file writes? (dangerous)
- allow only structured updates?
- allow remote operations?

Expose server capabilities via a tool or resource for the client/agent to adapt behavior.

---

# 6) Adding JSON without removing Markdown (recommended approach)

## 6.1 Why add JSON?

JSON enables:

- deterministic parsing
- schema validation
- partial updates (patch)
- safer merges & concurrency controls
- better search/filtering (by tags, timestamps, IDs)

Markdown remains:

- human-readable documentation
- stable “view” that can be regenerated

---

## 6.2 Canonical JSON + rendered Markdown (sidecar pattern)

Recommended structure (per-doc sidecars):

- `memory-bank/active-context.md`
- `memory-bank/active-context.json`
- `memory-bank/progress.md`
- `memory-bank/progress.json`
- `memory-bank/decision-log.md`
- `memory-bank/decision-log.json`
- `memory-bank/system-patterns.md`
- `memory-bank/system-patterns.json`
- `memory-bank/product-context.md` (optionally `product-context.json`)

### “Source of truth” rules

- JSON is canonical for structured fields.
- Markdown is generated (or partially generated) from JSON.
- Manual Markdown edits are allowed only in designated “freeform” sections (see 6.4).

---

## 6.3 JSON Schema and validation

Add JSON Schema files (or inline schemas) and validate on write:

- required keys
- types
- max lengths
- enums
- date formats (ISO 8601)

This avoids corrupted state due to partial agent outputs.

---

## 6.4 Hybrid: keep freeform Markdown sections

You can preserve full Markdown flexibility by dividing docs into:

- **structured sections** (generated)
- **freeform sections** (human-authored, preserved)

Example in `active-context.md`:

- `## Structured` (generated from JSON)
- `## Notes (freeform)` (kept as-is)

Store freeform content in JSON as a string (optional) or preserve in Markdown using marker comments:

- `<!-- MB:BEGIN:FREEFORM --> ... <!-- MB:END:FREEFORM -->`

---

## 6.5 Tools for JSON state

Add tools like:

- `get_memory_state()` → returns combined JSON object + etag
- `patch_memory_state({patch, ifMatchEtag})` → JSON Patch (RFC 6902) or merge-patch (RFC 7396)
- `render_memory_bank_markdown({documents?})` → regenerate Markdown from JSON

This gives agents a safe “data plane” and keeps Markdown as the “presentation plane”.

---

# 7) Search, indexing, and retrieval improvements

## 7.1 Fast full-text search tool

Add:

- `search_memory_bank({query, files?, maxResults?})` returning:

  - file
  - line snippet
  - match context
  - stable IDs (if JSON)

For remote: implement search server-side (`ripgrep`) when available, fallback to local.

---

## 7.2 Tagging, IDs, and references

Give every progress/decision item an ID:

- makes updates and cross-references stable
- enables deduping and merging

Example:

- progress entry: `p_2026-02-08_001`
- decision: `d_2026-02-08_adopt-json-sidecars`

---

## 7.3 Optional embeddings (advanced)

If you want “semantic” retrieval:

- store embeddings for chunks (product context, decisions, patterns)
- provide `semantic_search({query, topK})`

This is optional but can make “find the right context” much better.

---

# 8) Remote mode: make it production-grade

## 8.1 Replace shelling out with `ssh2` + SFTP

Benefits:

- fewer forks
- binary-safe file transfers
- no quoting issues
- reusable connection
- supports directory listing, stat, read/write natively

---

## 8.2 Support remote prerequisites & health checks

Add a `remote_health_check` tool/resource:

- test connection
- verify remote base path
- verify permissions
- check required commands (if you still use shell)

---

## 8.3 Normalize remote path handling

Use POSIX paths; do not use OS `path.join` for remote.
Add `posixJoin()` helper.

---

# 9) Robustness and formatting improvements

## 9.1 Time and locale consistency

`ProgressTracker` uses `toLocaleTimeString()` which varies by locale and environment.
If “English only” is a hard requirement, use:

- ISO 8601 timestamps with timezone (or UTC)
- consistent formatting for all entries

Example:

- `2026-02-08T15:22:10-05:00`

---

## 9.2 Markdown section insertion is regex-based

Current regex approach is OK for a prototype but breaks if headers change.

If you keep Markdown as editable, prefer:

- stable marker comments: `<!-- MB:UPDATE_HISTORY -->`
- update content between markers

This makes edits resilient even if headings change.

---

## 9.3 Enforce size limits / chunking

Add protections:

- max file size read/write (configurable)
- chunked read tool for very large docs:

  - `read_file_chunk({filename, offset, length})`

Helps prevent accidental multi-megabyte transfers.

---

# 10) Observability & diagnostics

## 10.1 Structured logging

- log level
- component
- event name
- optional request id

Avoid `console.error` in many places; route through LogManager and only emit errors to stderr by default.

---

## 10.2 Add “server info” tool/resource

Expose:

- version (from `package.json` instead of hard-coded `0.5.0`)
- capabilities (remote enabled? JSON enabled? safe mode?)
- memory bank root path
- mode + status prefix

Useful for clients.

---

# 11) Testing & CI improvements

## 11.1 Remote integration tests

Add CI tests using a local SSH container (e.g., `linuxserver/openssh-server`) to validate:

- remote file exists
- read/write/list
- backups
- JSON + markdown rendering end-to-end

---

## 11.2 Concurrency tests

Add tests for:

- ETag mismatch handling
- atomic write behavior
- lock acquisition/release
- merge strategy (if implemented)

---

# 12) Product-level features that make this “great”

## 12.1 A “context bundle” resource

Expose a single resource:

- `memory-bank://bundle`
  that returns a compact bundle of:
- product-context
- active-context
- progress (recent N)
- open decisions
- system patterns

This is the “load context quickly” killer feature.

---

## 12.2 A “digest” tool for context window limits

Add:

- `create_context_digest({maxChars|maxTokens, focus?})`
  The server can:
- pick salient sections
- summarize recent progress
- list current tasks + blockers
- return citations/links to full entries

This is extremely agent-friendly.

---

## 12.3 A “session workflow” for UMB mode

Once ModeManager is wired:

- detect trigger phrases
- enter UMB
- record updates
- exit UMB
- apply status prefix changes

This creates consistent, predictable behavior across clients.

---

# 13) Prioritized roadmap

## P0 — Must-fix (unblocks major functionality) ✅ COMPLETED

1. ✅ Fix remote exists / directory / file checks + stdout trimming.
2. ✅ Make ProgressTracker and backups use FileSystemInterface (remote works end-to-end).
3. ✅ Wire ModeManager (remove stubs) so mode tools/events work.
4. ✅ Add filename/path traversal protection for read/write tools.
5. ✅ Remove dummy tool parameters.

## P1 — Reliability & multi-agent readiness ✅ COMPLETED

1. ✅ Atomic writes (local and remote).
2. ✅ ETag-based optimistic concurrency on reads/writes.
3. ✅ Basic backup/rollback tooling (`create_backup`, `list_backups`, `restore_backup`).

## P2 — "Great agent experience" ✅ COMPLETED

1. ✅ Add structured tools (`add_progress_entry`, `add_session_note`, `update_tasks`).
2. ✅ Add `get_context_bundle` and `get_context_digest` tools.
3. ✅ Add `search_memory_bank` tool (full-text search).

## P3 — Performance & scale 🔲 NOT STARTED

1. 🔲 Persistent SSH / ssh2 SFTP.
2. 🔲 Read caching + batch operations.
3. 🔲 Optional embeddings + semantic search.

# 14) Quick win code pointers (where to change)

- Remote correctness:

  - `src/utils/storage/RemoteFileSystem.ts`
  - `src/utils/SshUtils.ts`
- Mode wiring:

  - `src/core/MemoryBankManager.ts` (remove stubs, instantiate `ExternalRulesLoader` + `ModeManager`)
  - `src/server/MemoryBankServer.ts` (should start working after wiring)
- Progress/backup remote compatibility:

  - `src/core/ProgressTracker.ts`
  - `src/core/MemoryBankManager.ts#createBackup`
- Tool schemas:

  - `src/server/tools/*.ts`
- Path traversal validation:

  - `src/server/tools/*` handlers + `MemoryBankManager` path join logic

---

## Appendix A — Suggested JSON shapes (starter)

### `active-context.json`

```json
{
  "projectState": "string",
  "tasks": [{"id":"t1","text":"...","status":"open|blocked|done","tags":["..."]}],
  "issues": [{"id":"i1","text":"...","severity":"low|med|high"}],
  "nextSteps": [{"id":"n1","text":"..."}],
  "sessionNotes": [{"id":"s1","timestamp":"ISO8601","text":"...","user":"..."}]
}
```

### `progress.json`

```json
{
  "entries": [
    {
      "id": "p_2026-02-08_001",
      "timestamp": "2026-02-08T15:22:10-05:00",
      "type": "change|fix|feature|doc",
      "summary": "string",
      "details": "string",
      "files": ["..."],
      "tags": ["..."],
      "user": "https://github.com/..."
    }
  ]
}
```

### `decision-log.json`

```json
{
  "decisions": [
    {
      "id":"d_2026-02-08_json-sidecars",
      "date":"2026-02-08",
      "title":"...",
      "context":"...",
      "decision":"...",
      "alternatives":["..."],
      "consequences":["..."],
      "tags":["..."],
      "user":"..."
    }
  ]
}
```

---

## Appendix B — What NOT to do (anti-patterns)

- Don’t make Markdown the canonical structured store and then try to parse it back into JSON.
- Don’t let agents freely edit arbitrary filenames without constraints.
- Don’t rely on regex headings only; use markers or server-owned formatting for structured sections.
- Don’t keep spawning SSH processes per operation if remote mode is a core feature.
