/**
 * api/routes/appointments.js — Appointment Booking Routes
 * ═════════════════════════════════════════════════════════
 *
 * POST   /api/appointments              Book a session
 * GET    /api/appointments              Student's own bookings
 * GET    /api/appointments/:id          Get one booking
 * PATCH  /api/appointments/:id/cancel   Cancel a booking (student)
 * PATCH  /api/appointments/:id/confirm  Confirm a booking (psychologist)
 * PATCH  /api/appointments/:id/complete Mark as completed (psychologist)
 */

'use strict';

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

const db                        = require('../db');
const { authenticate }          = require('../middleware/auth');
const { requireRole }           = require('../middleware/auth');
const { defaultLimiter }        = require('../middleware/rateLimit');

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

/* ── Booking reference generator ────────────── */
function makeBookingRef() {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `YM-${rand}`;
}

/* ════════════════════════════════════════════════
   POST /api/appointments
   Book a new session.
   Body: {
     psychologistId, date, time,
     sessionType?, concern?, stressLevel?
   }
════════════════════════════════════════════════ */
router.post(
  '/',
  defaultLimiter,
  [
    body('psychologistId')
      .isUUID()
      .withMessage('psychologistId must be a valid UUID'),
    body('date')
      .isISO8601()
      .withMessage('date must be a valid ISO date (YYYY-MM-DD)'),
    body('time')
      .matches(/^\d{2}:\d{2}$/)
      .withMessage('time must be in HH:MM format'),
    body('sessionType')
      .optional()
      .isIn(['chat', 'video', 'phone'])
      .withMessage('sessionType must be chat, video, or phone'),
    body('concern')
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage('concern must be under 1000 characters'),
    body('stressLevel')
      .optional()
      .isString()
      .isLength({ max: 40 })
  ],
  validationGuard,
  async (req, res) => {
    const {
      psychologistId,
      date,
      time,
      sessionType  = 'chat',
      concern      = '',
      stressLevel  = 'Unknown'
    } = req.body;

    const studentId = req.user.id;

    try {
      // 1. Verify psychologist exists and is available
      const psychResult = await db.query(
        `SELECT pp.id, pp.fee_inr, pp.is_available
         FROM psychologist_profiles pp
         JOIN users u ON u.id = pp.user_id
         WHERE pp.id = $1 AND u.deleted_at IS NULL`,
        [psychologistId]
      );

      if (!psychResult.rows.length) {
        return res.status(404).json({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Psychologist not found.' }
        });
      }

      // 2. Check slot is not already booked
      const conflictResult = await db.query(
        `SELECT id FROM appointments
         WHERE psychologist_id = $1
           AND session_date    = $2
           AND session_time    = $3
           AND status IN ('pending', 'confirmed')`,
        [psychologistId, date, time + ':00']
      );

      if (conflictResult.rows.length > 0) {
        return res.status(409).json({
          ok: false,
          error: {
            code:    'SLOT_TAKEN',
            message: 'This slot has just been booked. Please choose another time.'
          }
        });
      }

      // 3. Prevent double-booking by same student on same day
      const doubleResult = await db.query(
        `SELECT id FROM appointments
         WHERE student_id   = $1
           AND session_date = $2
           AND status IN ('pending', 'confirmed')`,
        [studentId, date]
      );

      if (doubleResult.rows.length > 0) {
        return res.status(409).json({
          ok: false,
          error: {
            code:    'ALREADY_BOOKED',
            message: 'You already have a booking on this date.'
          }
        });
      }

      // 4. Create booking
      const psychRow   = psychResult.rows[0];
      const bookingRef = makeBookingRef();

      const result = await db.query(
        `INSERT INTO appointments
           (booking_ref, student_id, psychologist_id,
            session_date, session_time, session_type,
            concern, stress_level, status, fee_inr)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
         RETURNING
           id, booking_ref, session_date, session_time,
           session_type, concern, stress_level, status,
           fee_inr, created_at`,
        [
          bookingRef, studentId, psychologistId,
          date, time + ':00', sessionType,
          concern, stressLevel, psychRow.fee_inr
        ]
      );

      const booking = result.rows[0];

      // 5. Fetch psychologist name for the response
      const nameResult = await db.query(
        'SELECT display_name FROM psychologist_profiles WHERE id = $1',
        [psychologistId]
      );

      return res.status(201).json({
        ok:   true,
        data: {
          ...booking,
          doctorName: nameResult.rows[0]?.display_name
        }
      });

    } catch (err) {
      console.error('[appointments POST]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to create booking.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/appointments
   Student's own bookings.
   Query: ?status=pending|confirmed|completed|cancelled
════════════════════════════════════════════════ */
router.get(
  '/',
  [
    query('status')
      .optional()
      .isIn(['pending', 'confirmed', 'completed', 'cancelled'])
  ],
  validationGuard,
  async (req, res) => {
    const statusFilter = req.query.status || null;
    const userId       = req.user.id;

    try {
      // Psychologists see all their appointments; students see only theirs
      let sql, params;

      if (req.user.role === 'psychologist') {
        // Find psychologist profile ID
        const profResult = await db.query(
          'SELECT id FROM psychologist_profiles WHERE user_id = $1',
          [userId]
        );

        if (!profResult.rows.length) {
          return res.json({ ok: true, data: [] });
        }

        const profId = profResult.rows[0].id;

        sql = `
          SELECT
            a.id, a.booking_ref, a.session_date, a.session_time,
            a.session_type, a.concern, a.stress_level, a.status,
            a.fee_inr, a.created_at, a.updated_at,
            u.name AS student_name, u.college AS student_college
          FROM appointments a
          JOIN users u ON u.id = a.student_id
          WHERE a.psychologist_id = $1
          ${statusFilter ? 'AND a.status = $2' : ''}
          ORDER BY a.session_date ASC, a.session_time ASC`;

        params = statusFilter ? [profId, statusFilter] : [profId];

      } else {
        sql = `
          SELECT
            a.id, a.booking_ref, a.session_date, a.session_time,
            a.session_type, a.concern, a.stress_level, a.status,
            a.fee_inr, a.created_at, a.updated_at,
            pp.display_name AS doctor_name
          FROM appointments a
          JOIN psychologist_profiles pp ON pp.id = a.psychologist_id
          WHERE a.student_id = $1
          ${statusFilter ? 'AND a.status = $2' : ''}
          ORDER BY a.created_at DESC`;

        params = statusFilter ? [userId, statusFilter] : [userId];
      }

      const result = await db.query(sql, params);

      return res.json({ ok: true, data: result.rows });

    } catch (err) {
      console.error('[appointments GET]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch appointments.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/appointments/:id
════════════════════════════════════════════════ */
router.get(
  '/:id',
  [param('id').isUUID()],
  validationGuard,
  async (req, res) => {
    try {
      const result = await db.query(
        `SELECT
           a.id, a.booking_ref, a.session_date, a.session_time,
           a.session_type, a.concern, a.stress_level,
           a.status, a.cancel_reason, a.fee_inr,
           a.created_at, a.updated_at,
           pp.id           AS psych_id,
           pp.display_name AS doctor_name,
           pp.credentials,
           pp.fee_inr      AS doctor_fee
         FROM appointments a
         JOIN psychologist_profiles pp ON pp.id = a.psychologist_id
         WHERE a.id = $1
           AND (a.student_id = $2 OR pp.user_id = $2)`,
        [req.params.id, req.user.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Appointment not found.' }
        });
      }

      return res.json({ ok: true, data: result.rows[0] });

    } catch (err) {
      console.error('[appointments/:id]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch appointment.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   PATCH /api/appointments/:id/cancel
   Student or psychologist can cancel.
════════════════════════════════════════════════ */
router.patch(
  '/:id/cancel',
  [
    param('id').isUUID(),
    body('reason').optional().isString().isLength({ max: 300 })
  ],
  validationGuard,
  async (req, res) => {
    try {
      const reason = req.body.reason || null;

      // Verify ownership
      const check = await db.query(
        `SELECT a.id, a.status, a.student_id, pp.user_id AS psych_user_id
         FROM appointments a
         JOIN psychologist_profiles pp ON pp.id = a.psychologist_id
         WHERE a.id = $1`,
        [req.params.id]
      );

      const appt = check.rows[0];

      if (!appt) {
        return res.status(404).json({
          ok: false, error: { code: 'NOT_FOUND', message: 'Appointment not found.' }
        });
      }

      const isOwner = appt.student_id === req.user.id ||
                      appt.psych_user_id === req.user.id ||
                      req.user.role === 'admin';

      if (!isOwner) {
        return res.status(403).json({
          ok: false, error: { code: 'FORBIDDEN', message: 'Not authorised.' }
        });
      }

      if (appt.status === 'cancelled') {
        return res.status(409).json({
          ok: false, error: { code: 'ALREADY_CANCELLED', message: 'Already cancelled.' }
        });
      }

      if (appt.status === 'completed') {
        return res.status(409).json({
          ok: false, error: { code: 'ALREADY_COMPLETED', message: 'Cannot cancel a completed session.' }
        });
      }

      const result = await db.query(
        `UPDATE appointments
         SET status = 'cancelled', cancel_reason = $2
         WHERE id = $1
         RETURNING id, status, cancel_reason, updated_at`,
        [req.params.id, reason]
      );

      return res.json({ ok: true, data: result.rows[0] });

    } catch (err) {
      console.error('[appointments/:id/cancel]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to cancel appointment.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   PATCH /api/appointments/:id/confirm
   Psychologist only.
════════════════════════════════════════════════ */
router.patch(
  '/:id/confirm',
  requireRole(['psychologist', 'admin']),
  [param('id').isUUID()],
  validationGuard,
  async (req, res) => {
    try {
      const result = await db.query(
        `UPDATE appointments a
         SET status = 'confirmed'
         FROM psychologist_profiles pp
         WHERE a.id = $1
           AND a.psychologist_id = pp.id
           AND pp.user_id = $2
           AND a.status = 'pending'
         RETURNING a.id, a.status, a.updated_at`,
        [req.params.id, req.user.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Pending appointment not found.' }
        });
      }

      return res.json({ ok: true, data: result.rows[0] });

    } catch (err) {
      console.error('[appointments/:id/confirm]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to confirm appointment.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   PATCH /api/appointments/:id/complete
   Psychologist only. Also increments total_sessions.
════════════════════════════════════════════════ */
router.patch(
  '/:id/complete',
  requireRole(['psychologist', 'admin']),
  [param('id').isUUID()],
  validationGuard,
  async (req, res) => {
    try {
      const result = await db.query(
        `UPDATE appointments a
         SET status = 'completed'
         FROM psychologist_profiles pp
         WHERE a.id = $1
           AND a.psychologist_id = pp.id
           AND pp.user_id = $2
           AND a.status = 'confirmed'
         RETURNING a.id, a.status, a.psychologist_id, a.updated_at`,
        [req.params.id, req.user.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Confirmed appointment not found.' }
        });
      }

      // Increment session counter on profile
      await db.query(
        `UPDATE psychologist_profiles
         SET total_sessions = total_sessions + 1
         WHERE id = $1`,
        [result.rows[0].psychologist_id]
      );

      return res.json({ ok: true, data: result.rows[0] });

    } catch (err) {
      console.error('[appointments/:id/complete]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to complete appointment.' }
      });
    }
  }
);

module.exports = router;
