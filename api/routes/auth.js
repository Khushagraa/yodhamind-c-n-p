/**
 * api/routes/auth.js — Authentication Routes
 * ════════════════════════════════════════════
 *
 * POST   /api/auth/register    Create a new student account
 * POST   /api/auth/login       Email + password login
 * GET    /api/auth/me          Get current user profile
 * PUT    /api/auth/me          Update current user profile
 * POST   /api/auth/refresh     Rotate access token using refresh token
 * POST   /api/auth/logout      Revoke refresh token
 * POST   /api/auth/forgot      Request password reset email
 * POST   /api/auth/reset       Set new password with reset token
 */

'use strict';

const express      = require('express');
const bcrypt       = require('bcryptjs');
const crypto       = require('crypto');
const { body, validationResult } = require('express-validator');

const db                          = require('../db');
const { generateTokens }          = require('../middleware/auth');
const { authenticate }            = require('../middleware/auth');
const { authLimiter }             = require('../middleware/rateLimit');

const router = express.Router();

/* ── Shared validation helpers ──────────────── */
const emailRule    = body('email').isEmail().normalizeEmail().withMessage('Valid email required');
const passwordRule = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters');

function validationGuard(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      ok:     false,
      error:  { code: 'VALIDATION_ERROR', fields: errors.array() }
    });
  }
  next();
}

/* ════════════════════════════════════════════════
   POST /api/auth/register
════════════════════════════════════════════════ */
router.post(
  '/register',
  authLimiter,
  [
    emailRule,
    passwordRule,
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('college').optional().trim().isLength({ max: 200 }),
    body('stream').optional().trim().isLength({ max: 80 }),
    body('year_of_study').optional().isInt({ min: 1, max: 6 })
  ],
  validationGuard,
  async (req, res) => {
    const { email, password, name, college, stream, year_of_study } = req.body;

    try {
      // Check for existing account
      const existing = await db.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          ok:    false,
          error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' }
        });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 12);

      // Insert user
      const result = await db.query(
        `INSERT INTO users
           (email, password_hash, name, college, stream, year_of_study, role, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, 'student', FALSE)
         RETURNING id, email, name, college, stream, year_of_study, role, created_at`,
        [email, password_hash, name, college || null, stream || null, year_of_study || null]
      );

      const user = result.rows[0];

      // Create streak row
      await db.query(
        'INSERT INTO streaks (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [user.id]
      );

      // Generate tokens
      const tokens = generateTokens(user);

      // Store refresh token hash
      const tokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
      await db.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
        [user.id, tokenHash]
      );

      return res.status(201).json({
        ok:   true,
        data: {
          user:   sanitiseUser(user),
          tokens: {
            accessToken:  tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn:    tokens.expiresIn
          }
        }
      });

    } catch (err) {
      console.error('[auth/register]', err.message);
      return res.status(500).json({
        ok:    false,
        error: { code: 'SERVER_ERROR', message: 'Registration failed. Please try again.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   POST /api/auth/login
════════════════════════════════════════════════ */
router.post(
  '/login',
  authLimiter,
  [emailRule, passwordRule],
  validationGuard,
  async (req, res) => {
    const { email, password } = req.body;

    try {
      const result = await db.query(
        `SELECT id, email, password_hash, name, college, stream,
                year_of_study, role, is_verified, avatar_url
         FROM users
         WHERE email = $1 AND deleted_at IS NULL`,
        [email]
      );

      const user = result.rows[0];

      // Constant-time check — same response whether user exists or not
      const dummyHash = '$2b$12$invalidhashtopreventtiming..............................';
      const passwordOk = user
        ? await bcrypt.compare(password, user.password_hash)
        : await bcrypt.compare(password, dummyHash).then(() => false);

      if (!user || !passwordOk) {
        return res.status(401).json({
          ok:    false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' }
        });
      }

      // Update last_login_at
      await db.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      const tokens = generateTokens(user);

      // Store refresh token hash
      const tokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
      await db.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
        [user.id, tokenHash]
      );

      return res.status(200).json({
        ok:   true,
        data: {
          user:   sanitiseUser(user),
          tokens: {
            accessToken:  tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn:    tokens.expiresIn
          }
        }
      });

    } catch (err) {
      console.error('[auth/login]', err.message);
      return res.status(500).json({
        ok:    false,
        error: { code: 'SERVER_ERROR', message: 'Login failed. Please try again.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/auth/me
════════════════════════════════════════════════ */
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, college, stream, year_of_study,
              role, is_verified, avatar_url, institution_code,
              last_login_at, created_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok:    false,
        error: { code: 'USER_NOT_FOUND', message: 'User account not found.' }
      });
    }

    return res.json({ ok: true, data: sanitiseUser(result.rows[0]) });

  } catch (err) {
    console.error('[auth/me]', err.message);
    return res.status(500).json({
      ok: false, error: { code: 'SERVER_ERROR', message: 'Could not load profile.' }
    });
  }
});

/* ════════════════════════════════════════════════
   PUT /api/auth/me  — update profile
════════════════════════════════════════════════ */
router.put(
  '/me',
  authenticate,
  [
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('college').optional().trim().isLength({ max: 200 }),
    body('stream').optional().trim().isLength({ max: 80 }),
    body('year_of_study').optional().isInt({ min: 1, max: 6 })
  ],
  validationGuard,
  async (req, res) => {
    const { name, college, stream, year_of_study } = req.body;

    // Build partial update — only set fields that were provided
    const updates = [];
    const values  = [];
    let   idx     = 1;

    if (name          !== undefined) { updates.push(`name = $${idx++}`);          values.push(name); }
    if (college       !== undefined) { updates.push(`college = $${idx++}`);       values.push(college); }
    if (stream        !== undefined) { updates.push(`stream = $${idx++}`);        values.push(stream); }
    if (year_of_study !== undefined) { updates.push(`year_of_study = $${idx++}`); values.push(year_of_study); }

    if (updates.length === 0) {
      return res.status(422).json({
        ok:    false,
        error: { code: 'NO_FIELDS', message: 'No fields provided to update.' }
      });
    }

    values.push(req.user.id);

    try {
      const result = await db.query(
        `UPDATE users SET ${updates.join(', ')}
         WHERE id = $${idx} AND deleted_at IS NULL
         RETURNING id, email, name, college, stream, year_of_study, role`,
        values
      );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false, error: { code: 'USER_NOT_FOUND', message: 'User not found.' }
        });
      }

      return res.json({ ok: true, data: sanitiseUser(result.rows[0]) });

    } catch (err) {
      console.error('[auth/me PUT]', err.message);
      return res.status(500).json({
        ok: false, error: { code: 'SERVER_ERROR', message: 'Profile update failed.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   POST /api/auth/refresh  — rotate tokens
════════════════════════════════════════════════ */
router.post(
  '/refresh',
  authLimiter,
  [body('refreshToken').notEmpty().withMessage('refreshToken is required')],
  validationGuard,
  async (req, res) => {
    const { refreshToken } = req.body;

    try {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Look up token in DB
      const tokenResult = await db.query(
        `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked,
                u.email, u.role
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1 AND u.deleted_at IS NULL`,
        [tokenHash]
      );

      const stored = tokenResult.rows[0];

      if (!stored) {
        return res.status(401).json({
          ok: false, error: { code: 'TOKEN_INVALID', message: 'Invalid refresh token.' }
        });
      }

      if (stored.revoked) {
        // Possible token theft — revoke all tokens for this user
        await db.query(
          'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
          [stored.user_id]
        );
        return res.status(401).json({
          ok: false, error: { code: 'TOKEN_REUSED', message: 'Security alert: please log in again.' }
        });
      }

      if (new Date(stored.expires_at) < new Date()) {
        return res.status(401).json({
          ok: false, error: { code: 'TOKEN_EXPIRED', message: 'Session expired. Please log in again.' }
        });
      }

      // Revoke old refresh token (rotation)
      await db.query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1',
        [stored.id]
      );

      // Issue new token pair
      const user   = { id: stored.user_id, email: stored.email, role: stored.role };
      const tokens = generateTokens(user);

      const newHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
      await db.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
        [stored.user_id, newHash]
      );

      return res.json({
        ok:   true,
        data: {
          accessToken:  tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn:    tokens.expiresIn
        }
      });

    } catch (err) {
      console.error('[auth/refresh]', err.message);
      return res.status(500).json({
        ok: false, error: { code: 'SERVER_ERROR', message: 'Token refresh failed.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   POST /api/auth/logout
════════════════════════════════════════════════ */
router.post(
  '/logout',
  authenticate,
  async (req, res) => {
    const { refreshToken } = req.body;

    try {
      if (refreshToken) {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        await db.query(
          'UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1 AND user_id = $2',
          [tokenHash, req.user.id]
        );
      }

      return res.json({ ok: true, message: 'Logged out successfully.' });

    } catch (err) {
      console.error('[auth/logout]', err.message);
      // Return success anyway — client should clear tokens regardless
      return res.json({ ok: true, message: 'Logged out.' });
    }
  }
);

/* ════════════════════════════════════════════════
   PRIVATE: sanitise user row before sending
   Never expose: password_hash, verify_token, reset_token
════════════════════════════════════════════════ */
function sanitiseUser(user) {
  const {
    password_hash, verify_token, reset_token, reset_token_exp, // eslint-disable-line
    ...safe
  } = user;
  return safe;
}

module.exports = router;
