(function () {
  'use strict';

  if (window.__ymCrisisSupportMounted) return;
  window.__ymCrisisSupportMounted = true;

  var css = [
    '.ym-crisis-bar {',
    '  position: fixed;',
    '  left: 0;',
    '  right: 0;',
    '  bottom: 0;',
    '  z-index: 1100;',
    '  background: #0b1220;',
    '  color: #f8fafc;',
    '  border-top: 2px solid #ef4444;',
    '  padding: 10px 14px;',
    '  font: 600 14px/1.35 "Segoe UI", Tahoma, sans-serif;',
    '  text-align: center;',
    '}',
    '.ym-crisis-bar a {',
    '  color: #fde68a;',
    '  font-weight: 800;',
    '  text-decoration: underline;',
    '}',
    '.ym-crisis-help-btn {',
    '  position: fixed;',
    '  right: 14px;',
    '  bottom: 62px;',
    '  z-index: 1110;',
    '  border: 0;',
    '  border-radius: 999px;',
    '  padding: 12px 16px;',
    '  background: #dc2626;',
    '  color: #fff;',
    '  font: 700 14px/1 "Segoe UI", Tahoma, sans-serif;',
    '  box-shadow: 0 10px 22px rgba(0,0,0,0.28);',
    '  cursor: pointer;',
    '}',
    '.ym-crisis-help-btn:focus-visible {',
    '  outline: 3px solid #93c5fd;',
    '  outline-offset: 2px;',
    '}',
    '.ym-crisis-modal {',
    '  position: fixed;',
    '  inset: 0;',
    '  z-index: 1120;',
    '  display: none;',
    '  align-items: center;',
    '  justify-content: center;',
    '  background: rgba(2, 6, 23, 0.62);',
    '  backdrop-filter: blur(3px);',
    '}',
    '.ym-crisis-modal.open {',
    '  display: flex;',
    '}',
    '.ym-crisis-dialog {',
    '  width: min(92vw, 440px);',
    '  background: #ffffff;',
    '  color: #0f172a;',
    '  border-radius: 14px;',
    '  border: 1px solid #e2e8f0;',
    '  box-shadow: 0 20px 50px rgba(0,0,0,0.24);',
    '  padding: 18px 18px 16px;',
    '}',
    '.ym-crisis-dialog h3 {',
    '  margin: 0 0 8px;',
    '  font: 800 18px/1.3 "Segoe UI", Tahoma, sans-serif;',
    '}',
    '.ym-crisis-dialog p {',
    '  margin: 0 0 12px;',
    '  color: #334155;',
    '  font: 500 14px/1.45 "Segoe UI", Tahoma, sans-serif;',
    '}',
    '.ym-crisis-actions {',
    '  display: flex;',
    '  gap: 10px;',
    '}',
    '.ym-crisis-call, .ym-crisis-close {',
    '  flex: 1;',
    '  border-radius: 10px;',
    '  padding: 10px 12px;',
    '  text-align: center;',
    '  text-decoration: none;',
    '  font: 700 14px/1 "Segoe UI", Tahoma, sans-serif;',
    '}',
    '.ym-crisis-call {',
    '  background: #dc2626;',
    '  color: #fff;',
    '  border: 1px solid #dc2626;',
    '}',
    '.ym-crisis-close {',
    '  background: #f8fafc;',
    '  color: #0f172a;',
    '  border: 1px solid #cbd5e1;',
    '}',
    '@media (max-width: 640px) {',
    '  .ym-crisis-bar {',
    '    font-size: 13px;',
    '    padding: 10px 12px;',
    '  }',
    '  .ym-crisis-help-btn {',
    '    right: 10px;',
    '    bottom: 60px;',
    '    padding: 11px 13px;',
    '    font-size: 13px;',
    '  }',
    '}',
  ].join('\n');

  var styleTag = document.createElement('style');
  styleTag.setAttribute('id', 'ym-crisis-style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  var bar = document.createElement('div');
  bar.className = 'ym-crisis-bar';
  bar.setAttribute('role', 'note');
  bar.innerHTML = 'Need immediate help? Call iCALL: <a href="tel:9152987821">9152987821</a>';
  document.body.appendChild(bar);

  var helpBtn = document.createElement('button');
  helpBtn.className = 'ym-crisis-help-btn';
  helpBtn.setAttribute('type', 'button');
  helpBtn.setAttribute('aria-haspopup', 'dialog');
  helpBtn.setAttribute('aria-controls', 'ym-crisis-modal');
  helpBtn.textContent = 'Need Help Now?';
  document.body.appendChild(helpBtn);

  var modal = document.createElement('div');
  modal.className = 'ym-crisis-modal';
  modal.setAttribute('id', 'ym-crisis-modal');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = [
    '<div class="ym-crisis-dialog" role="dialog" aria-modal="true" aria-labelledby="ym-crisis-title">',
    '  <h3 id="ym-crisis-title">Need Help Now?</h3>',
    '  <p>If you\'re in distress, please reach out immediately.</p>',
    '  <p><strong>Call iCALL: <a href="tel:9152987821">9152987821</a></strong></p>',
    '  <div class="ym-crisis-actions">',
    '    <a class="ym-crisis-call" href="tel:9152987821">Call iCALL</a>',
    '    <button class="ym-crisis-close" type="button">Close</button>',
    '  </div>',
    '</div>'
  ].join('');
  document.body.appendChild(modal);

  var closeBtn = modal.querySelector('.ym-crisis-close');

  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    closeBtn.focus();
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    helpBtn.focus();
  }

  helpBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closeModal();
    }
  });

  var barHeight = bar.getBoundingClientRect().height;
  var currentPadding = parseInt(window.getComputedStyle(document.body).paddingBottom, 10) || 0;
  document.body.style.paddingBottom = (currentPadding + barHeight + 8) + 'px';
})();
