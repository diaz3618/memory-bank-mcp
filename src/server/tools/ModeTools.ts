import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { LogManager } from '../../utils/LogManager.js';

const logger = LogManager.getInstance();

/**
 * Definition of mode tools
 */
export const modeTools = [
  {
    name: 'switch_mode',
    description: 'Switch to a specific mode, get current mode info, or manage UMB (Update Memory Bank) state. Call with no parameters to get current mode. Set umb:true to activate UMB, umb:false to deactivate.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: 'Name of the mode to switch to (architect, ask, code, debug, test). Omit to get current mode info.',
        },
        umb: {
          type: 'boolean',
          description: 'Set true to activate UMB mode, false to deactivate UMB mode',
        },
        umbCommand: {
          type: 'string',
          description: 'UMB command text (when umb: true). If not provided, defaults to "UMB"',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_current_mode',
    description: '(DEPRECATED: use switch_mode with no parameters) Gets information about the current mode',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'process_umb_command',
    description: '(DEPRECATED: use switch_mode with umb:true) Processes the Update Memory Bank (UMB) command',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Complete UMB command',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'complete_umb',
    description: '(DEPRECATED: use switch_mode with umb:false) Completes the Update Memory Bank (UMB) process',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Handles the switch_mode tool (consolidated - also handles get_current_mode and UMB)
 * @param memoryBankManager Memory Bank Manager
 * @param mode Mode name (optional - if omitted, returns current mode)
 * @param umb UMB activation flag (optional)
 * @param umbCommand UMB command text (optional)
 * @returns Operation result
 */
export async function handleSwitchMode(
  memoryBankManager: MemoryBankManager,
  mode?: string,
  umb?: boolean,
  umbCommand?: string
) {
  // Handle UMB operations first (takes precedence)
  if (umb === true) {
    // Activate UMB mode
    if (!memoryBankManager.getMemoryBankDir()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Memory Bank not found. Use initialize_memory_bank to create one.',
          },
        ],
        isError: true,
      };
    }

    const command = umbCommand || 'UMB';
    const isUmbTrigger = memoryBankManager.checkUmbTrigger(command);
    
    if (!isUmbTrigger) {
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid UMB command. Use "Update Memory Bank" or "UMB".',
          },
        ],
        isError: true,
      };
    }
    
    const success = memoryBankManager.activateUmbMode();
    
    if (!success) {
      return {
        content: [
          {
            type: 'text',
            text: 'Failed to activate UMB mode. Check if the current mode supports UMB.',
          },
        ],
        isError: true,
      };
    }
    
    return {
      content: [
        {
          type: 'text',
          text: '[MEMORY BANK: UPDATING] UMB mode activated. You can temporarily update Memory Bank files.',
        },
      ],
    };
  }

  if (umb === false) {
    // Deactivate UMB mode
    if (!memoryBankManager.isUmbModeActive()) {
      return {
        content: [
          {
            type: 'text',
            text: 'UMB mode is not active.',
          },
        ],
        isError: true,
      };
    }
    
    memoryBankManager.completeUmbMode();
    
    return {
      content: [
        {
          type: 'text',
          text: `${memoryBankManager.getStatusPrefix()} UMB mode deactivated. Memory Bank updates have been completed.`,
        },
      ],
    };
  }

  // If no mode provided, return current mode info
  if (!mode) {
    const modeManager = memoryBankManager.getModeManager();
    
    if (!modeManager) {
      return {
        content: [
          {
            type: 'text',
            text: 'Mode manager not initialized.',
          },
        ],
        isError: true,
      };
    }
    
    const modeState = modeManager.getCurrentModeState();
    
    return {
      content: [
        {
          type: 'text',
          text: `Current mode: ${modeState.name}\nMemory Bank status: ${modeState.memoryBankStatus}\nUMB mode active: ${modeState.isUmbActive ? 'Yes' : 'No'}`,
        },
      ],
    };
  }

  // Switch to specified mode
  const validModes = ['architect', 'ask', 'code', 'debug', 'test'];
  
  if (!validModes.includes(mode)) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid mode: ${mode}. Valid modes are: ${validModes.join(', ')}`,
        },
      ],
      isError: true,
    };
  }
  
  const success = await memoryBankManager.switchMode(mode);
  
  if (!success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to switch to mode ${mode}. Make sure the .mcprules-${mode} file exists in the project directory.`,
        },
      ],
      isError: true,
    };
  }
  
  return {
    content: [
      {
        type: 'text',
        text: `Successfully switched to mode ${mode}.`,
      },
    ],
  };
}

/**
 * Handles the get_current_mode tool (DEPRECATED - use switch_mode with no params)
 * @param memoryBankManager Memory Bank Manager
 * @returns Operation result
 */
export function handleGetCurrentMode(memoryBankManager: MemoryBankManager) {
  logger.debug('ModeTools', 'DEPRECATION: get_current_mode called - use switch_mode with no parameters instead');
  
  const modeManager = memoryBankManager.getModeManager();
  
  if (!modeManager) {
    return {
      content: [
        {
          type: 'text',
          text: 'Mode manager not initialized.',
        },
      ],
      isError: true,
    };
  }
  
  const modeState = modeManager.getCurrentModeState();
  
  return {
    content: [
      {
        type: 'text',
        text: `Current mode: ${modeState.name}\nMemory Bank status: ${modeState.memoryBankStatus}\nUMB mode active: ${modeState.isUmbActive ? 'Yes' : 'No'}`,
      },
    ],
  };
}

/**
 * Handles the process_umb_command tool (DEPRECATED - use switch_mode with umb:true)
 * @param memoryBankManager Memory Bank Manager
 * @param command UMB command
 * @returns Operation result
 */
export function handleProcessUmbCommand(memoryBankManager: MemoryBankManager, command: string) {
  logger.debug('ModeTools', 'DEPRECATION: process_umb_command called - use switch_mode with umb:true instead');
  
  if (!memoryBankManager.getMemoryBankDir()) {
    return {
      content: [
        {
          type: 'text',
          text: 'Memory Bank not found. Use initialize_memory_bank to create one.',
        },
      ],
      isError: true,
    };
  }
  
  const isUmbTrigger = memoryBankManager.checkUmbTrigger(command);
  
  if (!isUmbTrigger) {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid UMB command. Use "Update Memory Bank" or "UMB".',
        },
      ],
      isError: true,
    };
  }
  
  const success = memoryBankManager.activateUmbMode();
  
  if (!success) {
    return {
      content: [
        {
          type: 'text',
          text: 'Failed to activate UMB mode. Check if the current mode supports UMB.',
        },
      ],
      isError: true,
    };
  }
  
  return {
    content: [
      {
        type: 'text',
        text: '[MEMORY BANK: UPDATING] UMB mode activated. You can temporarily update Memory Bank files.',
      },
    ],
  };
}

/**
 * Handles the completion of UMB (DEPRECATED - use switch_mode with umb:false)
 * @param memoryBankManager Memory Bank Manager
 * @returns Operation result
 */
export function handleCompleteUmb(memoryBankManager: MemoryBankManager) {
  logger.debug('ModeTools', 'DEPRECATION: complete_umb called - use switch_mode with umb:false instead');
  
  if (!memoryBankManager.isUmbModeActive()) {
    return {
      content: [
        {
          type: 'text',
          text: 'UMB mode is not active.',
        },
      ],
      isError: true,
    };
  }
  
  memoryBankManager.completeUmbMode();
  
  return {
    content: [
      {
        type: 'text',
        text: `${memoryBankManager.getStatusPrefix()} UMB mode deactivated. Memory Bank updates have been completed.`,
      },
    ],
  };
} 