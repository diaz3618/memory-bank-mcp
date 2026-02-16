# Memory Bank MCP Integration Testing Guide

## Overview

This guide provides step-by-step instructions for testing the integration between Memory Bank MCP and AI assistants that support the Model Context Protocol (MCP). These tests will help verify that the Memory Bank MCP server is functioning correctly and that AI assistants can effectively access and update the Memory Bank.

## Prerequisites

Before beginning integration testing, ensure you have the following:

1. Memory Bank MCP server installed and configured
2. Access to an AI assistant that supports MCP
3. Basic understanding of API calls and JSON
4. cURL or another API testing tool (like Postman)
5. Node.js and npm (for running test scripts)

## Test Environment Setup

### 1. Create a Test Memory Bank

```bash
# Create a directory for the test Memory Bank
mkdir -p test-memory-bank

# Initialize the Memory Bank
npx memory-bank-mcp-server initialize --path ./test-memory-bank
```

### 2. Start the Memory Bank MCP Server

```bash
# Start the server with the test Memory Bank
npx memory-bank-mcp-server --port 3000 --memory-bank-path ./test-memory-bank
```

### 3. Create Test Rule Files

Create test rule files for each mode in the test Memory Bank directory:

**.clinerules-test-architect.json**
```json
{
  "mode": "architect",
  "instructions": {
    "general": [
      "Act as an experienced software architect",
      "Provide high-level guidance on code structure"
    ],
    "umb": {
      "trigger": "architect",
      "instructions": [
        "Analyze the project structure in the Memory Bank",
        "Suggest architectural improvements based on the current context"
      ],
      "override_file_restrictions": true
    }
  },
  "mode_triggers": {
    "architect": [
      { "condition": "How should we structure" },
      { "condition": "What is the best architecture" }
    ]
  }
}
```

## Basic Integration Tests

### Test 1: Verify Server Connection

```bash
# Test server connection
curl -X GET http://localhost:3000/status

# Expected response:
# {"status":"ok","version":"1.0.0","memoryBankStatus":"initialized"}
```

### Test 2: Read Memory Bank Files

```bash
# Test reading activeContext.md
curl -X GET http://localhost:3000/memory-bank/file/activeContext.md

# Expected response:
# {"content":"# Current Context\n\n## Ongoing Tasks\n\n...", "status":"success"}
```

### Test 3: Write to Memory Bank

```bash
# Test tracking progress
curl -X POST http://localhost:3000/memory-bank/trackProgress \
  -H "Content-Type: application/json" \
  -d '{
    "action": "Integration Test",
    "description": "Testing Memory Bank MCP integration with AI assistants"
  }'

# Expected response:
# {"status":"success","message":"Progress tracked successfully"}
```

### Test 4: List Memory Bank Files

```bash
# Test listing Memory Bank files
curl -X GET http://localhost:3000/memory-bank/files

# Expected response:
# {"files":["activeContext.md","productContext.md","progress.md","decisionLog.md","systemPatterns.md"], "status":"success"}
```

## AI Assistant Integration Tests

### Test 5: Basic Chat with Memory Bank Context

```bash
# Test basic chat with Memory Bank context
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
    "useMemoryBank": true
  }'

# Expected response:
# {"response":"Based on the Memory Bank, the current status of the project is...", "status":"success"}
```

### Test 6: Mode-Specific Chat

```bash
# Test architect mode chat
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "You are an AI assistant in architect mode."
      },
      {
        "role": "user",
        "content": "How should we structure our authentication system?"
      }
    ],
    "mode": "architect",
    "useMemoryBank": true
  }'

# Expected response:
# {"response":"As an architect, I recommend structuring your authentication system as follows...", "status":"success"}
```

### Test 7: Memory Bank Updates from Chat

```bash
# Test Memory Bank updates from chat
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "You are an AI assistant with access to the project Memory Bank. Update the Memory Bank with any important information."
      },
      {
        "role": "user",
        "content": "We have decided to use JWT for authentication. Please make a note of this decision."
      }
    ],
    "mode": "architect",
    "useMemoryBank": true,
    "allowMemoryBankUpdates": true
  }'

# Expected response:
# {"response":"I've noted that you've decided to use JWT for authentication...", "status":"success", "memoryBankUpdated": true}
```

## Automated Test Script

Create a file named `test-integration.js` with the following content:

```javascript
const axios = require('axios');
const assert = require('assert');

const SERVER_URL = 'http://localhost:3000';

async function runTests() {
  console.log('Starting Memory Bank MCP integration tests...');
  
  try {
    // Test 1: Verify server connection
    console.log('\nTest 1: Verify server connection');
    const statusResponse = await axios.get(`${SERVER_URL}/status`);
    assert.strictEqual(statusResponse.data.status, 'ok');
    console.log('[x] Server connection verified');
    
    // Test 2: Read Memory Bank files
    console.log('\nTest 2: Read Memory Bank files');
    const readResponse = await axios.get(`${SERVER_URL}/memory-bank/file/activeContext.md`);
    assert.strictEqual(readResponse.data.status, 'success');
    console.log('[x] Memory Bank file read successfully');
    
    // Test 3: Write to Memory Bank
    console.log('\nTest 3: Write to Memory Bank');
    const writeResponse = await axios.post(`${SERVER_URL}/memory-bank/trackProgress`, {
      action: 'Integration Test',
      description: 'Testing Memory Bank MCP integration with AI assistants'
    });
    assert.strictEqual(writeResponse.data.status, 'success');
    console.log('[x] Memory Bank updated successfully');
    
    // Test 4: List Memory Bank files
    console.log('\nTest 4: List Memory Bank files');
    const listResponse = await axios.get(`${SERVER_URL}/memory-bank/files`);
    assert.strictEqual(listResponse.data.status, 'success');
    assert(Array.isArray(listResponse.data.files));
    console.log('[x] Memory Bank files listed successfully');
    
    // Test 5: Basic chat with Memory Bank context
    console.log('\nTest 5: Basic chat with Memory Bank context');
    const basicChatResponse = await axios.post(`${SERVER_URL}/chat`, {
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant with access to the project Memory Bank.'
        },
        {
          role: 'user',
          content: 'What is the current status of our project?'
        }
      ],
      useMemoryBank: true
    });
    assert.strictEqual(basicChatResponse.data.status, 'success');
    console.log('[x] Basic chat with Memory Bank context successful');
    
    // Test 6: Mode-specific chat
    console.log('\nTest 6: Mode-specific chat');
    const modeChatResponse = await axios.post(`${SERVER_URL}/chat`, {
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant in architect mode.'
        },
        {
          role: 'user',
          content: 'How should we structure our authentication system?'
        }
      ],
      mode: 'architect',
      useMemoryBank: true
    });
    assert.strictEqual(modeChatResponse.data.status, 'success');
    console.log('[x] Mode-specific chat successful');
    
    // Test 7: Memory Bank updates from chat
    console.log('\nTest 7: Memory Bank updates from chat');
    const updateChatResponse = await axios.post(`${SERVER_URL}/chat`, {
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant with access to the project Memory Bank. Update the Memory Bank with any important information.'
        },
        {
          role: 'user',
          content: 'We have decided to use JWT for authentication. Please make a note of this decision.'
        }
      ],
      mode: 'architect',
      useMemoryBank: true,
      allowMemoryBankUpdates: true
    });
    assert.strictEqual(updateChatResponse.data.status, 'success');
    console.log('[x] Memory Bank updates from chat successful');
    
    console.log('\nAll tests passed! Memory Bank MCP integration is working correctly.');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    process.exit(1);
  }
}

runTests();
```

Run the automated test script:

```bash
# Install dependencies
npm install axios

# Run the test script
node test-integration.js
```

## Advanced Integration Tests

### Test 8: Mode Switching

Create a file named `test-mode-switching.js`:

```javascript
const axios = require('axios');

const SERVER_URL = 'http://localhost:3000';

async function testModeSwitching() {
  console.log('Testing mode switching...');
  
  const modes = ['architect', 'code', 'ask', 'debug', 'test'];
  
  for (const mode of modes) {
    console.log(`\nTesting ${mode} mode...`);
    
    try {
      const response = await axios.post(`${SERVER_URL}/chat`, {
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant in ${mode} mode.`
          },
          {
            role: 'user',
            content: 'What can you help me with in this mode?'
          }
        ],
        mode: mode,
        useMemoryBank: true
      });
      
      console.log(`[x] ${mode} mode response:`, response.data.response.substring(0, 100) + '...');
    } catch (error) {
      console.error(`❌ ${mode} mode test failed:`, error.message);
    }
  }
}

testModeSwitching();
```

### Test 9: Memory Bank File Operations

Create a file named `test-file-operations.js`:

```javascript
const axios = require('axios');

const SERVER_URL = 'http://localhost:3000';

async function testFileOperations() {
  console.log('Testing Memory Bank file operations...');
  
  try {
    // Test writing to a new file
    console.log('\nTesting writing to a new file...');
    const writeResponse = await axios.post(`${SERVER_URL}/memory-bank/file`, {
      filename: 'test-file.md',
      content: '# Test File\n\nThis is a test file created during integration testing.'
    });
    console.log('[x] Write response:', writeResponse.data);
    
    // Test reading the file
    console.log('\nTesting reading the file...');
    const readResponse = await axios.get(`${SERVER_URL}/memory-bank/file/test-file.md`);
    console.log('[x] Read response:', readResponse.data);
    
    // Test updating the file
    console.log('\nTesting updating the file...');
    const updateResponse = await axios.post(`${SERVER_URL}/memory-bank/file`, {
      filename: 'test-file.md',
      content: '# Updated Test File\n\nThis file was updated during integration testing.'
    });
    console.log('[x] Update response:', updateResponse.data);
    
    // Test reading the updated file
    console.log('\nTesting reading the updated file...');
    const readUpdatedResponse = await axios.get(`${SERVER_URL}/memory-bank/file/test-file.md`);
    console.log('[x] Read updated response:', readUpdatedResponse.data);
    
    // Test deleting the file
    console.log('\nTesting deleting the file...');
    const deleteResponse = await axios.delete(`${SERVER_URL}/memory-bank/file/test-file.md`);
    console.log('[x] Delete response:', deleteResponse.data);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testFileOperations();
```

### Test 10: Decision Logging

Create a file named `test-decision-logging.js`:

```javascript
const axios = require('axios');

const SERVER_URL = 'http://localhost:3000';

async function testDecisionLogging() {
  console.log('Testing decision logging...');
  
  try {
    // Test logging a decision
    console.log('\nTesting logging a decision...');
    const logResponse = await axios.post(`${SERVER_URL}/memory-bank/logDecision`, {
      title: 'Authentication Method',
      context: 'We need to choose an authentication method for our API',
      decision: 'Use JWT for authentication',
      alternatives: [
        'Session-based authentication',
        'OAuth 2.0',
        'API keys'
      ],
      consequences: [
        'Stateless authentication',
        'Easy to implement across different platforms',
        'Need to handle token expiration and refresh'
      ]
    });
    console.log('[x] Log decision response:', logResponse.data);
    
    // Test reading the decision log
    console.log('\nTesting reading the decision log...');
    const readResponse = await axios.get(`${SERVER_URL}/memory-bank/file/decisionLog.md`);
    console.log('[x] Decision log content:', readResponse.data.content.substring(0, 200) + '...');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testDecisionLogging();
```

## Integration with Specific AI Assistants

### Claude Integration Test

Create a file named `test-claude-integration.js`:

```javascript
const axios = require('axios');
require('dotenv').config(); // Load API key from .env file

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const MEMORY_BANK_URL = 'http://localhost:3000';

async function testClaudeIntegration() {
  console.log('Testing Claude integration with Memory Bank MCP...');
  
  try {
    // Get context from Memory Bank
    console.log('\nFetching context from Memory Bank...');
    const contextResponse = await axios.get(`${MEMORY_BANK_URL}/memory-bank/file/activeContext.md`);
    const context = contextResponse.data.content;
    console.log('[x] Context fetched successfully');
    
    // Send message to Claude with Memory Bank context
    console.log('\nSending message to Claude with Memory Bank context...');
    const claudeResponse = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-opus-20240229',
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant with access to the project's Memory Bank.
Current project context:
${context}
Please help the user with their request while considering this context.`
        },
        {
          role: 'user',
          content: 'What is the current status of our project?'
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    });
    
    console.log('[x] Claude response:', claudeResponse.data.content[0].text);
    
    // Update Memory Bank with Claude's response
    console.log('\nUpdating Memory Bank with Claude\'s response...');
    const updateResponse = await axios.post(`${MEMORY_BANK_URL}/memory-bank/trackProgress`, {
      action: 'Claude Integration Test',
      description: `Claude provided information about the project status: "${claudeResponse.data.content[0].text.substring(0, 100)}..."`
    });
    console.log('[x] Memory Bank updated successfully');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testClaudeIntegration();
```

## Troubleshooting Integration Issues

### Common Issues and Solutions

1. **Connection Refused**
   - Ensure Memory Bank MCP server is running
   - Check the port configuration
   - Verify there are no firewall issues

2. **Authentication Errors**
   - Check API keys and authentication tokens
   - Ensure environment variables are set correctly
   - Verify API endpoint URLs

3. **File Not Found Errors**
   - Ensure Memory Bank is properly initialized
   - Check file paths and permissions
   - Verify Memory Bank path configuration

4. **Mode Switching Issues**
   - Ensure rule files for all modes are properly configured
   - Check for syntax errors in rule files
   - Verify mode names are consistent

5. **Response Format Issues**
   - Check API version compatibility
   - Ensure request and response formats match expectations
   - Verify content types in requests

### Diagnostic Commands

```bash
# Check Memory Bank status
curl -X GET http://localhost:3000/status

# Check available modes
curl -X GET http://localhost:3000/memory-bank/modes

# Check Memory Bank files
curl -X GET http://localhost:3000/memory-bank/files

# Check server logs
tail -f memory-bank-mcp-server.log
```

## Conclusion

This integration testing guide provides a comprehensive set of tests to verify the integration between Memory Bank MCP and AI assistants. By following these tests, you can ensure that your Memory Bank MCP server is functioning correctly and that AI assistants can effectively access and update the Memory Bank.

For more information on Memory Bank MCP and its integration capabilities, refer to the [AI Assistant Integration](./ai-assistant-integration.md) documentation.

---

*Memory Bank MCP - Enhancing AI assistants with persistent context and memory*