/**
 * shared/storage.js — YodhaMind Client-Side Data Layer
 * ══════════════════════════════════════════════════════
 *
 * Single source of truth for all localStorage operations.
 * Include on every HTML page BEFORE any page script:
 *
 *   <script src="/shared/storage.js"></script>
 *
 * Then use the global YM object anywhere:
 *
 *   YM.logMood(4, 'good')
 *   YM.saveJournalEntry('title', 'body', 4, ['stress'])
 *   YM.getWellnessScore()   // → { score, label, color, components }
 *
 * ── localStorage Key Contract ────────────────────────
 *  ym_user             { id, name, email, college, stream, createdAt }
 *  ym_mood_log         [{ mood(1-5), label, note, ts }]           max 90
 *  ym_assessments      [{ type, raw, risk, severity, suggestions, ts }] max 20
 *  ym_game_scores      { gameId: [{ score, level, duration, meta, ts }] } max 50/game
 *  ym_journal          [{ id, title, content, mood, tags, ts }]   max 100
 *  ym_streaks          { current, longest, lastCheckIn, totalCheckIns }
 *  ym_wellness         { score, label, color, components, computedAt } (cache)
 *  ym_student_bookings [{ id, psychId, doctor, date, time, status … }]
 *  ym_anon_posts       [{ id, type, cat, content, relates, ts }]
 *  ym_anon_relates     { postId: count }
 *  ym_anon_liked       [postId, …]
 *  ym_anon_comments    { postId: [{ id, text, ts }] }
 *
 * ── Wellness Score Weights ───────────────────────────
 *  Mood (7-day avg)    35%
 *  Engagement / week   20%
 *  Assessment (risk)   30%
 *  Streak              15%
 */

/* global window, localStorage, module */

const YM = (function () {
  'use strict';

  /* ════════════════════════════════════════════
     PRIVATE — Storage primitives
  ════════════════════════════════════════════ */

  function _get(key, fallback) {
    if (fallback === undefined) fallback = null;
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[YM] read error:', key, e.message);
      return fallback;
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[YM] write error:', key, e.message);
      return false;
    }
  }

  function _id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ════════════════════════════════════════════
     PRIVATE — Streak engine
     Called automatically on any logged activity.
  ════════════════════════════════════════════ */

  function _updateStreak() {
    const s = _get('ym_streaks', {
      current: 0, longest: 0, lastCheckIn: null, totalCheckIns: 0
    });

    const today     = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    if (s.lastCheckIn === today) return;   // already counted today

    s.current     = s.lastCheckIn === yesterday ? s.current + 1 : 1;
    s.longest     = Math.max(s.longest, s.current);
    s.lastCheckIn = today;
    s.totalCheckIns = (s.totalCheckIns || 0) + 1;

    _set('ym_streaks', s);
  }

  /* ════════════════════════════════════════════
     PRIVATE — Wellness engine
  ════════════════════════════════════════════ */

  function _getMoodsInRange(days) {
    const cutoff = Date.now() - days * 86400000;
    return _get('ym_mood_log', [])
      .filter(l => new Date(l.ts).getTime() > cutoff);
  }

  function _computeWellness() {
    // ── Mood component (35%) ──────────────────
    const moods = _getMoodsInRange(7);
    let moodScore;
    if (!moods.length) {
      moodScore = 50;                      // neutral default, no data yet
    } else {
      const avg = moods.reduce((s, l) => s + l.mood, 0) / moods.length;
      moodScore = Math.round(((avg - 1) / 4) * 100); // 1-5 → 0-100
    }

    // ── Engagement component (20%) ────────────
    const weekAgo    = Date.now() - 7 * 86400000;
    const allGames   = _get('ym_game_scores', {});
    const weekGames  = Object.values(allGames).flat()
                         .filter(s => new Date(s.ts).getTime() > weekAgo);
    const weekJournal = _get('ym_journal', [])
                         .filter(e => new Date(e.ts).getTime() > weekAgo);
    // Target: 1 activity per day = 7/week → 100pts
    const engageScore = Math.min(
      Math.round(((weekGames.length + weekJournal.length) / 7) * 100),
      100
    );

    // ── Assessment component (30%) ────────────
    const assessments = _get('ym_assessments', []);
    let assessScore;
    if (!assessments.length) {
      assessScore = 50;
    } else {
      const latest = assessments
        .slice()
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];
      assessScore = Math.max(0, 100 - (latest.risk || 50));
    }

    // ── Streak component (15%) ────────────────
    const streak      = _get('ym_streaks', { current: 0 });
    const streakScore = Math.min(
      Math.round((streak.current / 14) * 100),
      100
    );

    // ── Composite ─────────────────────────────
    const total = Math.round(
      moodScore   * 0.35 +
      engageScore * 0.20 +
      assessScore * 0.30 +
      streakScore * 0.15
    );

    const result = {
      score:      total,
      total:      total,  // alias — some pages use .total
      label:      _label(total),
      color:      _color(total),
      components: { moodScore, engageScore, assessScore, streakScore },
      computedAt: new Date().toISOString()
    };

    _set('ym_wellness', result);
    return result;
  }

  function _label(s) {
    if (s >= 80) return 'Thriving';
    if (s >= 65) return 'Doing Good';
    if (s >= 50) return 'Holding Steady';
    if (s >= 35) return 'Struggling';
    return 'Needs Support';
  }

  function _color(s) {
    if (s >= 80) return '#10B981';   // green
    if (s >= 65) return '#56CFB2';   // mint
    if (s >= 50) return '#7C5CBF';   // purple
    if (s >= 35) return '#F59E0B';   // amber
    return '#EF4444';                // red
  }

  /* ════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════ */

  return {

    /* ── USER ────────────────────────────────── */

    /** Returns stored profile or null. */
    getUser() { return _get('ym_user', null); },

    /**
     * Save / update profile (deep merge — partial updates safe).
     * @param {Object} data  e.g. { name: 'Arjun', college: 'IIT Delhi' }
     * @returns {Object} merged profile
     */
    saveUser(data) {
      const existing = _get('ym_user', {});
      const updated  = {
        ...existing, ...data,
        id:        existing.id || _id(),
        createdAt: existing.createdAt || new Date().toISOString()
      };
      _set('ym_user', updated);
      return updated;
    },

    /* ── MOOD ─────────────────────────────────── */

    /**
     * Log a mood entry. Automatically updates streak.
     * @param {number} mood   1-5  (1 = rough, 5 = amazing)
     * @param {string} label  human label e.g. 'good'
     * @param {string} [note] optional free-text
     */
    logMood(mood, label, note) {
      note = note || '';
      const logs = _get('ym_mood_log', []);
      logs.unshift({ mood, label, note, ts: new Date().toISOString() });
      _set('ym_mood_log', logs.slice(0, 90));
      _updateStreak();
    },

    /**
     * Mood entries from the last N days (default 7).
     * @param {number} [days=7]
     */
    getMoods(days) {
      return _getMoodsInRange(days !== undefined ? days : 7);
    },

    /**
     * First mood logged today, or null.
     */
    getTodayMood() {
      const today = new Date().toDateString();
      return _get('ym_mood_log', [])
        .find(l => new Date(l.ts).toDateString() === today) || null;
    },

    /* ── GAMES ────────────────────────────────── */

    /**
     * Save a completed game session. Updates streak.
     * @param {string} gameId    e.g. 'yodha_match'
     * @param {number} score
     * @param {number} [level=1]
     * @param {number} [duration=0]  ms
     * @param {Object} [meta={}]     game-specific extras
     */
    logGameScore(gameId, score, level, duration, meta) {
      level    = level    !== undefined ? level    : 1;
      duration = duration !== undefined ? duration : 0;
      meta     = meta     !== undefined ? meta     : {};

      const all = _get('ym_game_scores', {});
      if (!all[gameId]) all[gameId] = [];

      all[gameId].unshift({
        score, level, duration, meta,
        ts: new Date().toISOString()
      });
      all[gameId] = all[gameId].slice(0, 50);

      _set('ym_game_scores', all);
      _updateStreak();
    },

    /**
     * Score history for a game (default last 10).
     * @param {string} gameId
     * @param {number} [limit=10]
     */
    getGameScores(gameId, limit) {
      limit = limit !== undefined ? limit : 10;
      return (_get('ym_game_scores', {})[gameId] || []).slice(0, limit);
    },

    /**
     * Highest score ever for a game, or null.
     * @param {string} gameId
     */
    getPersonalBest(gameId) {
      const scores = this.getGameScores(gameId, 50);
      return scores.length ? Math.max.apply(null, scores.map(s => s.score)) : null;
    },

    /**
     * All sessions across all games in last N days.
     * @param {number} [days=7]
     */
    getRecentGameSessions(days) {
      days = days !== undefined ? days : 7;
      const cutoff = Date.now() - days * 86400000;
      return Object.entries(_get('ym_game_scores', {}))
        .flatMap(function(entry) {
          const gameId   = entry[0];
          const sessions = entry[1];
          return sessions
            .filter(s => new Date(s.ts).getTime() > cutoff)
            .map(s => Object.assign({}, s, { gameId }));
        });
    },

    /* ── ASSESSMENTS ──────────────────────────── */

    /**
     * Save a completed assessment.
     * @param {string}   type         'stress'|'anxiety'|'burnout'|'focus'
     * @param {number}   raw          raw test score
     * @param {number}   risk         0-100 normalised risk
     * @param {string}   severity     display label e.g. 'Low Stress 🌿'
     * @param {string[]} [suggestions=[]]
     */
    saveAssessment(type, raw, risk, severity, suggestions) {
      suggestions = suggestions || [];
      const list = _get('ym_assessments', []);
      list.unshift({ type, raw, risk, severity, suggestions, ts: new Date().toISOString() });
      _set('ym_assessments', list.slice(0, 20));
    },

    /**
     * All assessments, optionally filtered by type.
     * @param {string|null} [type=null]
     */
    getAssessments(type) {
      const list = _get('ym_assessments', []);
      return type ? list.filter(a => a.type === type) : list;
    },

    /**
     * Most recent assessment of a given type, or null.
     * @param {string} type
     */
    getLatestAssessment(type) {
      const list = this.getAssessments(type);
      return list.length ? list[0] : null;
    },

    /* ── JOURNAL ──────────────────────────────── */

    /**
     * Save a new journal entry. Updates streak.
     * @param {string}      title
     * @param {string}      content
     * @param {number|null} [mood=null]   1-5
     * @param {string[]}    [tags=[]]
     */
    saveJournalEntry(title, content, mood, tags) {
      mood = mood !== undefined ? mood : null;
      tags = tags !== undefined ? tags : [];

      const entries = _get('ym_journal', []);
      entries.unshift({
        id: _id(), title: title || '', content, mood, tags,
        ts: new Date().toISOString()
      });
      _set('ym_journal', entries.slice(0, 100));
      _updateStreak();
    },

    /**
     * Most recent N journal entries (default 10).
     * @param {number} [limit=10]
     */
    getJournalEntries(limit) {
      limit = limit !== undefined ? limit : 10;
      return _get('ym_journal', []).slice(0, limit);
    },

    /**
     * Delete a journal entry by its id.
     * @param {string} id
     */
    deleteJournalEntry(id) {
      _set('ym_journal', _get('ym_journal', []).filter(e => e.id !== id));
    },

    /* ── STREAKS ──────────────────────────────── */

    /**
     * Returns { current, longest, lastCheckIn, totalCheckIns }.
     */
    getStreak() {
      return _get('ym_streaks', {
        current: 0, longest: 0, lastCheckIn: null, totalCheckIns: 0
      });
    },

    /* ── WELLNESS SCORE ───────────────────────── */

    /**
     * Compute a fresh wellness score (and cache it).
     * Returns { score, total, label, color, components, computedAt }.
     */
    getWellnessScore() { return _computeWellness(); },

    /**
     * Last cached wellness score — no recompute.
     * Returns null if never computed.
     */
    getCachedWellnessScore() { return _get('ym_wellness', null); },

    /* ── DIRECT ACCESS (escape hatch) ─────────── */

    /** Read any ym_* key (JSON-parsed). */
    get: _get,

    /** Write any key to localStorage (JSON-stringified). */
    set: _set,

    /* ── ACCOUNT UTILITIES ─────────────────────── */

    /**
     * Delete all ym_* keys. Used for logout / reset.
     * @returns {string[]} keys that were removed
     */
    clearAll() {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('ym_'));
      keys.forEach(k => localStorage.removeItem(k));
      return keys;
    },

    /**
     * Export all known ym_* data as a plain object.
     * Useful for server sync or local backup.
     */
    exportData() {
      const KEYS = [
        'ym_user', 'ym_mood_log', 'ym_assessments',
        'ym_game_scores', 'ym_journal', 'ym_streaks', 'ym_wellness',
        'ym_student_bookings', 'ym_anon_posts',
        'ym_anon_relates', 'ym_anon_liked', 'ym_anon_comments'
      ];
      return KEYS.reduce(function(acc, k) {
        const v = _get(k);
        if (v !== null) acc[k] = v;
        return acc;
      }, {});
    },

    /**
     * Import a data blob (from exportData or server).
     * Merges into existing data — never overwrites with null.
     * @param {Object} blob
     */
    importData(blob) {
      if (!blob || typeof blob !== 'object') return;
      Object.keys(blob).forEach(function(k) {
        if (k.startsWith('ym_') && blob[k] !== null) _set(k, blob[k]);
      });
    }

  };

}());

/* ── Expose globally ────────────────────────── */
if (typeof window !== 'undefined') {
  window.YM = YM;
}

/* ── CommonJS export (Node / Jest) ─────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = YM;
}
