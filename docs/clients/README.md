# Example Clients

Source: <https://modelcontextprotocol.io/clients>

A list of applications that support MCP integrations

This page provides an overview of applications that support the Model Context Protocol (MCP). Each client may support different MCP features, allowing for varying levels of integration with MCP servers.

## Feature support matrix

| Client                               | [Resources] | [Prompts] | [Tools] | [Sampling] | Roots | Notes                                                              |
| ------------------------------------ | ----------- | --------- | ------- | ---------- | ----- | ------------------------------------------------------------------ |
| [Claude Desktop App][Claude]         | ✅          | ✅        | ✅      | ❌         | ❌    | Full support for all MCP features                                  |
| [5ire][5ire]                         | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools.                                                    |
| [BeeAI Framework][BeeAI Framework]   | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools in agentic workflows.                               |
| [Cline][Cline]                       | ✅          | ❌        | ✅      | ❌         | ❌    | Supports tools and resources.                                      |
| [Continue][Continue]                 | ✅          | ✅        | ✅      | ❌         | ❌    | Full support for all MCP features                                  |
| [Cursor][Cursor]                     | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools.                                                    |
| [Emacs Mcp][Mcp.el]                  | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools in Emacs.                                           |
| [Firebase Genkit][Genkit]            | ⚠️          | ✅        | ✅      | ❌         | ❌    | Supports resource list and lookup through tools.                   |
| [GenAIScript][GenAIScript]           | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools.                                                    |
| [Goose][Goose]                       | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools.                                                    |
| [LibreChat][LibreChat]               | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools for Agents                                          |
| [mcp-agent][mcp-agent]               | ❌          | ❌        | ✅      | ⚠️         | ❌    | Supports tools, server connection management, and agent workflows. |
| [Roo Code][Roo Code]                 | ✅          | ❌        | ✅      | ❌         | ❌    | Supports tools and resources.                                      |
| [Sourcegraph Cody][Cody]             | ✅          | ❌        | ❌      | ❌         | ❌    | Supports resources through OpenCTX                                 |
| [Superinterface][Superinterface]     | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools                                                     |
| [TheiaAI/TheiaIDE][TheiaAI/TheiaIDE] | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools for Agents in Theia AI and the AI-powered Theia IDE |
| [Windsurf Editor][Windsurf]          | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools with AI Flow for collaborative development.         |
| [Zed][Zed]                           | ❌          | ✅        | ❌      | ❌         | ❌    | Prompts appear as slash commands                                   |
| \[OpenSumi]\[OpenSumi]               | ❌          | ❌        | ✅      | ❌         | ❌    | Supports tools in OpenSumi                                         |

[Claude]: https://claude.ai/download
[Cursor]: https://cursor.com
[Zed]: https://zed.dev
[Cody]: https://sourcegraph.com/cody
[Genkit]: https://github.com/firebase/genkit
[Continue]: https://github.com/continuedev/continue
[GenAIScript]: https://microsoft.github.io/genaiscript/reference/scripts/mcp-tools/
[Cline]: https://github.com/cline/cline
[LibreChat]: https://github.com/danny-avila/LibreChat
[TheiaAI/TheiaIDE]: https://eclipsesource.com/blogs/2024/12/19/theia-ide-and-theia-ai-support-mcp/
[Superinterface]: https://superinterface.ai
[5ire]: https://github.com/nanbingxyz/5ire
[BeeAI Framework]: https://i-am-bee.github.io/beeai-framework
[mcp-agent]: https://github.com/lastmile-ai/mcp-agent
[Mcp.el]: https://github.com/lizqwerscott/mcp.el
[Roo Code]: https://roocode.com
[Goose]: https://block.github.io/goose/docs/goose-architecture/#interoperability-with-extensions
[Windsurf]: https://codeium.com/windsurf
[Resources]: https://modelcontextprotocol.io/docs/concepts/resources
[Prompts]: https://modelcontextprotocol.io/docs/concepts/prompts
[Tools]: https://modelcontextprotocol.io/docs/concepts/tools
[Sampling]: https://modelcontextprotocol.io/docs/concepts/sampling

## Client Pages

| File | Client |
|------|--------|
| [mcp-agent.md](mcp-agent.md) | mcp-agent |

## Protocol Reference

| File | Topic |
|------|-------|
| [core-architecture.md](core-architecture.md) | MCP architecture, lifecycle, error handling |
| [concepts-prompts.md](concepts-prompts.md) | Prompts |
| [concepts-resources.md](concepts-resources.md) | Resources |
| [concepts-roots.md](concepts-roots.md) | Roots |
| [concepts-sampling.md](concepts-sampling.md) | Sampling |
| [concepts-tools.md](concepts-tools.md) | Tools |
| [concepts-transports.md](concepts-transports.md) | Transports |
| [debugging.md](debugging.md) | Debugging, Inspector, Example Servers |
| [introduction.md](introduction.md) | Introduction and overview |
| [quickstart-client.md](quickstart-client.md) | Building an MCP client |
| [quickstart-server.md](quickstart-server.md) | Building an MCP server |
| [quickstart-desktop.md](quickstart-desktop.md) | Claude Desktop user guide |
| [java-sdk.md](java-sdk.md) | Java SDK (client + server) + building with LLMs |

## Adding MCP support to your application

If you've added MCP support to your application, we encourage you to submit a pull request to add it to this list. MCP integration can provide your users with powerful contextual AI capabilities and make your application part of the growing MCP ecosystem.

Benefits of adding MCP support:

- Enable users to bring their own context and tools
- Join a growing ecosystem of interoperable AI applications
- Provide users with flexible integration options
- Support local-first AI workflows

To get started with implementing MCP in your application, check out our [Python](https://github.com/modelcontextprotocol/python-sdk) or [TypeScript SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)

## Updates and corrections

This list is maintained by the community. If you notice any inaccuracies or would like to update information about MCP support in your application, please submit a pull request or [open an issue in our documentation repository](https://github.com/modelcontextprotocol/docs/issues).

# Contributing

Source: <https://modelcontextprotocol.io/development/contributing>

How to participate in Model Context Protocol development

We welcome contributions from the community! Please review our [contributing guidelines](https://github.com/modelcontextprotocol/.github/blob/main/CONTRIBUTING.md) for details on how to submit changes.

All contributors must adhere to our [Code of Conduct](https://github.com/modelcontextprotocol/.github/blob/main/CODE_OF_CONDUCT.md).

For questions and discussions, please use [GitHub Discussions](https://github.com/orgs/modelcontextprotocol/discussions).

# Roadmap

Source: <https://modelcontextprotocol.io/development/roadmap>

Our plans for evolving Model Context Protocol (H1 2025)

The Model Context Protocol is rapidly evolving. This page outlines our current thinking on key priorities and future direction for **the first half of 2025**, though these may change significantly as the project develops.

<Note>The ideas presented here are not commitments—we may solve these challenges differently than described, or some may not materialize at all. This is also not an _exhaustive_ list; we may incorporate work that isn't mentioned here.</Note>

We encourage community participation! Each section links to relevant discussions where you can learn more and contribute your thoughts.

## Remote MCP Support

Our top priority is enabling [remote MCP connections](https://github.com/modelcontextprotocol/specification/discussions/102), allowing clients to securely connect to MCP servers over the internet. Key initiatives include:

- [**Authentication & Authorization**](https://github.com/modelcontextprotocol/specification/discussions/64): Adding standardized auth capabilities, particularly focused on OAuth 2.0 support.

- [**Service Discovery**](https://github.com/modelcontextprotocol/specification/discussions/69): Defining how clients can discover and connect to remote MCP servers.

- [**Stateless Operations**](https://github.com/modelcontextprotocol/specification/discussions/102): Thinking about whether MCP could encompass serverless environments too, where they will need to be mostly stateless.

## Reference Implementations

To help developers build with MCP, we want to offer documentation for:

- **Client Examples**: Comprehensive reference client implementation(s), demonstrating all protocol features
- **Protocol Drafting**: Streamlined process for proposing and incorporating new protocol features

## Distribution & Discovery

Looking ahead, we're exploring ways to make MCP servers more accessible. Some areas we may investigate include:

- **Package Management**: Standardized packaging format for MCP servers
- **Installation Tools**: Simplified server installation across MCP clients
- **Sandboxing**: Improved security through server isolation
- **Server Registry**: A common directory for discovering available MCP servers

## Agent Support

We're expanding MCP's capabilities for [complex agentic workflows](https://github.com/modelcontextprotocol/specification/discussions/111), particularly focusing on:

- [**Hierarchical Agent Systems**](https://github.com/modelcontextprotocol/specification/discussions/94): Improved support for trees of agents through namespacing and topology awareness.

- [**Interactive Workflows**](https://github.com/modelcontextprotocol/specification/issues/97): Better handling of user permissions and information requests across agent hierarchies, and ways to send output to users instead of models.

- [**Streaming Results**](https://github.com/modelcontextprotocol/specification/issues/117): Real-time updates from long-running agent operations.

## Broader Ecosystem

We're also invested in:

- **Community-Led Standards Development**: Fostering a collaborative ecosystem where all AI providers can help shape MCP as an open standard through equal participation and shared governance, ensuring it meets the needs of diverse AI applications and use cases.
- [**Additional Modalities**](https://github.com/modelcontextprotocol/specification/discussions/88): Expanding beyond text to support audio, video, and other formats.
- \[**Standardization**] Considering standardization through a standardization body.

## Get Involved

We welcome community participation in shaping MCP's future. Visit our [GitHub Discussions](https://github.com/orgs/modelcontextprotocol/discussions) to join the conversation and contribute your ideas.

# What's New

Source: <https://modelcontextprotocol.io/development/updates>

The latest updates and improvements to MCP

<Update label="2025-02-14" description="Java SDK released">
  * We're excited to announce that the Java SDK developed by Spring AI at VMware Tanzu is now
    the official [Java SDK](https://github.com/modelcontextprotocol/java-sdk) for MCP.
    This joins our existing Kotlin SDK in our growing list of supported languages.
    The Spring AI team will maintain the SDK as an integral part of the Model Context Protocol
    organization. We're thrilled to welcome them to the MCP community!
</Update>

<Update label="2025-01-27" description="Python SDK 1.2.1">
  * Version [1.2.1](https://github.com/modelcontextprotocol/python-sdk/releases/tag/v1.2.1) of the MCP Python SDK has been released,
    delivering important stability improvements and bug fixes.
</Update>

<Update label="2025-01-18" description="SDK and Server Improvements">
  * Simplified, express-like API in the [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
  * Added 8 new clients to the [clients page](https://modelcontextprotocol.io/clients)
</Update>

<Update label="2025-01-03" description="SDK and Server Improvements">
  * FastMCP API in the [Python SDK](https://github.com/modelcontextprotocol/python-sdk)
  * Dockerized MCP servers in the [servers repo](https://github.com/modelcontextprotocol/servers)
</Update>

<Update label="2024-12-21" description="Kotlin SDK released">
  * Jetbrains released a Kotlin SDK for MCP!
  * For a sample MCP Kotlin server, check out [this repository](https://github.com/modelcontextprotocol/kotlin-sdk/tree/main/samples/kotlin-mcp-server)
</Update>
