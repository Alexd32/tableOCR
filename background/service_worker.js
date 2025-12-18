(() => {
  'use strict';

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'START_SELECTION') {
      start_selection().then(sendResponse);
      return true;
    }

    if (msg.type === 'SELECTION_FINISHED') {
      handle_selection_finished(sender, msg.rect).then(sendResponse);
      return true;
    }

    if (msg.type === 'SELECTION_CANCELLED') {
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'CLEAR_SESSION_PREVIEW') {
      chrome.storage.session.remove(['preview_data_url', 'preview_type']).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }
  });

  async function start_selection() {
    const tab = await get_active_tab();
    if (!tab || !tab.id) return { ok: false, error: 'No active tab' };

    // chrome://* — нельзя инжектить
    if (typeof tab.url === 'string' && tab.url.startsWith('chrome://')) {
      return { ok: false, error: 'Cannot run on chrome:// pages' };
    }

    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content/overlay.css']
      });

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/overlay.js']
      });

      // overlay.js стартует сам, но оставим совместимость:
      try { await chrome.tabs.sendMessage(tab.id, { type: 'BEGIN_SELECTION' }); } catch (_) {}

      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Injection failed' };
    }
  }

  async function handle_selection_finished(sender, rect) {
    const tab_id = sender && sender.tab ? sender.tab.id : null;
    if (!tab_id) return { ok: false, error: 'No tab id' };

    try {
      const data_url_full = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

      const cropped_data_url = await crop_data_url(data_url_full, rect);

      await chrome.storage.session.set({
        preview_data_url: cropped_data_url,
        preview_type: 'image'
      });

      // сообщим всем частям расширения (можно логировать/подхватывать)
      chrome.runtime.sendMessage({ type: 'PREVIEW_READY' });

      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Capture/crop failed' };
    }
  }

  async function crop_data_url(data_url, rect) {
    const blob = data_url_to_blob(data_url);
    const bmp = await createImageBitmap(blob);

    const dpr = rect.dpr || 1;

    // rect.x/y/w/h в CSS пикселях viewport → в пикселях скрина умножаем на dpr
    const sx = Math.max(0, Math.floor(rect.x * dpr));
    const sy = Math.max(0, Math.floor(rect.y * dpr));
    const sw = Math.max(1, Math.floor(rect.w * dpr));
    const sh = Math.max(1, Math.floor(rect.h * dpr));

    // целевые ограничения "HD"
    const max_w = 1280;
    const max_h = 720;

    let dw = sw;
    let dh = sh;

    const scale = Math.min(1, max_w / dw, max_h / dh);
    if (scale < 1) {
      dw = Math.max(1, Math.floor(dw * scale));
      dh = Math.max(1, Math.floor(dh * scale));
    }

    const canvas = new OffscreenCanvas(dw, dh);
    const ctx = canvas.getContext('2d', { alpha: false });

    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh);

    const out_blob = await canvas.convertToBlob({ type: 'image/png' });

    // dataURL (для простого preview в popup)
    const out_data_url = await blob_to_data_url(out_blob);

    // cleanup
    bmp.close?.();

    return out_data_url;
  }

  function data_url_to_blob(data_url) {
    const parts = data_url.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  }

  function blob_to_data_url(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  async function get_active_tab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs.length ? tabs[0] : null;
  }
})();
