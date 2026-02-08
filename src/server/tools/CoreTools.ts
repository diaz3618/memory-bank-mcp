import path from 'path';
import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { MigrationUtils } from '../../utils/MigrationUtils.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { ETagUtils } from '../../utils/ETagUtils.js';
import os from 'os';

/**
 * Definition of the main Memory Bank tools
 */
export const coreTools = [
  {
    name: 'initialize_memory_bank',
    description: 'Initialize a Memory Bank in the specified directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path where the Memory Bank will be initialized',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'set_memory_bank_path',
    description: 'Set a custom path for the Memory Bank',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Custom path for the Memory Bank. If not provided, the current directory will be used.',
        },
      },
      required: [],
    },
  },
  {
    name: 'debug_mcp_config',
    description: 'Debug the current MCP configuration',
    inputSchema: {
      type: 'object',
      properties: {
        verbose: {
          type: 'boolean',
          description: 'Whether to include detailed information',
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: 'read_memory_bank_file',
    description: 'Read a file from the Memory Bank. Returns content with ETag for optimistic concurrency control.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Name of the file to read',
        },
        includeEtag: {
          type: 'boolean',
          description: 'Whether to include ETag in response (default: true)',
          default: true,
        },
      },
      required: ['filename'],
    },
  },
  {
    name: 'write_memory_bank_file',
    description: 'Write to a Memory Bank file. Supports optimistic concurrency control via ifMatchEtag.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Name of the file to write',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
        ifMatchEtag: {
          type: 'string',
          description: 'Optional ETag from a previous read. If provided, write will only succeed if the file has not been modified since the read.',
        },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'list_memory_bank_files',
    description: 'List Memory Bank files',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_memory_bank_status',
    description: 'Check Memory Bank status',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'migrate_file_naming',
    description: 'Migrate Memory Bank files from camelCase to kebab-case naming convention',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

/**
 * Processes the set_memory_bank_path tool
 * @param memoryBankManager Memory Bank Manager
 * @param customPath Custom path for the Memory Bank
 * @returns Operation result
 */
export async function handleSetMemoryBankPath(
  memoryBankManager: MemoryBankManager,
  customPath?: string
) {
  // Use the provided path, project path, or the current directory
  const basePath = customPath || memoryBankManager.getProjectPath();
  
  // Ensure the path is absolute
  const absolutePath = path.isAbsolute(basePath) ? basePath : path.resolve(process.cwd(), basePath);
  console.error('Using absolute path for Memory Bank:', absolutePath);
  
  // Set the custom path and check for a memory-bank directory
  await memoryBankManager.setCustomPath(absolutePath);
  
  // Check if a memory-bank directory was found
  const memoryBankDir = memoryBankManager.getMemoryBankDir();
  if (memoryBankDir) {
    return {
      content: [
        {
          type: 'text',
          text: `Memory Bank path set to ${memoryBankDir}`,
        },
      ],
    };
  }
  
  // If we get here, no valid Memory Bank was found
  return {
    content: [
      {
        type: 'text',
        text: `Memory Bank not found in the provided directory. Use initialize_memory_bank to create one.`,
      },
    ],
  };
}

/**
 * Processes the initialize_memory_bank tool
 * @param memoryBankManager Memory Bank Manager
 * @param dirPath Directory path where the Memory Bank will be initialized
 * @returns Operation result
 */
export async function handleInitializeMemoryBank(
  memoryBankManager: MemoryBankManager,
  dirPath: string
) {
  try {
    // If dirPath is not provided, use the project path
    const basePath = dirPath || memoryBankManager.getProjectPath();
    
    // Ensure the path is absolute
    const absolutePath = path.isAbsolute(basePath) ? basePath : path.resolve(process.cwd(), basePath);
    console.error('Using absolute path:', absolutePath);
    
    try {
      // Set the custom path first
      await memoryBankManager.setCustomPath(absolutePath);
      
      // Initialize the Memory Bank with createIfNotExists = true
      await memoryBankManager.initialize(true);
      
      // Get the Memory Bank directory
      const memoryBankDir = memoryBankManager.getMemoryBankDir();
      
      return {
        content: [
          {
            type: 'text',
            text: `Memory Bank initialized at ${memoryBankDir}`,
          },
        ],
      };
    } catch (initError) {
      // Check if the error is related to .clinerules files
      const errorMessage = String(initError);
      if (errorMessage.includes('.clinerules')) {
        console.warn('Warning: Error related to .clinerules files:', initError);
        console.warn('Continuing with Memory Bank initialization despite .clinerules issues.');
        
        // Use the provided path directly as the memory bank directory
        const memoryBankDir = absolutePath;
        try {
          await FileUtils.ensureDirectory(memoryBankDir);
          memoryBankManager.setMemoryBankDir(memoryBankDir);
          
          return {
            content: [
              {
                type: 'text',
                text: `Memory Bank initialized at ${memoryBankDir} (with warnings about .clinerules files)`,
              },
            ],
          };
        } catch (dirError) {
          console.error('Failed to create memory-bank directory:', dirError);
          
          // Try to use an existing memory-bank directory if it exists
          if (await FileUtils.fileExists(memoryBankDir) && await FileUtils.isDirectory(memoryBankDir)) {
            memoryBankManager.setMemoryBankDir(memoryBankDir);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `Memory Bank initialized at ${memoryBankDir} (with warnings)`,
                },
              ],
            };
          }
          
          // If we can't create or find a memory-bank directory, return an error
          return {
            content: [
              {
                type: 'text',
                text: `Failed to initialize Memory Bank: ${dirError}`,
              },
            ],
          };
        }
      }
      
      // For other errors, return the error message
      return {
        content: [
          {
            type: 'text',
            text: `Failed to initialize Memory Bank: ${initError}`,
          },
        ],
      };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error initializing Memory Bank: ${error}`,
        },
      ],
    };
  }
}

/**
 * Processes the read_memory_bank_file tool
 * @param memoryBankManager Memory Bank Manager
 * @param filename Name of the file to read
 * @param includeEtag Whether to include ETag in response (default: true)
 * @returns Operation result with content and optional ETag
 */
export async function handleReadMemoryBankFile(
  memoryBankManager: MemoryBankManager,
  filename: string,
  includeEtag: boolean = true
) {
  try {
    const content = await memoryBankManager.readFile(filename);
    
    if (includeEtag) {
      const etag = ETagUtils.calculateETag(content);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              content,
              etag,
              filename,
            }, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: content,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error reading file ${filename}: ${error}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Processes the write_memory_bank_file tool
 * @param memoryBankManager Memory Bank Manager
 * @param filename Name of the file to write
 * @param content Content to write to the file
 * @param ifMatchEtag Optional ETag for optimistic concurrency control
 * @returns Operation result
 */
export async function handleWriteMemoryBankFile(
  memoryBankManager: MemoryBankManager,
  filename: string,
  content: string,
  ifMatchEtag?: string
) {
  try {
    // If ifMatchEtag is provided, validate the ETag before writing
    if (ifMatchEtag) {
      try {
        const currentContent = await memoryBankManager.readFile(filename);
        const currentEtag = ETagUtils.calculateETag(currentContent);
        
        if (currentEtag !== ifMatchEtag) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'ETAG_MISMATCH',
                  message: `File ${filename} has been modified by another process. Expected ETag: ${ifMatchEtag}, Current ETag: ${currentEtag}. Read the file again to get the latest content and ETag.`,
                  expectedEtag: ifMatchEtag,
                  currentEtag: currentEtag,
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      } catch (readError) {
        // If file doesn't exist and we have an ifMatchEtag, that's a conflict
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'FILE_NOT_FOUND',
                message: `File ${filename} not found. Cannot validate ETag against non-existent file.`,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
    
    await memoryBankManager.writeFile(filename, content);
    
    // Return new ETag for potential subsequent writes
    const newEtag = ETagUtils.calculateETag(content);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `File ${filename} successfully written to Memory Bank`,
            filename,
            etag: newEtag,
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error writing file ${filename}: ${error}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Processes the list_memory_bank_files tool
 * @param memoryBankManager Memory Bank Manager
 * @returns Operation result
 */
export async function handleListMemoryBankFiles(
  memoryBankManager: MemoryBankManager
) {
  try {
    const files = await memoryBankManager.listFiles();

    return {
      content: [
        {
          type: 'text',
          text: `Files in Memory Bank:\n${files.join('\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error listing Memory Bank files: ${error}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Processes the get_memory_bank_status tool
 * @param memoryBankManager Memory Bank Manager
 * @returns Operation result
 */
export async function handleGetMemoryBankStatus(
  memoryBankManager: MemoryBankManager
) {
  try {
    const status = await memoryBankManager.getStatus();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error checking Memory Bank status: ${error}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Processes the migrate_file_naming tool
 * @param memoryBankManager Memory Bank Manager instance
 * @returns Operation result
 */
export async function handleMigrateFileNaming(
  memoryBankManager: MemoryBankManager
) {
  try {
    if (!memoryBankManager.getMemoryBankDir()) {
      return {
        content: [
          {
            type: "text",
            text: 'Memory Bank directory not found. Use initialize_memory_bank or set_memory_bank_path first.',
          },
        ],
      };
    }

    const result = await memoryBankManager.migrateFileNaming();
    return {
      content: [
        {
          type: "text",
          text: `Migration completed. ${result.migrated.length} files migrated.`,
        },
      ],
    };
  } catch (error) {
    console.error("Error in handleMigrateFileNaming:", error);
    return {
      content: [
        {
          type: "text",
          text: `Error migrating file naming: ${error}`,
        },
      ],
    };
  }
}

/**
 * Processes the debug_mcp_config tool
 * 
 * This function collects and returns detailed information about the current
 * MCP configuration, including Memory Bank status, mode information, system details,
 * and other relevant configuration data.
 * 
 * @param memoryBankManager Memory Bank Manager instance
 * @param verbose Whether to include detailed information
 * @returns Operation result with configuration details
 */
export async function handleDebugMcpConfig(
  memoryBankManager: MemoryBankManager,
  verbose: boolean = false
) {
  try {
    // Get basic information
    const memoryBankDir = memoryBankManager.getMemoryBankDir();
    const projectPath = memoryBankManager.getProjectPath();
    const language = memoryBankManager.getLanguage();
    const folderName = memoryBankManager.getFolderName();
    
    // Get mode information
    const modeManager = memoryBankManager.getModeManager();
    let modeInfo = null;
    if (modeManager) {
      const currentModeState = modeManager.getCurrentModeState();
      modeInfo = {
        name: currentModeState.name,
        isUmbActive: currentModeState.isUmbActive,
        memoryBankStatus: currentModeState.memoryBankStatus
      };
    }
    
    // Get Memory Bank status
    let memoryBankStatus = null;
    try {
      if (memoryBankDir) {
        memoryBankStatus = await memoryBankManager.getStatus();
      }
    } catch (error) {
      console.error('Error getting Memory Bank status:', error);
    }
    
    // Get system information
    const systemInfo = {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      nodeVersion: process.version,
      cwd: process.cwd(),
      env: verbose ? process.env : undefined
    };
    
    // Collect all information
    const debugInfo = {
      timestamp: new Date().toISOString(),
      memoryBank: {
        directory: memoryBankDir,
        projectPath,
        language,
        folderName,
        status: memoryBankStatus
      },
      mode: modeInfo,
      system: systemInfo
    };
    
    return {
      content: [
        {
          type: "text",
          text: `MCP Configuration Debug Information:\n${JSON.stringify(debugInfo, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    console.error("Error in handleDebugMcpConfig:", error);
    return {
      content: [
        {
          type: "text",
          text: `Error debugging MCP configuration: ${error}`,
        },
      ],
      isError: true
    };
  }
}