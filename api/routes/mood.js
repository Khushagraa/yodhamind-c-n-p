/**
 * api/routes/mood.js — Mood Tracking Routes
 * ══════════════════════════════════════════
 *
 * POST  /api/mood          Log a mood entry (updates streak)
 * GET   /api/mood          Get mood history (paginated, filterable)
 * GET   /api/mood/today    Get today's mood entry
 * GET   /api/mood/trend    Get 7-day trend + analysis
 * GET   /api/mood/streak   Get current streak data
 */

'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');

const db                 = require('../db');
const { authenticate }   = require('../middleware/auth');
const { moodLimiter }    = require('../middleware/rateLimit');

const router = express.Router();

/* ── All mood routes require auth ───────────── */
router.use(authenticate);

/* ── Shared validation ──────────────────────── */
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

const VALID_LABELS = ['amazing', 'good', 'okay', 'low', 'rough'];

/* ════════════════════════════════════════════════
   POST /api/mood
   Body: { mood: 1-5, label: string, note?: string }
════════════════════════════════════════════════ */
router.post(
  '/',
  moodLimiter,
  [
    body('mood')
      .isInt({ min: 1, max: 5 })
      .withMessage('mood must be an integer between 1 and 5'),
    body('label')
      .isIn(VALID_LABELS)
      .withMessage(`label must be one of: ${VALID_LABELS.join(', ')}`),
    body('note')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('note must be a string under 500 characters')
  ],
  validationGuard,
  async (req, res) => {
    const { mood, label, note = '' } = req.body;
    const userId = req.user.id;

    try {
      // Insert mood log
      const result = await db.query(
        `INSERT INTO mood_logs (user_id, mood, label, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, mood, label, note, logged_at`,
        [userId, mood, label, note]
      );

      const entry = result.rows[0];

      // Update streak
      const streak = await updateStreak(userId);

      return res.status(201).json({
        ok:   true,
        data: { entry, streak }
      });

    } catch (err) {
      console.error('[mood POST]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to log mood.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/mood
   Query: ?days=7&limit=30&offset=0
════════════════════════════════════════════════ */
router.get(
  '/',
  [
    query('days').optional().isInt({ min: 1, max: 90 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  validationGuard,
  async (req, res) => {
    const days   = parseInt(req.query.days,   10) || 30;
    const limit  = parseInt(req.query.limit,  10) || 30;
    const offset = parseInt(req.query.offset, 10) || 0;

    try {
      const result = await db.query(
        `SELECT id, mood, label, note, logged_at
         FROM mood_logs
         WHERE user_id = $1
           AND logged_at >= NOW() - ($2 || ' days')::INTERVAL
         ORDER BY logged_at DESC
         LIMIT $3 OFFSET $4`,
        [req.user.id, days, limit, offset]
      );

      // Total count for pagination
      const countResult = await db.query(
        `SELECT COUNT(*) AS total
         FROM mood_logs
         WHERE user_id = $1
           AND logged_at >= NOW() - ($2 || ' days')::INTERVAL`,
        [req.user.id, days]
      );

      return res.json({
        ok:   true,
        data: {
          logs:   result.rows,
          total:  parseInt(countResult.rows[0].total, 10),
          limit,
          offset
        }
      });

    } catch (err) {
      console.error('[mood GET]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch mood logs.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/mood/today
════════════════════════════════════════════════ */
router.get('/today', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, mood, label, note, logged_at
       FROM mood_logs
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE
         AND logged_at <  CURRENT_DATE + INTERVAL '1 day'
       ORDER BY logged_at ASC
       LIMIT 1`,
      [req.user.id]
    );

    return res.json({
      ok:   true,
      data: result.rows[0] || null
    });

  } catch (err) {
    console.error('[mood/today]', err.message);
    return res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch today\'s mood.' }
    });
  }
});

/* ════════════════════════════════════════════════
   GET /api/mood/trend
   Returns 7-day mood logs + computed trend analysis.
   Used by the dashboard mood chart.
════════════════════════════════════════════════ */
router.get('/trend', async (req, res) => {
  try {
    // One data point per day — average of all logs that day
    const result = await db.query(
      `SELECT
         DATE(logged_at AT TIME ZONE 'Asia/Kolkata') AS day,
         ROUND(AVG(mood), 2)                         AS avg_mood,
         COUNT(*)::int                               AS entries
       FROM mood_logs
       WHERE user_id = $1
         AND logged_at >= NOW() - INTERVAL '7 days'
       GROUP BY day
       ORDER BY day ASC`,
      [req.user.id]
    );

    const days = result.rows;

    // Trend computation
    const trend = computeTrend(days.map(d => parseFloat(d.avg_mood)));

    // Overall 7-day average
    const avg7 = days.length
      ? Math.round((days.reduce((s, d) => s + parseFloat(d.avg_mood), 0) / days.length) * 10) / 10
      : null;

    return res.json({
      ok:   true,
      data: { days, avg7, trend }
    });

  } catch (err) {
    console.error('[mood/trend]', err.message);
    return res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to compute mood trend.' }
    });
  }
});

/* ════════════════════════════════════════════════
   GET /api/mood/streak
════════════════════════════════════════════════ */
router.get('/streak', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT current_streak, longest_streak, last_check_in, total_check_ins, updated_at
       FROM streaks
       WHERE user_id = $1`,
      [req.user.id]
    );

    const streak = result.rows[0] || {
      current_streak:  0,
      longest_streak:  0,
      last_check_in:   null,
      total_check_ins: 0
    };

    return res.json({ ok: true, data: streak });

  } catch (err) {
    console.error('[mood/streak]', err.message);
    return res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch streak.' }
    });
  }
});

/* ════════════════════════════════════════════════
   PRIVATE: Update streak for a user
   Called after any mood log, game score, or journal entry.
   Matches the logic in shared/storage.js _updateStreak().
════════════════════════════════════════════════ */
async function updateStreak(userId) {
  const today     = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Upsert streak row
  const result = await db.query(
    `INSERT INTO streaks (user_id, current_streak, longest_streak, last_check_in, total_check_ins)
     VALUES ($1, 1, 1, $2, 1)
     ON CONFLICT (user_id) DO UPDATE SET
       current_streak  = CASE
         WHEN streaks.last_check_in = $2 THEN streaks.current_streak          -- already today
         WHEN streaks.last_check_in = $3 THEN streaks.current_streak + 1      -- continuing
         ELSE 1                                                                 -- reset
       END,
       longest_streak  = GREATEST(
         streaks.longest_streak,
         CASE
           WHEN streaks.last_check_in = $2 THEN streaks.current_streak
           WHEN streaks.last_check_in = $3 THEN streaks.current_streak + 1
           ELSE 1
         END
       ),
       last_check_in   = CASE
         WHEN streaks.last_check_in = $2 THEN streaks.last_check_in
         ELSE $2
       END,
       total_check_ins = CASE
         WHEN streaks.last_check_in = $2 THEN streaks.total_check_ins
         ELSE streaks.total_check_ins + 1
       END,
       updated_at = NOW()
     RETURNING current_streak, longest_streak, last_check_in, total_check_ins`,
    [userId, today, yesterday]
  );

  return result.rows[0];
}

/* ════════════════════════════════════════════════
   PRIVATE: Compute trend from array of mood values
════════════════════════════════════════════════ */
function computeTrend(values) {
  if (!values || values.length < 2) return 'stable';

  const half      = Math.max(Math.floor(values.length / 2), 1);
  const firstHalf = values.slice(0, half);
  const lastHalf  = values.slice(values.length - half);

  const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const lastAvg  = lastHalf.reduce((s,  v) => s + v, 0) / lastHalf.length;
  const delta    = lastAvg - firstAvg;

  if (delta >= 0.4)  return 'improving';
  if (delta <= -0.4) return 'declining';
  return 'stable';
}

/* Export updateStreak so other routes can call it */
module.exports = router;
module.exports.updateStreak = updateStreak;
