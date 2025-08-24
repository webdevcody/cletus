// CORS middleware for Cletus API

/**
 * CORS middleware for enabling cross-origin requests
 * Specifically configured for browser extension requests
 * @param {Object} options - CORS configuration options
 * @returns {Function} Hono middleware function
 */
export const corsMiddleware = (options = {}) => {
  const config = {
    origin: options.origin || '*',
    methods: options.methods || 'GET, POST, DELETE, OPTIONS',
    headers: options.headers || 'Content-Type, Authorization',
    credentials: options.credentials || false,
    maxAge: options.maxAge || 86400, // 24 hours
    ...options
  };
  
  return async (c, next) => {
    // Set CORS headers
    c.header('Access-Control-Allow-Origin', config.origin);
    c.header('Access-Control-Allow-Methods', config.methods);
    c.header('Access-Control-Allow-Headers', config.headers);
    
    if (config.credentials) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }
    
    if (config.maxAge) {
      c.header('Access-Control-Max-Age', config.maxAge.toString());
    }
    
    // Handle preflight OPTIONS requests
    if (c.req.method === 'OPTIONS') {
      return c.text('', 204);
    }
    
    await next();
  };
};

/**
 * Default CORS middleware configured for browser extensions
 */
export const defaultCorsMiddleware = corsMiddleware({
  origin: '*',
  methods: 'GET, POST, DELETE, OPTIONS',
  headers: 'Content-Type, Authorization, X-Requested-With',
  credentials: false
});

export default defaultCorsMiddleware;