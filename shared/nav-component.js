/**
 * shared/nav-component.js — YodhaMind Navigation Enhancer
 * ══════════════════════════════════════════════════════════
 *
 * Drop this script at the END of <body> on every page.
 * Requires shared/storage.js to be loaded first.
 *
 *   <script src="/shared/storage.js"></script>
 *   <script src="/shared/nav-component.js"></script>   ← last before </body>
 *
 * What it does automatically:
 *   1. Scroll shadow  — adds .scrolled class to #navbar on scroll
 *   2. Streak pill    — shows/injects streak count in nav
 *   3. Active links   — highlights current page in both desktop + mobile nav
 *   4. ESC to close   — closes any open .modal-overlay on Escape
 *   5. Page fade-in   — smooth opacity transition on load
 *   6. Smooth nav     — 180ms fade-out before internal link navigation
 *   7. Pending badge  — red dot on mobile Support link if pending bookings
 *   8. Wellness badge — populates any .ym-wellness-badge element with score
 *
 * No configuration needed — everything is auto-detected from the DOM.
 */

/* global window, document, YM */

(function () {
  'use strict';

  /* ── Helpers ─────────────────────────────── */

  function $(sel, ctx)  { return (ctx || document).querySelector(sel);   }
  function $$(sel, ctx) { return (ctx || document).querySelectorAll(sel); }

  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  /* ══════════════════════════════════════════
     1. SCROLL SHADOW
  ══════════════════════════════════════════ */

  function initScrollShadow() {
    const nav = $('#navbar');
    if (!nav) return;

    function update() {
      nav.classList.toggle('scrolled', window.scrollY > 10);
    }

    window.addEventListener('scroll', update, { passive: true });
    update(); // apply immediately on load
  }

  /* ══════════════════════════════════════════
     2. STREAK PILL
     Looks for an existing #streakPill / .streak-pill.
     If found → updates the count and shows it.
     If not found → injects one into .nav-right.
  ══════════════════════════════════════════ */

  function initStreakPill() {
    if (typeof YM === 'undefined') return;

    const streak = YM.getStreak();
    if (!streak || streak.current < 1) return;

    // Try existing element
    var pill = $('#streakPill') || $('.streak-pill');

    if (pill) {
      // Update number inside pill
      var numEl = pill.querySelector('#streakNum, .streak-num, span');
      if (numEl) numEl.textContent = streak.current;
      pill.classList.remove('hidden');
      pill.classList.add('show');
      pill.style.display = 'flex';
      return;
    }

    // Inject new pill
    var container = $('#navbar .nav-right') ||
                    $('#navbar .nav-controls') ||
                    $('#navbar .nav-container');
    if (!container) return;

    pill = document.createElement('div');
    pill.id        = 'ym-streak-pill';
    pill.className = 'streak-pill';
    pill.style.cssText = [
      'display:flex', 'align-items:center', 'gap:5px',
      'background:white', 'border:1px solid rgba(124,92,191,0.2)',
      'padding:6px 14px', 'border-radius:50px',
      'font-size:0.83rem', 'font-weight:700', 'color:#7C5CBF',
      'font-family:inherit'
    ].join(';');

    pill.innerHTML = '🔥 <span>' + streak.current + '</span>-day streak';

    // Insert before the last child (usually the CTA button)
    var lastChild = container.children[container.children.length - 1];
    if (lastChild) {
      container.insertBefore(pill, lastChild);
    } else {
      container.appendChild(pill);
    }
  }

  /* ══════════════════════════════════════════
     3. ACTIVE LINK HIGHLIGHTING
  ══════════════════════════════════════════ */

  function initActiveLinks() {
    var page = currentPage();

    $$('nav a, .nav-links a, .mobile-nav a').forEach(function (link) {
      var href = (link.getAttribute('href') || '').split('/').pop().split('?')[0];
      if (href && href === page) {
        link.classList.add('active');
      }
    });
  }

  /* ══════════════════════════════════════════
     4. ESC KEY — close any open modal
  ══════════════════════════════════════════ */

  function initEscapeHandler() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      $$('.modal-overlay.open, .confirm-overlay.open, .setup-overlay.open')
        .forEach(function (el) { el.classList.remove('open'); });
    });
  }

  /* ══════════════════════════════════════════
     5. PAGE FADE-IN
  ══════════════════════════════════════════ */

  function initFadeIn() {
    if (document.body.dataset.ymTransition) return; // already done
    document.body.style.opacity    = '0';
    document.body.style.transition = 'opacity 0.22s ease';

    // Two rAF calls to ensure the initial opacity is painted first
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.body.style.opacity = '1';
      });
    });

    document.body.dataset.ymTransition = '1';
  }

  /* ══════════════════════════════════════════
     6. SMOOTH INTERNAL NAVIGATION
     180ms fade-out before following a local link.
  ══════════════════════════════════════════ */

  function initSmoothNav() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href]');
      if (!link) return;

      var href = link.getAttribute('href') || '';

      // Only handle simple relative .html links
      if (href.startsWith('http')   ||
          href.startsWith('//')     ||
          href.startsWith('#')      ||
          href.startsWith('tel:')   ||
          href.startsWith('mailto:')) return;

      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (link.target === '_blank') return;

      e.preventDefault();

      document.body.style.opacity    = '0';
      document.body.style.transition = 'opacity 0.18s ease';

      setTimeout(function () {
        window.location.href = href;
      }, 180);
    });
  }

  /* ══════════════════════════════════════════
     7. PENDING BOOKING BADGE
     Red dot on mobile Support link if any
     ym_student_bookings are pending.
  ══════════════════════════════════════════ */

  function initBookingBadge() {
    if (typeof YM === 'undefined') return;

    var bookings = YM.get('ym_student_bookings', []);
    var pending  = bookings.filter(function (b) { return b.status === 'pending'; }).length;
    if (!pending) return;

    var mobileNav   = $('.mobile-nav');
    if (!mobileNav) return;

    var supportLink = null;
    $$('a', mobileNav).forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (href.indexOf('connect') !== -1) supportLink = a;
    });

    if (!supportLink) return;

    var dot = document.createElement('span');
    dot.style.cssText = [
      'position:absolute', 'top:2px', 'right:4px',
      'width:8px', 'height:8px', 'border-radius:50%',
      'background:#EF4444', 'border:1.5px solid white',
      'pointer-events:none'
    ].join(';');

    supportLink.style.position = 'relative';
    supportLink.appendChild(dot);
  }

  /* ══════════════════════════════════════════
     8. WELLNESS BADGE
     Populates .ym-wellness-badge elements if any.
  ══════════════════════════════════════════ */

  function initWellnessBadge() {
    if (typeof YM === 'undefined') return;

    $$('.ym-wellness-badge').forEach(function (el) {
      var ws = YM.getCachedWellnessScore();
      if (!ws) return;
      el.textContent = ws.score !== undefined ? ws.score : ws.total;
      if (ws.color) el.style.color = ws.color;
      el.title = 'Wellness: ' + (ws.label || '');
    });
  }

  /* ══════════════════════════════════════════
     9. PRIVACY CONSENT BANNER
     Injects a consent banner if not accepted.
  ══════════════════════════════════════════ */

  function initPrivacyBanner() {
    if (localStorage.getItem('ym_privacy_consent') === 'true') return;

    var banner = document.createElement('div');
    banner.id = 'ym-privacy-banner';
    banner.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0',
      'background:var(--ink, #1a1625)', 'color:#fff', 'padding:16px 20px',
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'gap:20px', 'z-index:9999', 'font-size:0.85rem', 'font-family:inherit',
      'box-shadow:0 -4px 20px rgba(0,0,0,0.1)'
    ].join(';');

    // Handle mobile stacking
    if (window.innerWidth < 600) {
      banner.style.flexDirection = 'column';
      banner.style.textAlign = 'center';
      banner.style.paddingBottom = '80px'; // clear mobile nav
    }

    banner.innerHTML = `
      <div>
        <strong>Privacy Notice:</strong> We use local storage to save your progress and provide emergency crisis support if needed.
        <a href="privacy.html" style="color:var(--accent, #56CFB2);text-decoration:underline;margin-left:6px;">Read Policy</a>
      </div>
      <button id="ym-privacy-btn" style="
        background:var(--accent, #56CFB2); color:var(--ink, #1a1625);
        border:none; padding:8px 18px; border-radius:8px; font-weight:700;
        cursor:pointer; white-space:nowrap; font-family:inherit;
      ">Got it</button>
    `;

    document.body.appendChild(banner);

    document.getElementById('ym-privacy-btn').addEventListener('click', function() {
      localStorage.setItem('ym_privacy_consent', 'true');
      banner.style.opacity = '0';
      banner.style.transition = 'opacity 0.3s ease';
      setTimeout(function() { banner.remove(); }, 300);
    });
  }

  /* ══════════════════════════════════════════
     INIT — run on DOMContentLoaded
  ══════════════════════════════════════════ */

  function init() {
    initScrollShadow();
    initActiveLinks();
    initEscapeHandler();
    initFadeIn();
    initSmoothNav();
    initPrivacyBanner();

    // YM-dependent features — retry after a tick in case
    // storage.js is deferred or loaded async
    initStreakPill();
    initBookingBadge();
    initWellnessBadge();

    setTimeout(function () {
      initStreakPill();    // second pass for pages that init YM after DOMContentLoaded
      initWellnessBadge();
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
