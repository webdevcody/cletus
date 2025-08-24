// GET / - Basic status endpoint

import { Context } from "hono";

/**
 * Basic status endpoint handler
 * @param {Object} options - Dependency injection options
 * @returns {Function} Hono handler function
 */
export const statusEndpoint = (options = {}) => {
  return async (c: Context) => {
    return c.json({
      status: "ok",
      service: "cletus-api",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      message: "Claude job management API is running",
    });
  };
};

export default statusEndpoint;
