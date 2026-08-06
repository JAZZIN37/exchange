(() => {
  'use strict';

  const PAYLOAD_KEY = 'nz-exchange-news-payload-v1';
  const BOARD_HOST = 'anseong-e.goean.kr';

  const normalize = value => String(value || '').replace(/\u00a0/g, ' ').trim();

  function storageGet(key) {
    return new Promise(resolve => chrome.storage.local.get(key, result => resolve(result?.[key] || null)));
  }

  function storageSet(key, value) {
    return new Promise(resolve => chrome.storage.local.set({ [key]: value }, () => resolve(true)));
  }

  function normalizePayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return {
      title: normalize(payload.title) || '국제교류 소식',
      body: normalize(payload.body),
      translatedTitle: normalize(payload.translatedTitle),
      translatedBody: normalize(payload.translatedBody),
      imageDataUrl: typeof payload.imageDataUrl === 'string' ? payload.imageDataUrl : '',
      imageName: normalize(payload.imageName) || 'exchange-news.png',
      savedAt: payload.savedAt || ''
    };
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function visible(element) {
    return element && element.offsetParent !== null && !element.disabled;
  }

  function findFirst(selectors) {
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)].find(visible);
      if (found) return found;
    }
    return null;
  }

  function findTitleField() {
    return findFirst([
      'input[name*="sj" i]', 'input[id*="sj" i]',
      'input[name*="title" i]', 'input[id*="title" i]',
      'input[type="text"]'
    ]);
  }

  function findBodyField() {
    return findFirst([
      'textarea[name*="cn" i]', 'textarea[id*="cn" i]',
      'textarea[name*="content" i]', 'textarea[id*="content" i]',
      'textarea', '[contenteditable="true"]'
    ]);
  }

  async function setFileInput(payload) {
    if (!payload.imageDataUrl) return false;
    const input = document.querySelector('input[type="file"]');
    if (!input) return false;
    try {
      const response = await fetch(payload.imageDataUrl);
      const blob = await response.blob();
      const file = new File([blob], payload.imageName, { type: blob.type || 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (error) {
      console.error('[NZ 자동입력] 이미지 파일 입력 실패', error);
      return false;
    }
  }

  function showNotice(message, isError = false) {
    let box = document.getElementById('nzAutoFillNotice');
    if (!box) {
      box = document.createElement('div');
      box.id = 'nzAutoFillNotice';
      Object.assign(box.style, {
        position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483647',
        maxWidth: '420px', padding: '14px 16px', borderRadius: '12px',
        color: isError ? '#7f1d1d' : '#064e3b',
        background: isError ? '#fee2e2' : '#d1fae5',
        border: `1px solid ${isError ? '#fca5a5' : '#6ee7b7'}`,
        font: '600 14px/1.5 system-ui, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.2)'
      });
      document.body.appendChild(box);
    }
    box.textContent = message;
  }

  async function fillBoard() {
    const payload = normalizePayload(await storageGet(PAYLOAD_KEY));
    if (!payload) {
      showNotice('신문 자료를 찾지 못했어. 편집 페이지에서 먼저 게시판 등록 준비를 눌러줘.', true);
      return;
    }
    const titleField = findTitleField();
    const bodyField = findBodyField();
    if (!titleField || !bodyField) {
      showNotice('로그인 후 글쓰기 화면에서 제목·본문 입력칸을 찾지 못했어. 화면을 확인해줘.', true);
      return;
    }
    setNativeValue(titleField, payload.title);
    const translated = payload.translatedBody ? `\n\n[번역]\n${payload.translatedBody}` : '';
    const body = `${payload.body}${translated}`.trim();
    if (bodyField.isContentEditable) bodyField.textContent = body;
    else setNativeValue(bodyField, body);
    bodyField.dispatchEvent(new Event('input', { bubbles: true }));
    const uploaded = await setFileInput(payload);
    showNotice(`제목·본문을 입력했어${uploaded ? '·신문 이미지도 첨부했어' : ''}. 내용을 확인한 뒤 게시판의 등록 버튼을 눌러줘.`);
  }

  function addBoardButton() {
    if (document.getElementById('nzAutoFillButton')) return;
    const button = document.createElement('button');
    button.id = 'nzAutoFillButton';
    button.type = 'button';
    button.textContent = '📤 신문 내용 자동입력';
    Object.assign(button.style, {
      position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483646',
      padding: '13px 17px', border: '2px solid #111', borderRadius: '999px',
      color: '#fff', background: '#111', font: '800 14px system-ui, sans-serif',
      boxShadow: '0 8px 24px rgba(0,0,0,.25)', cursor: 'pointer'
    });
    button.addEventListener('click', fillBoard);
    document.body.appendChild(button);
  }

  document.addEventListener('NZ_EXCHANGE_NEWS_PAYLOAD_READY', async event => {
    try {
      const payload = normalizePayload(JSON.parse(event.detail || '{}'));
      if (payload) await storageSet(PAYLOAD_KEY, payload);
    } catch (error) {
      console.error('[NZ 자동입력] 편집 페이지 자료 저장 실패', error);
    }
  });

  if (location.hostname === BOARD_HOST) {
    window.setTimeout(addBoardButton, 1200);
  }
})();
