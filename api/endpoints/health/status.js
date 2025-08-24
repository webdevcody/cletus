// GET / - Basic status endpoint

/**
 * Basic status endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const statusEndpoint = (options = {}) => {
  return async (c) => {
    return c.json({ 
      status: 'ok',
      service: 'cletus-api',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      message: 'Claude job management API is running'
    });
  };
};

export default statusEndpoint;