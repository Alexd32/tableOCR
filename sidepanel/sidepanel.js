(() => {
  'use strict';

  const dropzone   = document.getElementById('dropzone');
  const file_input = document.getElementById('file_input');

  const dz_empty   = document.getElementById('dz_empty');
  const dz_preview = document.getElementById('dz_preview');

  const preview_img = document.getElementById('preview_img');
  const preview_pdf = document.getElementById('preview_pdf');

  const btn_select  = document.getElementById('btn_select');
  const extract_block = document.getElementById('extract_block');
  const btn_extract = document.getElementById('btn_extract');

  const btn_clear = document.getElementById('btn_clear');

  const error_box = document.getElementById('error');

  const state = {
    has_preview: false,
    preview_type: null, // 'image' | 'pdf'
    preview_url: null   // dataURL (from capture) or blobURL (from file)
  };

  // режим активного выбора области (overlay на странице)
  let selection_in_progress = false;

  // держим порт, чтобы service worker понял, что панель закрыли крестиком
  let panel_port = null;

  init();

  async function init() {
    clear_error();
    connect_panel_port();
    bind_ui();
    bind_runtime();
    bind_sidepanel_esc();

    // подтягиваем session preview после выбора области
    try {
      const session = await chrome.storage.session.get(['preview_type', 'preview_data_url']);
      if (session && session.preview_type === 'image' && session.preview_data_url) {
        set_image_preview(session.preview_data_url);
      }
    } catch (_) {}

    render();
  }

  function connect_panel_port() {
    try {
      panel_port = chrome.runtime.connect({ name: 'sidepanel' });
      // на всякий случай, если service worker перезапустится
      panel_port.onDisconnect.addListener(() => {
        panel_port = null;
      });
    } catch (_) {
      panel_port = null;
    }
  }

  function bind_ui() {
    dropzone.addEventListener('click', () => file_input.click());

    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        file_input.click();
      }
    });

    file_input.addEventListener('change', () => {
      if (!file_input.files || file_input.files.length === 0) return;
      handle_files(file_input.files);
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag_over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag_over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag_over');
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      handle_files(e.dataTransfer.files);
    });

    btn_select.addEventListener('click', async () => {
      clear_error();
      btn_select.disabled = true;

      try {
        await clear_session_preview();
        reset_to_initial_state_local(); // вернуть UI в исходное состояние перед выделением

        selection_in_progress = true;

        const res = await chrome.runtime.sendMessage({ type: 'START_SELECTION' });
        if (!res || !res.ok) {
          selection_in_progress = false;
          show_error(res && res.error ? res.error : 'Cannot start selection');
        }
      } catch (_) {
        selection_in_progress = false;
        show_error('Cannot start selection');
      } finally {
        btn_select.disabled = false;
      }
    });

    btn_extract.addEventListener('click', () => {
      console.log('[sidepanel] Start Extract (TODO: send to API)');
    });

    btn_clear.addEventListener('click', async () => {
      clear_error();
      btn_clear.disabled = true;

      try {
        await clear_session_preview();
        reset_to_initial_state_local();
      } finally {
        btn_clear.disabled = false;
      }
    });
  }

  function bind_runtime() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || !msg.type) return;

      if (msg.type === 'PREVIEW_READY') {
        selection_in_progress = false;

        if (msg.preview_type === 'image' && msg.preview_data_url) {
          set_image_preview(msg.preview_data_url);
          render();
        }
        return;
      }

      if (msg.type === 'SELECTION_FAILED') {
        selection_in_progress = false;
        show_error(msg.error || 'Selection failed');
        return;
      }
    });
  }

  // ESC в Side Panel: если идёт выбор области — отменяем оверлей на странице
  function bind_sidepanel_esc() {
    document.addEventListener('keydown', async (e) => {
      if (e.key !== 'Escape') return;
      if (!selection_in_progress) return;

      e.preventDefault();
      e.stopPropagation();

      selection_in_progress = false;
      try {
        await chrome.runtime.sendMessage({ type: 'SELECTION_CANCELLED' });
      } catch (_) {}
    }, true);
  }

  function handle_files(file_list) {
    clear_error();

    const file = file_list[0];
    if (!file) return;

    const max_bytes = 10 * 1024 * 1024;
    if (file.size > max_bytes) {
      show_error('File is too large. Max size is 10 MB.');
      return;
    }

    const is_pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const is_image = file.type.startsWith('image/');

    if (!is_pdf && !is_image) {
      show_error('Only images and PDF files are allowed.');
      return;
    }

    clear_session_preview().catch(() => {});
    reset_to_initial_state_local();

    if (is_pdf) {
      state.has_preview = true;
      state.preview_type = 'pdf';
      state.preview_url = null;
      file_input.value = '';
      render();
      return;
    }

    state.has_preview = true;
    state.preview_type = 'image';
    state.preview_url = URL.createObjectURL(file);
    file_input.value = '';
    render();
  }

  function set_image_preview(data_url) {
    reset_to_initial_state_local();
    state.has_preview = true;
    state.preview_type = 'image';
    state.preview_url = data_url;
  }

  function reset_to_initial_state_local() {
    if (state.preview_type === 'image' && state.preview_url && String(state.preview_url).startsWith('blob:')) {
      try { URL.revokeObjectURL(state.preview_url); } catch (_) {}
    }

    state.has_preview = false;
    state.preview_type = null;
    state.preview_url = null;

    file_input.value = '';
    preview_img.removeAttribute('src');

    clear_error();
    render();
  }

  async function clear_session_preview() {
    try {
      await chrome.storage.session.remove(['preview_type', 'preview_data_url']);
    } catch (_) {}

    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_SESSION_PREVIEW' });
    } catch (_) {}
  }

  function render() {
    if (state.has_preview) {
      btn_select.classList.add('hidden');
      extract_block.classList.remove('hidden');
      btn_clear.classList.remove('hidden');
    } else {
      btn_select.classList.remove('hidden');
      extract_block.classList.add('hidden');
      btn_clear.classList.add('hidden');
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
