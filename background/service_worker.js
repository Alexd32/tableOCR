(() => {
  'use strict';

  // Открывать side panel по клику на иконку расширения
  chrome.runtime.onInstalled.addListener(async () => {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) {
      // ignore
    }
  });

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
  });

  async function start_selection() {
    const tab = await get_active_tab();
    if (!tab || !tab.id) return { ok: false, error: 'No active tab' };

    const url = String(tab.url || '');

    // страницы, куда Chrome запрещает инжектить скрипты
    const forbidden =
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('devtools://') ||
      url.includes('chrome.google.com/webstore') ||
      url.includes('chromewebstore.google.com');

    if (forbidden) {
      return { ok: false, error: 'This page does not allow script injection' };
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

      return { ok: true };
    } catch (e) {
      const message = (e && e.message) ? e.message : String(e);
      return { ok: false, error: `Injection failed: ${message}` };
    }
  }

  async function handle_selection_finished(sender, rect) {
    try {
      const data_url_full = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      const cropped_data_url = await crop_data_url(data_url_full, rect);

      chrome.runtime.sendMessage({
        type: 'PREVIEW_READY',
        preview_type: 'image',
        preview_data_url: cropped_data_url
      });

      return { ok: true };
    } catch (e) {
      const message = (e && e.message) ? e.message : String(e);

      chrome.runtime.sendMessage({
        type: 'SELECTION_FAILED',
        error: `Capture/crop failed: ${message}`
      });

      return { ok: false, error: `Capture/crop failed: ${message}` };
    }
  }

  async function crop_data_url(data_url, rect) {
    const blob = data_url_to_blob(data_url);
    const bmp = await createImageBitmap(blob);

    const dpr = rect && rect.dpr ? rect.dpr : 1;

    const sx = Math.max(0, Math.floor(rect.x * dpr));
    const sy = Math.max(0, Math.floor(rect.y * dpr));
    const sw = Math.max(1, Math.floor(rect.w * dpr));
    const sh = Math.max(1, Math.floor(rect.h * dpr));

    // ограничение "HD"
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
    const out_data_url = await blob_to_data_url(out_blob);

    if (bmp && typeof bmp.close === 'function') bmp.close();

    return out_data_url;
  }

  function data_url_to_blob(data_url) {
    const parts = data_url.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
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
