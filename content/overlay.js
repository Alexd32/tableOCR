(() => {
  'use strict';

  if (document.getElementById('table_ocr_overlay')) return;

  let overlay = null;
  let selection = null;
  let hint = null;

  let m_top = null, m_left = null, m_right = null, m_bottom = null;

  let is_selecting = false;
  let start_x = 0, start_y = 0;

  let is_cleaning_up = false;

  begin();

  function begin() {
    document.documentElement.dataset.tableOcrOldOverflow = document.documentElement.style.overflow || '';
    document.body.dataset.tableOcrOldOverflow = document.body.style.overflow || '';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    overlay = document.createElement('div');
    overlay.id = 'table_ocr_overlay';

    hint = document.createElement('div');
    hint.id = 'table_ocr_selection_hint';
    hint.textContent = 'Select area with mouse. Press Esc to cancel.';
    overlay.appendChild(hint);

    m_top = mk_mask();
    m_left = mk_mask();
    m_right = mk_mask();
    m_bottom = mk_mask();

    overlay.appendChild(m_top);
    overlay.appendChild(m_left);
    overlay.appendChild(m_right);
    overlay.appendChild(m_bottom);

    selection = document.createElement('div');
    selection.id = 'table_ocr_selection';
    overlay.appendChild(selection);

    document.documentElement.appendChild(overlay);

    overlay.addEventListener('mousedown', on_down, true);
    window.addEventListener('mousemove', on_move, true);
    window.addEventListener('mouseup', on_up, true);

    document.addEventListener('keydown', on_key, true);

    // слушаем принудительную команду очистки (например Esc был в iframe)
    chrome.runtime.onMessage.addListener(on_runtime_message);

    update_rect(0, 0, 0, 0);
  }

  function on_runtime_message(msg) {
    if (!msg || msg.type !== 'FORCE_OVERLAY_CLEANUP') return;
    cleanup();
  }

  function mk_mask() {
    const d = document.createElement('div');
    d.className = 'table_ocr_mask';
    return d;
  }

  function on_down(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    is_selecting = true;
    start_x = e.clientX;
    start_y = e.clientY;

    update_rect(start_x, start_y, 0, 0);
  }

  function on_move(e) {
    if (!is_selecting) return;

    const x2 = e.clientX;
    const y2 = e.clientY;

    const left = Math.min(start_x, x2);
    const top = Math.min(start_y, y2);
    const width = Math.abs(x2 - start_x);
    const height = Math.abs(y2 - start_y);

    update_rect(left, top, width, height);
  }

  function on_up(e) {
    if (!is_selecting) return;
    is_selecting = false;

    e.preventDefault();
    e.stopPropagation();

    const rect = selection.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) {
      cancel();
      return;
    }

    const result = {
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
      scroll_x: window.scrollX,
      scroll_y: window.scrollY,
      dpr: window.devicePixelRatio || 1
    };

    chrome.runtime.sendMessage({ type: 'SELECTION_FINISHED', rect: result }, () => cleanup());
  }

  function on_key(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }

  function cancel() {
    if (is_cleaning_up) return;
    chrome.runtime.sendMessage({ type: 'SELECTION_CANCELLED' }, () => cleanup());
  }

  function update_rect(left, top, width, height) {
    selection.style.left = `${left}px`;
    selection.style.top = `${top}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    m_top.style.left = `0px`;
    m_top.style.top = `0px`;
    m_top.style.width = `${vw}px`;
    m_top.style.height = `${top}px`;

    m_left.style.left = `0px`;
    m_left.style.top = `${top}px`;
    m_left.style.width = `${left}px`;
    m_left.style.height = `${height}px`;

    m_right.style.left = `${left + width}px`;
    m_right.style.top = `${top}px`;
    m_right.style.width = `${Math.max(0, vw - (left + width))}px`;
    m_right.style.height = `${height}px`;

    m_bottom.style.left = `0px`;
    m_bottom.style.top = `${top + height}px`;
    m_bottom.style.width = `${vw}px`;
    m_bottom.style.height = `${Math.max(0, vh - (top + height))}px`;
  }

  function cleanup() {
    if (is_cleaning_up) return;
    is_cleaning_up = true;

    try {
      chrome.runtime.onMessage.removeListener(on_runtime_message);
    } catch (_) {}

    try {
      if (overlay) {
        overlay.removeEventListener('mousedown', on_down, true);
        overlay.remove();
      }

      window.removeEventListener('mousemove', on_move, true);
      window.removeEventListener('mouseup', on_up, true);
      document.removeEventListener('keydown', on_key, true);
    } catch (_) {}

    overlay = null;
    selection = null;
    hint = null;
    m_top = m_left = m_right = m_bottom = null;

    try {
      if (document.documentElement.dataset.tableOcrOldOverflow !== undefined) {
        document.documentElement.style.overflow = document.documentElement.dataset.tableOcrOldOverflow;
        delete document.documentElement.dataset.tableOcrOldOverflow;
      }
      if (document.body.dataset.tableOcrOldOverflow !== undefined) {
        document.body.style.overflow = document.body.dataset.tableOcrOldOverflow;
        delete document.body.dataset.tableOcrOldOverflow;
      }
    } catch (_) {}
  }
})();
