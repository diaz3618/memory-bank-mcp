# Architecture

High-level overview of the Memory Bank MCP server codebase.

## Layer Diagram

```
┌──────────────────────────────────────────────────┐
│                   MCP Protocol                   │
│            (JSON-RPC over stdio/SSE)             │
├──────────────────────────────────────────────────┤
│                MemoryBankServer                  │
│          src/server/MemoryBankServer.ts          │
├────────────┬────────────┬────────────────────────┤
│   Tools    │ Resources  │       Prompts          │
│  (write)   │  (read)    │                        │
├────────────┴────────────┴────────────────────────┤
│              MemoryBankManager                   │
│             src/core/MemoryBankManager.ts        │
├──────────┬──────────┬──────────┬─────────────────┤
│  Graph   │ Progress │  Mode    │ Store Registry  │
│  Store   │ Tracker  │ Manager  │                 │
├──────────┴──────────┴──────────┴─────────────────┤
│            FileSystem Abstraction                │
│  LocalFileSystem │ RemoteFileSystem (SSH)        │
│         CachingFileSystem (decorator)            │
└──────────────────────────────────────────────────┘
```

---

## Architecture Diagrams

### System Context — External Interactions

Shows how external AI clients and the VS Code extension interact with the Memory Bank MCP server.

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize':'14px'}}}%%
graph LR
    %% External Actors
    Copilot["GitHub Copilot"]
    Claude["Claude Code"]
    Cursor["Cursor"]
    Cline["Cline / Roo Code"]
    Other["Other MCP Clients"]
    
    %% VS Code Extension
    VSCodeExt["VS Code Extension\n(Separate Process)"]
    
    %% MCP Server
    MCPServer["Memory Bank MCP Server\n(Node.js Process)\nstdio/HTTP Transport"]
    
    %% Storage
    Storage[("File Storage\nLocal or Remote SSH")]
    
    %% Connections
    Copilot -->|"stdio\nJSON-RPC 2.0"| MCPServer
    Claude -->|"stdio\nJSON-RPC 2.0"| MCPServer
    Cursor -->|"stdio\nJSON-RPC 2.0"| MCPServer
    Cline -->|"stdio\nJSON-RPC 2.0"| MCPServer
    Other -->|"stdio\nJSON-RPC 2.0"| MCPServer
    
    VSCodeExt -->|"stdio or HTTP\nJSON-RPC 2.0"| MCPServer
    
    MCPServer <-->|"Read/Write\nmemory-bank/"| Storage
    
    classDef client fill:#e8f4fd,stroke:#4a90d9,stroke-width:2px,color:#1a3a5c
    classDef server fill:#e6f9e6,stroke:#4a9e4a,stroke-width:3px,color:#1a4a1a
    classDef extension fill:#f0e6ff,stroke:#7b5ea7,stroke-width:2px,color:#3a2063
    classDef storage fill:#f5f5f5,stroke:#757575,stroke-width:2px,color:#333
    
    class Copilot,Claude,Cursor,Cline,Other client
    class MCPServer server
    class VSCodeExt extension
    class Storage storage
```

---

### Container Architecture — High-Level Components

Shows the major containers (processes) and their responsibilities.

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize':'13px'}}}%%
graph TB
    subgraph VSCode["VS Code Process"]
        direction TB
        ExtUI["Extension UI Layer\n(TreeViews, Commands, Webviews)"]
        CopilotInt["Copilot Integration\n(@memory-bank chat, LM Tool)"]
        McpClientMgr["MCP Client Manager\n(StdioMcpClient | HttpMcpClient)"]
        
        ExtUI --> McpClientMgr
        CopilotInt --> McpClientMgr
    end
    
    subgraph ServerProc["Memory Bank Server Process (Node.js)"]
        direction TB
        Transport["MCP Transport Layer\n(stdio/HTTP + JSON-RPC 2.0)"]
        ToolLayer["Tool Handlers (7 domains)\nCore · Progress · Context · Decision\nMode · Graph · Store"]
        ResourceLayer["MCP Resources\n(5 read-only markdown files)"]
        CoreLogic["MemoryBankManager\n(Orchestration + Validation)"]
        
        Transport --> ToolLayer
        Transport --> ResourceLayer
        ToolLayer --> CoreLogic
        ResourceLayer --> CoreLogic
    end
    
    subgraph StorageLayer["Storage Layer"]
        FSInterface{{"FileSystemInterface"}}
        LocalFS["LocalFileSystem"]
        RemoteFS["RemoteFileSystem\n(SSH/SFTP)"]
        CacheFS["CachingFileSystem"]
        
        FSInterface -.implements.- LocalFS
        FSInterface -.implements.- RemoteFS
        FSInterface -.decorates.- CacheFS
    end
    
    Disk[("Local Disk\nmemory-bank/")]
    RemoteHost[("Remote SSH Host")]
    
    McpClientMgr -.->|"IPC or Network"| Transport
    CoreLogic --> FSInterface
    LocalFS --> Disk
    RemoteFS --> RemoteHost
    
    classDef container fill:#fff7e6,stroke:#d4a017,stroke-width:3px,color:#5a4210
    classDef layer fill:#e6f9e6,stroke:#4a9e4a,stroke-width:2px,color:#1a4a1a
    classDef storage fill:#fce4ec,stroke:#c0392b,stroke-width:2px,color:#5a1a1a
    classDef disk fill:#f5f5f5,stroke:#757575,stroke-width:2px,color:#333
    classDef iface fill:#fff,stroke:#555,stroke-width:2px,stroke-dasharray:5 5,color:#333
    
    class VSCode,ServerProc container
    class ExtUI,CopilotInt,McpClientMgr,Transport,ToolLayer,ResourceLayer,CoreLogic layer
    class LocalFS,RemoteFS,CacheFS storage
    class Disk,RemoteHost disk
    class FSInterface iface
```

---

### MCP Server Components — Internal Structure

Detailed view of the MCP server's internal components and their relationships.

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize':'12px'}}}%%
graph TB
    subgraph API["MCP API Layer"]
        Tools["Tool Handlers"]
        Resources["Resource Handlers"]
    end
    
    subgraph ToolDomains["Tool Domains"]
        CoreT["CoreTools\n24 tools"]
        ProgT["ProgressTools"]
        CtxT["ContextTools"]
        DecT["DecisionTools"]
        ModeT["ModeTools\nUMB lifecycle"]
        GraphT["GraphTools\n10 tools"]
        StoreT["StoreTools\n4 tools"]
    end
    
    subgraph CoreMgmt["Core Management"]
        MBM["MemoryBankManager\nOrchestrator"]
        PT["ProgressTracker"]
        SR["StoreRegistry\nstores.json"]
    end
    
    subgraph GraphSys["Knowledge Graph Subsystem"]
        GS["GraphStore\nEvent Log Manager"]
        GI["GraphIds\nSHA-256 IDs"]
        GV["GraphSchemas\nValidation"]
        GR["GraphReducer\nEvent → Snapshot"]
        GSE["GraphSearch\nRelevance Scoring"]
        GREN["GraphRenderer\nMarkdown Output"]
    end
    
    subgraph ModeSys["Mode System"]
        MM["ModeManager\nState Machine"]
        ERL["ExternalRulesLoader\n.mcprules-*"]
        Templates["McpRulesTemplates"]
    end
    
    Tools --> ToolDomains
    Resources --> MBM
    
    ToolDomains --> MBM
    
    MBM --> PT
    MBM --> SR
    MBM --> GS
    MBM --> MM
    
    GS --> GI
    GS --> GV
    GS --> GR
    GS --> GSE
    GS --> GREN
    
    MM --> ERL
    ERL --> Templates
    
    classDef apiClass fill:#e8f4fd,stroke:#4a90d9,stroke-width:2px,color:#1a3a5c
    classDef domainClass fill:#e6f9e6,stroke:#4a9e4a,stroke-width:2px,color:#1a4a1a
    classDef coreClass fill:#fff7e6,stroke:#c49a2a,stroke-width:2px,color:#5a4210
    classDef graphClass fill:#ffe6f0,stroke:#d81b60,stroke-width:2px,color:#5a1a3a
    classDef modeClass fill:#f3e5f5,stroke:#8e24aa,stroke-width:2px,color:#4a0e4e
    
    class Tools,Resources apiClass
    class CoreT,ProgT,CtxT,DecT,ModeT,GraphT,StoreT domainClass
    class MBM,PT,SR coreClass
    class GS,GI,GV,GR,GSE,GREN graphClass
    class MM,ERL,Templates modeClass
```

---

### VS Code Extension Components

Internal structure of the VS Code extension showing UI, services, and MCP client layer.

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize':'13px'}}}%%
graph TB
    subgraph UI["User Interface Layer"]
        TV["8 Tree Views\nStatus · Files · Actions\nMode · Graph · Stores\nRemote · Help"]
        WV["Graph Webview\nReact Flow + D3"]
        CMD["Commands\n40+ registered"]
    end
    
    subgraph CopilotInt["Copilot Integration"]
        Chat["@memory-bank\nChat Participant\n4 slash commands"]
        LMTool["get-instructions\nLanguage Model Tool\nAuto-inject context"]
    end
    
    subgraph ServiceLayer["Service Layer"]
        MBS["MemoryBankService\nState Management\nEvent Bridge"]
    end
    
    subgraph ClientLayer["MCP Client Layer"]
        Mgr["McpClientManager\nConnection Lifecycle"]
        StdioClient["StdioMcpClient\nChild Process Spawn"]
        HttpClient["HttpMcpClient\nSSE + HTTP POST"]
    end
    
    subgraph Config["Configuration"]
        Settings["VS Code Settings"]
        McpJson[".vscode/mcp.json"]
    end
    
    TV --> MBS
    WV --> MBS
    CMD --> MBS
    Chat --> MBS
    LMTool --> MBS
    
    MBS --> Mgr
    
    Mgr --> StdioClient
    Mgr --> HttpClient
    
    Mgr -.reads.- Settings
    Mgr -.reads.- McpJson
    
    StdioClient -.spawns.-> ServerProc["MCP Server Process"]
    HttpClient -.connects to.-> ServerProc
    
    classDef ui fill:#e8f4fd,stroke:#4a90d9,stroke-width:2px,color:#1a3a5c
    classDef copilot fill:#f0e6ff,stroke:#7b5ea7,stroke-width:2px,color:#3a2063
    classDef service fill:#e6f9e6,stroke:#4a9e4a,stroke-width:2px,color:#1a4a1a
    classDef client fill:#fff7e6,stroke:#c49a2a,stroke-width:2px,color:#5a4210
    classDef config fill:#f5f5f5,stroke:#757575,stroke-width:2px,color:#333
    classDef external fill:#fce4ec,stroke:#c0392b,stroke-width:2px,color:#5a1a1a
    
    class TV,WV,CMD ui
    class Chat,LMTool copilot
    class MBS service
    class Mgr,StdioClient,HttpClient client
    class Settings,McpJson config
    class ServerProc external
```

---

### Request Flow — Tool Invocation Path

Shows the complete path of a tool request from client to storage.

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize':'13px'}}}%%
sequenceDiagram
    participant Client as AI Client / Extension
    participant Transport as MCP Transport<br/>(stdio/HTTP)
    participant Router as Tool Router<br/>(tools/index.ts)
    participant Handler as Tool Handler<br/>(CoreTools, etc.)
    participant Manager as MemoryBankManager<br/>(Orchestrator)
    participant Validator as Validation Layer<br/>(Schemas, Guards)
    participant FS as FileSystemInterface
    participant Storage as Storage<br/>(Disk/SSH)
    
    Client->>Transport: JSON-RPC 2.0 Request<br/>{"method": "tools/call", ...}
    Transport->>Router: Dispatch tool call
    Router->>Handler: Route to specific handler
    Handler->>Manager: Call manager method
    
    Manager->>Validator: Validate input params
    Validator-->>Manager: ✓ Valid
    
    Manager->>Manager: Check file allowlist<br/>Apply mode restrictions
    
    Manager->>FS: Read/Write operation
    FS->>Storage: Actual I/O
    Storage-->>FS: Data
    FS-->>Manager: Result
    
    Manager->>Manager: Update state<br/>(progress, mode, etc.)
    
    Manager-->>Handler: Return result
    Handler-->>Router: Format response
    Router-->>Transport: JSON-RPC response
    Transport-->>Client: {"result": ...}
    
    Note over Client,Storage: All mutations are validated and logged
```

---

### Storage Architecture — FileSystem Abstraction

Shows the storage layer's design pattern and implementations.

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize':'13px'}}}%%
graph TB
    subgraph Core["Core Layer"]
        MBM["MemoryBankManager"]
        PT["ProgressTracker"]
        GS["GraphStore"]
    end
    
    subgraph Interface["Abstract Interface"]
        FSI{{"FileSystemInterface<br/>────────────────<br/>fileExists()<br/>readFile()<br/>writeFile()<br/>appendFile()<br/>listFiles()<br/>delete()<br/>ensureDirectory()"}}
    end
    
    subgraph Implementations["Concrete Implementations"]
        LFS["LocalFileSystem<br/>────────────────<br/>Uses: Node.js fs<br/>Sync: fs.promises"]
        RFS["RemoteFileSystem<br/>────────────────<br/>Uses: ssh2, ssh2-sftp-client<br/>Auth: SSH key<br/>Connection pooling"]
    end
    
    subgraph Decorator["Caching Decorator"]
        CFS["CachingFileSystem<br/>────────────────<br/>ETag-based invalidation<br/>Wraps any implementation<br/>Read cache only"]
    end
    
    subgraph Factory["Creation Pattern"]
        Factory["FileSystemFactory<br/>────────────────<br/>createLocalFileSystem()<br/>createRemoteFileSystem()<br/>testRemoteConnection()"]
    end
    
    subgraph Storage["Physical Storage"]
        LocalDisk[("Local Filesystem<br/>memory-bank/")]
        RemoteSSH[("Remote SSH Host<br/>~/memory-bank/")]
    end
    
    MBM --> FSI
    PT --> FSI
    GS --> FSI
    
    FSI -.implements.- LFS
    FSI -.implements.- RFS
    
    CFS -.wraps.- LFS
    CFS -.wraps.- RFS
    CFS -.implements.- FSI
    
    Factory -.creates.- LFS
    Factory -.creates.- RFS
    Factory -.creates.- CFS
    
    LFS --> LocalDisk
    RFS --> RemoteSSH
    
    classDef core fill:#fff7e6,stroke:#c49a2a,stroke-width:2px,color:#5a4210
    classDef iface fill:#fff,stroke:#555,stroke-width:3px,stroke-dasharray:5 5,color:#333
    classDef impl fill:#e6f9e6,stroke:#4a9e4a,stroke-width:2px,color:#1a4a1a
    classDef decorator fill:#e8f4fd,stroke:#4a90d9,stroke-width:2px,color:#1a3a5c
    classDef factory fill:#f0e6ff,stroke:#7b5ea7,stroke-width:2px,color:#3a2063
    classDef storage fill:#f5f5f5,stroke:#757575,stroke-width:2px,color:#333
    
    class MBM,PT,GS core
    class FSI iface
    class LFS,RFS impl
    class CFS decorator
    class Factory factory
    class LocalDisk,RemoteSSH storage
```

---

### Mode System Architecture

Shows how the mode system manages behavioral states and rules.

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize':'13px'}}}%%
stateDiagram-v2
    [*] --> code: Initialize (default)
    
    code --> architect: switch_mode('architect')
    code --> ask: switch_mode('ask')
    code --> debug: switch_mode('debug')
    code --> test: switch_mode('test')
    
    architect --> code: switch_mode('code')
    architect --> ask: switch_mode('ask')
    architect --> debug: switch_mode('debug')
    architect --> test: switch_mode('test')
    
    ask --> code: switch_mode('code')
    ask --> architect: switch_mode('architect')
    ask --> debug: switch_mode('debug')
    ask --> test: switch_mode('test')
    
    debug --> code: switch_mode('code')
    debug --> architect: switch_mode('architect')
    debug --> ask: switch_mode('ask')
    debug --> test: switch_mode('test')
    
    test --> code: switch_mode('code')
    test --> architect: switch_mode('architect')
    test --> ask: switch_mode('ask')
    test --> debug: switch_mode('debug')
    
    state "UMB Active" as umb {
        [*] --> processing: process_umb_command()
        processing --> updating: Update memory-bank/*.md
        updating --> [*]: complete_umb()
    }
    
    code --> umb: UMB trigger detected
    architect --> umb: UMB trigger detected
    ask --> umb: UMB trigger detected
    debug --> umb: UMB trigger detected
    test --> umb: UMB trigger detected
    
    umb --> code: Restore previous mode
    umb --> architect: Restore previous mode
    umb --> ask: Restore previous mode
    umb --> debug: Restore previous mode
    umb --> test: Restore previous mode
    
    note right of code
        .mcprules-code
        Full file access
        Write permissions
    end note
    
    note right of architect
        .mcprules-architect
        Markdown files only
        Design focus
    end note
    
    note right of ask
        .mcprules-ask
        Read-only (default)
        UMB exception
    end note
    
    note right of debug
        .mcprules-debug
        Read access
        Diagnostic commands
    end note
    
    note right of test
        .mcprules-test
        Read + execute tests
        No file writes
    end note
    
    note right of umb
        Temporary mode
        Write to memory-bank/
        Auto-restores
    end note
```

## Source Layout

```
src/
├── index.ts                    # Entry point — parses CLI args, starts server
├── server/
│   ├── MemoryBankServer.ts     # MCP server setup and routing
│   ├── tools/                  # MCP tool handlers (one file per domain)
│   │   ├── index.ts            # Tool registration and dispatch
│   │   ├── CoreTools.ts        # init, read, write, status, search
│   │   ├── ContextTools.ts     # get_context_digest, get_context_bundle
│   │   ├── DecisionTools.ts    # log_decision
│   │   ├── GraphTools.ts       # Knowledge graph CRUD
│   │   ├── ModeTools.ts        # switch_mode, get_current_mode, UMB
│   │   ├── ProgressTools.ts    # track_progress, add_progress_entry
│   │   └── StoreTools.ts       # Multi-store management
│   └── resources/
│       ├── index.ts
│       └── MemoryBankResources.ts  # MCP resource endpoints
├── core/
│   ├── MemoryBankManager.ts    # Central orchestrator (init, read, write, mode)
│   ├── ProgressTracker.ts      # Structured progress entries
│   ├── StoreRegistry.ts        # Multi-store path management
│   ├── graph/
│   │   ├── GraphStore.ts       # Append-only event log + snapshot
│   │   ├── GraphIds.ts         # Branded ID generation
│   │   ├── GraphReducer.ts     # JSONL → snapshot replay
│   │   ├── GraphRenderer.ts    # Snapshot → Markdown
│   │   ├── GraphSchemas.ts     # Input validation
│   │   └── GraphSearch.ts      # Entity lookup
│   └── templates/
│       ├── CoreTemplates.ts    # Default markdown file content
│       └── index.ts
├── types/
│   ├── index.ts                # Re-exports
│   ├── graph.ts                # Graph types, branded IDs, event union
│   ├── rules.ts                # Clinerules interfaces
│   ├── progress.ts             # Progress entry types
│   ├── guards.ts               # Runtime type guards
│   ├── constants.ts            # Core file list, tool names
│   └── memory-bank-constants.ts
└── utils/
    ├── FileUtils.ts            # File I/O helpers
    ├── LogManager.ts           # Structured logging
    ├── ModeManager.ts          # Mode state machine
    ├── ExternalRulesLoader.ts  # .mcprules-* file loading
    ├── McpRulesTemplates.ts    # Default rules for each mode
    ├── MigrationUtils.ts       # Version migration helpers
    ├── ETagUtils.ts            # Content hashing for caching
    ├── SshUtils.ts             # SSH connection helpers
    └── storage/
        ├── FileSystemInterface.ts  # Abstract FS contract
        ├── LocalFileSystem.ts      # Node fs implementation
        ├── RemoteFileSystem.ts     # SSH/SFTP implementation
        ├── CachingFileSystem.ts    # Read-cache decorator
        └── FileSystemFactory.ts    # Factory for FS selection
```

## Key Concepts

### Memory Bank Files
The server manages a set of markdown files in a `memory-bank/` directory:

| File | Purpose |
|------|---------|
| `product-context.md` | Project overview, goals, tech stack |
| `active-context.md` | Current tasks, blockers, next steps |
| `progress.md` | Chronological progress log |
| `decision-log.md` | Decisions with rationale |
| `system-patterns.md` | Architecture patterns |

### Knowledge Graph
An append-only JSONL event log (`graph/graph.jsonl`) that materializes into a snapshot (`graph.snapshot.json`). Operations:
- **upsert_entity** / **delete_entity**
- **add_observation** / **delete_observation**
- **link_entities** / **unlink_entities**

Write operations are serialized via an async write queue to prevent race conditions.

### Modes
Five operational modes (`architect`, `ask`, `code`, `debug`, `test`) configured via `.mcprules-{mode}` files. Each mode has:
- Custom instructions
- File authority rules (read/write/create permissions)
- Tool usage guidelines
- UMB (Update Memory Bank) triggers

Modes are auto-created from templates if missing during initialization.

### Storage Abstraction
All file I/O goes through `FileSystemInterface`, enabling:
- **Local** — direct Node.js `fs` calls
- **Remote** — SSH/SFTP via `ssh2`
- **Caching** — decorator that caches reads with ETag invalidation

### Multi-Store
`StoreRegistry` allows managing multiple memory banks from a single server instance. Each store has an ID, path, and optional label.

## Data Flow

```
AI Client → MCP Protocol → MemoryBankServer
  → Tool dispatch (tools/index.ts)
    → Tool handler (e.g., CoreTools.handleWriteMemoryBankFile)
      → MemoryBankManager (orchestration + validation)
        → FileSystem (LocalFileSystem | RemoteFileSystem)
          → Disk / SSH
```

## VS Code Extension
The companion extension lives in `vscode-extension/` and provides:
- Tree views for memory bank files and modes
- Commands for initialization, mode switching
- MCP client that communicates with the server via stdio
- Copilot integration (instructions, chat participant)
