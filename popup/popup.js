(() => {
  'use strict';

  const btn_select = document.getElementById('btn_select');
  const btn_extract = document.getElementById('btn_extract');

  const dz_empty = document.getElementById('dz_empty');
  const dz_preview = document.getElementById('dz_preview');

  const preview_img = document.getElementById('preview_img');
  const preview_pdf = document.getElementById('preview_pdf');

  const error_box = document.getElementById('error');

  const state = {
    has_preview: false,
    preview_url: null,
    preview_type: null // 'image' | 'pdf'
  };

  init();

  async function init() {
    clear_error();

    // Всегда сбрасываем при каждом открытии попапа? — по твоему ТЗ “всё сбрасываем”.
    // Но миниатюра нужна после выделения, поэтому делаем так:
    // 1) если есть preview в session — показываем
    // 2) если нет — пусто
    const session = await chrome.storage.session.get(['preview_data_url', 'preview_type']);

    if (session && session.preview_data_url && session.preview_type) {
      state.has_preview = true;
      state.preview_type = session.preview_type;
      state.preview_url = session.preview_data_url;
    } else {
      state.has_preview = false;
      state.preview_type = null;
      state.preview_url = null;
    }

    render();
    init_handlers();
  }

  function init_handlers() {
    btn_select.addEventListener('click', on_select_table_click);
    btn_extract.addEventListener('click', on_extract_click);

    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'PREVIEW_READY') return;
      // пользователь откроет попап заново и увидит превью
    });
  }

  async function on_select_table_click() {
    clear_error();

    try {
      btn_select.disabled = true;

      // перед стартом можно чистить старый preview
      await chrome.runtime.sendMessage({ type: 'CLEAR_SESSION_PREVIEW' });

      const res = await chrome.runtime.sendMessage({ type: 'START_SELECTION' });

      if (!res || !res.ok) {
        show_error((res && res.error) ? res.error : 'Cannot start selection');
        btn_select.disabled = false;
        return;
      }

      window.close();
    } catch (e) {
      show_error('Cannot start selection');
      btn_select.disabled = false;
    }
  }

  function on_extract_click() {
    console.log('[popup] Start Extract clicked (TODO: send to API)');
  }

  function render() {
    if (state.has_preview) {
      btn_select.classList.add('hidden');
      btn_extract.classList.remove('hidden');
    } else {
      btn_select.classList.remove('hidden');
      btn_extract.classList.add('hidden');
    }

    if (!state.has_preview) {
      dz_empty.classList.remove('hidden');
      dz_preview.classList.add('hidden');
      preview_img.classList.add('hidden');
      preview_pdf.classList.add('hidden');
      return;
    }

    dz_empty.classList.add('hidden');
    dz_preview.classList.remove('hidden');

    if (state.preview_type === 'pdf') {
      preview_img.classList.add('hidden');
      preview_pdf.classList.remove('hidden');
      return;
    }

    preview_pdf.classList.add('hidden');
    preview_img.classList.remove('hidden');
    preview_img.src = state.preview_url;
  }

  function show_error(msg) {
    error_box.textContent = msg;
    error_box.classList.remove('hidden');
  }

  function clear_error() {
    error_box.textContent = '';
    error_box.classList.add('hidden');
  }
})();
