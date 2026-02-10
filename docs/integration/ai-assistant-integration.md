# AI Assistant Integration with Memory Bank MCP

## Overview

This document describes how to integrate Memory Bank MCP with AI assistants that support the Model Context Protocol (MCP). Memory Bank MCP provides tools and resources for AI assistants to maintain context and memory across sessions, enhancing their ability to assist with long-term projects.

## Supported AI Assistants

Memory Bank MCP can be integrated with any AI assistant that supports the Model Context Protocol, including:

- Claude (via Anthropic's MCP implementation)
- GPT models (via OpenAI's MCP implementation)
- Custom AI assistants built on MCP-compatible frameworks

## Integration Methods

### 1. Direct API Integration

The most straightforward way to integrate Memory Bank MCP with an AI assistant is through direct API calls.

#### Example: Basic Integration

```javascript
// Import required libraries
const { MemoryBankClient } = require('memory-bank-mcp');
const { AIAssistantClient } = require('ai-assistant-sdk');

// Initialize Memory Bank client
const memoryBank = new MemoryBankClient({
  serverUrl: 'http://localhost:3000',
  projectId: 'my-project'
});

// Initialize AI assistant client
const assistant = new AIAssistantClient({
  apiKey: 'your-api-key',
  model: 'your-preferred-model'
});

// Function to process user messages with Memory Bank context
async function processUserMessage(message) {
  // Get relevant context from Memory Bank
  const context = await memoryBank.getActiveContext();
  
  // Prepare system message with context
  const systemMessage = `You are an AI assistant with access to the project's Memory Bank.
Current project context:
${context}
Please help the user with their request while considering this context.`;
  
  // Send message to AI assistant with context
  const response = await assistant.sendMessage({
    systemMessage: systemMessage,
    userMessage: message
  });
  
  // Update Memory Bank with new information if needed
  if (response.shouldUpdateMemoryBank) {
    await memoryBank.trackProgress({
      action: response.action,
      description: response.description
    });
  }
  
  return response.content;
}
```

### 2. MCP Protocol Integration

For deeper integration, you can use the MCP protocol directly, allowing the AI assistant to access Memory Bank tools and resources.

#### Example: MCP Protocol Integration

```javascript
// Import required libraries
const { MCPServer } = require('@modelcontextprotocol/server');
const { MemoryBankMCPPlugin } = require('memory-bank-mcp');

// Initialize MCP server
const mcpServer = new MCPServer({
  port: 3000
});

// Register Memory Bank plugin
mcpServer.registerPlugin(new MemoryBankMCPPlugin({
  memoryBankPath: '/path/to/memory-bank'
}));

// Start MCP server
mcpServer.start().then(() => {
  console.log('MCP server with Memory Bank integration started on port 3000');
});
```

### 3. Web Interface Integration

For applications with a web interface, you can integrate Memory Bank MCP through a web client.

#### Example: Web Client Integration

```html
<!DOCTYPE html>
<html>
<head>
  <title>AI Assistant with Memory Bank</title>
  <script src="https://cdn.jsdelivr.net/npm/memory-bank-mcp-client/dist/memory-bank-client.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/ai-assistant-client/dist/ai-assistant-client.min.js"></script>
</head>
<body>
  <div id="chat-container">
    <div id="chat-messages"></div>
    <div id="input-container">
      <select id="mode-selector">
        <option value="architect">Architect</option>
        <option value="code">Code</option>
        <option value="ask">Ask</option>
        <option value="debug">Debug</option>
        <option value="test">Test</option>
      </select>
      <input type="text" id="user-input" placeholder="Type your message...">
      <button id="send-button">Send</button>
    </div>
  </div>

  <script>
    // Initialize Memory Bank client
    const memoryBank = new MemoryBankClient({
      serverUrl: 'http://localhost:3000',
      projectId: 'my-project'
    });

    // Initialize AI assistant client
    const assistant = new AIAssistantClient({
      apiKey: 'your-api-key',
      model: 'your-preferred-model'
    });

    // Handle message sending
    document.getElementById('send-button').addEventListener('click', async () => {
      const userInput = document.getElementById('user-input').value;
      const selectedMode = document.getElementById('mode-selector').value;
      
      // Display user message
      addMessageToChat('user', userInput);
      
      // Clear input field
      document.getElementById('user-input').value = '';
      
      // Get context from Memory Bank
      const context = await memoryBank.getActiveContext();
      
      // Send message to AI assistant with context and mode
      const response = await assistant.sendMessage({
        systemMessage: `You are an AI assistant in ${selectedMode} mode with access to the project's Memory Bank.
Current project context:
${context}
Please help the user with their request while considering this context.`,
        userMessage: userInput,
        mode: selectedMode
      });
      
      // Display assistant response
      addMessageToChat('assistant', response.content);
      
      // Update Memory Bank if needed
      if (response.shouldUpdateMemoryBank) {
        await memoryBank.trackProgress({
          action: response.action,
          description: response.description
        });
      }
    });
    
    // Function to add messages to the chat UI
    function addMessageToChat(role, content) {
      const messagesContainer = document.getElementById('chat-messages');
      const messageElement = document.createElement('div');
      messageElement.className = `message ${role}`;
      messageElement.textContent = content;
      messagesContainer.appendChild(messageElement);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  </script>
</body>
</html>
```

## Testing Integration

To test the integration between Memory Bank MCP and an AI assistant, follow these steps:

### 1. Start Memory Bank MCP Server

```bash
# Start Memory Bank MCP server
npx memory-bank-mcp-server --port 3000 --memory-bank-path /path/to/memory-bank
```

### 2. Test Basic Functionality

```bash
# Test retrieving active context
curl -X GET http://localhost:3000/memory-bank/activeContext

# Test tracking progress
curl -X POST http://localhost:3000/memory-bank/trackProgress \
  -H "Content-Type: application/json" \
  -d '{
    "action": "Test Integration",
    "description": "Testing integration between Memory Bank MCP and AI assistant"
  }'
```

### 3. Test AI Assistant Integration

```bash
# Test AI assistant with Memory Bank integration
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "You are an AI assistant with access to the project Memory Bank."
      },
      {
        "role": "user",
        "content": "What is the current status of our project?"
      }
    ],
    "mode": "ask",
    "useMemoryBank": true
  }'
```

## Mode-Specific Integration

Memory Bank MCP supports different modes for different tasks. Here's how to integrate each mode with an AI assistant:

### Architect Mode

```javascript
// Example: Integrating Architect mode
async function architectMode(userMessage) {
  const systemPatterns = await memoryBank.readFile('systemPatterns.md');
  const activeContext = await memoryBank.readFile('activeContext.md');
  
  const systemMessage = `You are in Architect mode. Your task is to help with high-level system design and project organization.
Current system patterns:
${systemPatterns}
Current project context:
${activeContext}
Please provide architectural guidance based on this context.`;
  
  return assistant.sendMessage({
    systemMessage: systemMessage,
    userMessage: userMessage,
    mode: 'architect'
  });
}
```

### Code Mode

```javascript
// Example: Integrating Code mode
async function codeMode(userMessage) {
  const systemPatterns = await memoryBank.readFile('systemPatterns.md');
  const activeContext = await memoryBank.readFile('activeContext.md');
  
  const systemMessage = `You are in Code mode. Your task is to help with implementation and development.
Current system patterns:
${systemPatterns}
Current project context:
${activeContext}
Please provide coding assistance based on this context.`;
  
  return assistant.sendMessage({
    systemMessage: systemMessage,
    userMessage: userMessage,
    mode: 'code'
  });
}
```

### Ask Mode

```javascript
// Example: Integrating Ask mode
async function askMode(userMessage) {
  const productContext = await memoryBank.readFile('productContext.md');
  const activeContext = await memoryBank.readFile('activeContext.md');
  
  const systemMessage = `You are in Ask mode. Your task is to provide information and explanations.
Product context:
${productContext}
Current project context:
${activeContext}
Please provide information based on this context.`;
  
  return assistant.sendMessage({
    systemMessage: systemMessage,
    userMessage: userMessage,
    mode: 'ask'
  });
}
```

### Debug Mode

```javascript
// Example: Integrating Debug mode
async function debugMode(userMessage) {
  const activeContext = await memoryBank.readFile('activeContext.md');
  const systemPatterns = await memoryBank.readFile('systemPatterns.md');
  
  const systemMessage = `You are in Debug mode. Your task is to help identify and resolve issues.
Current project context:
${activeContext}
System patterns:
${systemPatterns}
Please provide debugging assistance based on this context.`;
  
  return assistant.sendMessage({
    systemMessage: systemMessage,
    userMessage: userMessage,
    mode: 'debug'
  });
}
```

### Test Mode

```javascript
// Example: Integrating Test mode
async function testMode(userMessage) {
  const activeContext = await memoryBank.readFile('activeContext.md');
  const systemPatterns = await memoryBank.readFile('systemPatterns.md');
  
  const systemMessage = `You are in Test mode. Your task is to help with testing and quality assurance.
Current project context:
${activeContext}
System patterns:
${systemPatterns}
Please provide testing assistance based on this context.`;
  
  return assistant.sendMessage({
    systemMessage: systemMessage,
    userMessage: userMessage,
    mode: 'test'
  });
}
```

## Advanced Integration Features

### 1. Automatic Mode Detection

```javascript
// Example: Automatic mode detection based on user message
async function detectMode(userMessage) {
  // Get available modes and their triggers
  const modes = await memoryBank.getAvailableModes();
  
  // Check each mode's triggers against the user message
  for (const mode of modes) {
    const triggers = await memoryBank.getModeTriggers(mode);
    
    for (const trigger of triggers) {
      if (userMessage.toLowerCase().includes(trigger.condition.toLowerCase())) {
        return mode;
      }
    }
  }
  
  // Default to 'ask' mode if no triggers match
  return 'ask';
}
```

### 2. Memory Bank Updates

```javascript
// Example: Updating Memory Bank based on conversation
async function updateMemoryBank(conversation, mode) {
  // Extract key information from conversation
  const keyInfo = extractKeyInformation(conversation);
  
  // Update appropriate Memory Bank files based on mode
  switch (mode) {
    case 'architect':
      if (keyInfo.architecturalDecision) {
        await memoryBank.logDecision({
          title: keyInfo.title,
          context: keyInfo.context,
          decision: keyInfo.decision,
          alternatives: keyInfo.alternatives,
          consequences: keyInfo.consequences
        });
      }
      break;
      
    case 'code':
      if (keyInfo.implementation) {
        await memoryBank.trackProgress({
          action: 'Implementation',
          description: keyInfo.implementation
        });
      }
      break;
      
    // Handle other modes...
  }
  
  // Update active context
  await memoryBank.updateActiveContext({
    tasks: keyInfo.tasks,
    issues: keyInfo.issues,
    nextSteps: keyInfo.nextSteps
  });
}
```

### 3. File Access Control

```javascript
// Example: Controlling file access based on mode
function getAccessibleFiles(mode) {
  const commonFiles = ['activeContext.md', 'productContext.md'];
  
  switch (mode) {
    case 'architect':
      return [...commonFiles, 'systemPatterns.md', 'decisionLog.md'];
      
    case 'code':
      return [...commonFiles, 'progress.md', 'systemPatterns.md'];
      
    case 'ask':
      return [...commonFiles, 'progress.md', 'decisionLog.md', 'systemPatterns.md'];
      
    case 'debug':
      return [...commonFiles, 'progress.md', 'decisionLog.md'];
      
    case 'test':
      return [...commonFiles, 'progress.md', 'systemPatterns.md'];
      
    default:
      return commonFiles;
  }
}
```

## Troubleshooting

### Common Issues and Solutions

1. **Connection Issues**
   - Ensure Memory Bank MCP server is running
   - Check server URL and port configuration
   - Verify network connectivity

2. **Authentication Issues**
   - Check API keys and authentication tokens
   - Verify permissions for Memory Bank access

3. **Mode Switching Issues**
   - Ensure rule files for all modes are properly configured
   - Check for syntax errors in rule files
   - Verify mode triggers are correctly defined

4. **Context Loading Issues**
   - Check if Memory Bank files exist and are accessible
   - Verify file paths and permissions
   - Check for file format or encoding issues

## Best Practices

1. **Context Management**
   - Keep context concise and relevant
   - Prioritize recent and important information
   - Regularly clean up outdated context

2. **Mode Selection**
   - Use the most appropriate mode for each task
   - Allow users to explicitly select modes when needed
   - Implement automatic mode detection as a fallback

3. **Memory Updates**
   - Update Memory Bank files after significant interactions
   - Avoid excessive updates for minor changes
   - Maintain consistent formatting in Memory Bank files

4. **Error Handling**
   - Implement robust error handling for all API calls
   - Provide clear error messages to users
   - Gracefully degrade functionality when Memory Bank is unavailable

---

*Memory Bank MCP - Enhancing AI assistants with persistent context and memory*