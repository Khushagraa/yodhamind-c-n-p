/**
 * api/server.js — YodhaMind API Server
 * ══════════════════════════════════════
 *
 * Express application.
 *
 * Start dev:   npm run dev      (nodemon)
 * Start prod:  npm start        (node)
 * Vercel:      handled automatically via vercel.json build config
 *
 * Base URL:    /api/*
 *
 * Routes mounted:
 *   /api/auth           Authentication (register, login, me, refresh)
 *   /api/mood           Mood logging and trend
 *   /api/assessments    Self-assessment submissions and history
 *   /api/games          Game score submission and leaderboard
 *   /api/psychologists  Browse psychologist profiles
 *   /api/appointments   Booking management
 *   /api/community      Anonymous posts and comments
 *   /api/advisor        Anthropic AI proxy (streamed)
 *   /api/health         Health check (uptime monitoring)
 */

'use strict';

require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const morgan      = require('morgan');

const { defaultLimiter } = require('./middleware/rateLimit');

/* ── Route modules ───────────────────────────── */
const authRoute          = require('./routes/auth');
const moodRoute          = require('./routes/mood');
const assessmentsRoute   = require('./routes/assessments');
const gamesRoute         = require('./routes/games');
const psychologistsRoute = require('./routes/psychologists');
const appointmentsRoute  = require('./routes/appointments');
const communityRoute     = require('./routes/community');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ══════════════════════════════════════════════
   TRUST PROXY
   Required for express-rate-limit to read the
   real client IP behind Vercel / Railway reverse proxy.
══════════════════════════════════════════════ */
app.set('trust proxy', 1);

/* ══════════════════════════════════════════════
   SECURITY HEADERS  (helmet)
══════════════════════════════════════════════ */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],   // allow inline scripts on HTML pages
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https:'],
      connectSrc:  ["'self'", 'https://api.anthropic.com'],  // allow AI advisor calls
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"]
    }
  },
  // Disable X-Powered-By (helmet does this by default)
  hidePoweredBy: true,
  // Force HTTPS in production
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true }
    : false
}));

/* ══════════════════════════════════════════════
   CORS
══════════════════════════════════════════════ */
const corsOrigin = process.env.CORS_ORIGIN || '*';

app.use(cors({
  origin: corsOrigin === '*'
    ? '*'
    : corsOrigin.split(',').map(s => s.trim()),
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: corsOrigin !== '*'
}));

// Handle pre-flight requests
app.options('*', cors());

/* ══════════════════════════════════════════════
   BODY PARSING + COMPRESSION
══════════════════════════════════════════════ */
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

/* ══════════════════════════════════════════════
   LOGGING
══════════════════════════════════════════════ */
if (process.env.NODE_ENV !== 'test') {
  // 'combined' in production (Apache-style), 'dev' in development
  const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(morganFormat));
}

/* ══════════════════════════════════════════════
   GLOBAL RATE LIMIT  (all /api/* routes)
══════════════════════════════════════════════ */
app.use('/api', defaultLimiter);

/* ══════════════════════════════════════════════
   HEALTH CHECK
   Used by Vercel, Railway, UptimeRobot, etc.
══════════════════════════════════════════════ */
app.get('/api/health', (req, res) => {
  res.json({
    ok:          true,
    status:      'healthy',
    environment: process.env.NODE_ENV || 'development',
    timestamp:   new Date().toISOString(),
    version:     process.env.npm_package_version || '1.0.0'
  });
});

/* ══════════════════════════════════════════════
   API ROUTES
══════════════════════════════════════════════ */
app.use('/api/auth',          authRoute);
app.use('/api/mood',          moodRoute);
app.use('/api/assessments',   assessmentsRoute);
app.use('/api/games',         gamesRoute);
app.use('/api/psychologists', psychologistsRoute);
app.use('/api/appointments',  appointmentsRoute);
app.use('/api/community',     communityRoute);

/* ══════════════════════════════════════════════
   AI ADVISOR PROXY
   Proxies requests to Anthropic API so the
   API key stays on the server, never in the browser.
   Supports streaming (SSE).
══════════════════════════════════════════════ */
app.post('/api/advisor/chat', async (req, res) => {
  // Lazy require — only loads if this endpoint is called
  const { authenticate } = require('./middleware/auth');
  const { aiLimiter }    = require('./middleware/rateLimit');

  // Run middleware manually since we can't use router.use here
  authenticate(req, res, async () => {
    aiLimiter(req, res, async () => {
      const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
      const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

      if (!ANTHROPIC_KEY) {
        return res.status(503).json({
          ok:    false,
          error: { code: 'AI_UNAVAILABLE', message: 'AI advisor is not configured.' }
        });
      }

      const { messages, system, max_tokens = 1024 } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(422).json({
          ok:    false,
          error: { code: 'VALIDATION_ERROR', message: 'messages array is required.' }
        });
      }

      // ── CRISIS DETECTION ──
      const userMessage = messages[messages.length - 1]?.content || "";
      if (/(suicide|kill myself|die|end it all|give up on life)/i.test(userMessage)) {
         return res.json({
             content: [{
                 type: 'text',
                 text: "⚠️ **SYSTEM CRISIS ALERT**\n\nI am an AI, but I can see you are in extreme distress. Your life is valuable. Please, stop and call the iCall helpline immediately at **9152987821** or Vandrevala Foundation at **1860-2662-345**. They are available 24/7 to listen without judgment. You do not have to go through this alone."
             }]
         });
      }

      try {
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method:  'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model:      ANTHROPIC_MODEL,
            max_tokens,
            stream:     true,
            system:     system || '',
            messages
          })
        });

        if (!upstream.ok) {
          const errBody = await upstream.text();
          console.error('[advisor] Anthropic error:', upstream.status, errBody);
          return res.status(upstream.status).json({
            ok:    false,
            error: { code: 'AI_ERROR', message: 'AI service returned an error.' }
          });
        }

        // Forward SSE stream to client
        res.setHeader('Content-Type',  'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection',    'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);

          // Flush buffer (important for streaming in Node / Vercel)
          if (res.flush) res.flush();
        }

        res.end();

      } catch (err) {
        console.error('[advisor] fetch error:', err.message);
        // If headers not sent yet, return JSON error
        if (!res.headersSent) {
          return res.status(502).json({
            ok:    false,
            error: { code: 'AI_UPSTREAM_ERROR', message: 'Could not reach AI service.' }
          });
        }
        // If already streaming, just end
        res.end();
      }
    });
  });
});

/* ══════════════════════════════════════════════
   404 — Unknown API routes
══════════════════════════════════════════════ */
app.use('/api/*', (req, res) => {
  res.status(404).json({
    ok:    false,
    error: {
      code:    'NOT_FOUND',
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`
    }
  });
});

/* ══════════════════════════════════════════════
   LOCAL DEVELOPMENT — Serve Frontend
══════════════════════════════════════════════ */
if (process.env.NODE_ENV !== 'production' || process.env.SERVE_STATIC === 'true') {
  const path = require('path');
  
  app.use('/public', express.static(path.join(__dirname, '../public')));
  app.use('/shared', express.static(path.join(__dirname, '../shared')));
  app.use('/pages', express.static(path.join(__dirname, '../pages')));
  app.use('/games', express.static(path.join(__dirname, '../games')));
  app.use('/tools', express.static(path.join(__dirname, '../tools')));

  const routes = [
    { path: '/', file: 'pages/index.html' },
    { path: '/dashboard', file: 'pages/dashboard.html' },
    { path: '/student-dashboard', file: 'pages/student_dashboard.html' },
    { path: '/assessment', file: 'pages/assessment.html' },
    { path: '/journal', file: 'pages/journal.html' },
    { path: '/connect', file: 'pages/connect.html' },
    { path: '/community', file: 'pages/community.html' },
    { path: '/games', file: 'pages/games.html' },
    { path: '/chat', file: 'pages/chat.html' },
    { path: '/student-auth', file: 'pages/student_auth.html' }
  ];

  routes.forEach(route => {
    app.get(route.path, (req, res) => {
      res.sendFile(path.join(__dirname, '..', route.file));
    });
  });

  app.use((req, res, next) => {
    if (!req.originalUrl.startsWith('/api')) {
      return res.status(404).sendFile(path.join(__dirname, '../pages/index.html'));
    }
    next();
  });
}

/* ══════════════════════════════════════════════
   GLOBAL ERROR HANDLER
   Catches anything thrown by route handlers.
══════════════════════════════════════════════ */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err.stack || err.message);

  // Never leak stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(err.status || 500).json({
    ok:    false,
    error: {
      code:    err.code    || 'SERVER_ERROR',
      message: err.message || 'An unexpected error occurred.',
      ...(isDev && { stack: err.stack })
    }
  });
});

/* ══════════════════════════════════════════════
   DATABASE  — initialise pool lazily
   The db module creates the pool on first import.
   We verify connectivity here on startup.
══════════════════════════════════════════════ */
const db = require('./db');

async function startServer() {
  // Verify DB connection
  try {
    await db.query('SELECT 1');
    console.log('[server] ✅ Database connected');
  } catch (err) {
    console.error('[server] ❌ Database connection failed:', err.message);
    console.error('[server] Check DATABASE_URL in .env');
    // Don't exit — let Vercel serverless handle cold starts gracefully
  }

  // Only listen in non-serverless environments
  if (process.env.NODE_ENV !== 'production' || process.env.LISTEN_IN_PROD === 'true') {
    app.listen(PORT, () => {
      console.log(`[server] 🚀 YodhaMind API running on http://localhost:${PORT}`);
      console.log(`[server]    Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[server]    Health:      http://localhost:${PORT}/api/health`);
    });
  }
}

startServer();

// Vercel exports the app as the serverless function handler
module.exports = app;
