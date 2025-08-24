// Mock Claude responses for testing

/**
 * Mock responses for different test scenarios
 */
export const mockResponses = {
  success: {
    chunks: [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: 'Starting to process your request...\n'
          }]
        }
      }) + '\n',
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: 'Processing complete. Here is your result:\n\nHello! This is a mock response from Claude.'
          }]
        }
      }) + '\n',
    ],
    errorChunks: [],
    exitCode: 0
  },

  error: {
    chunks: [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: 'Starting process...\n'
          }]
        }
      }) + '\n',
    ],
    errorChunks: ['Error: Mock error occurred\n'],
    exitCode: 1
  },

  longRunning: {
    chunks: Array(5).fill(null).map((_, i) => 
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: `Step ${i + 1}/5: Processing...\n`
          }]
        }
      }) + '\n'
    ).concat([
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: 'All steps completed successfully!'
          }]
        }
      }) + '\n'
    ]),
    errorChunks: [],
    exitCode: 0
  },

  empty: {
    chunks: [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: ''
          }]
        }
      }) + '\n',
    ],
    errorChunks: [],
    exitCode: 0
  },

  malformed: {
    chunks: [
      'This is not valid JSON\n',
      '{"incomplete": json\n',
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: 'Valid message after malformed ones'
          }]
        }
      }) + '\n',
    ],
    errorChunks: [],
    exitCode: 0
  },

  timeout: {
    chunks: [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: 'This will take a very long time...\n'
          }]
        }
      }) + '\n',
    ],
    errorChunks: [],
    exitCode: 124, // timeout exit code
    delay: 10000 // 10 second delay
  }
};

/**
 * Test prompts that trigger specific mock responses
 */
export const testPrompts = {
  success: 'Create a simple hello world program',
  error: 'This should fail with an error',
  longRunning: 'Perform a long complex task',
  empty: 'Return empty response',
  malformed: 'Return malformed JSON',
  timeout: 'Take a very long time to respond'
};

/**
 * Expected output patterns for validation
 */
export const expectedOutputs = {
  success: [
    'Starting to process your request',
    'Processing complete',
    'Hello! This is a mock response from Claude'
  ],
  
  error: [
    'Starting process',
    'Mock error occurred'
  ],
  
  longRunning: [
    'Step 1/5: Processing',
    'Step 2/5: Processing',
    'Step 3/5: Processing',
    'Step 4/5: Processing',
    'Step 5/5: Processing',
    'All steps completed successfully'
  ]
};

/**
 * Test job configurations
 */
export const testJobConfigs = {
  basic: {
    prompt: testPrompts.success,
    options: {}
  },
  
  withModel: {
    prompt: testPrompts.success,
    options: {
      model: 'claude-haiku-20240307'
    }
  },
  
  withTools: {
    prompt: testPrompts.success,
    options: {
      allowedTools: ['Read', 'Write'],
      disallowedTools: ['Bash']
    }
  },
  
  withDirectories: {
    prompt: testPrompts.success,
    options: {
      addDirs: ['/tmp/test']
    }
  },
  
  complex: {
    prompt: testPrompts.longRunning,
    options: {
      model: 'claude-sonnet-4-20250514',
      allowedTools: ['Read', 'Write', 'Edit'],
      addDirs: ['/project/src', '/project/docs']
    }
  }
};

export default mockResponses;