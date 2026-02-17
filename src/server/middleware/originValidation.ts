/**
 * Origin Validation Middleware
 *
 * Enforces Origin header checks per MCP Streamable HTTP transport spec:
 *   https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
 *
 * Security goals:
 *   - Prevent DNS rebinding attacks
 *   - Reject cross-origin requests unless explicitly allowed
 *   - Validate Host header against expected bindings
 *
 * Configurable via ALLOWED_ORIGINS env var (comma-separated).
 * Defaults to localhost origins when MCP_HOST is 127.0.0.1/localhost.
 */

import type { Request, Response, NextFunction } from 'express';
import { LogManager } from '../../utils/LogManager.js';

const logger = LogManager.getInstance();

export interface OriginValidationConfig {
  /** Allowed origins (e.g., ['http://localhost:3000', 'https://app.example.com']) */
  allowedOrigins: string[];
  /** Expected Host header values (e.g., ['localhost:3100', 'mcp.example.com']) */
  allowedHosts: string[];
  /** Skip validation for health/readiness endpoints */
  skipPaths?: string[];
}

/**
 * Build origin validation config from environment variables.
 *
 * ALLOWED_ORIGINS — comma-separated list of allowed origins (default: localhost variants)
 * MCP_HOST / MCP_PORT — used to derive default Host header expectations
 */
export function buildOriginConfig(host: string, port: number): OriginValidationConfig {
  const isLocalhost = host === '127.0.0.1' || host === 'localhost' || host === '::1';

  // Default allowed origins — localhost when bound locally, empty (strict) otherwise
  const defaultOrigins = isLocalhost
    ? [
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
        `http://[::1]:${port}`,
      ]
    : [];

  const envOrigins = process.env.ALLOWED_ORIGINS
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean) ?? [];

  const allowedOrigins = envOrigins.length > 0 ? envOrigins : defaultOrigins;

  // Host header expectations
  const allowedHosts = [
    `${host}:${port}`,
    `localhost:${port}`,
    `127.0.0.1:${port}`,
  ];

  // Also accept without port for standard ports
  if (port === 80 || port === 443) {
    allowedHosts.push(host, 'localhost', '127.0.0.1');
  }

  // Add any custom hosts from env
  const envHosts = process.env.ALLOWED_HOSTS
    ?.split(',')
    .map((h) => h.trim())
    .filter(Boolean) ?? [];
  allowedHosts.push(...envHosts);

  return {
    allowedOrigins,
    allowedHosts,
    skipPaths: ['/health', '/ready'],
  };
}

/**
 * Create Origin + Host validation middleware.
 *
 * For requests with an Origin header:
 *   - Reject if Origin is not in allowedOrigins
 * For all requests:
 *   - Validate Host header against allowedHosts (when configured)
 */
export function createOriginValidationMiddleware(config: OriginValidationConfig) {
  const { allowedOrigins, allowedHosts, skipPaths = [] } = config;
  const skipSet = new Set(skipPaths);

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip validation for health endpoints
    if (skipSet.has(req.path)) {
      next();
      return;
    }

    // ── Origin header check ──────────────────────────────────────────────
    const origin = req.headers.origin;
    if (origin) {
      if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
        logger.warn('OriginValidation', `Rejected Origin: ${origin} (allowed: ${allowedOrigins.join(', ')})`);
        res.status(403).json({ error: 'Origin not allowed' });
        return;
      }
    }

    // ── Host header check (DNS rebinding protection) ─────────────────────
    const hostHeader = req.headers.host;
    if (hostHeader && allowedHosts.length > 0 && !allowedHosts.includes(hostHeader)) {
      logger.warn('OriginValidation', `Rejected Host: ${hostHeader} (allowed: ${allowedHosts.join(', ')})`);
      res.status(403).json({ error: 'Host not allowed' });
      return;
    }

    next();
  };
}
