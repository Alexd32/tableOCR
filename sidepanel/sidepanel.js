(() => {
  'use strict';

  const dropzone   = document.getElementById('dropzone');
  const file_input = document.getElementById('file_input');

  const dz_empty   = document.getElementById('dz_empty');
  const dz_preview = document.getElementById('dz_preview');

  const preview_img = document.getElementById('preview_img');
  const preview_pdf = document.getElementById('preview_pdf');

  const btn_select  = document.getElementById('btn_select');
  const btn_extract = document.getElementById('btn_extract');

  const error_box = document.getElementById('error');

  const state = {
    has_preview: false,
    preview_type: null, // 'image' | 'pdf'
    preview_url: null   // dataURL (from capture) or blobURL (from file)
  };

  init();

  async function init() {
    clear_error();
    bind_ui();
    bind_runtime();

    // ВАЖНО: подхватываем сохранённую миниатюру (после выделения области)
    try {
      const session = await chrome.storage.session.get(['preview_type', 'preview_data_url']);
      if (session && session.preview_type === 'image' && session.preview_data_url) {
        set_image_preview(session.preview_data_url); // dataURL
      }
    } catch (_) {}

    render();
  }

  function bind_ui() {
    // dropzone click -> open file dialog
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
        // чистим прошлый session preview (на всякий случай)
        await chrome.runtime.sendMessage({ type: 'CLEAR_SESSION_PREVIEW' });

        clear_preview_local_only();

        const res = await chrome.runtime.sendMessage({ type: 'START_SELECTION' });
        if (!res || !res.ok) {
          show_error(res && res.error ? res.error : 'Cannot start selection');
        }
      } catch (e) {
        show_error('Cannot start selection');
      } finally {
        btn_select.disabled = false;
      }
    });

    btn_extract.addEventListener('click', () => {
      console.log('[sidepanel] Start Extract (TODO: send to API)');
    });
  }

  function bind_runtime() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || !msg.type) return;

      if (msg.type === 'PREVIEW_READY') {
        if (msg.preview_type === 'image' && msg.preview_data_url) {
          set_image_preview(msg.preview_data_url);
          render();
        }
        return;
      }

      if (msg.type === 'SELECTION_FAILED') {
        show_error(msg.error || 'Selection failed');
        return;
      }
    });
  }

  function handle_files(file_list) {
    clear_error();

    const file = file_list[0];
    if (!file) return;

    // max 10 MB
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

    // При загрузке файла — локальный preview, session-preview не нужен
    chrome.runtime.sendMessage({ type: 'CLEAR_SESSION_PREVIEW' }).catch(() => {});
    clear_preview_local_only();

    if (is_pdf) {
      state.has_preview = true;
      state.preview_type = 'pdf';
      state.preview_url = null;
      render();
      file_input.value = '';
      return;
    }

    // image preview via blob url
    state.has_preview = true;
    state.preview_type = 'image';
    state.preview_url = URL.createObjectURL(file);
    render();

    file_input.value = '';
  }

  function set_image_preview(data_url) {
    // data_url = data:image/png;base64,...
    clear_preview_local_only();
    state.has_preview = true;
    state.preview_type = 'image';
    state.preview_url = data_url;
  }

  function clear_preview_local_only() {
    // revoke blob url if used
    if (state.preview_type === 'image' && state.preview_url && String(state.preview_url).startsWith('blob:')) {
      try { URL.revokeObjectURL(state.preview_url); } catch (_) {}
    }
    state.has_preview = false;
    state.preview_type = null;
    state.preview_url = null;
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
