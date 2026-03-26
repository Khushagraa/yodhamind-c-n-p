/**
 * api/routes/community.js — Anonymous Community Routes
 * ══════════════════════════════════════════════════════
 *
 * GET   /api/community/posts            Browse posts (feed)
 * POST  /api/community/posts            Create an anonymous post
 * GET   /api/community/posts/:id        Get one post + comments
 * POST  /api/community/posts/:id/relate Toggle relate on a post
 * POST  /api/community/posts/:id/comments  Add a comment
 * POST  /api/community/posts/:id/flag      Flag a post for review
 *
 * Anonymity model:
 *   - No user ID stored on posts or comments
 *   - A session_hash (HMAC of user_id + daily salt) links a user's
 *     own posts without revealing identity to anyone
 *   - Relates are also keyed by session_hash (one relate per post)
 *   - Admins can see flagged posts but not who wrote them
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const { body, param, query, validationResult } = require('express-validator');

const db                   = require('../db');
const { authenticate }     = require('../middleware/auth');
const { optionalAuth }     = require('../middleware/auth');
const { requireRole }      = require('../middleware/auth');
const { communityLimiter } = require('../middleware/rateLimit');

const router = express.Router();

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

const VALID_CATS  = ['academics','exams','stress','burnout','relationships','general'];
const VALID_TYPES = ['share', 'question'];

/* ── Session hash generator ─────────────────────
   Produces a daily-rotating, non-reversible hash
   that identifies a user's session anonymously.
   Same user on same calendar day → same hash.
   Different day → different hash.
─────────────────────────────────────────────── */
function makeSessionHash(userId) {
  const salt    = process.env.ANON_SALT || 'yodhamind-default-salt';
  const day     = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const payload = `${userId}:${day}:${salt}`;
  return crypto.createHmac('sha256', salt).update(payload).digest('hex');
}

/* ── Client-side moderation word list ─────────
   Posts containing these terms are auto-flagged
   for human review but not auto-removed.
─────────────────────────────────────────────── */
const FLAG_TERMS = [
  'kill myself', 'end my life', 'want to die', 'suicide',
  'self harm', 'hurt myself', 'no reason to live',
  'doxx', 'phone number of', 'address of'
];

function shouldFlag(text) {
  const lower = text.toLowerCase();
  return FLAG_TERMS.some(t => lower.includes(t));
}

const BLOCK_TERMS = [
  'hate all', 'kill all', 'rape', 'personal info of',
  'whatsapp of', 'instagram of'
];

function isBlocked(text) {
  const lower = text.toLowerCase();
  return BLOCK_TERMS.some(t => lower.includes(t));
}

/* ════════════════════════════════════════════════
   GET /api/community/posts
   Query:
     ?cat=stress         filter by category
     ?type=question      filter by post type
     ?sort=recent|relates  (default: recent)
     ?limit=20
     ?offset=0
════════════════════════════════════════════════ */
router.get(
  '/posts',
  optionalAuth,
  [
    query('cat').optional().isIn(VALID_CATS),
    query('type').optional().isIn(VALID_TYPES),
    query('sort').optional().isIn(['recent', 'relates']),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  validationGuard,
  async (req, res) => {
    const cat    = req.query.cat  || null;
    const type   = req.query.type || null;
    const sort   = req.query.sort || 'recent';
    const limit  = parseInt(req.query.limit,  10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;

    // Determine caller's session hash to mark their own posts
    const sessionHash = req.user ? makeSessionHash(req.user.id) : null;

    try {
      const conditions = ['p.is_removed = FALSE'];
      const params     = [];
      let   p          = 1;

      if (cat)  { conditions.push(`p.category = $${p++}`);   params.push(cat); }
      if (type) { conditions.push(`p.post_type = $${p++}`);  params.push(type); }

      const where   = 'WHERE ' + conditions.join(' AND ');
      const orderBy = sort === 'relates'
        ? 'p.relates_count DESC, p.posted_at DESC'
        : 'p.posted_at DESC';

      params.push(limit, offset);

      const result = await db.query(
        `SELECT
           p.id,
           p.post_type    AS type,
           p.category     AS cat,
           p.content,
           p.relates_count AS relates,
           p.posted_at,
           p.is_flagged,
           (SELECT COUNT(*) FROM community_comments c
            WHERE c.post_id = p.id AND c.is_removed = FALSE)::int AS comment_count,
           ${sessionHash ? `(p.session_hash = '${sessionHash}')` : 'FALSE'} AS is_mine
         FROM community_posts p
         ${where}
         ORDER BY ${orderBy}
         LIMIT $${p} OFFSET $${p + 1}`,
        params
      );

      const countResult = await db.query(
        `SELECT COUNT(*) AS total FROM community_posts p ${where}`,
        params.slice(0, params.length - 2)
      );

      return res.json({
        ok:   true,
        data: {
          posts:  result.rows,
          total:  parseInt(countResult.rows[0].total, 10),
          limit,
          offset
        }
      });

    } catch (err) {
      console.error('[community/posts GET]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch posts.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   POST /api/community/posts
════════════════════════════════════════════════ */
router.post(
  '/posts',
  authenticate,
  communityLimiter,
  [
    body('type')
      .isIn(VALID_TYPES)
      .withMessage(`type must be: ${VALID_TYPES.join(', ')}`),
    body('cat')
      .isIn(VALID_CATS)
      .withMessage(`cat must be: ${VALID_CATS.join(', ')}`),
    body('content')
      .isString()
      .isLength({ min: 10, max: 500 })
      .withMessage('content must be 10-500 characters')
  ],
  validationGuard,
  async (req, res) => {
    const { type, cat, content } = req.body;

    // Hard block
    if (isBlocked(content)) {
      return res.status(422).json({
        ok: false,
        error: {
          code:    'CONTENT_BLOCKED',
          message: 'This content is not allowed. Please keep the community safe and kind.'
        }
      });
    }

    const sessionHash = makeSessionHash(req.user.id);
    const flagged     = shouldFlag(content);

    try {
      const result = await db.query(
        `INSERT INTO community_posts
           (session_hash, post_type, category, content, is_flagged, institution_code)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING
           id, post_type AS type, category AS cat,
           content, relates_count AS relates,
           is_flagged, posted_at`,
        [
          sessionHash, type, cat, content, flagged,
          req.user.institution_code || 'DEFAULT'
        ]
      );

      const post = result.rows[0];

      // Add is_mine = true for the creator
      post.is_mine      = true;
      post.comment_count = 0;

      return res.status(201).json({ ok: true, data: post });

    } catch (err) {
      console.error('[community/posts POST]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to create post.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   GET /api/community/posts/:id
   Returns post + comments.
════════════════════════════════════════════════ */
router.get(
  '/posts/:id',
  optionalAuth,
  [param('id').isUUID()],
  validationGuard,
  async (req, res) => {
    try {
      const postResult = await db.query(
        `SELECT
           id, post_type AS type, category AS cat,
           content, relates_count AS relates,
           is_flagged, posted_at
         FROM community_posts
         WHERE id = $1 AND is_removed = FALSE`,
        [req.params.id]
      );

      if (!postResult.rows.length) {
        return res.status(404).json({
          ok: false, error: { code: 'NOT_FOUND', message: 'Post not found.' }
        });
      }

      const post = postResult.rows[0];

      // Comments
      const commentsResult = await db.query(
        `SELECT id, content, posted_at
         FROM community_comments
         WHERE post_id = $1 AND is_removed = FALSE
         ORDER BY posted_at ASC
         LIMIT 50`,
        [req.params.id]
      );

      // Has the current user already related to this post?
      let hasRelated = false;
      if (req.user) {
        const hash    = makeSessionHash(req.user.id);
        const relRes  = await db.query(
          'SELECT 1 FROM community_relates WHERE post_id = $1 AND session_hash = $2',
          [req.params.id, hash]
        );
        hasRelated = relRes.rows.length > 0;
      }

      return res.json({
        ok:   true,
        data: { ...post, comments: commentsResult.rows, hasRelated }
      });

    } catch (err) {
      console.error('[community/posts/:id]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch post.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   POST /api/community/posts/:id/relate
   Toggle — first call adds, second call removes.
════════════════════════════════════════════════ */
router.post(
  '/posts/:id/relate',
  authenticate,
  [param('id').isUUID()],
  validationGuard,
  async (req, res) => {
    const postId     = req.params.id;
    const sessionHash = makeSessionHash(req.user.id);

    try {
      // Check if already related
      const existing = await db.query(
        'SELECT 1 FROM community_relates WHERE post_id = $1 AND session_hash = $2',
        [postId, sessionHash]
      );

      let newCount;
      let action;

      if (existing.rows.length > 0) {
        // Un-relate
        await db.query(
          'DELETE FROM community_relates WHERE post_id = $1 AND session_hash = $2',
          [postId, sessionHash]
        );
        const r = await db.query(
          `UPDATE community_posts SET relates_count = GREATEST(relates_count - 1, 0)
           WHERE id = $1 RETURNING relates_count`,
          [postId]
        );
        newCount = r.rows[0]?.relates_count;
        action   = 'removed';
      } else {
        // Relate
        await db.query(
          'INSERT INTO community_relates (post_id, session_hash) VALUES ($1, $2)',
          [postId, sessionHash]
        );
        const r = await db.query(
          `UPDATE community_posts SET relates_count = relates_count + 1
           WHERE id = $1 RETURNING relates_count`,
          [postId]
        );
        newCount = r.rows[0]?.relates_count;
        action   = 'added';
      }

      return res.json({
        ok:   true,
        data: { action, relates: newCount }
      });

    } catch (err) {
      console.error('[community/relate]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to update relate.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   POST /api/community/posts/:id/comments
════════════════════════════════════════════════ */
router.post(
  '/posts/:id/comments',
  authenticate,
  communityLimiter,
  [
    param('id').isUUID(),
    body('content')
      .isString()
      .isLength({ min: 1, max: 300 })
      .withMessage('Comment must be 1-300 characters')
  ],
  validationGuard,
  async (req, res) => {
    const { content } = req.body;
    const postId      = req.params.id;

    if (isBlocked(content)) {
      return res.status(422).json({
        ok: false,
        error: { code: 'CONTENT_BLOCKED', message: 'This comment is not allowed.' }
      });
    }

    try {
      // Verify post exists
      const postCheck = await db.query(
        'SELECT id FROM community_posts WHERE id = $1 AND is_removed = FALSE',
        [postId]
      );

      if (!postCheck.rows.length) {
        return res.status(404).json({
          ok: false, error: { code: 'NOT_FOUND', message: 'Post not found.' }
        });
      }

      const sessionHash = makeSessionHash(req.user.id);
      const flagged     = shouldFlag(content);

      const result = await db.query(
        `INSERT INTO community_comments (post_id, session_hash, content, is_removed)
         VALUES ($1, $2, $3, $4)
         RETURNING id, content, posted_at`,
        [postId, sessionHash, content, flagged]
      );

      return res.status(201).json({ ok: true, data: result.rows[0] });

    } catch (err) {
      console.error('[community/comments POST]', err.message);
      return res.status(500).json({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to post comment.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   POST /api/community/posts/:id/flag
   Any authenticated user can flag a post for review.
════════════════════════════════════════════════ */
router.post(
  '/posts/:id/flag',
  authenticate,
  [param('id').isUUID()],
  validationGuard,
  async (req, res) => {
    try {
      await db.query(
        'UPDATE community_posts SET is_flagged = TRUE WHERE id = $1',
        [req.params.id]
      );
      return res.json({ ok: true, message: 'Post flagged for review. Thank you.' });
    } catch (err) {
      console.error('[community/flag]', err.message);
      return res.status(500).json({
        ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to flag post.' }
      });
    }
  }
);

/* ════════════════════════════════════════════════
   PATCH /api/community/posts/:id/remove
   Admin only — remove a post after review.
════════════════════════════════════════════════ */
router.patch(
  '/posts/:id/remove',
  authenticate,
  requireRole(['admin']),
  [param('id').isUUID()],
  validationGuard,
  async (req, res) => {
    try {
      await db.query(
        'UPDATE community_posts SET is_removed = TRUE WHERE id = $1',
        [req.params.id]
      );
      return res.json({ ok: true, message: 'Post removed.' });
    } catch (err) {
      console.error('[community/remove]', err.message);
      return res.status(500).json({
        ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to remove post.' }
      });
    }
  }
);

module.exports = router;
