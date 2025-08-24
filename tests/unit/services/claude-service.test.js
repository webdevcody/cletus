// Unit tests for Claude service mock behavior

import { test, expect, describe, beforeEach } from 'bun:test';
import { createClaudeService, resetClaudeService } from '../../../api/services/claude-service.js';

describe('claude service mock behavior', () => {
  let claudeService;

  beforeEach(() => {
    resetClaudeService();
    claudeService = createClaudeService({ mockMode: true });
  });

  describe('service creation and configuration', () => {
    test('should create mock service when mockMode is true', () => {
      const mockService = createClaudeService({ mockMode: true });
      const config = mockService.getConfig();
      
      expect(config.mockMode).toBe(true);
      expect(config.executable).toBe('mock');
    });

    test('should create real service when mockMode is false', () => {
      const realService = createClaudeService({ mockMode: false });
      const config = realService.getConfig();
      
      expect(config.mockMode).toBe(false);
      expect(config.executable).not.toBe('mock');
    });

    test('should default to config setting when mockMode not specified', () => {
      const service = createClaudeService();
      const config = service.getConfig();
      
      // Should use the config default (which is likely true in test environment)
      expect(config.mockMode).toBeTypeOf('boolean');
    });
  });

  describe('mock service availability', () => {
    test('should always return true for isAvailable', async () => {
      const available = await claudeService.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('mock process creation', () => {
    test('should create mock process with basic prompt', async () => {
      const prompt = 'Hello, Claude!';
      const process = await claudeService.startProcess(prompt);
      
      expect(process).toBeDefined();
      expect(process.process).toBeDefined();
      expect(process.stdout).toBeDefined();
      expect(process.stderr).toBeDefined();
      expect(process.exited).toBeDefined();
      expect(process.kill).toBeTypeOf('function');
      expect(process.metadata).toBeDefined();
    });

    test('should include metadata in process handle', async () => {
      const prompt = 'Test prompt';
      const options = { model: 'claude-3-haiku' };
      const process = await claudeService.startProcess(prompt, options);
      
      expect(process.metadata.model).toBe('claude-3-haiku');
      expect(process.metadata.startedAt).toBeTypeOf('number');
      expect(process.metadata.prompt).toBe(prompt.substring(0, 100));
      expect(process.metadata.mockMode).toBe(true);
    });

    test('should truncate long prompts in metadata', async () => {
      const longPrompt = 'a'.repeat(200);
      const process = await claudeService.startProcess(longPrompt);
      
      expect(process.metadata.prompt).toHaveLength(100);
      expect(process.metadata.prompt).toBe(longPrompt.substring(0, 100));
    });

    test('should use default model when not specified', async () => {
      const process = await claudeService.startProcess('test');
      
      // Should use config default model
      expect(process.metadata.model).toBeTypeOf('string');
      expect(process.metadata.model.length).toBeGreaterThan(0);
    });
  });

  describe('mock response selection', () => {
    test('should return default response for normal prompt', async () => {
      const process = await claudeService.startProcess('Write a hello world program');
      
      // Consume stdout to see the response
      const chunks = [];
      for await (const chunk of process.stdout) {
        chunks.push(new TextDecoder().decode(chunk));
      }
      
      const output = chunks.join('');
      expect(output).toContain('This is a mock response from Claude');
      expect(output).toContain('Processing your request');
      expect(output).toContain('Task completed successfully');
    });

    test('should return error response for error-related prompts', async () => {
      const process = await claudeService.startProcess('This will fail with an error');
      
      // Should get error response
      const stderrChunks = [];
      for await (const chunk of process.stderr) {
        stderrChunks.push(new TextDecoder().decode(chunk));
      }
      
      const errorOutput = stderrChunks.join('');
      expect(errorOutput).toContain('Something went wrong');
      
      // Should exit with error code
      const exitCode = await process.exited;
      expect(exitCode).toBe(1);
    });

    test('should return long response for complex prompts', async () => {
      const process = await claudeService.startProcess('This is a long complex task');
      
      const chunks = [];
      for await (const chunk of process.stdout) {
        chunks.push(new TextDecoder().decode(chunk));
      }
      
      const output = chunks.join('');
      
      // Should contain multiple processing steps
      for (let i = 1; i <= 10; i++) {
        expect(output).toContain(`Processing step ${i}/10`);
      }
    });

    test('should handle prompts with fail keyword', async () => {
      const process = await claudeService.startProcess('This will fail spectacularly');
      
      const exitCode = await process.exited;
      expect(exitCode).toBe(1);
    });
  });

  describe('mock stream behavior', () => {
    test('should provide async iterable stdout stream', async () => {
      const process = await claudeService.startProcess('test');
      
      let chunkCount = 0;
      for await (const chunk of process.stdout) {
        expect(chunk).toBeInstanceOf(Uint8Array);
        chunkCount++;
      }
      
      expect(chunkCount).toBeGreaterThan(0);
    });

    test('should provide async iterable stderr stream', async () => {
      const process = await claudeService.startProcess('error test');
      
      let errorChunkCount = 0;
      for await (const chunk of process.stderr) {
        expect(chunk).toBeInstanceOf(Uint8Array);
        errorChunkCount++;
      }
      
      expect(errorChunkCount).toBeGreaterThan(0);
    });

    test('should handle empty stderr for successful processes', async () => {
      const process = await claudeService.startProcess('successful task');
      
      let errorChunkCount = 0;
      for await (const chunk of process.stderr) {
        errorChunkCount++;
      }
      
      expect(errorChunkCount).toBe(0);
    });

    test('should simulate delay between chunks', async () => {
      const startTime = Date.now();
      const process = await claudeService.startProcess('test');
      
      let chunkTimes = [];
      for await (const chunk of process.stdout) {
        chunkTimes.push(Date.now() - startTime);
      }
      
      // Should have some delay between chunks
      if (chunkTimes.length > 1) {
        expect(chunkTimes[1] - chunkTimes[0]).toBeGreaterThan(0);
      }
    });
  });

  describe('mock process lifecycle', () => {
    test('should resolve exited promise with success code', async () => {
      const process = await claudeService.startProcess('successful task');
      
      // Consume streams
      for await (const chunk of process.stdout) {}
      for await (const chunk of process.stderr) {}
      
      const exitCode = await process.exited;
      expect(exitCode).toBe(0);
    });

    test('should resolve exited promise with error code for failed tasks', async () => {
      const process = await claudeService.startProcess('error task');
      
      // Consume streams
      for await (const chunk of process.stdout) {}
      for await (const chunk of process.stderr) {}
      
      const exitCode = await process.exited;
      expect(exitCode).toBe(1);
    });

    test('should handle process kill', async () => {
      const process = await claudeService.startProcess('test');
      
      const killResult = process.kill('SIGTERM');
      expect(killResult).toBe(true);
    });

    test('should handle process kill with different signals', async () => {
      const process = await claudeService.startProcess('test');
      
      const killResult = process.kill('SIGKILL');
      expect(killResult).toBe(true);
    });

    test('should handle default kill signal', async () => {
      const process = await claudeService.startProcess('test');
      
      const killResult = process.kill();
      expect(killResult).toBe(true);
    });
  });

  describe('concurrent mock processes', () => {
    test('should handle multiple concurrent processes', async () => {
      const prompts = ['task1', 'task2', 'task3'];
      const processes = [];
      
      // Create processes with slight delays to ensure different timestamps
      for (let i = 0; i < prompts.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1)); // 1ms delay
        const process = await claudeService.startProcess(prompts[i]);
        processes.push(process);
      }
      
      expect(processes).toHaveLength(3);
      
      // All should be valid processes
      for (const process of processes) {
        expect(process.metadata.startedAt).toBeTypeOf('number');
        expect(process.stdout).toBeDefined();
        expect(process.stderr).toBeDefined();
        expect(process.exited).toBeDefined();
      }
    });

    test('should handle concurrent stream consumption', async () => {
      const process1 = await claudeService.startProcess('concurrent task 1');
      const process2 = await claudeService.startProcess('concurrent task 2');
      
      const results = await Promise.allSettled([
        (async () => {
          const chunks = [];
          for await (const chunk of process1.stdout) {
            chunks.push(chunk);
          }
          return chunks;
        })(),
        (async () => {
          const chunks = [];
          for await (const chunk of process2.stdout) {
            chunks.push(chunk);
          }
          return chunks;
        })()
      ]);
      
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
    });
  });

  describe('error handling', () => {
    test('should handle malformed prompts gracefully', async () => {
      const process = await claudeService.startProcess('');
      
      expect(process).toBeDefined();
      expect(process.metadata.prompt).toBe('');
    });

    test('should handle null/undefined prompts', async () => {
      const process1 = await claudeService.startProcess(null);
      const process2 = await claudeService.startProcess(undefined);
      
      expect(process1).toBeDefined();
      expect(process2).toBeDefined();
    });

    test('should handle options with undefined values', async () => {
      const options = {
        model: undefined,
        workingDirectory: null,
        env: {}
      };
      
      const process = await claudeService.startProcess('test', options);
      expect(process).toBeDefined();
    });
  });

  describe('response format validation', () => {
    test('should generate valid JSON responses', async () => {
      const process = await claudeService.startProcess('test');
      
      const chunks = [];
      for await (const chunk of process.stdout) {
        chunks.push(new TextDecoder().decode(chunk));
      }
      
      const output = chunks.join('');
      const lines = output.split('\n').filter(line => line.trim());
      
      // Each non-empty line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
        
        const parsed = JSON.parse(line);
        expect(parsed.type).toBe('assistant');
        expect(parsed.message).toBeDefined();
        expect(parsed.message.content).toBeInstanceOf(Array);
        expect(parsed.message.content[0].type).toBe('text');
        expect(parsed.message.content[0].text).toBeTypeOf('string');
      }
    });

    test('should handle different response types consistently', async () => {
      const prompts = ['normal', 'error test', 'long complex task'];
      
      for (const prompt of prompts) {
        const process = await claudeService.startProcess(prompt);
        
        const chunks = [];
        for await (const chunk of process.stdout) {
          chunks.push(new TextDecoder().decode(chunk));
        }
        
        const output = chunks.join('');
        if (output.trim()) {
          const lines = output.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            const parsed = JSON.parse(line);
            expect(parsed.type).toBe('assistant');
            expect(parsed.message.content[0].type).toBe('text');
          }
        }
      }
    });
  });

  describe('integration with other components', () => {
    test('should work with output parser utility', async () => {
      const { parseClaudeJsonOutput } = await import('../../../api/utils/output-parser.js');
      const process = await claudeService.startProcess('test integration');
      
      const chunks = [];
      for await (const chunk of process.stdout) {
        chunks.push(new TextDecoder().decode(chunk));
      }
      
      const output = chunks.join('');
      const lines = output.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const humanText = parseClaudeJsonOutput(line);
        expect(humanText).toBeTypeOf('string');
        expect(humanText.length).toBeGreaterThan(0);
      }
    });

    test('should provide consistent timing for job processing', async () => {
      const startTime = Date.now();
      const process = await claudeService.startProcess('timing test');
      
      // Consume all output
      for await (const chunk of process.stdout) {}
      for await (const chunk of process.stderr) {}
      
      await process.exited;
      const endTime = Date.now();
      
      // Should complete in reasonable time
      const duration = endTime - startTime;
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10000); // Less than 10 seconds
    });
  });
});