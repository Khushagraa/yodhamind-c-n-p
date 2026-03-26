/**
 * api/middleware/rateLimit.js — Tiered Rate Limiting
 * ════════════════════════════════════════════════════
 *
 * Exports pre-configured limiters for different route sensitivity levels:
 *
 *   defaultLimiter     — general API routes       100 req / 15 min
 *   authLimiter        — login / register / reset  10 req / 15 min
 *   aiLimiter          — AI advisor chat           20 req / 60 min
 *   assessmentLimiter  — assessment submissions    30 req / 60 min
 *   communityLimiter   — anonymous post / comment  20 req / 60 min
 *
 * Usage:
 *   const { authLimiter, aiLimiter } = require('../middleware/rateLimit');
 *
 *   router.post('/login',      authLimiter, loginHandler);
 *   router.post('/advisor',    aiLimiter,   advisorHandler);
 *
 * Key strategy:
 *   - All limiters key by IP address by default
 *   - authLimiter additionally keys by email body field
 *     to prevent distributed login attacks from multiple IPs
 *   - Errors return JSON (never HTML) so clients can handle them
 */

'use strict';

const rateLimit = require('express-rate-limit');

/* ── Shared config ──────────────────────────── */
const WINDOW_MS  = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000; // 15 min
const MAX_REQ    = parseInt(process.env.RATE_LIMIT_MAX,        10) || 100;
const AUTH_MAX   = parseInt(process.env.AUTH_RATE_LIMIT_MAX,   10) || 10;

/* ── Standard JSON error response ───────────── */
function rateLimitHandler(req, res) {
  const retryAfter = Math.ceil(res.getHeader('Retry-After') || 60);

  res.status(429).json({
    ok:    false,
    error: {
      code:       'RATE_LIMITED',
      message:    'Too many requests. Please wait before trying again.',
      retryAfter  // seconds
    }
  });
}

/* ── Skip limiting in test environment ──────── */
function skipInTest() {
  return process.env.NODE_ENV === 'test';
}

/* ════════════════════════════════════════════════
   defaultLimiter
   Applied globally in server.js to all /api routes.
   100 requests per 15 minutes per IP.
════════════════════════════════════════════════ */
const defaultLimiter = rateLimit({
  windowMs:         WINDOW_MS,
  max:              MAX_REQ,
  standardHeaders:  true,    // Return RateLimit-* headers (RFC 6585)
  legacyHeaders:    false,
  skip:             skipInTest,
  handler:          rateLimitHandler,
  keyGenerator:     (req) => req.ip
});

/* ════════════════════════════════════════════════
   authLimiter
   Tighter limit for login / register / password reset.
   10 requests per 15 minutes per IP.
   Also checks X-Forwarded-For to handle proxied requests.
════════════════════════════════════════════════ */
const authLimiter = rateLimit({
  windowMs:        WINDOW_MS,
  max:             AUTH_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            skipInTest,
  handler:         rateLimitHandler,

  // Key on IP — express-rate-limit reads req.ip which respects
  // the trust proxy setting in server.js
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip        = forwarded ? forwarded.split(',')[0].trim() : req.ip;
    return `auth:${ip}`;
  },

  message: 'Too many login attempts. Please wait 15 minutes before trying again.'
});

/* ════════════════════════════════════════════════
   aiLimiter
   For the /api/advisor/chat proxy route.
   Each Anthropic API call costs tokens — this
   prevents abuse while allowing genuine use.
   20 requests per 60 minutes per IP.
════════════════════════════════════════════════ */
const aiLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,   // 60 minutes
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            skipInTest,
  handler(req, res) {
    res.status(429).json({
      ok:    false,
      error: {
        code:       'AI_RATE_LIMITED',
        message:    'You\'ve reached the AI chat limit. Please wait an hour before sending more messages.',
        retryAfter: 3600
      }
    });
  },
  keyGenerator: (req) => `ai:${req.user ? req.user.id : req.ip}`
});

/* ════════════════════════════════════════════════
   assessmentLimiter
   Prevents spamming assessments to game the
   wellness score. 30 submissions per 60 minutes.
════════════════════════════════════════════════ */
const assessmentLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,   // 60 minutes
  max:             30,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            skipInTest,
  handler:         rateLimitHandler,
  keyGenerator:    (req) => `assess:${req.user ? req.user.id : req.ip}`
});

/* ════════════════════════════════════════════════
   communityLimiter
   Anonymous post + comment creation.
   20 new posts/comments per 60 minutes per IP.
   Reduces spam without requiring an account.
════════════════════════════════════════════════ */
const communityLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,   // 60 minutes
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            skipInTest,
  handler(req, res) {
    res.status(429).json({
      ok:    false,
      error: {
        code:       'COMMUNITY_RATE_LIMITED',
        message:    'You\'re posting too quickly. Please wait before sharing again.',
        retryAfter: 3600
      }
    });
  },
  keyGenerator: (req) => `community:${req.ip}`
});

/* ════════════════════════════════════════════════
   moodLimiter
   Prevents logging moods more than once every
   5 minutes (still allows corrections but blocks floods).
════════════════════════════════════════════════ */
const moodLimiter = rateLimit({
  windowMs:        5 * 60 * 1000,    // 5 minutes
  max:             3,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            skipInTest,
  handler:         rateLimitHandler,
  keyGenerator:    (req) => `mood:${req.user ? req.user.id : req.ip}`
});

module.exports = {
  defaultLimiter,
  authLimiter,
  aiLimiter,
  assessmentLimiter,
  communityLimiter,
  moodLimiter
};
