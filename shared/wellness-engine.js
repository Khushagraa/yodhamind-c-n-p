/**
 * shared/wellness-engine.js — YodhaMind Wellness Scoring Engine
 * ══════════════════════════════════════════════════════════════
 *
 * Pure functions — no side effects, no localStorage, no DOM.
 * Used by:
 *   - Frontend pages (imported via <script> tag)
 *   - Backend API routes (imported via require/import)
 *   - Unit tests
 *
 * Include on any page that needs scoring or interpretation logic:
 *
 *   <script src="/shared/wellness-engine.js"></script>
 *   → window.WE available
 *
 * Or in Node:
 *   const WE = require('./shared/wellness-engine');
 *
 * ─────────────────────────────────────────────────────────────
 * ASSESSMENT SCORING SPECIFICATIONS
 * ─────────────────────────────────────────────────────────────
 *
 *  PSS-10  (Perceived Stress Scale)
 *    Questions : 10
 *    Scale     : 0-4 per item (Never / Almost Never / Sometimes / Fairly Often / Very Often)
 *    Reverse   : items 4, 5, 7, 8  (0-indexed: 3, 4, 6, 7)
 *    Max score : 40
 *    Ranges    : 0-13 Low · 14-26 Moderate · 27-40 High
 *
 *  GAD-7  (Generalised Anxiety Disorder)
 *    Questions : 7
 *    Scale     : 0-3 per item (Not at all … Nearly every day)
 *    Reverse   : none
 *    Max score : 21
 *    Ranges    : 0-4 Minimal · 5-9 Mild · 10-14 Moderate · 15-21 Severe
 *
 *  MBI-SS  (Maslach Burnout Inventory — Student Survey, 8-item short)
 *    Questions : 8
 *    Scale     : 0-6 per item (Never … Every day)
 *    Reverse   : items 7, 8  (0-indexed: 6, 7)  — efficacy items
 *    Max score : 42
 *    Ranges    : 0-14 None · 15-28 Early · 29-42 Burnout Detected
 *
 *  FOCUS  (YodhaMind custom — academic focus assessment)
 *    Questions : 7
 *    Scale     : 0-4 per item (Never … Always)
 *    Reverse   : items 6, 7  (0-indexed: 5, 6)  — positive items
 *    Max score : 24
 *    Ranges    : 0-8 Sharp · 9-16 Moderate · 17-24 Low
 */

/* global window, module */

const WE = (function () {
  'use strict';

  /* ═══════════════════════════════════════════
     ASSESSMENT DEFINITIONS
     Each test is fully self-describing.
  ═══════════════════════════════════════════ */

  const TESTS = {

    stress: {
      id:         'stress',
      label:      'Stress Check',
      instrument: 'PSS-10',
      context:    'In the last month, how often have you…',
      maxScore:   40,
      optionCount: 5,            // 0-4
      reverseItems: [3, 4, 6, 7], // 0-indexed

      questions: [
        'Been upset because of something that happened unexpectedly?',
        'Felt unable to control the important things in your life?',
        'Felt nervous and stressed?',
        'Dealt successfully with irritating life hassles?',        // reverse
        'Felt that you were effectively coping with important changes?', // reverse
        'Felt confident about your ability to handle personal problems?',
        'Been able to control irritations in your life?',          // reverse
        'Felt that things were going your way?',                   // reverse
        'Been unable to control the way you spend your time?',
        'Felt difficulties were piling up so high that you could not overcome them?'
      ],

      options: ['Never', 'Almost Never', 'Sometimes', 'Fairly Often', 'Very Often'],

      interpret(raw) {
        if (raw <= 13) return {
          level: 'low', emoji: '🌿',
          label: 'Low Stress',
          color: '#059669',
          description: 'Your stress levels are manageable. Keep up the healthy habits.',
          crisis: false
        };
        if (raw <= 26) return {
          level: 'moderate', emoji: '⚠️',
          label: 'Moderate Stress',
          color: '#D97706',
          description: 'You\'re experiencing noticeable stress. Small daily habits can help significantly.',
          crisis: false
        };
        return {
          level: 'high', emoji: '🚨',
          label: 'High Stress',
          color: '#DC2626',
          description: 'Your stress score is high. We strongly recommend speaking with a counselor.',
          crisis: true
        };
      }
    },

    anxiety: {
      id:         'anxiety',
      label:      'Anxiety Check',
      instrument: 'GAD-7',
      context:    'Over the last 2 weeks, how often have you been bothered by…',
      maxScore:   21,
      optionCount: 4,             // 0-3
      reverseItems: [],

      questions: [
        'Feeling nervous, anxious, or on edge?',
        'Not being able to stop or control worrying?',
        'Worrying too much about different things?',
        'Trouble relaxing?',
        'Being so restless that it\'s hard to sit still?',
        'Becoming easily annoyed or irritable?',
        'Feeling afraid, as if something awful might happen?'
      ],

      options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],

      interpret(raw) {
        if (raw <= 4)  return {
          level: 'minimal', emoji: '🌿',
          label: 'Minimal Anxiety',
          color: '#059669',
          description: 'Minimal anxiety symptoms. Your worry levels appear well managed.',
          crisis: false
        };
        if (raw <= 9)  return {
          level: 'mild', emoji: '💛',
          label: 'Mild Anxiety',
          color: '#D97706',
          description: 'Some anxiety present. Breathing exercises and journaling may help.',
          crisis: false
        };
        if (raw <= 14) return {
          level: 'moderate', emoji: '⚠️',
          label: 'Moderate Anxiety',
          color: '#EA580C',
          description: 'Moderate anxiety detected. Consider speaking with a counselor.',
          crisis: false
        };
        return {
          level: 'severe', emoji: '🚨',
          label: 'Severe Anxiety',
          color: '#DC2626',
          description: 'Severe anxiety symptoms. Please speak with a mental health professional soon.',
          crisis: true
        };
      }
    },

    burnout: {
      id:         'burnout',
      label:      'Burnout Check',
      instrument: 'MBI-SS (8-item)',
      context:    'How often do you experience the following?',
      maxScore:   42,
      optionCount: 7,             // 0-6
      reverseItems: [6, 7],       // efficacy items (positive direction)

      questions: [
        'I feel emotionally drained by my studies.',
        'I feel used up at the end of a day at university.',
        'I feel tired when I get up in the morning and have to face another day.',
        'Studying or attending classes is really a strain for me.',
        'I feel burned out from my studies.',
        'I have become less interested in my studies since I started.',
        'I can effectively solve the problems that arise in my studies.',  // reverse
        'I believe I make an effective contribution to classes or seminars.' // reverse
      ],

      options: ['Never', 'A few times a year', 'Once a month', 'A few times a month',
                'Once a week', 'A few times a week', 'Every day'],

      interpret(raw) {
        if (raw <= 14) return {
          level: 'none', emoji: '🌟',
          label: 'No Burnout',
          color: '#059669',
          description: 'No significant burnout signs. Great — keep protecting your energy.',
          crisis: false
        };
        if (raw <= 28) return {
          level: 'early', emoji: '💛',
          label: 'Early Burnout',
          color: '#D97706',
          description: 'Early burnout signs are present. Address them now before they deepen.',
          crisis: false
        };
        return {
          level: 'detected', emoji: '🔴',
          label: 'Burnout Detected',
          color: '#DC2626',
          description: 'Significant burnout detected. Please prioritise rest and seek support.',
          crisis: true
        };
      }
    },

    focus: {
      id:         'focus',
      label:      'Focus Assessment',
      instrument: 'YodhaMind Custom',
      context:    'How often do the following happen during your study time?',
      maxScore:   24,
      optionCount: 5,             // 0-4
      reverseItems: [5, 6],       // positive focus items

      questions: [
        'I find it hard to start studying even when I plan to.',
        'My mind wanders within 10 minutes of sitting down to study.',
        'I get distracted by my phone or social media while studying.',
        'I feel mentally foggy and unable to retain what I read.',
        'I need to re-read the same paragraph multiple times.',
        'I can study for 45+ minutes without losing focus.',    // reverse
        'After a study session, I feel I genuinely learned something.' // reverse
      ],

      options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],

      interpret(raw) {
        if (raw <= 8)  return {
          level: 'sharp', emoji: '🎯',
          label: 'Sharp Focus',
          color: '#059669',
          description: 'Excellent focus habits. Your study sessions are effective.',
          crisis: false
        };
        if (raw <= 16) return {
          level: 'moderate', emoji: '💛',
          label: 'Moderate Focus',
          color: '#D97706',
          description: 'Some focus challenges. The Pomodoro timer and Focus Realm may help.',
          crisis: false
        };
        return {
          level: 'low', emoji: '⚠️',
          label: 'Low Focus',
          color: '#EA580C',
          description: 'Focus is significantly impaired. Try short sessions with structured breaks.',
          crisis: false
        };
      }
    }
  };

  /* ═══════════════════════════════════════════
     SCORING FUNCTIONS
  ═══════════════════════════════════════════ */

  /**
   * Score a completed assessment.
   *
   * @param {string}   testId    'stress' | 'anxiety' | 'burnout' | 'focus'
   * @param {number[]} responses  Array of 0-based answer indices,
   *                             one per question (length must match test)
   *
   * @returns {{
   *   testId:      string,
   *   raw:         number,   // sum of scored values
   *   maxScore:    number,
   *   risk:        number,   // 0-100 normalised (higher = more at-risk)
   *   interpretation: Object // from test.interpret()
   * }}
   */
  function scoreAssessment(testId, responses) {
    const test = TESTS[testId];
    if (!test)       throw new Error('[WE] Unknown test: ' + testId);
    if (!responses || responses.length !== test.questions.length) {
      throw new Error('[WE] Response count mismatch for ' + testId);
    }

    const maxOption = test.optionCount - 1;
    let raw = 0;

    for (let i = 0; i < responses.length; i++) {
      const val = test.reverseItems.indexOf(i) !== -1
        ? maxOption - responses[i]
        : responses[i];
      raw += val;
    }

    // Normalise to 0-100 risk (higher = worse)
    const risk = Math.round((raw / test.maxScore) * 100);

    return {
      testId,
      raw,
      maxScore:       test.maxScore,
      risk,
      interpretation: test.interpret(raw)
    };
  }

  /* ═══════════════════════════════════════════
     WELLNESS SCORE COMPUTATION
     (mirrors storage.js _computeWellness but as a
      pure function — pass data in, no localStorage)
  ═══════════════════════════════════════════ */

  /**
   * Compute a wellness score from raw data.
   *
   * @param {Object} data
   * @param {Object[]} data.moods7        mood logs from last 7 days [{ mood:1-5 }]
   * @param {number}   data.weekActivities total game sessions + journal entries this week
   * @param {Object|null} data.latestAssessment  { risk: 0-100 } or null
   * @param {number}   data.streakDays    current streak
   *
   * @returns {{ score, label, color, components }}
   */
  function computeWellness(data) {
    const moods7           = data.moods7           || [];
    const weekActivities   = data.weekActivities   || 0;
    const latestAssessment = data.latestAssessment  || null;
    const streakDays       = data.streakDays        || 0;

    // Mood (35%)
    let moodScore;
    if (!moods7.length) {
      moodScore = 50;
    } else {
      const avg = moods7.reduce((s, l) => s + l.mood, 0) / moods7.length;
      moodScore = Math.round(((avg - 1) / 4) * 100);
    }

    // Engagement (20%)
    const engageScore = Math.min(Math.round((weekActivities / 7) * 100), 100);

    // Assessment (30%)
    const assessScore = latestAssessment
      ? Math.max(0, 100 - (latestAssessment.risk || 50))
      : 50;

    // Streak (15%)
    const streakScore = Math.min(Math.round((streakDays / 14) * 100), 100);

    const score = Math.round(
      moodScore   * 0.35 +
      engageScore * 0.20 +
      assessScore * 0.30 +
      streakScore * 0.15
    );

    return {
      score,
      label:      wellnessLabel(score),
      color:      wellnessColor(score),
      components: { moodScore, engageScore, assessScore, streakScore }
    };
  }

  /* ═══════════════════════════════════════════
     LABEL / COLOR HELPERS  (exported individually)
  ═══════════════════════════════════════════ */

  function wellnessLabel(score) {
    if (score >= 80) return 'Thriving';
    if (score >= 65) return 'Doing Good';
    if (score >= 50) return 'Holding Steady';
    if (score >= 35) return 'Struggling';
    return 'Needs Support';
  }

  function wellnessColor(score) {
    if (score >= 80) return '#10B981';
    if (score >= 65) return '#56CFB2';
    if (score >= 50) return '#7C5CBF';
    if (score >= 35) return '#F59E0B';
    return '#EF4444';
  }

  /* ═══════════════════════════════════════════
     SUGGESTIONS ENGINE
     Maps a test result to actionable suggestions.
  ═══════════════════════════════════════════ */

  const SUGGESTIONS = {
    stress: {
      low: [
        { text: 'Keep logging your mood daily to track your positive trend.',   link: '/dashboard'  },
        { text: 'Try Mandala drawing to maintain your calm and creativity.',     link: '/games/yodha_mandala.html' },
        { text: 'Challenge yourself with Enchaeos to build mental resilience.',  link: '/games/yodha_enchaeos.html' }
      ],
      moderate: [
        { text: 'Do 5 minutes of 4-7-8 breathing right now — it directly lowers cortisol.', link: '/tools/Yodhaflow.html' },
        { text: 'Use the Pomodoro timer to break study into manageable 25-min chunks.',       link: '/tools/Focusrealm.html' },
        { text: 'Journal your stress triggers — writing reduces their psychological power.',   link: '/journal' }
      ],
      high: [
        { text: 'We strongly recommend booking a session with a counselor today.',  link: '/connect'  },
        { text: 'Open Yodha Flow right now — do one full breathing round (3 min).', link: '/tools/Yodhaflow.html' },
        { text: 'Mandala drawing is clinically proven to reduce acute stress.',     link: '/games/yodha_mandala.html' }
      ]
    },
    anxiety: {
      minimal: [
        { text: 'Great baseline — keep your daily check-in habit going.',           link: '/dashboard' },
        { text: 'Play Lumina to keep your visual processing sharp.',               link: '/games/yodha_lumina.html' },
        { text: 'Write a gratitude entry in your journal.',                         link: '/journal'   }
      ],
      mild: [
        { text: 'Try box breathing (4-4-4-4) when anxious thoughts arrive.',        link: '/tools/Yodhaflow.html' },
        { text: 'Journal what is worrying you — externalising thoughts reduces anxiety.', link: '/journal' },
        { text: 'Yodha Match memory game helps redirect anxious mental energy.',    link: '/games/yodhamatch.html' }
      ],
      moderate: [
        { text: 'Consider booking a counseling session — moderate anxiety responds very well to CBT.', link: '/connect' },
        { text: 'Daily breathing practice significantly reduces GAD symptoms over 2 weeks.',           link: '/tools/Yodhaflow.html' },
        { text: 'Use the Focus Realm timer to create structured, less overwhelming study blocks.',      link: '/tools/Focusrealm.html' }
      ],
      severe: [
        { text: 'Please speak to a counselor — severe anxiety is very treatable with professional help.', link: '/connect' },
        { text: 'Right now: open Yodha Flow and complete two full breathing cycles.',                      link: '/tools/Yodhaflow.html' },
        { text: 'Connect with the anonymous community — you are not alone in this.',                       link: '/community' }
      ]
    },
    burnout: {
      none: [
        { text: 'Excellent energy levels — protect them by avoiding overcommitting.', link: '/dashboard'  },
        { text: 'Play a game to keep your mind engaged without pressure.',            link: '/games'       },
        { text: 'Log a journal reflection on what\'s keeping you energised.',         link: '/journal'     }
      ],
      early: [
        { text: 'Take intentional breaks — even 15-minute walks reset the nervous system.',  link: '/tools/Yodhaflow.html' },
        { text: 'Reduce your daily task list to 3 most important things.',                   link: '/journal'    },
        { text: 'Mandala drawing is a proven active recovery tool for early burnout.',       link: '/games/yodha_mandala.html' }
      ],
      detected: [
        { text: 'Burnout needs rest first — speak to a counselor about a structured recovery plan.', link: '/connect' },
        { text: 'Do nothing demanding today. Use Yodha Flow for a calming breathing session.',       link: '/tools/Yodhaflow.html' },
        { text: 'Write freely in your journal without any agenda — just unload.',                    link: '/journal'  }
      ]
    },
    focus: {
      sharp: [
        { text: 'Your focus is strong — challenge it with Enchaeos reaction game.',   link: '/games/yodha_enchaeos.html' },
        { text: 'Use deep work blocks of 90 minutes with 20-minute breaks.',          link: '/tools/Focusrealm.html' },
        { text: 'Track your best focus times in your journal to build a schedule.',   link: '/journal' }
      ],
      moderate: [
        { text: 'Start sessions with 5 min of breathing to prime your focus state.',  link: '/tools/Yodhaflow.html'  },
        { text: 'Use 25-minute Pomodoro blocks — short targets are easier to start.',  link: '/tools/Focusrealm.html' },
        { text: 'Lumina pattern game trains the same visual attention used for reading.', link: '/games/yodha_lumina.html' }
      ],
      low: [
        { text: 'Start with just 10-minute study blocks — build momentum first.',     link: '/tools/Focusrealm.html' },
        { text: 'If anxiety is driving your focus issues, take the Anxiety Check.',   link: '/assessment?type=anxiety' },
        { text: 'A counselor can help identify underlying focus difficulties.',       link: '/connect' }
      ]
    }
  };

  /**
   * Get personalised suggestions for an assessment result.
   *
   * @param {string} testId   'stress' | 'anxiety' | 'burnout' | 'focus'
   * @param {string} level    interpretation.level from scoreAssessment()
   * @returns {Array<{ text: string, link: string }>}
   */
  function getSuggestions(testId, level) {
    const testSuggestions = SUGGESTIONS[testId];
    if (!testSuggestions) return [];
    return testSuggestions[level] || [];
  }

  /* ═══════════════════════════════════════════
     MOOD TREND ANALYSIS
  ═══════════════════════════════════════════ */

  /**
   * Compute trend from an array of mood logs.
   *
   * @param {Array<{ mood: number, ts: string }>} logs
   * @returns {{
   *   avg:    number,   // 1-5 average
   *   trend:  string,   // 'improving' | 'declining' | 'stable'
   *   delta:  number    // avg(last 3) - avg(first 3), clamped to ±4
   * }}
   */
  function moodTrend(logs) {
    if (!logs || logs.length < 2) {
      return { avg: logs && logs.length === 1 ? logs[0].mood : 3, trend: 'stable', delta: 0 };
    }

    const sorted = logs.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const avg    = sorted.reduce((s, l) => s + l.mood, 0) / sorted.length;

    const half    = Math.max(Math.floor(sorted.length / 2), 1);
    const first   = sorted.slice(0, half);
    const last    = sorted.slice(sorted.length - half);
    const firstAvg = first.reduce((s, l) => s + l.mood, 0) / first.length;
    const lastAvg  = last.reduce((s,  l) => s + l.mood, 0) / last.length;

    const delta   = Math.round((lastAvg - firstAvg) * 10) / 10;
    let trend     = 'stable';
    if (delta >= 0.4)  trend = 'improving';
    if (delta <= -0.4) trend = 'declining';

    return { avg: Math.round(avg * 10) / 10, trend, delta };
  }

  /* ═══════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════ */

  return {
    TESTS,
    scoreAssessment,
    computeWellness,
    wellnessLabel,
    wellnessColor,
    getSuggestions,
    moodTrend
  };

}());

/* ── Expose globally ────────────────────────── */
if (typeof window !== 'undefined') {
  window.WE = WE;
}

/* ── CommonJS export ────────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WE;
}
