// Unit tests for output-parser utility functions

import { test, expect, describe } from 'bun:test';
import {
  parseClaudeJsonOutput,
  processStreamChunk,
  formatOutputChunk,
  addJobPrefix,
  buildClaudeArgs
} from '../../../utils/output-parser.js';

describe('output-parser utilities', () => {
  describe('parseClaudeJsonOutput', () => {
    test('should extract text from valid Claude JSON output', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello, world!' }
          ]
        }
      });
      
      const result = parseClaudeJsonOutput(jsonLine);
      expect(result).toBe('Hello, world!');
    });

    test('should handle multiple text content items', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello, ' },
            { type: 'text', text: 'world!' }
          ]
        }
      });
      
      const result = parseClaudeJsonOutput(jsonLine);
      expect(result).toBe('Hello, world!');
    });

    test('should filter out non-text content types when text is first', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Found results' },
            { type: 'tool_use', id: '123', name: 'search' },
            { type: 'image', url: 'http://example.com/image.png' }
          ]
        }
      });
      
      const result = parseClaudeJsonOutput(jsonLine);
      expect(result).toBe('Found results');
    });

    test('should return null when first content item is not text', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: '123', name: 'search' },
            { type: 'text', text: 'Found results' },
            { type: 'image', url: 'http://example.com/image.png' }
          ]
        }
      });
      
      const result = parseClaudeJsonOutput(jsonLine);
      expect(result).toBe(null);
    });

    test('should return null for non-assistant messages', () => {
      const jsonLine = JSON.stringify({
        type: 'human',
        message: {
          content: [
            { type: 'text', text: 'User input' }
          ]
        }
      });
      
      const result = parseClaudeJsonOutput(jsonLine);
      expect(result).toBe(null);
    });

    test('should return null for messages without text content', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: '123', name: 'search' }
          ]
        }
      });
      
      const result = parseClaudeJsonOutput(jsonLine);
      expect(result).toBe(null);
    });

    test('should return null for malformed message structure', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          // Missing content
        }
      });
      
      const result = parseClaudeJsonOutput(jsonLine);
      expect(result).toBe(null);
    });

    test('should return plain text for invalid JSON', () => {
      const plainText = 'This is not JSON';
      const result = parseClaudeJsonOutput(plainText);
      expect(result).toBe(plainText);
    });

    test('should handle empty string input', () => {
      const result = parseClaudeJsonOutput('');
      expect(result).toBe('');
    });

    test('should handle single content item structure', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Single item' }
          ]
        }
      });
      
      const result = parseClaudeJsonOutput(jsonLine);
      expect(result).toBe('Single item');
    });

    test('should handle empty text content', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '' }
          ]
        }
      });
      
      const result = parseClaudeJsonOutput(jsonLine);
      expect(result).toBe('');
    });
  });

  describe('processStreamChunk', () => {
    test('should process complete lines from stream', () => {
      const buffer = '';
      const newChunk = 'line1\nline2\nline3';
      
      const result = processStreamChunk(buffer, newChunk);
      
      expect(result.lines).toEqual(['line1', 'line2']);
      expect(result.buffer).toBe('line3');
    });

    test('should append to existing buffer', () => {
      const buffer = 'incomplete';
      const newChunk = ' line\nnew line\n';
      
      const result = processStreamChunk(buffer, newChunk);
      
      expect(result.lines).toEqual(['incomplete line', 'new line']);
      expect(result.buffer).toBe('');
    });

    test('should filter out empty lines', () => {
      const buffer = '';
      const newChunk = 'line1\n\n\nline2\n\nline3';
      
      const result = processStreamChunk(buffer, newChunk);
      
      expect(result.lines).toEqual(['line1', 'line2']);
      expect(result.buffer).toBe('line3');
    });

    test('should handle chunk with only newlines', () => {
      const buffer = '';
      const newChunk = '\n\n\n';
      
      const result = processStreamChunk(buffer, newChunk);
      
      expect(result.lines).toEqual([]);
      expect(result.buffer).toBe('');
    });

    test('should preserve whitespace in lines', () => {
      const buffer = '';
      const newChunk = '  spaced line  \n\t\ttabbed line\t\n';
      
      const result = processStreamChunk(buffer, newChunk);
      
      expect(result.lines).toEqual(['  spaced line  ', '\t\ttabbed line\t']);
      expect(result.buffer).toBe('');
    });

    test('should handle empty chunk', () => {
      const buffer = 'existing';
      const newChunk = '';
      
      const result = processStreamChunk(buffer, newChunk);
      
      expect(result.lines).toEqual([]);
      expect(result.buffer).toBe('existing');
    });

    test('should handle chunk ending with newline', () => {
      const buffer = '';
      const newChunk = 'complete line\n';
      
      const result = processStreamChunk(buffer, newChunk);
      
      expect(result.lines).toEqual(['complete line']);
      expect(result.buffer).toBe('');
    });
  });

  describe('formatOutputChunk', () => {
    test('should format output chunk with all properties', () => {
      const text = 'Test output';
      const type = 'stdout';
      const jobId = 'job_123';
      
      const result = formatOutputChunk(text, type, jobId);
      
      expect(result.text).toBe(text);
      expect(result.type).toBe(type);
      expect(result.jobId).toBe(jobId);
      expect(result.timestamp).toBeTypeOf('number');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    test('should use default type when not provided', () => {
      const text = 'Test output';
      const jobId = 'job_123';
      
      const result = formatOutputChunk(text, undefined, jobId);
      
      expect(result.type).toBe('stdout');
    });

    test('should handle different output types', () => {
      const text = 'Error occurred';
      const type = 'stderr';
      const jobId = 'job_123';
      
      const result = formatOutputChunk(text, type, jobId);
      
      expect(result.type).toBe('stderr');
    });

    test('should handle empty text', () => {
      const text = '';
      const type = 'system';
      const jobId = 'job_123';
      
      const result = formatOutputChunk(text, type, jobId);
      
      expect(result.text).toBe('');
      expect(result.type).toBe('system');
    });

    test('should generate unique timestamps', async () => {
      const chunk1 = formatOutputChunk('text1', 'stdout', 'job1');
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      const chunk2 = formatOutputChunk('text2', 'stdout', 'job2');
      
      expect(chunk2.timestamp).toBeGreaterThan(chunk1.timestamp);
    });
  });

  describe('addJobPrefix', () => {
    test('should add job prefix to single line', () => {
      const text = 'Hello world';
      const jobId = 'job_1234567890abcdef';
      
      const result = addJobPrefix(text, jobId);
      
      expect(result).toBe('[90abcdef] Hello world');
    });

    test('should add job prefix to multiple lines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const jobId = 'job_1234567890abcdef';
      
      const result = addJobPrefix(text, jobId);
      
      expect(result).toBe('[90abcdef] Line 1\n[90abcdef] Line 2\n[90abcdef] Line 3');
    });

    test('should handle empty lines without prefix', () => {
      const text = 'Line 1\n\nLine 3';
      const jobId = 'job_1234567890abcdef';
      
      const result = addJobPrefix(text, jobId);
      
      expect(result).toBe('[90abcdef] Line 1\n\n[90abcdef] Line 3');
    });

    test('should add additional prefix when provided', () => {
      const text = 'Error message';
      const jobId = 'job_1234567890abcdef';
      const prefix = 'ERROR:';
      
      const result = addJobPrefix(text, jobId, prefix);
      
      expect(result).toBe('[90abcdef] ERROR: Error message');
    });

    test('should handle job ID shorter than 8 characters', () => {
      const text = 'Short ID test';
      const jobId = 'job123';
      
      const result = addJobPrefix(text, jobId);
      
      expect(result).toBe('[job123] Short ID test');
    });

    test('should handle exactly 8 character job ID', () => {
      const text = 'Exact length test';
      const jobId = 'job12345';
      
      const result = addJobPrefix(text, jobId);
      
      expect(result).toBe('[job12345] Exact length test');
    });

    test('should handle empty text', () => {
      const text = '';
      const jobId = 'job_1234567890abcdef';
      
      const result = addJobPrefix(text, jobId);
      
      expect(result).toBe('');
    });

    test('should handle text with only newlines', () => {
      const text = '\n\n';
      const jobId = 'job_1234567890abcdef';
      
      const result = addJobPrefix(text, jobId);
      
      expect(result).toBe('\n\n');
    });
  });

  describe('buildClaudeArgs', () => {
    test('should build args with model option', () => {
      const options = { model: 'claude-3-haiku' };
      
      const result = buildClaudeArgs(options);
      
      expect(result).toEqual(['--model', 'claude-3-haiku']);
    });

    test('should build args with allowed tools', () => {
      const options = { allowedTools: ['file', 'web', 'terminal'] };
      
      const result = buildClaudeArgs(options);
      
      expect(result).toEqual(['--allowedTools', 'file,web,terminal']);
    });

    test('should build args with disallowed tools', () => {
      const options = { disallowedTools: ['dangerous', 'restricted'] };
      
      const result = buildClaudeArgs(options);
      
      expect(result).toEqual(['--disallowedTools', 'dangerous,restricted']);
    });

    test('should build args with add directories', () => {
      const options = { addDirs: ['/path/to/dir1', '/path/to/dir2'] };
      
      const result = buildClaudeArgs(options);
      
      expect(result).toEqual(['--add-dir', '/path/to/dir1', '--add-dir', '/path/to/dir2']);
    });

    test('should build args with all options', () => {
      const options = {
        model: 'claude-3-sonnet',
        allowedTools: ['file', 'web'],
        disallowedTools: ['terminal'],
        addDirs: ['/project']
      };
      
      const result = buildClaudeArgs(options);
      
      expect(result).toEqual([
        '--model', 'claude-3-sonnet',
        '--allowedTools', 'file,web',
        '--disallowedTools', 'terminal',
        '--add-dir', '/project'
      ]);
    });

    test('should handle empty options', () => {
      const options = {};
      
      const result = buildClaudeArgs(options);
      
      expect(result).toEqual([]);
    });

    test('should handle undefined options', () => {
      const result = buildClaudeArgs();
      
      expect(result).toEqual([]);
    });

    test('should handle empty arrays', () => {
      const options = {
        allowedTools: [],
        disallowedTools: [],
        addDirs: []
      };
      
      const result = buildClaudeArgs(options);
      
      expect(result).toEqual([]);
    });

    test('should handle single item arrays', () => {
      const options = {
        allowedTools: ['file'],
        disallowedTools: ['terminal'],
        addDirs: ['/single/dir']
      };
      
      const result = buildClaudeArgs(options);
      
      expect(result).toEqual([
        '--allowedTools', 'file',
        '--disallowedTools', 'terminal',
        '--add-dir', '/single/dir'
      ]);
    });
  });
});