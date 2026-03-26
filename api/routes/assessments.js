/**
 * api/routes/assessments.js — Self-Assessment Routes
 * ════════════════════════════════════════════════════
 *
 * POST  /api/assessments          Submit a completed assessment
 * GET   /api/assessments          Get assessment history
 * GET   /api/assessments/latest   Get most recent per test type
 * GET   /api/assessments/:id      Get one assessment by ID
 */

'use strict';

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');

const db                       = require('../db');
const { authenticate }         = require('../middleware/auth');
const { assessmentLimiter }    = require('../middleware/rateLimit');
const { updateStreak }         = require('./mood');

// Wellness engine runs server-side for authoritative scoring
const WE = require('../../shared/wellness-engine');

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

const VALID_TYPES = ['stress', 'anxiety', 'burnout', 'focus'];

/* ════════════════════════════════════════════════
   POST /api/assessments
   Body: { type, responses: [0,2,1,3,...] }

   The server scores the responses using wellness-engine.js
   — the client never sends a score, only raw answers.
   This prevents score manipulation.
════════════════════════════════════════════════ */
router.post(
  '/',
  assessmentLimiter,
  [
    body('type')
      .isIn(VALID_TYPES)
      .withMessage(`type must be one of: ${VALID_TYPES.join(', ')}`),
    body('responses')
      .isArray({ min: 1 })
      .withMessage('responses must be a non-empty array'),
    body('responses.*')
      .isInt({ min: 0, max: 6 })
      .withMessage('Each response must be an integer 0-6')
  ],
  validationGuard,
  async (req, res) => {
    const { type, responses } = req.body;
    const userId = req.user.id;

    try {
      // Score server-side using shared wellness engine
      let scored;
      try {
        scored = WE.scoreAssessment(type, responses);
      } catch (scoreErr) {
        return res.status(422).json({
          ok: false,
          error: {
            code:    'SCORING_ERROR',
            message: scoreErr.message
          }
        });
      }

      const { raw, maxScore, risk, interpretation } = scored;
      const suggestions = WE.getSuggestions(type, interpretation.level);

      // Persist
      const result = await db.query(
        `INSERT INTO assessments
           (user_id, type, raw_score, max_score, risk, severity, responses, suggestions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, type, raw_score, max_score, risk, severity, taken_at`,
        [
          userId,
          type,
          raw,
          maxScore,
          risk,
          interpretation.label,
          JSON.stringify(responses),
          JSON.stringify(suggestions)
        ]
      );

      const saved = result.rows[0];

      // Update streak (taking an assessment counts as activity)
      await updateStreak(userId);

      // Snapshot wellness score after new assessment
      const wellnessSnap = await snapshotWellness(userId);

      return res.status(201).json({
        ok:   true,
        data: {
          assessment: {
            ...saved,
            interpretation,
            suggestions
          },
          wellness: wellnessSnap
        }
      });

    } catch (err) {
      console.error('[assessments POST]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to save assessment.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/assessments
   Query: ?type=stress&limit=10&offset=0
════════════════════════════════════════════════ */
router.get(
  '/',
  [
    query('type').optional().isIn(VALID_TYPES),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  validationGuard,
  async (req, res) => {
    const type   = req.query.type   || null;
    const limit  = parseInt(req.query.limit,  10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    try {
      const whereType = type ? 'AND type = $3' : '';
      const params    = type
        ? [req.user.id, limit, type, offset]
        : [req.user.id, limit, offset];

      // Build dynamic query depending on type filter
      const sql = type
        ? `SELECT id, type, raw_score, max_score, risk, severity, suggestions, taken_at
           FROM assessments
           WHERE user_id = $1 AND type = $3
           ORDER BY taken_at DESC
           LIMIT $2 OFFSET $4`
        : `SELECT id, type, raw_score, max_score, risk, severity, suggestions, taken_at
           FROM assessments
           WHERE user_id = $1
           ORDER BY taken_at DESC
           LIMIT $2 OFFSET $3`;

      const result = await db.query(sql, params);

      return res.json({
        ok:   true,
        data: {
          assessments: result.rows,
          limit,
          offset
        }
      });

    } catch (err) {
      console.error('[assessments GET]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch assessments.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/assessments/latest
   Returns the most recent result for each test type.
   Used by dashboard and AI advisor system prompt.
════════════════════════════════════════════════ */
router.get('/latest', async (req, res) => {
  try {
    // DISTINCT ON guarantees one row per type, ordered by most recent
    const result = await db.query(
      `SELECT DISTINCT ON (type)
         id, type, raw_score, max_score, risk, severity, suggestions, taken_at
       FROM assessments
       WHERE user_id = $1
       ORDER BY type, taken_at DESC`,
      [req.user.id]
    );

    // Shape as object: { stress: {...}, anxiety: {...} }
    const latest = result.rows.reduce((acc, row) => {
      acc[row.type] = row;
      return acc;
    }, {});

    return res.json({ ok: true, data: latest });

  } catch (err) {
    console.error('[assessments/latest]', err.message);
    return res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch latest assessments.' }
    });
  }
});

/* ════════════════════════════════════════════════
   GET /api/assessments/:id
════════════════════════════════════════════════ */
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Invalid assessment ID')],
  validationGuard,
  async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, type, raw_score, max_score, risk, severity,
                responses, suggestions, taken_at
         FROM assessments
         WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Assessment not found.' }
        });
      }

      const row = result.rows[0];

      // Re-derive interpretation labels from score (no need to store them separately)
      const test = WE.TESTS[row.type];
      const interpretation = test ? test.interpret(row.raw_score) : null;
      const suggestions    = WE.getSuggestions(row.type, interpretation ? interpretation.level : '');

      return res.json({
        ok:   true,
        data: { ...row, interpretation, suggestions }
      });

    } catch (err) {
      console.error('[assessments/:id]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch assessment.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   PRIVATE: Snapshot wellness score to DB
   Called after every new assessment submission.
════════════════════════════════════════════════ */
async function snapshotWellness(userId) {
  try {
    // Gather components from DB
    const [moodRows, gameRows, assessRows, streakRow] = await Promise.all([
      // 7-day mood average
      db.query(
        `SELECT mood FROM mood_logs
         WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '7 days'`,
        [userId]
      ),
      // Week activity count
      db.query(
        `SELECT COUNT(*) AS cnt FROM game_scores
         WHERE user_id = $1 AND played_at >= NOW() - INTERVAL '7 days'`,
        [userId]
      ),
      // Latest assessment
      db.query(
        `SELECT DISTINCT ON (type) type, risk
         FROM assessments WHERE user_id = $1
         ORDER BY type, taken_at DESC`,
        [userId]
      ),
      // Streak
      db.query(
        'SELECT current_streak FROM streaks WHERE user_id = $1',
        [userId]
      )
    ]);

    const moods7     = moodRows.rows;
    const weekGames  = parseInt(gameRows.rows[0].cnt, 10);
    const latestRisk = assessRows.rows.length
      ? Math.round(assessRows.rows.reduce((s, r) => s + r.risk, 0) / assessRows.rows.length)
      : 50;
    const streakDays = streakRow.rows[0] ? streakRow.rows[0].current_streak : 0;

    const ws = WE.computeWellness({
      moods7:            moods7.map(r => ({ mood: r.mood })),
      weekActivities:    weekGames,
      latestAssessment:  { risk: latestRisk },
      streakDays
    });

    // Upsert daily snapshot (one per day enforced by unique index)
    await db.query(
      `INSERT INTO wellness_scores
         (user_id, score, label, mood_component, engage_component,
          assess_component, streak_component)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, DATE(computed_at)) DO UPDATE SET
         score            = EXCLUDED.score,
         label            = EXCLUDED.label,
         mood_component   = EXCLUDED.mood_component,
         engage_component = EXCLUDED.engage_component,
         assess_component = EXCLUDED.assess_component,
         streak_component = EXCLUDED.streak_component,
         computed_at      = NOW()`,
      [
        userId, ws.score, ws.label,
        ws.components.moodScore, ws.components.engageScore,
        ws.components.assessScore, ws.components.streakScore
      ]
    );

    return ws;

  } catch (err) {
    // Non-fatal — log but don't fail the main request
    console.error('[assessments snapshotWellness]', err.message);
    return null;
  }
}

module.exports = router;
