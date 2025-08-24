// Claude output parsing utilities

/**
 * Parse JSON output from Claude to extract human-readable text content
 * @param {string} jsonLine - JSON line from Claude output
 * @returns {string|null} Extracted human text or null if not found
 */
export const parseClaudeJsonOutput = (jsonLine) => {
  try {
    const parsed = JSON.parse(jsonLine);

    if (
      parsed.type === 'assistant' &&
      parsed.message?.content?.[0]?.type === 'text'
    ) {
      if (Array.isArray(parsed.message.content)) {
        return parsed.message.content
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('');
      } else if (parsed.message.content[0].text) {
        return parsed.message.content[0].text;
      }
    }

    return null; // No human text content found
  } catch (error) {
    // Not valid JSON, might be plain text - return as is
    return jsonLine;
  }
};

/**
 * Process a stream of output chunks and extract complete lines
 * @param {string} buffer - Current buffer content
 * @param {string} newChunk - New chunk to add
 * @returns {Object} Object with lines array and remaining buffer
 */
export const processStreamChunk = (buffer, newChunk) => {
  const fullText = buffer + newChunk;
  const lines = fullText.split('\n');
  const remainingBuffer = lines.pop() || ''; // Keep incomplete line in buffer
  
  return {
    lines: lines.filter(line => line.trim()), // Filter out empty lines
    buffer: remainingBuffer
  };
};

/**
 * Format output chunk for storage
 * @param {string} text - Text content
 * @param {string} type - Type of output (stdout, stderr, error, system)
 * @param {string} jobId - Job ID
 * @returns {Object} Formatted output chunk
 */
export const formatOutputChunk = (text, type = 'stdout', jobId) => {
  return {
    text,
    type,
    timestamp: Date.now(),
    jobId
  };
};

/**
 * Add job ID prefix to output lines
 * @param {string} text - Text to prefix
 * @param {string} jobId - Job ID (will use last 8 chars)
 * @param {string} prefix - Additional prefix (e.g., 'ERROR:')
 * @returns {string} Prefixed text
 */
export const addJobPrefix = (text, jobId, prefix = '') => {
  const shortId = jobId.slice(-8);
  const fullPrefix = prefix ? `[${shortId}] ${prefix} ` : `[${shortId}] `;
  
  return text
    .split('\n')
    .map((line) => line ? fullPrefix + line : line)
    .join('\n');
};

/**
 * Parse Claude command options into arguments array
 * @param {Object} options - Command options
 * @returns {Array} Array of command arguments
 */
export const buildClaudeArgs = (options = {}) => {
  const args = [];
  
  if (options.model) {
    args.push('--model', options.model);
  }
  
  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push('--allowedTools', options.allowedTools.join(','));
  }
  
  if (options.disallowedTools && options.disallowedTools.length > 0) {
    args.push('--disallowedTools', options.disallowedTools.join(','));
  }
  
  if (options.addDirs && options.addDirs.length > 0) {
    options.addDirs.forEach((dir) => {
      args.push('--add-dir', dir);
    });
  }
  
  return args;
};