#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  FileProgressDetails,
  MemoryBankStatus,
  isMemoryBankStatus,
  isProgressDetails
} from './types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Configuration for the test tools
 */
interface TestConfig {
  /** Path to the server executable */
  serverPath: string;
  /** Timeout for server startup in milliseconds */
  startupTimeout: number;
  /** Whether to run validation tests */
  runValidation: boolean;
  /** Timeout for test completion in milliseconds */
  testTimeout: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TestConfig = {
  serverPath: path.join(__dirname, '../build/index.js'),
  startupTimeout: 3000,
  runValidation: true,
  testTimeout: 1000
};

/**
 * Sleep utility function
 * @param ms Milliseconds to sleep
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main function to run the test tools
 * @param config Test configuration
 */
async function main(config: TestConfig = DEFAULT_CONFIG) {
  console.log('Starting Memory Bank Server...');
  
  // Start the MCP server
  const serverProcess = spawn('node', [config.serverPath], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  // Wait for the server to start
  await sleep(config.startupTimeout);
  console.log('Memory Bank Server started successfully');

  // Configure the client transport
  const transport = new StdioClientTransport({
    command: 'node',
    args: [config.serverPath]
  });

  // Create the MCP client
  const client = new Client(
    { name: 'memory-bank-test-client', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  try {
    // Connect to the server
    await client.connect(transport);
    console.log('Conectado ao servidor MCP');

    // List available tools
    try {
      const tools = await client.listTools();
      console.log('Ferramentas disponíveis:');
      console.log(JSON.stringify(tools, null, 2));
      
      // Run validation tests if enabled
      if (config.runValidation) {
        await runValidationTests(client);
        
        // Wait for tests to complete
        console.log('Waiting for tests to complete...');
        await sleep(config.testTimeout);
        console.log('Test execution completed');
      }
    } catch (error) {
      console.error('Erro ao listar ferramentas:', error);
    }

  } catch (error) {
    console.error('Erro ao conectar ao servidor:', error);
  } finally {
    // Terminate the server
    console.log('Shutting down server...');
    serverProcess.kill();
    console.log('Server terminated');
    process.exit(0);
  }
}

/**
 * Run validation tests for the Memory Bank MCP
 * @param client MCP client
 */
async function runValidationTests(client: Client) {
  console.log('\n=== Running Validation Tests ===\n');
  
  // Test 1: Initialize Memory Bank
  try {
    console.log('Test 1: Initialize Memory Bank');
    const result = await client.callTool({
      name: 'initialize_memory_bank',
      arguments: {
        path: path.join(__dirname, '../test-memory-bank')
      }
    });
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Test 1 failed:', error);
  }
  
  // Test 2: Get Memory Bank Status
  try {
    console.log('\nTest 2: Get Memory Bank Status');
    const result = await client.callTool({
      name: 'get_memory_bank_status',
      arguments: {}
    });
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Validate the result using type guards
    if (result && result.content && Array.isArray(result.content) && 
        result.content.length > 0 && typeof result.content[0] === 'object' && 
        result.content[0] && typeof result.content[0].text === 'string') {
      try {
        const status = JSON.parse(result.content[0].text) as MemoryBankStatus;
        console.log('Parsed status:', JSON.stringify(status, null, 2));
        if (isMemoryBankStatus(status)) {
          console.log('Status validation passed');
        } else {
          console.error('Status validation failed: Invalid status object');
        }
      } catch (error) {
        console.error('Status validation failed:', error);
      }
    }
  } catch (error) {
    console.error('Test 2 failed:', error);
  }
  
  // Test 3: Track Progress
  try {
    console.log('\nTest 3: Track Progress');
    const progressDetails: FileProgressDetails = {
      type: 'file',
      description: 'Updated test file',
      filename: 'test.md',
      status: 'success'
    };
    
    // Validate the progress details using type guards
    if (isProgressDetails(progressDetails)) {
      console.log('Progress details validation passed');
      
      const result = await client.callTool({
        name: 'track_progress',
        arguments: {
          action: 'File Update',
          description: progressDetails.description,
          updateActiveContext: true
        }
      });
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.error('Progress details validation failed');
    }
  } catch (error) {
    console.error('Test 3 failed:', error);
  }
  
  console.log('\n=== Validation Tests Completed ===\n');
}

// Run the main function
main().catch(error => {
  console.error('Erro no script de teste:', error);
  process.exit(1);
}); 