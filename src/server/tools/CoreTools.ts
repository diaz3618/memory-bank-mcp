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
  {
    name: 'get_context_bundle',
    description: 'Get all Memory Bank files in a single response for quick context loading. Returns all core files (product-context, active-context, progress, decision-log, system-patterns) as a combined JSON object.',
    inputSchema: {
      type: 'object',
      properties: {
        includeEtags: {
          type: 'boolean',
          description: 'Whether to include ETags for each file (default: true)',
          default: true,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_context_digest',
    description: 'Get a compact summary of the Memory Bank for context-limited situations. Returns recent progress entries, current tasks, known issues, and recent decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        maxProgressEntries: {
          type: 'number',
          description: 'Maximum number of recent progress entries to include (default: 10)',
          default: 10,
        },
        maxDecisions: {
          type: 'number',
          description: 'Maximum number of recent decisions to include (default: 5)',
          default: 5,
        },
        includeSystemPatterns: {
          type: 'boolean',
          description: 'Whether to include system patterns summary (default: false)',
          default: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_memory_bank',
    description: 'Search across all Memory Bank files with full-text search',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of specific files to search (e.g., ["progress.md", "decision-log.md"]). If not provided, searches all core files.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 20)',
          default: 20,
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether search is case-sensitive (default: false)',
          default: false,
        },
      },
      required: ['query'],
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

/**
 * Core Memory Bank file names
 */
const CORE_FILES = [
  'product-context.md',
  'active-context.md',
  'progress.md',
  'decision-log.md',
  'system-patterns.md',
];

/**
 * Processes the get_context_bundle tool
 * 
 * Returns all core Memory Bank files in a single response for quick context loading.
 * This is the #1 operational use-case for memory banks - quickly loading context
 * when starting a new session or when context window limits are a concern.
 * 
 * @param memoryBankManager Memory Bank Manager instance
 * @param includeEtags Whether to include ETags for each file
 * @returns Bundle of all core files with optional ETags
 */
export async function handleGetContextBundle(
  memoryBankManager: MemoryBankManager,
  includeEtags: boolean = true
) {
  try {
    const memoryBankDir = memoryBankManager.getMemoryBankDir();
    if (!memoryBankDir) {
      return {
        content: [
          {
            type: 'text',
            text: 'Memory Bank not initialized. Use set_memory_bank_path or initialize_memory_bank first.',
          },
        ],
        isError: true,
      };
    }

    const bundle: Record<string, { content: string; etag?: string }> = {};
    const errors: string[] = [];

    for (const filename of CORE_FILES) {
      try {
        const content = await memoryBankManager.readFile(filename);
        bundle[filename] = {
          content,
          ...(includeEtags && { etag: ETagUtils.calculateETag(content) }),
        };
      } catch (error) {
        // File might not exist yet, which is OK
        errors.push(`${filename}: ${error}`);
      }
    }

    // Count successfully loaded files
    const loadedCount = Object.keys(bundle).length;
    
    if (loadedCount === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No Memory Bank files found. Errors: ${errors.join('; ')}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            bundle,
            metadata: {
              timestamp: new Date().toISOString(),
              filesLoaded: loadedCount,
              totalFiles: CORE_FILES.length,
              memoryBankDir,
              ...(errors.length > 0 && { warnings: errors }),
            },
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error('Error in handleGetContextBundle:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error getting context bundle: ${error}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Extracts recent progress entries from the progress.md content
 * 
 * @param content Progress file content
 * @param maxEntries Maximum number of entries to return
 * @returns Array of recent progress entries
 */
function extractProgressEntries(content: string, maxEntries: number): string[] {
  const entries: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Progress entries start with "- [" followed by a date/time
    if (line.trim().startsWith('- [') && /\d{4}-\d{2}-\d{2}/.test(line)) {
      entries.push(line.trim());
      if (entries.length >= maxEntries) {
        break;
      }
    }
  }
  
  return entries;
}

/**
 * Extracts decisions from the decision-log.md content
 * 
 * @param content Decision log content
 * @param maxDecisions Maximum number of decisions to return
 * @returns Array of decision summaries
 */
function extractDecisions(content: string, maxDecisions: number): Array<{ title: string; date?: string; summary: string }> {
  const decisions: Array<{ title: string; date?: string; summary: string }> = [];
  const sections = content.split(/^## /m).filter(s => s.trim());
  
  for (let i = 0; i < Math.min(sections.length, maxDecisions); i++) {
    const section = sections[i];
    const lines = section.split('\n');
    const title = lines[0]?.trim() || 'Untitled Decision';
    
    // Extract date if present
    let date: string | undefined;
    let summary = '';
    
    for (const line of lines.slice(1)) {
      if (line.includes('**Date:**')) {
        date = line.replace(/.*\*\*Date:\*\*\s*/, '').trim();
      } else if (line.includes('**Decision:**')) {
        summary = line.replace(/.*\*\*Decision:\*\*\s*/, '').trim();
      }
    }
    
    if (title && title !== 'Decision Log') {
      decisions.push({ title, date, summary: summary || 'See full decision log for details.' });
    }
  }
  
  return decisions;
}

/**
 * Extracts current tasks, issues, and next steps from active-context.md
 * 
 * @param content Active context content
 * @returns Object with tasks, issues, and nextSteps arrays
 */
function extractActiveContextItems(content: string): { tasks: string[]; issues: string[]; nextSteps: string[] } {
  const result = { tasks: [] as string[], issues: [] as string[], nextSteps: [] as string[] };
  
  // Extract tasks
  const tasksMatch = content.match(/## Ongoing Tasks\s+([\s\S]*?)(?=##|$)/);
  if (tasksMatch) {
    result.tasks = tasksMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(Boolean);
  }
  
  // Extract issues
  const issuesMatch = content.match(/## Known Issues\s+([\s\S]*?)(?=##|$)/);
  if (issuesMatch) {
    result.issues = issuesMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(Boolean);
  }
  
  // Extract next steps
  const nextStepsMatch = content.match(/## Next Steps\s+([\s\S]*?)(?=##|$)/);
  if (nextStepsMatch) {
    result.nextSteps = nextStepsMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(Boolean);
  }
  
  return result;
}

/**
 * Processes the get_context_digest tool
 * 
 * Returns a compact summary of the Memory Bank for context-limited situations.
 * Useful when agents need quick access to the most relevant information.
 * 
 * @param memoryBankManager Memory Bank Manager instance
 * @param maxProgressEntries Maximum progress entries to return
 * @param maxDecisions Maximum decisions to return
 * @param includeSystemPatterns Whether to include system patterns
 * @returns Compact digest of Memory Bank state
 */
export async function handleGetContextDigest(
  memoryBankManager: MemoryBankManager,
  maxProgressEntries: number = 10,
  maxDecisions: number = 5,
  includeSystemPatterns: boolean = false
) {
  try {
    const memoryBankDir = memoryBankManager.getMemoryBankDir();
    if (!memoryBankDir) {
      return {
        content: [
          {
            type: 'text',
            text: 'Memory Bank not initialized. Use set_memory_bank_path or initialize_memory_bank first.',
          },
        ],
        isError: true,
      };
    }

    const digest: {
      projectState?: string;
      currentContext: { tasks: string[]; issues: string[]; nextSteps: string[] };
      recentProgress: string[];
      recentDecisions: Array<{ title: string; date?: string; summary: string }>;
      systemPatterns?: string;
    } = {
      currentContext: { tasks: [], issues: [], nextSteps: [] },
      recentProgress: [],
      recentDecisions: [],
    };

    // Load active context
    try {
      const activeContext = await memoryBankManager.readFile('active-context.md');
      
      // Extract project state (first paragraph after # Active Context)
      const projectStateMatch = activeContext.match(/## Current Project State\s+([\s\S]*?)(?=##|$)/);
      if (projectStateMatch) {
        digest.projectState = projectStateMatch[1].trim().split('\n')[0];
      }
      
      // Extract tasks, issues, and next steps
      digest.currentContext = extractActiveContextItems(activeContext);
    } catch (error) {
      console.error('Error loading active-context.md:', error);
    }

    // Load recent progress
    try {
      const progress = await memoryBankManager.readFile('progress.md');
      digest.recentProgress = extractProgressEntries(progress, maxProgressEntries);
    } catch (error) {
      console.error('Error loading progress.md:', error);
    }

    // Load recent decisions
    try {
      const decisionLog = await memoryBankManager.readFile('decision-log.md');
      digest.recentDecisions = extractDecisions(decisionLog, maxDecisions);
    } catch (error) {
      console.error('Error loading decision-log.md:', error);
    }

    // Optionally load system patterns summary
    if (includeSystemPatterns) {
      try {
        const systemPatterns = await memoryBankManager.readFile('system-patterns.md');
        // Just include first few lines as a summary
        const lines = systemPatterns.split('\n').slice(0, 20);
        digest.systemPatterns = lines.join('\n');
      } catch (error) {
        console.error('Error loading system-patterns.md:', error);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            digest,
            metadata: {
              timestamp: new Date().toISOString(),
              memoryBankDir,
            },
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error('Error in handleGetContextDigest:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error getting context digest: ${error}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Search result interface
 */
interface SearchResult {
  file: string;
  line: number;
  content: string;
  context: string;
}

/**
 * Processes the search_memory_bank tool
 * 
 * Performs full-text search across Memory Bank files.
 * 
 * @param memoryBankManager Memory Bank Manager instance
 * @param query Search query
 * @param files Optional list of files to search
 * @param maxResults Maximum results to return
 * @param caseSensitive Whether search is case-sensitive
 * @returns Search results
 */
export async function handleSearchMemoryBank(
  memoryBankManager: MemoryBankManager,
  query: string,
  files?: string[],
  maxResults: number = 20,
  caseSensitive: boolean = false
) {
  try {
    const memoryBankDir = memoryBankManager.getMemoryBankDir();
    if (!memoryBankDir) {
      return {
        content: [
          {
            type: 'text',
            text: 'Memory Bank not initialized. Use set_memory_bank_path or initialize_memory_bank first.',
          },
        ],
        isError: true,
      };
    }

    if (!query || query.trim().length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Search query cannot be empty.',
          },
        ],
        isError: true,
      };
    }

    const filesToSearch = files && files.length > 0 ? files : CORE_FILES;
    const results: SearchResult[] = [];
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    for (const filename of filesToSearch) {
      if (results.length >= maxResults) break;

      try {
        const content = await memoryBankManager.readFile(filename);
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) break;

          const line = lines[i];
          const searchLine = caseSensitive ? line : line.toLowerCase();

          if (searchLine.includes(searchQuery)) {
            // Get context (1 line before and after)
            const contextLines: string[] = [];
            if (i > 0) contextLines.push(lines[i - 1]);
            contextLines.push(line);
            if (i < lines.length - 1) contextLines.push(lines[i + 1]);

            results.push({
              file: filename,
              line: i + 1,
              content: line.trim(),
              context: contextLines.join('\n'),
            });
          }
        }
      } catch (error) {
        // File might not exist, skip it
        console.error(`Error searching ${filename}:`, error);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            query,
            results,
            metadata: {
              timestamp: new Date().toISOString(),
              totalResults: results.length,
              filesSearched: filesToSearch,
              truncated: results.length >= maxResults,
            },
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error('Error in handleSearchMemoryBank:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error searching Memory Bank: ${error}`,
        },
      ],
      isError: true,
    };
  }
}