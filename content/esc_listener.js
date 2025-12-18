(() => {
  'use strict';

  // В top-frame Esc и так ловит overlay.js.
  // Наша задача — ловить Esc в iframe, где фокус может "застрять".
  if (window.top === window) return;

  const handler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'SELECTION_CANCELLED' });
    }
  };

  // capture-phase, чтобы успеть раньше обработчиков сайта
  document.addEventListener('keydown', handler, true);
})();
