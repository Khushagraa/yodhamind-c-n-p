/**
 * api/routes/games.js — Cognitive Game Routes
 * ══════════════════════════════════════════════
 *
 * POST  /api/games/score           Submit a completed game session
 * GET   /api/games/history         Get personal game history
 * GET   /api/games/history/:gameId Get history for one game
 * GET   /api/games/best            Get personal bests across all games
 * GET   /api/games/leaderboard/:gameId  Top 10 scores for a game
 */

'use strict';

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

const db                 = require('../db');
const { authenticate }   = require('../middleware/auth');
const { updateStreak }   = require('./mood');

const router = express.Router();

router.use(authenticate);

/* ── Validation helper ──────────────────────── */
function validationGuard(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', fields: errors.array() }
    });
  }
  next();
}

/* ── Known game IDs ─────────────────────────── */
const VALID_GAMES = [
  'yodha_match',    // Memory grid
  'lumina',         // Pattern recognition
  'enchaeos',       // Reaction speed
  'aura',           // Sustained attention
  'mandala',        // Zen drawing / art therapy
  'untangle',       // Spatial reasoning
  'yodha_core'      // Composite
];

/* ════════════════════════════════════════════════
   POST /api/games/score
   Body: { gameId, score, level?, durationMs?, metadata? }

   Anti-cheat: server enforces score upper bounds per game.
   Implausible scores are rejected or clamped.
════════════════════════════════════════════════ */

// Max plausible scores — prevents trivially faked high scores
const MAX_SCORES = {
  yodha_match: 50000,
  lumina:      30000,
  enchaeos:    20000,
  aura:        40000,
  mandala:     10000,  // mandala is qualitative — low max
  untangle:    25000,
  yodha_core:  60000
};

router.post(
  '/score',
  [
    body('gameId')
      .isIn(VALID_GAMES)
      .withMessage(`gameId must be one of: ${VALID_GAMES.join(', ')}`),
    body('score')
      .isInt({ min: 0 })
      .withMessage('score must be a non-negative integer'),
    body('level')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('level must be 1-100'),
    body('durationMs')
      .optional()
      .isInt({ min: 0, max: 600000 })  // max 10 minutes
      .withMessage('durationMs must be 0-600000'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('metadata must be an object')
  ],
  validationGuard,
  async (req, res) => {
    let { gameId, score, level = 1, durationMs = 0, metadata = {} } = req.body;
    const userId = req.user.id;

    // Anti-cheat: clamp to max plausible score
    const maxScore = MAX_SCORES[gameId] || 99999;
    if (score > maxScore) {
      return res.status(422).json({
        ok: false,
        error: {
          code:    'IMPLAUSIBLE_SCORE',
          message: `Score ${score} exceeds maximum for ${gameId} (${maxScore}).`
        }
      });
    }

    try {
      const result = await db.query(
        `INSERT INTO game_scores (user_id, game_id, score, level, duration_ms, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, game_id, score, level, duration_ms, played_at`,
        [userId, gameId, score, level, durationMs, JSON.stringify(metadata)]
      );

      const entry = result.rows[0];

      // Update streak
      const streak = await updateStreak(userId);

      // Fetch personal best for this game
      const bestResult = await db.query(
        `SELECT MAX(score) AS best FROM game_scores
         WHERE user_id = $1 AND game_id = $2`,
        [userId, gameId]
      );
      const personalBest = parseInt(bestResult.rows[0].best, 10);

      const isNewBest = score >= personalBest;

      return res.status(201).json({
        ok:   true,
        data: {
          entry,
          personalBest,
          isNewBest,
          streak
        }
      });

    } catch (err) {
      console.error('[games/score POST]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to save game score.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/games/history
   All games, all sessions. Used by dashboard.
   Query: ?limit=20&days=30
════════════════════════════════════════════════ */
router.get(
  '/history',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('days').optional().isInt({ min: 1, max: 365 })
  ],
  validationGuard,
  async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 20;
    const days  = parseInt(req.query.days,  10) || 30;

    try {
      const result = await db.query(
        `SELECT id, game_id, score, level, duration_ms, played_at
         FROM game_scores
         WHERE user_id = $1
           AND played_at >= NOW() - ($2 || ' days')::INTERVAL
         ORDER BY played_at DESC
         LIMIT $3`,
        [req.user.id, days, limit]
      );

      return res.json({ ok: true, data: result.rows });

    } catch (err) {
      console.error('[games/history]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch game history.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/games/history/:gameId
════════════════════════════════════════════════ */
router.get(
  '/history/:gameId',
  [
    param('gameId').isIn(VALID_GAMES).withMessage('Unknown game ID'),
    query('limit').optional().isInt({ min: 1, max: 50 })
  ],
  validationGuard,
  async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 10;

    try {
      const result = await db.query(
        `SELECT id, game_id, score, level, duration_ms, played_at
         FROM game_scores
         WHERE user_id = $1 AND game_id = $2
         ORDER BY played_at DESC
         LIMIT $3`,
        [req.user.id, req.params.gameId, limit]
      );

      return res.json({ ok: true, data: result.rows });

    } catch (err) {
      console.error('[games/history/:gameId]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch game history.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/games/best
   Personal best for every game in one query.
   Returns { yodha_match: 1450, lumina: 920, ... }
════════════════════════════════════════════════ */
router.get('/best', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT game_id, MAX(score) AS best, COUNT(*)::int AS sessions
       FROM game_scores
       WHERE user_id = $1
       GROUP BY game_id`,
      [req.user.id]
    );

    // Shape as flat object for easy frontend consumption
    const bests = result.rows.reduce((acc, row) => {
      acc[row.game_id] = {
        best:     parseInt(row.best, 10),
        sessions: row.sessions
      };
      return acc;
    }, {});

    return res.json({ ok: true, data: bests });

  } catch (err) {
    console.error('[games/best]', err.message);
    return res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch personal bests.' }
    });
  }
});

/* ════════════════════════════════════════════════
   GET /api/games/leaderboard/:gameId
   Top 10 scores across all users (anonymous display).
   Returns name initials + score only — no IDs.
════════════════════════════════════════════════ */
router.get(
  '/leaderboard/:gameId',
  [param('gameId').isIn(VALID_GAMES).withMessage('Unknown game ID')],
  validationGuard,
  async (req, res) => {
    try {
      // One entry per user (their personal best), sorted by score
      const result = await db.query(
        `SELECT
           u.name,
           MAX(gs.score) AS best_score,
           gs.user_id = $2 AS is_me
         FROM game_scores gs
         JOIN users u ON u.id = gs.user_id
         WHERE gs.game_id = $1
           AND u.deleted_at IS NULL
         GROUP BY gs.user_id, u.name
         ORDER BY best_score DESC
         LIMIT 10`,
        [req.params.gameId, req.user.id]
      );

      // Anonymise: only show initials of first + last name
      const entries = result.rows.map((row, i) => ({
        rank:     i + 1,
        initials: getInitials(row.name),
        score:    parseInt(row.best_score, 10),
        isMe:     row.is_me
      }));

      return res.json({ ok: true, data: entries });

    } catch (err) {
      console.error('[games/leaderboard]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch leaderboard.' }
      });
    }
  }
);

/* ── Private helpers ────────────────────────── */
function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

module.exports = router;
