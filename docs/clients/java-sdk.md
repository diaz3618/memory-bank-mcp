# MCP Client

Source: <https://modelcontextprotocol.io/sdk/java/mcp-client>

Learn how to use the Model Context Protocol (MCP) client to interact with MCP servers

# Model Context Protocol Client

The MCP Client is a key component in the Model Context Protocol (MCP) architecture, responsible for establishing and managing connections with MCP servers. It implements the client-side of the protocol, handling:

- Protocol version negotiation to ensure compatibility with servers
- Capability negotiation to determine available features
- Message transport and JSON-RPC communication
- Tool discovery and execution
- Resource access and management
- Prompt system interactions
- Optional features like roots management and sampling support

The client provides both synchronous and asynchronous APIs for flexibility in different application contexts.

<Tabs>
  <Tab title="Sync API">
    ```java
    // Create a sync client with custom configuration
    McpSyncClient client = McpClient.sync(transport)
        .requestTimeout(Duration.ofSeconds(10))
        .capabilities(ClientCapabilities.builder()
            .roots(true)      // Enable roots capability
            .sampling()       // Enable sampling capability
            .build())
        .sampling(request -> new CreateMessageResult(response))
        .build();

    // Initialize connection
    client.initialize();

    // List available tools
    ListToolsResult tools = client.listTools();

    // Call a tool
    CallToolResult result = client.callTool(
        new CallToolRequest("calculator",
            Map.of("operation", "add", "a", 2, "b", 3))
    );

    // List and read resources
    ListResourcesResult resources = client.listResources();
    ReadResourceResult resource = client.readResource(
        new ReadResourceRequest("resource://uri")
    );

    // List and use prompts
    ListPromptsResult prompts = client.listPrompts();
    GetPromptResult prompt = client.getPrompt(
        new GetPromptRequest("greeting", Map.of("name", "Spring"))
    );

    // Add/remove roots
    client.addRoot(new Root("file:///path", "description"));
    client.removeRoot("file:///path");

    // Close client
    client.closeGracefully();
    ```

  </Tab>

  <Tab title="Async API">
    ```java
    // Create an async client with custom configuration
    McpAsyncClient client = McpClient.async(transport)
        .requestTimeout(Duration.ofSeconds(10))
        .capabilities(ClientCapabilities.builder()
            .roots(true)      // Enable roots capability
            .sampling()       // Enable sampling capability
            .build())
        .sampling(request -> Mono.just(new CreateMessageResult(response)))
        .toolsChangeConsumer(tools -> Mono.fromRunnable(() -> {
            logger.info("Tools updated: {}", tools);
        }))
        .resourcesChangeConsumer(resources -> Mono.fromRunnable(() -> {
            logger.info("Resources updated: {}", resources);
        }))
        .promptsChangeConsumer(prompts -> Mono.fromRunnable(() -> {
            logger.info("Prompts updated: {}", prompts);
        }))
        .build();

    // Initialize connection and use features
    client.initialize()
        .flatMap(initResult -> client.listTools())
        .flatMap(tools -> {
            return client.callTool(new CallToolRequest(
                "calculator",
                Map.of("operation", "add", "a", 2, "b", 3)
            ));
        })
        .flatMap(result -> {
            return client.listResources()
                .flatMap(resources ->
                    client.readResource(new ReadResourceRequest("resource://uri"))
                );
        })
        .flatMap(resource -> {
            return client.listPrompts()
                .flatMap(prompts ->
                    client.getPrompt(new GetPromptRequest(
                        "greeting",
                        Map.of("name", "Spring")
                    ))
                );
        })
        .flatMap(prompt -> {
            return client.addRoot(new Root("file:///path", "description"))
                .then(client.removeRoot("file:///path"));
        })
        .doFinally(signalType -> {
            client.closeGracefully().subscribe();
        })
        .subscribe();
    ```

  </Tab>
</Tabs>

## Client Transport

The transport layer handles the communication between MCP clients and servers, providing different implementations for various use cases. The client transport manages message serialization, connection establishment, and protocol-specific communication patterns.

<Tabs>
  <Tab title="STDIO">
    Creates transport for in-process based communication

    ```java
    ServerParameters params = ServerParameters.builder("npx")
        .args("-y", "@modelcontextprotocol/server-everything", "dir")
        .build();
    McpTransport transport = new StdioClientTransport(params);
    ```

  </Tab>

  <Tab title="SSE (HttpClient)">
    Creates a framework agnostic (pure Java API) SSE client transport. Included in the core mcp module.

    ```java
    McpTransport transport = new HttpClientSseClientTransport("http://your-mcp-server");
    ```

  </Tab>

  <Tab title="SSE (WebFlux)">
    Creates WebFlux-based SSE client transport. Requires the mcp-webflux-sse-transport dependency.

    ```java
    WebClient.Builder webClientBuilder = WebClient.builder()
        .baseUrl("http://your-mcp-server");
    McpTransport transport = new WebFluxSseClientTransport(webClientBuilder);
    ```

  </Tab>
</Tabs>

## Client Capabilities

The client can be configured with various capabilities:

```java
var capabilities = ClientCapabilities.builder()
    .roots(true)      // Enable filesystem roots support with list changes notifications
    .sampling()       // Enable LLM sampling support
    .build();
```

### Roots Support

Roots define the boundaries of where servers can operate within the filesystem:

```java
// Add a root dynamically
client.addRoot(new Root("file:///path", "description"));

// Remove a root
client.removeRoot("file:///path");

// Notify server of roots changes
client.rootsListChangedNotification();
```

The roots capability allows servers to:

- Request the list of accessible filesystem roots
- Receive notifications when the roots list changes
- Understand which directories and files they have access to

### Sampling Support

Sampling enables servers to request LLM interactions ("completions" or "generations") through the client:

```java
// Configure sampling handler
Function<CreateMessageRequest, CreateMessageResult> samplingHandler = request -> {
    // Sampling implementation that interfaces with LLM
    return new CreateMessageResult(response);
};

// Create client with sampling support
var client = McpClient.sync(transport)
    .capabilities(ClientCapabilities.builder()
        .sampling()
        .build())
    .sampling(samplingHandler)
    .build();
```

This capability allows:

- Servers to leverage AI capabilities without requiring API keys
- Clients to maintain control over model access and permissions
- Support for both text and image-based interactions
- Optional inclusion of MCP server context in prompts

## Using MCP Clients

### Tool Execution

Tools are server-side functions that clients can discover and execute. The MCP client provides methods to list available tools and execute them with specific parameters. Each tool has a unique name and accepts a map of parameters.

<Tabs>
  <Tab title="Sync API">
    ```java
    // List available tools and their names
    var tools = client.listTools();
    tools.forEach(tool -> System.out.println(tool.getName()));

    // Execute a tool with parameters
    var result = client.callTool("calculator", Map.of(
        "operation", "add",
        "a", 1,
        "b", 2
    ));
    ```

  </Tab>

  <Tab title="Async API">
    ```java
    // List available tools asynchronously
    client.listTools()
        .doOnNext(tools -> tools.forEach(tool ->
            System.out.println(tool.getName())))
        .subscribe();

    // Execute a tool asynchronously
    client.callTool("calculator", Map.of(
            "operation", "add",
            "a", 1,
            "b", 2
        ))
        .subscribe();
    ```

  </Tab>
</Tabs>

### Resource Access

Resources represent server-side data sources that clients can access using URI templates. The MCP client provides methods to discover available resources and retrieve their contents through a standardized interface.

<Tabs>
  <Tab title="Sync API">
    ```java
    // List available resources and their names
    var resources = client.listResources();
    resources.forEach(resource -> System.out.println(resource.getName()));

    // Retrieve resource content using a URI template
    var content = client.getResource("file", Map.of(
        "path", "/path/to/file.txt"
    ));
    ```

  </Tab>

  <Tab title="Async API">
    ```java
    // List available resources asynchronously
    client.listResources()
        .doOnNext(resources -> resources.forEach(resource ->
            System.out.println(resource.getName())))
        .subscribe();

    // Retrieve resource content asynchronously
    client.getResource("file", Map.of(
            "path", "/path/to/file.txt"
        ))
        .subscribe();
    ```

  </Tab>
</Tabs>

### Prompt System

The prompt system enables interaction with server-side prompt templates. These templates can be discovered and executed with custom parameters, allowing for dynamic text generation based on predefined patterns.

<Tabs>
  <Tab title="Sync API">
    ```java
    // List available prompt templates
    var prompts = client.listPrompts();
    prompts.forEach(prompt -> System.out.println(prompt.getName()));

    // Execute a prompt template with parameters
    var response = client.executePrompt("echo", Map.of(
        "text", "Hello, World!"
    ));
    ```

  </Tab>

  <Tab title="Async API">
    ```java
    // List available prompt templates asynchronously
    client.listPrompts()
        .doOnNext(prompts -> prompts.forEach(prompt ->
            System.out.println(prompt.getName())))
        .subscribe();

    // Execute a prompt template asynchronously
    client.executePrompt("echo", Map.of(
            "text", "Hello, World!"
        ))
        .subscribe();
    ```

  </Tab>
</Tabs>

# Overview

Source: <https://modelcontextprotocol.io/sdk/java/mcp-overview>

Introduction to the Model Context Protocol (MCP) Java SDK

Java SDK for the [Model Context Protocol](https://modelcontextprotocol.org/docs/concepts/architecture)
enables standardized integration between AI models and tools.

## Features

- MCP Client and MCP Server implementations supporting:
  - Protocol [version compatibility negotiation](https://spec.modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle/#initialization)
  - [Tool](https://spec.modelcontextprotocol.io/specification/2024-11-05/server/tools/) discovery, execution, list change notifications
  - [Resource](https://spec.modelcontextprotocol.io/specification/2024-11-05/server/resources/) management with URI templates
  - [Roots](https://spec.modelcontextprotocol.io/specification/2024-11-05/client/roots/) list management and notifications
  - [Prompt](https://spec.modelcontextprotocol.io/specification/2024-11-05/server/prompts/) handling and management
  - [Sampling](https://spec.modelcontextprotocol.io/specification/2024-11-05/client/sampling/) support for AI model interactions
- Multiple transport implementations:
  - Default transports:
    - Stdio-based transport for process-based communication
    - Java HttpClient-based SSE client transport for HTTP SSE Client-side streaming
    - Servlet-based SSE server transport for HTTP SSE Server streaming
  - Spring-based transports:
    - WebFlux SSE client and server transports for reactive HTTP streaming
    - WebMVC SSE transport for servlet-based HTTP streaming
- Supports Synchronous and Asynchronous programming paradigms

## Architecture

The SDK follows a layered architecture with clear separation of concerns:

![MCP Stack Architecture](https://mintlify.s3.us-west-1.amazonaws.com/mcp/images/java/mcp-stack.svg)

- **Client/Server Layer (McpClient/McpServer)**: Both use McpSession for sync/async operations,
  with McpClient handling client-side protocol operations and McpServer managing server-side protocol operations.
- **Session Layer (McpSession)**: Manages communication patterns and state using DefaultMcpSession implementation.
- **Transport Layer (McpTransport)**: Handles JSON-RPC message serialization/deserialization via:
  - StdioTransport (stdin/stdout) in the core module
  - HTTP SSE transports in dedicated transport modules (Java HttpClient, Spring WebFlux, Spring WebMVC)

The MCP Client is a key component in the Model Context Protocol (MCP) architecture, responsible for establishing and managing connections with MCP servers.
It implements the client-side of the protocol.

![Java MCP Client Architecture](https://mintlify.s3.us-west-1.amazonaws.com/mcp/images/java/java-mcp-client-architecture.jpg)

The MCP Server is a foundational component in the Model Context Protocol (MCP) architecture that provides tools, resources, and capabilities to clients.
It implements the server-side of the protocol.

![Java MCP Server Architecture](https://mintlify.s3.us-west-1.amazonaws.com/mcp/images/java/java-mcp-server-architecture.jpg)

Key Interactions:

- **Client/Server Initialization**: Transport setup, protocol compatibility check, capability negotiation, and implementation details exchange.
- **Message Flow**: JSON-RPC message handling with validation, type-safe response processing, and error handling.
- **Resource Management**: Resource discovery, URI template-based access, subscription system, and content retrieval.

## Dependencies

Add the following Maven dependency to your project:

<Tabs>
  <Tab title="Maven">
    The core MCP functionality:

    ```xml
    <dependency>
        <groupId>io.modelcontextprotocol.sdk</groupId>
        <artifactId>mcp</artifactId>
    </dependency>
    ```

    For HTTP SSE transport implementations, add one of the following dependencies:

    ```xml
    <!-- Spring WebFlux-based SSE client and server transport -->
    <dependency>
        <groupId>io.modelcontextprotocol.sdk</groupId>
        <artifactId>mcp-spring-webflux</artifactId>
    </dependency>

    <!-- Spring WebMVC-based SSE server transport -->
    <dependency>
        <groupId>io.modelcontextprotocol.sdk</groupId>
        <artifactId>mcp-spring-webmvc</artifactId>
    </dependency>
    ```

  </Tab>

  <Tab title="Gradle">
    The core MCP functionality:

    ```groovy
    dependencies {
      implementation platform("io.modelcontextprotocol.sdk:mcp")
      //...
    }
    ```

    For HTTP SSE transport implementations, add one of the following dependencies:

    ```groovy
    // Spring WebFlux-based SSE client and server transport
    dependencies {
      implementation platform("io.modelcontextprotocol.sdk:mcp-spring-webflux")
    }

    // Spring WebMVC-based SSE server transport
    dependencies {
      implementation platform("io.modelcontextprotocol.sdk:mcp-spring-webmvc")
    }
    ```

  </Tab>
</Tabs>

### Bill of Materials (BOM)

The Bill of Materials (BOM) declares the recommended versions of all the dependencies used by a given release.
Using the BOM from your application's build script avoids the need for you to specify and maintain the dependency versions yourself.
Instead, the version of the BOM you're using determines the utilized dependency versions.
It also ensures that you're using supported and tested versions of the dependencies by default, unless you choose to override them.

Add the BOM to your project:

<Tabs>
  <Tab title="Maven">
    ```xml
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>io.modelcontextprotocol.sdk</groupId>
                <artifactId>mcp-bom</artifactId>
                <version>0.7.0</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
    ```
  </Tab>

  <Tab title="Gradle">
    ```groovy
    dependencies {
      implementation platform("io.modelcontextprotocol.sdk:mcp-bom:0.7.0")
      //...
    }
    ```

    Gradle users can also use the Spring AI MCP BOM by leveraging Gradle (5.0+) native support for declaring dependency constraints using a Maven BOM.
    This is implemented by adding a 'platform' dependency handler method to the dependencies section of your Gradle build script.
    As shown in the snippet above this can then be followed by version-less declarations of the Starter Dependencies for the one or more spring-ai modules you wish to use, e.g. spring-ai-openai.

  </Tab>
</Tabs>

Replace the version number with the version of the BOM you want to use.

### Available Dependencies

The following dependencies are available and managed by the BOM:

- Core Dependencies
  - `io.modelcontextprotocol.sdk:mcp` - Core MCP library providing the base functionality and APIs for Model Context Protocol implementation.
- Transport Dependencies
  - `io.modelcontextprotocol.sdk:mcp-spring-webflux` - WebFlux-based Server-Sent Events (SSE) transport implementation for reactive applications.
  - `io.modelcontextprotocol.sdk:mcp-spring-webmvc` - WebMVC-based Server-Sent Events (SSE) transport implementation for servlet-based applications.
- Testing Dependencies
  - `io.modelcontextprotocol.sdk:mcp-test` - Testing utilities and support for MCP-based applications.

# MCP Server

Source: <https://modelcontextprotocol.io/sdk/java/mcp-server>

Learn how to implement and configure a Model Context Protocol (MCP) server

## Overview

The MCP Server is a foundational component in the Model Context Protocol (MCP) architecture that provides tools, resources, and capabilities to clients. It implements the server-side of the protocol, responsible for:

- Exposing tools that clients can discover and execute
- Managing resources with URI-based access patterns
- Providing prompt templates and handling prompt requests
- Supporting capability negotiation with clients
- Implementing server-side protocol operations
- Managing concurrent client connections
- Providing structured logging and notifications

The server supports both synchronous and asynchronous APIs, allowing for flexible integration in different application contexts.

<Tabs>
  <Tab title="Sync API">
    ```java
    // Create a server with custom configuration
    McpSyncServer syncServer = McpServer.sync(transport)
        .serverInfo("my-server", "1.0.0")
        .capabilities(ServerCapabilities.builder()
            .resources(true)     // Enable resource support
            .tools(true)         // Enable tool support
            .prompts(true)       // Enable prompt support
            .logging()           // Enable logging support
            .build())
        .build();

    // Register tools, resources, and prompts
    syncServer.addTool(syncToolRegistration);
    syncServer.addResource(syncResourceRegistration);
    syncServer.addPrompt(syncPromptRegistration);

    // Send logging notifications
    syncServer.loggingNotification(LoggingMessageNotification.builder()
        .level(LoggingLevel.INFO)
        .logger("custom-logger")
        .data("Server initialized")
        .build());

    // Close the server when done
    syncServer.close();
    ```

  </Tab>

  <Tab title="Async API">
    ```java
    // Create an async server with custom configuration
    McpAsyncServer asyncServer = McpServer.async(transport)
        .serverInfo("my-server", "1.0.0")
        .capabilities(ServerCapabilities.builder()
            .resources(true)     // Enable resource support
            .tools(true)         // Enable tool support
            .prompts(true)       // Enable prompt support
            .logging()           // Enable logging support
            .build())
        .build();

    // Register tools, resources, and prompts
    asyncServer.addTool(asyncToolRegistration)
        .doOnSuccess(v -> logger.info("Tool registered"))
        .subscribe();

    asyncServer.addResource(asyncResourceRegistration)
        .doOnSuccess(v -> logger.info("Resource registered"))
        .subscribe();

    asyncServer.addPrompt(asyncPromptRegistration)
        .doOnSuccess(v -> logger.info("Prompt registered"))
        .subscribe();

    // Send logging notifications
    asyncServer.loggingNotification(LoggingMessageNotification.builder()
        .level(LoggingLevel.INFO)
        .logger("custom-logger")
        .data("Server initialized")
        .build());

    // Close the server when done
    asyncServer.close()
        .doOnSuccess(v -> logger.info("Server closed"))
        .subscribe();
    ```

  </Tab>
</Tabs>

## Server Transport

The transport layer in the MCP SDK is responsible for handling the communication between clients and servers. It provides different implementations to support various communication protocols and patterns. The SDK includes several built-in transport implementations:

<Tabs>
  <Tab title="STDIO">
    <>
      Create in-process based transport:

      ```java
      StdioServerTransport transport = new StdioServerTransport(new ObjectMapper());
      ```

      Provides bidirectional JSON-RPC message handling over standard input/output streams with non-blocking message processing, serialization/deserialization, and graceful shutdown support.

      Key features:

      <ul>
        <li>Bidirectional communication through stdin/stdout</li>
        <li>Process-based integration support</li>
        <li>Simple setup and configuration</li>
        <li>Lightweight implementation</li>
      </ul>
    </>

  </Tab>

  <Tab title="SSE (WebFlux)">
    <>
      <p>Creates WebFlux-based SSE server transport.<br />Requires the <code>mcp-spring-webflux</code> dependency.</p>

      ```java
      @Configuration
      class McpConfig {
          @Bean
          WebFluxSseServerTransport webFluxSseServerTransport(ObjectMapper mapper) {
              return new WebFluxSseServerTransport(mapper, "/mcp/message");
          }

          @Bean
          RouterFunction<?> mcpRouterFunction(WebFluxSseServerTransport transport) {
              return transport.getRouterFunction();
          }
      }
      ```

      <p>Implements the MCP HTTP with SSE transport specification, providing:</p>

      <ul>
        <li>Reactive HTTP streaming with WebFlux</li>
        <li>Concurrent client connections through SSE endpoints</li>
        <li>Message routing and session management</li>
        <li>Graceful shutdown capabilities</li>
      </ul>
    </>

  </Tab>

  <Tab title="SSE (WebMvc)">
    <>
      <p>Creates WebMvc-based SSE server transport.<br />Requires the <code>mcp-spring-webmvc</code> dependency.</p>

      ```java
      @Configuration
      @EnableWebMvc
      class McpConfig {
          @Bean
          WebMvcSseServerTransport webMvcSseServerTransport(ObjectMapper mapper) {
              return new WebMvcSseServerTransport(mapper, "/mcp/message");
          }

          @Bean
          RouterFunction<ServerResponse> mcpRouterFunction(WebMvcSseServerTransport transport) {
              return transport.getRouterFunction();
          }
      }
      ```

      <p>Implements the MCP HTTP with SSE transport specification, providing:</p>

      <ul>
        <li>Server-side event streaming</li>
        <li>Integration with Spring WebMVC</li>
        <li>Support for traditional web applications</li>
        <li>Synchronous operation handling</li>
      </ul>
    </>

  </Tab>

  <Tab title="SSE (Servlet)">
    <>
      <p>
        Creates a Servlet-based SSE server transport. It is included in the core <code>mcp</code> module.<br />
        The <code>HttpServletSseServerTransport</code> can be used with any Servlet container.<br />
        To use it with a Spring Web application, you can register it as a Servlet bean:
      </p>

      ```java
      @Configuration
      @EnableWebMvc
      public class McpServerConfig implements WebMvcConfigurer {

          @Bean
          public HttpServletSseServerTransport servletSseServerTransport() {
              return new HttpServletSseServerTransport(new ObjectMapper(), "/mcp/message");
          }

          @Bean
          public ServletRegistrationBean customServletBean(HttpServletSseServerTransport servlet) {
              return new ServletRegistrationBean(servlet);
          }
      }
      ```

      <p>
        Implements the MCP HTTP with SSE transport specification using the traditional Servlet API, providing:
      </p>

      <ul>
        <li>Asynchronous message handling using Servlet 6.0 async support</li>
        <li>Session management for multiple client connections</li>

        <li>
          Two types of endpoints:

          <ul>
            <li>SSE endpoint (<code>/sse</code>) for server-to-client events</li>
            <li>Message endpoint (configurable) for client-to-server requests</li>
          </ul>
        </li>

        <li>Error handling and response formatting</li>
        <li>Graceful shutdown support</li>
      </ul>
    </>

  </Tab>
</Tabs>

## Server Capabilities

The server can be configured with various capabilities:

```java
var capabilities = ServerCapabilities.builder()
    .resources(false, true)  // Resource support with list changes notifications
    .tools(true)            // Tool support with list changes notifications
    .prompts(true)          // Prompt support with list changes notifications
    .logging()              // Enable logging support (enabled by default with loging level INFO)
    .build();
```

### Logging Support

The server provides structured logging capabilities that allow sending log messages to clients with different severity levels:

```java
// Send a log message to clients
server.loggingNotification(LoggingMessageNotification.builder()
    .level(LoggingLevel.INFO)
    .logger("custom-logger")
    .data("Custom log message")
    .build());
```

Clients can control the minimum logging level they receive through the `mcpClient.setLoggingLevel(level)` request. Messages below the set level will be filtered out.
Supported logging levels (in order of increasing severity): DEBUG (0), INFO (1), NOTICE (2), WARNING (3), ERROR (4), CRITICAL (5), ALERT (6), EMERGENCY (7)

### Tool Registration

<Tabs>
  <Tab title="Sync">
    ```java
    // Sync tool registration
    var syncToolRegistration = new McpServerFeatures.SyncToolRegistration(
        new Tool("calculator", "Basic calculator", Map.of(
            "operation", "string",
            "a", "number",
            "b", "number"
        )),
        arguments -> {
            // Tool implementation
            return new CallToolResult(result, false);
        }
    );
    ```
  </Tab>

  <Tab title="Async">
    ```java
    // Async tool registration
    var asyncToolRegistration = new McpServerFeatures.AsyncToolRegistration(
        new Tool("calculator", "Basic calculator", Map.of(
            "operation", "string",
            "a", "number",
            "b", "number"
        )),
        arguments -> {
            // Tool implementation
            return Mono.just(new CallToolResult(result, false));
        }
    );
    ```
  </Tab>
</Tabs>

### Resource Registration

<Tabs>
  <Tab title="Sync">
    ```java
    // Sync resource registration
    var syncResourceRegistration = new McpServerFeatures.SyncResourceRegistration(
        new Resource("custom://resource", "name", "description", "mime-type", null),
        request -> {
            // Resource read implementation
            return new ReadResourceResult(contents);
        }
    );
    ```
  </Tab>

  <Tab title="Async">
    ```java
    // Async resource registration
    var asyncResourceRegistration = new McpServerFeatures.AsyncResourceRegistration(
        new Resource("custom://resource", "name", "description", "mime-type", null),
        request -> {
            // Resource read implementation
            return Mono.just(new ReadResourceResult(contents));
        }
    );
    ```
  </Tab>
</Tabs>

### Prompt Registration

<Tabs>
  <Tab title="Sync">
    ```java
    // Sync prompt registration
    var syncPromptRegistration = new McpServerFeatures.SyncPromptRegistration(
        new Prompt("greeting", "description", List.of(
            new PromptArgument("name", "description", true)
        )),
        request -> {
            // Prompt implementation
            return new GetPromptResult(description, messages);
        }
    );
    ```
  </Tab>

  <Tab title="Async">
    ```java
    // Async prompt registration
    var asyncPromptRegistration = new McpServerFeatures.AsyncPromptRegistration(
        new Prompt("greeting", "description", List.of(
            new PromptArgument("name", "description", true)
        )),
        request -> {
            // Prompt implementation
            return Mono.just(new GetPromptResult(description, messages));
        }
    );
    ```
  </Tab>
</Tabs>

## Error Handling

The SDK provides comprehensive error handling through the McpError class, covering protocol compatibility, transport communication, JSON-RPC messaging, tool execution, resource management, prompt handling, timeouts, and connection issues. This unified error handling approach ensures consistent and reliable error management across both synchronous and asynchronous operations.

# Building MCP with LLMs

Source: <https://modelcontextprotocol.io/tutorials/building-mcp-with-llms>

Speed up your MCP development using LLMs such as Claude!

This guide will help you use LLMs to help you build custom Model Context Protocol (MCP) servers and clients. We'll be focusing on Claude for this tutorial, but you can do this with any frontier LLM.

## Preparing the documentation

Before starting, gather the necessary documentation to help Claude understand MCP:

1. Visit [https://modelcontextprotocol.io/llms-full.txt](https://modelcontextprotocol.io/llms-full.txt) and copy the full documentation text
2. Navigate to either the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) or [Python SDK repository](https://github.com/modelcontextprotocol/python-sdk)
3. Copy the README files and other relevant documentation
4. Paste these documents into your conversation with Claude

## Describing your server

Once you've provided the documentation, clearly describe to Claude what kind of server you want to build. Be specific about:

- What resources your server will expose
- What tools it will provide
- Any prompts it should offer
- What external systems it needs to interact with

For example:

```
Build an MCP server that:
- Connects to my company's PostgreSQL database
- Exposes table schemas as resources
- Provides tools for running read-only SQL queries
- Includes prompts for common data analysis tasks
```

## Working with Claude

When working with Claude on MCP servers:

1. Start with the core functionality first, then iterate to add more features
2. Ask Claude to explain any parts of the code you don't understand
3. Request modifications or improvements as needed
4. Have Claude help you test the server and handle edge cases

Claude can help implement all the key MCP features:

- Resource management and exposure
- Tool definitions and implementations
- Prompt templates and handlers
- Error handling and logging
- Connection and transport setup

## Best practices

When building MCP servers with Claude:

- Break down complex servers into smaller pieces
- Test each component thoroughly before moving on
- Keep security in mind - validate inputs and limit access appropriately
- Document your code well for future maintenance
- Follow MCP protocol specifications carefully

## Next steps

After Claude helps you build your server:

1. Review the generated code carefully
2. Test the server with the MCP Inspector tool
3. Connect it to Claude.app or other MCP clients
4. Iterate based on real usage and feedback

Remember that Claude can help you modify and improve your server as requirements change over time.

Need more guidance? Just ask Claude specific questions about implementing MCP features or troubleshooting issues that arise.

---

*Source: [modelcontextprotocol.io](https://modelcontextprotocol.io) — Part of the [MCP Clients Reference](README.md)*
