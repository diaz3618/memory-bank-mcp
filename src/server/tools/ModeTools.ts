import { MemoryBankManager } from '../../core/MemoryBankManager.js';

/**
 * Definition of mode tools
 */
export const modeTools = [
  {
    name: 'switch_mode',
    description: 'Switches to a specific mode',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: 'Name of the mode to switch to (architect, ask, code, debug, test)',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'get_current_mode',
    description: 'Gets information about the current mode',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'process_umb_command',
    description: 'Processes the Update Memory Bank (UMB) command',
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
    description: 'Completes the Update Memory Bank (UMB) process',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Handles the switch_mode tool
 * @param memoryBankManager Memory Bank Manager
 * @param mode Mode name
 * @returns Operation result
 */
export async function handleSwitchMode(memoryBankManager: MemoryBankManager, mode: string) {
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
          text: `Failed to switch to mode ${mode}. Make sure the .clinerules-${mode} file exists in the project directory.`,
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
 * Handles the get_current_mode tool
 * @param memoryBankManager Memory Bank Manager
 * @returns Operation result
 */
export function handleGetCurrentMode(memoryBankManager: MemoryBankManager) {
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
 * Handles the process_umb_command tool
 * @param memoryBankManager Memory Bank Manager
 * @param command UMB command
 * @returns Operation result
 */
export function handleProcessUmbCommand(memoryBankManager: MemoryBankManager, command: string) {
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
 * Handles the completion of UMB
 * @param memoryBankManager Memory Bank Manager
 * @returns Operation result
 */
export function handleCompleteUmb(memoryBankManager: MemoryBankManager) {
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