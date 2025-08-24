// Claude process management service with mock support for testing

import getConfig from "../config/index.js";
import { buildClaudeArgs } from "../utils/output-parser.js";

/**
 * Create a Claude service instance
 * @param {Object} options - Service options
 * @returns {Object} Claude service interface
 */
export const createClaudeService = (options = {}) => {
  const config = getConfig();
  const isMockMode =
    options.mockMode !== undefined ? options.mockMode : config.claude.mockMode;

  if (isMockMode) {
    return createMockClaudeService(config);
  }

  return createRealClaudeService(config);
};

/**
 * Real Claude process implementation
 */
const createRealClaudeService = (config) => {
  return {
    /**
     * Start a Claude process
     * @param {string} prompt - The prompt to send to Claude
     * @param {Object} options - Process options
     * @returns {Object} Process handle and metadata
     */
    async startProcess(prompt, options = {}) {
      const model = options.model || config.claude.defaultModel;

      // Build base arguments
      const args = [config.claude.executable];

      if (config.claude.dangerouslySkipPermissions) {
        args.push("--dangerously-skip-permissions");
      }

      args.push(
        "-p", // print mode for better programmatic usage
        prompt,
        "--output-format",
        config.claude.outputFormat,
        "--model",
        model
      );

      if (
        config.claude.verbose ||
        config.claude.outputFormat === "stream-json"
      ) {
        args.push("--verbose");
      }

      // Add additional options
      const additionalArgs = buildClaudeArgs(options);
      args.push(...additionalArgs);

      // Start the process
      const proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
        cwd: options.workingDirectory || process.cwd(),
        env: {
          ...process.env,
          CLAUDE_HEADLESS: config.claude.headlessMode ? "1" : "0",
          ...options.env,
        },
      });

      return {
        process: proc,
        stdout: proc.stdout,
        stderr: proc.stderr,
        exited: proc.exited,
        kill: (signal = "SIGTERM") => proc.kill(signal),
        metadata: {
          model,
          startedAt: Date.now(),
          prompt: (prompt || "").substring(0, 100),
        },
      };
    },

    /**
     * Check if service is available
     */
    async isAvailable() {
      try {
        // Try to run a simple version check
        const proc = Bun.spawn([config.claude.executable, "--version"], {
          stdout: "pipe",
          stderr: "pipe",
        });

        const exitCode = await proc.exited;
        return exitCode === 0;
      } catch (error) {
        return false;
      }
    },

    /**
     * Get service configuration
     */
    getConfig() {
      return {
        executable: config.claude.executable,
        defaultModel: config.claude.defaultModel,
        mockMode: false,
      };
    },
  };
};

/**
 * Mock Claude service for testing
 */
const createMockClaudeService = (config) => {
  const mockResponses = getMockResponses();

  return {
    /**
     * Start a mock Claude process
     */
    async startProcess(prompt, options = {}) {
      const responseDelay = config.test.mockResponseDelay;
      const response = selectMockResponse(prompt, mockResponses);

      // Create mock readable streams
      const createMockStream = (chunks) => {
        let index = 0;
        const chunkDelay = response.delay || responseDelay;
        return {
          async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
              // Simulate delay between chunks
              await new Promise((resolve) => setTimeout(resolve, chunkDelay));
              yield new TextEncoder().encode(chunk);
            }
          },
        };
      };

      // Prepare mock output chunks
      const outputChunks = response.chunks || [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text:
                  response.text ||
                  `Mock response for: ${prompt.substring(0, 50)}...`,
              },
            ],
          },
        }) + "\n",
      ];

      const errorChunks = response.errorChunks || [];

      // Create mock process object
      const mockProcess = {
        stdout: createMockStream(outputChunks),
        stderr: createMockStream(errorChunks),
        exited: new Promise((resolve) => {
          // Simulate process completion after all chunks
          const chunkDelay = response.delay || responseDelay;
          const totalDelay =
            (outputChunks.length + errorChunks.length) * chunkDelay + 100;
          setTimeout(() => resolve(response.exitCode || 0), totalDelay);
        }),
        kill: (signal = "SIGTERM") => {
          // Simulate process termination
          console.log(`Mock process killed with signal: ${signal}`);
          return true;
        },
        killed: false,
      };

      return {
        process: mockProcess,
        stdout: mockProcess.stdout,
        stderr: mockProcess.stderr,
        exited: mockProcess.exited,
        kill: mockProcess.kill,
        metadata: {
          model: options.model || config.claude.defaultModel,
          startedAt: Date.now(),
          prompt: (prompt || "").substring(0, 100),
          mockMode: true,
        },
      };
    },

    /**
     * Mock service is always available
     */
    async isAvailable() {
      return true;
    },

    /**
     * Get mock service configuration
     */
    getConfig() {
      return {
        executable: "mock",
        defaultModel: config.claude.defaultModel,
        mockMode: true,
      };
    },
  };
};

/**
 * Get mock responses for testing
 */
const getMockResponses = () => {
  return {
    default: {
      chunks: [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "This is a mock response from Claude.\n",
              },
            ],
          },
        }) + "\n",
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "Processing your request...\n",
              },
            ],
          },
        }) + "\n",
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "Task completed successfully!",
              },
            ],
          },
        }) + "\n",
      ],
      exitCode: 0,
    },
    error: {
      chunks: [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "Starting task...\n",
              },
            ],
          },
        }) + "\n",
      ],
      errorChunks: ["Error: Something went wrong\n"],
      exitCode: 1,
    },
    long: {
      chunks: Array(10)
        .fill(null)
        .map(
          (_, i) =>
            JSON.stringify({
              type: "assistant",
              message: {
                content: [
                  {
                    type: "text",
                    text: `Processing step ${i + 1}/10...\n`,
                  },
                ],
              },
            }) + "\n"
        ),
      exitCode: 0,
      delay: 50, // Longer delay between chunks for truly long-running jobs
    },
  };
};

/**
 * Select appropriate mock response based on prompt
 */
const selectMockResponse = (prompt, responses) => {
  // Simple heuristic for selecting responses
  if (!prompt || typeof prompt !== "string") {
    return responses.default;
  }

  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("error") || lowerPrompt.includes("fail")) {
    return responses.error;
  }

  if (lowerPrompt.includes("long") || lowerPrompt.includes("complex")) {
    return responses.long;
  }

  return responses.default;
};

// Export a default service instance
let serviceInstance = null;

export const getClaudeService = () => {
  if (!serviceInstance) {
    serviceInstance = createClaudeService();
  }
  return serviceInstance;
};

// For testing - allow service reset
export const resetClaudeService = () => {
  serviceInstance = null;
};

export default getClaudeService;
