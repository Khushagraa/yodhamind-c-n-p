/**
 * ym-nav.js — YodhaMind Shared Navigation Module
 * ═══════════════════════════════════════════════
 *
 * Drop this script at the end of <body> on any YodhaMind page.
 * It enhances the existing nav HTML with:
 *
 *   1. Scroll shadow on #navbar
 *   2. Streak pill injection (if YM streak > 0)
 *   3. Active link highlighting (matches current filename)
 *   4. Smooth keyboard trap for modals (ESC to close)
 *   5. Mobile nav active state sync
 *   6. Page transition fade-in
 *
 * Prerequisites:
 *   - shared/ym-storage.js loaded before this file
 *   - Nav must have id="navbar"
 *   - Nav links should be <a href="page.html"> pointing to their pages
 *
 * Usage:
 *   <script src="shared/ym-storage.js"></script>
 *   <script src="shared/ym-nav.js"></script>  ← just before </body>
 */

(function() {
  'use strict';

  /* ─────────────────────────────────────────────
     1. SCROLL SHADOW
  ───────────────────────────────────────────── */
  const navbar = document.getElementById('navbar');

  if (navbar) {
    const updateScrollShadow = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 10);
    };
    window.addEventListener('scroll', updateScrollShadow, { passive: true });
    updateScrollShadow(); // run on load
  }

  /* ─────────────────────────────────────────────
     2. STREAK PILL
     Looks for .streak-pill / #streakPill in the nav.
     If found, shows it when streak > 0.
     If not found, injects one before .btn-cta or at end of .nav-right.
  ───────────────────────────────────────────── */
  function initStreakPill() {
    if (typeof YM === 'undefined') return;

    const streak = YM.getStreak();
    if (!streak || streak.current < 1) return;

    // Try to find existing streak pill element
    let pill = document.getElementById('streakPill') ||
               document.querySelector('.streak-pill');

    if (pill) {
      // Update count + show
      const numEl = pill.querySelector('#streakNum') ||
                    pill.querySelector('.streak-num') ||
                    pill.querySelector('span');
      if (numEl) numEl.textContent = streak.current;
      pill.classList.remove('hidden');
      pill.classList.add('show');
      pill.style.display = 'flex';
    } else {
      // Inject fresh pill into .nav-right or .nav-controls
      const container = navbar &&
        (navbar.querySelector('.nav-right') ||
         navbar.querySelector('.nav-controls') ||
         navbar.querySelector('.nav-container'));

      if (!container) return;

      pill = document.createElement('div');
      pill.className = 'streak-pill';
      pill.id        = 'ym-injected-streak';
      pill.style.cssText = [
        'display:flex', 'align-items:center', 'gap:5px',
        'background:white', 'border:1px solid rgba(124,92,191,0.2)',
        'padding:6px 13px', 'border-radius:50px',
        'font-size:0.82rem', 'font-weight:700', 'color:#7C5CBF',
        'font-family:inherit'
      ].join(';');
      pill.innerHTML = `🔥 <span>${streak.current}</span>-day streak`;

      // Insert before the last button in container
      const lastBtn = container.querySelector('a:last-child, button:last-child');
      if (lastBtn) {
        container.insertBefore(pill, lastBtn);
      } else {
        container.appendChild(pill);
      }
    }
  }

  /* ─────────────────────────────────────────────
     3. ACTIVE LINK HIGHLIGHTING
     Compares each nav <a> href to current page filename.
     Adds class="active" to matching link.
  ───────────────────────────────────────────── */
  function highlightActiveLink() {
    const current = window.location.pathname.split('/').pop() || 'index.html';

    // Desktop nav links
    document.querySelectorAll('nav a, .nav-links a, .mobile-nav a').forEach(link => {
      const href = (link.getAttribute('href') || '').split('/').pop().split('?')[0];
      if (href && href === current) {
        link.classList.add('active');
      } else if (href && link.classList.contains('active') && href !== current) {
        // Only remove if it wasn't manually set via HTML
        // (respect explicit class="active" in the HTML markup)
      }
    });
  }

  /* ─────────────────────────────────────────────
     4. MODAL ESC KEY HANDLER
     Any element with class="modal-overlay" or class="confirm-overlay"
     will be closed when ESC is pressed.
  ───────────────────────────────────────────── */
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-overlay.open, .confirm-overlay.open, .setup-overlay.open')
      .forEach(el => el.classList.remove('open'));
  });

  /* ─────────────────────────────────────────────
     5. PAGE TRANSITION FADE-IN
     Adds a subtle fade-in when any page loads.
     Only applied if body doesn't already have
     a page-transition class.
  ───────────────────────────────────────────── */
  function initPageTransition() {
    if (document.body.dataset.navTransition) return; // already handled
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.22s ease';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.style.opacity = '1';
      });
    });
    document.body.dataset.navTransition = '1';
  }

  /* ─────────────────────────────────────────────
     6. SMOOTH CROSS-PAGE NAVIGATION
     Intercepts internal link clicks to add a
     brief fade-out before navigating.
  ───────────────────────────────────────────── */
  function initSmoothNav() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      // Only handle relative internal links (.html pages)
      if (!href || href.startsWith('http') || href.startsWith('#') ||
          href.startsWith('tel:') || href.startsWith('mailto:') ||
          !href.endsWith('.html')) return;

      // Skip if modifier key held (open in new tab etc.)
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (link.target === '_blank') return;

      e.preventDefault();

      document.body.style.opacity = '0';
      document.body.style.transition = 'opacity 0.18s ease';

      setTimeout(() => {
        window.location.href = href;
      }, 180);
    });
  }

  /* ─────────────────────────────────────────────
     7. WELLNESS SCORE BADGE (optional)
     If a .ym-wellness-badge element exists on page,
     populates it with the cached wellness score.
  ───────────────────────────────────────────── */
  function initWellnessBadge() {
    if (typeof YM === 'undefined') return;
    const badge = document.querySelector('.ym-wellness-badge');
    if (!badge) return;

    const ws = YM.getCachedWellnessScore();
    if (!ws) return;

    badge.textContent = ws.total;
    badge.style.color = ws.color || '#7C5CBF';
    badge.title = `Wellness: ${ws.label}`;
  }

  /* ─────────────────────────────────────────────
     8. BOTTOM NAV BADGE FOR PENDING BOOKINGS
     Adds a small red dot to the Support link in
     the mobile nav if there are pending bookings.
  ───────────────────────────────────────────── */
  function initBookingBadge() {
    if (typeof YM === 'undefined') return;
    const bookings = YM.get('ym_student_bookings', []);
    const pending  = bookings.filter(b => b.status === 'pending').length;
    if (!pending) return;

    // Find the Support link in mobile nav
    const mobileNav = document.querySelector('.mobile-nav');
    if (!mobileNav) return;

    const supportLink = Array.from(mobileNav.querySelectorAll('a'))
      .find(a => (a.getAttribute('href') || '').includes('connect'));

    if (!supportLink) return;

    const dot = document.createElement('span');
    dot.style.cssText = [
      'position:absolute', 'top:2px', 'right:6px',
      'width:8px', 'height:8px', 'border-radius:50%',
      'background:#EF4444', 'border:1.5px solid white'
    ].join(';');
    supportLink.style.position = 'relative';
    supportLink.appendChild(dot);
  }

  /* ─────────────────────────────────────────────
     9. AUTO-UPDATE STREAK ON DAILY VISIT
     Calls YM.getStreak() which triggers internal
     streak logic, ensuring visits are counted
     even if no explicit activity is logged.
     (Note: YM only increments streak on explicit
      mood/journal/game activity — this just ensures
      the streak pill reflects the latest count.)
  ───────────────────────────────────────────── */
  function warmStreakCache() {
    if (typeof YM === 'undefined') return;
    YM.getStreak(); // warm the cache
  }

  /* ─────────────────────────────────────────────
     INIT — run on DOM ready
  ───────────────────────────────────────────── */
  function init() {
    warmStreakCache();
    initStreakPill();
    highlightActiveLink();
    initPageTransition();
    initSmoothNav();
    initWellnessBadge();
    initBookingBadge();

    // Re-run streak pill after a tick (some pages init YM async)
    setTimeout(initStreakPill, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
