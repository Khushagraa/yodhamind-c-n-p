/**
 * api/middleware/auth.js — JWT Authentication Middleware
 * ════════════════════════════════════════════════════════
 *
 * Provides three middleware functions:
 *
 *   authenticate        — requires a valid JWT, attaches req.user
 *   optionalAuth        — attaches req.user if token present, never blocks
 *   requireRole(roles)  — gates a route to specific roles
 *
 * Token format:
 *   Authorization: Bearer <jwt>
 *
 * JWT payload shape:
 *   {
 *     sub:   string   // user UUID
 *     email: string
 *     role:  'student' | 'psychologist' | 'admin'
 *     iat:   number
 *     exp:   number
 *   }
 *
 * Usage:
 *   const { authenticate, requireRole } = require('../middleware/auth');
 *
 *   router.get('/me',            authenticate, handler);
 *   router.get('/admin/stats',   authenticate, requireRole(['admin']), handler);
 *   router.get('/public-feed',   optionalAuth, handler);
 */

'use strict';

const jwt = require('jsonwebtoken');

/* ── Config ──────────────────────────────────── */
const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_OPTIONS = {
  algorithms: ['HS256'],
  issuer:     'yodhamind',
  audience:   'yodhamind-client'
};

if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.error('[auth] FATAL: JWT_SECRET is not set. Authentication will fail.');
}

/* ── Helper: extract raw token from request ──── */
function extractToken(req) {
  // 1. Authorization header  (preferred)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Cookie fallback  (ym_token — for pages that use cookie-based auth)
  if (req.cookies && req.cookies.ym_token) {
    return req.cookies.ym_token;
  }

  return null;
}

/* ── Helper: build a clean error response ─────── */
function authError(res, status, code, message) {
  return res.status(status).json({
    ok:    false,
    error: { code, message }
  });
}

/* ════════════════════════════════════════════════
   authenticate
   Requires a valid JWT. Returns 401/403 on failure.
   On success attaches req.user = { id, email, role }.
════════════════════════════════════════════════ */
function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return authError(res, 401, 'NO_TOKEN',
      'Authentication required. Please include a Bearer token.');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);

    // Attach a clean user object — never the full payload
    req.user = {
      id:    payload.sub,
      email: payload.email,
      role:  payload.role
    };

    return next();

  } catch (err) {
    // Distinguish between expired and malformed tokens
    if (err.name === 'TokenExpiredError') {
      return authError(res, 401, 'TOKEN_EXPIRED',
        'Session expired. Please log in again.');
    }

    if (err.name === 'JsonWebTokenError') {
      return authError(res, 401, 'TOKEN_INVALID',
        'Invalid token. Please log in again.');
    }

    // Unexpected error — log and return 500
    console.error('[auth] jwt.verify unexpected error:', err.message);
    return authError(res, 500, 'AUTH_ERROR',
      'Authentication check failed. Please try again.');
  }
}

/* ════════════════════════════════════════════════
   optionalAuth
   Attaches req.user if a valid token is present.
   Never blocks the request — used for public routes
   that behave differently for logged-in users.
════════════════════════════════════════════════ */
function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
    req.user = {
      id:    payload.sub,
      email: payload.email,
      role:  payload.role
    };
  } catch {
    // Invalid / expired token — treat as unauthenticated
    req.user = null;
  }

  return next();
}

/* ════════════════════════════════════════════════
   requireRole(roles)
   Factory that returns middleware enforcing
   that req.user.role is in the allowed roles array.

   Must be used AFTER authenticate:
     router.delete('/post/:id',
       authenticate,
       requireRole(['admin']),
       deletePostHandler
     );
════════════════════════════════════════════════ */
function requireRole(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error('[auth] requireRole() must receive a non-empty array of roles');
  }

  return function roleGuard(req, res, next) {
    // authenticate() should have run first
    if (!req.user) {
      return authError(res, 401, 'NO_TOKEN',
        'Authentication required.');
    }

    if (!roles.includes(req.user.role)) {
      return authError(res, 403, 'FORBIDDEN',
        `Access restricted to: ${roles.join(', ')}.`);
    }

    return next();
  };
}

/* ════════════════════════════════════════════════
   generateTokens
   Utility used by the auth route to create
   access + refresh token pairs.

   @param {{ id, email, role }} user
   @returns {{ accessToken, refreshToken, expiresIn }}
════════════════════════════════════════════════ */
function generateTokens(user) {
  const accessToken = jwt.sign(
    {
      sub:   user.id,
      email: user.email,
      role:  user.role
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer:    'yodhamind',
      audience:  'yodhamind-client',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );

  // Refresh token carries only the subject — minimal payload
  const refreshToken = jwt.sign(
    { sub: user.id },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer:    'yodhamind',
      audience:  'yodhamind-client',
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
    }
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: 7 * 24 * 60 * 60   // seconds — 7 days
  };
}

/* ════════════════════════════════════════════════
   decodeToken
   Decodes without verification — for logging /
   debugging only. Never use for auth decisions.
════════════════════════════════════════════════ */
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  generateTokens,
  decodeToken
};
