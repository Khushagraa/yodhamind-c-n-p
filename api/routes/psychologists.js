/**
 * api/routes/psychologists.js — Psychologist Profile Routes
 * ═══════════════════════════════════════════════════════════
 *
 * GET  /api/psychologists            Browse all available profiles
 * GET  /api/psychologists/:id        Get one profile with availability
 * GET  /api/psychologists/:id/slots  Get available slots for a given week
 *
 * (Psychologist profile management — create/update — is admin-only
 *  and handled in a separate admin router not included in MVP.)
 */

'use strict';

const express = require('express');
const { param, query, validationResult } = require('express-validator');

const db               = require('../db');
const { authenticate } = require('../middleware/auth');

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

const VALID_TAGS = [
  'stress', 'anxiety', 'burnout', 'depression',
  'relationships', 'career', 'trauma', 'focus'
];

/* ════════════════════════════════════════════════
   GET /api/psychologists
   Query:
     ?tag=stress          filter by specialisation tag
     ?available=true      only show currently available
     ?limit=20
     ?offset=0
════════════════════════════════════════════════ */
router.get(
  '/',
  [
    query('tag').optional().isIn(VALID_TAGS).withMessage('Unknown tag filter'),
    query('available').optional().isBoolean(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  validationGuard,
  async (req, res) => {
    const tag       = req.query.tag       || null;
    const available = req.query.available !== undefined
                        ? req.query.available === 'true'
                        : null;
    const limit  = parseInt(req.query.limit,  10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;

    try {
      // Build WHERE clauses dynamically
      const conditions = ['u.deleted_at IS NULL'];
      const params     = [];
      let   p          = 1;

      if (tag !== null) {
        conditions.push(`$${p} = ANY(pp.tags)`);
        params.push(tag);
        p++;
      }

      if (available !== null) {
        conditions.push(`pp.is_available = $${p}`);
        params.push(available);
        p++;
      }

      // College visibility: show profiles for this college or global ones
      conditions.push(
        `(pp.college_code IS NULL OR pp.college_code = $${p})`
      );
      params.push(req.user.institution_code || 'DEFAULT');
      p++;

      const whereClause = conditions.length
        ? 'WHERE ' + conditions.join(' AND ')
        : '';

      params.push(limit, offset);

      const result = await db.query(
        `SELECT
           pp.id,
           pp.display_name      AS name,
           pp.specialisation,
           pp.credentials,
           pp.bio,
           pp.fee_inr           AS fee,
           pp.rating,
           pp.total_sessions    AS sessions,
           pp.tags,
           pp.session_types,
           pp.is_available      AS available,
           pp.next_slot,
           pp.avatar_initials   AS initials,
           pp.grad_start,
           pp.grad_end
         FROM psychologist_profiles pp
         JOIN users u ON u.id = pp.user_id
         ${whereClause}
         ORDER BY pp.is_available DESC, pp.rating DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        params
      );

      // Total count for pagination
      const countParams  = params.slice(0, params.length - 2);
      const countResult  = await db.query(
        `SELECT COUNT(*) AS total
         FROM psychologist_profiles pp
         JOIN users u ON u.id = pp.user_id
         ${whereClause}`,
        countParams
      );

      return res.json({
        ok:   true,
        data: {
          psychologists: result.rows,
          total:  parseInt(countResult.rows[0].total, 10),
          limit,
          offset
        }
      });

    } catch (err) {
      console.error('[psychologists GET]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch psychologists.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/psychologists/:id
   Full profile including availability slots.
════════════════════════════════════════════════ */
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Invalid psychologist ID')],
  validationGuard,
  async (req, res) => {
    try {
      // Profile
      const profileResult = await db.query(
        `SELECT
           pp.id,
           pp.display_name      AS name,
           pp.specialisation,
           pp.credentials,
           pp.bio,
           pp.fee_inr           AS fee,
           pp.rating,
           pp.total_sessions    AS sessions,
           pp.tags,
           pp.session_types,
           pp.is_available      AS available,
           pp.next_slot,
           pp.avatar_initials   AS initials,
           pp.grad_start,
           pp.grad_end,
           u.email
         FROM psychologist_profiles pp
         JOIN users u ON u.id = pp.user_id
         WHERE pp.id = $1 AND u.deleted_at IS NULL`,
        [req.params.id]
      );

      if (!profileResult.rows.length) {
        return res.status(404).json({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Psychologist not found.' }
        });
      }

      const profile = profileResult.rows[0];

      // Availability slots
      const slotsResult = await db.query(
        `SELECT day_of_week, slot_time
         FROM availability_slots
         WHERE psychologist_id = $1 AND is_active = TRUE
         ORDER BY
           CASE day_of_week
             WHEN 'Monday'    THEN 1
             WHEN 'Tuesday'   THEN 2
             WHEN 'Wednesday' THEN 3
             WHEN 'Thursday'  THEN 4
             WHEN 'Friday'    THEN 5
             WHEN 'Saturday'  THEN 6
             WHEN 'Sunday'    THEN 7
           END,
           slot_time ASC`,
        [req.params.id]
      );

      // Format slot times for display
      const slots = slotsResult.rows.map(row => ({
        day:  row.day_of_week,
        time: formatTime(row.slot_time)
      }));

      return res.json({
        ok:   true,
        data: { ...profile, slots }
      });

    } catch (err) {
      console.error('[psychologists/:id]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch psychologist.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/psychologists/:id/slots
   Returns available slots for the next 7 days,
   excluding dates already booked.
   Query: ?date=2025-01-15  (week starting from this date)
════════════════════════════════════════════════ */
router.get(
  '/:id/slots',
  [
    param('id').isUUID().withMessage('Invalid psychologist ID'),
    query('date').optional().isISO8601().withMessage('date must be ISO 8601 (YYYY-MM-DD)')
  ],
  validationGuard,
  async (req, res) => {
    const psychId = req.params.id;

    // Start from tomorrow or supplied date
    const startDate = req.query.date
      ? new Date(req.query.date)
      : new Date(Date.now() + 86400000);

    try {
      // Get recurring weekly slots
      const slotsResult = await db.query(
        `SELECT day_of_week, slot_time
         FROM availability_slots
         WHERE psychologist_id = $1 AND is_active = TRUE`,
        [psychId]
      );

      if (!slotsResult.rows.length) {
        return res.json({ ok: true, data: [] });
      }

      // Get booked appointments in the next 7 days
      const endDate = new Date(startDate.getTime() + 7 * 86400000);
      const bookedResult = await db.query(
        `SELECT session_date, session_time
         FROM appointments
         WHERE psychologist_id = $1
           AND session_date >= $2
           AND session_date <= $3
           AND status IN ('pending', 'confirmed')`,
        [psychId, startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10)]
      );

      const bookedSet = new Set(
        bookedResult.rows.map(r => `${r.session_date.toISOString().slice(0, 10)}_${r.session_time.slice(0, 5)}`)
      );

      // Generate available date-time slots for next 7 days
      const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const available = [];

      for (let d = 0; d < 7; d++) {
        const date    = new Date(startDate.getTime() + d * 86400000);
        const dayName = DAY_NAMES[date.getDay()];
        const dateStr = date.toISOString().slice(0, 10);

        const daySlots = slotsResult.rows.filter(s => s.day_of_week === dayName);

        daySlots.forEach(slot => {
          const timeStr = slot.slot_time.slice(0, 5); // 'HH:MM'
          const key     = `${dateStr}_${timeStr}`;

          if (!bookedSet.has(key)) {
            available.push({
              date:    dateStr,
              time:    timeStr,
              display: formatTime(slot.slot_time),
              dayName
            });
          }
        });
      }

      return res.json({ ok: true, data: available });

    } catch (err) {
      console.error('[psychologists/:id/slots]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch available slots.' }
      });
    }
  }
);

/* ── Private helpers ────────────────────────── */
function formatTime(pgTime) {
  // pgTime comes as 'HH:MM:SS' — convert to '10:00 AM'
  const [h, m] = pgTime.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

module.exports = router;
