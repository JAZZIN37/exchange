const MAX_TEXT = 8000;
const RATE_LIMIT_PER_MINUTE = 20;
const RATE_WINDOW_MS = 60_000;
const LANGUAGE_LABELS = { ko: 'Korean', en: 'English', ru: 'Russian' };
const DEEPL_SOURCE_CODES = { ko: 'KO', en: 'EN', ru: 'RU' };
const DEEPL_TARGET_CODES = { ko: 'KO', en: 'EN-US', ru: 'RU' };
const TARGETS = { ko: ['en', 'ru'], en: ['ko', 'ru'], ru: ['en', 'ko'] };
const SCHOOL_ORIGIN = 'https://anseong-e.goean.kr';
const SCHOOL_SYS_ID = 'anseong-e';
const BOARD_MI = '6436';
const BOARD_ID = '3783';

function detectLanguage(text) {
  const counts = {
    ko: (text.match(/[가-힣]/g) || []).length,
    ru: (text.match(/[А-Яа-яЁё]/g) || []).length,
    en: (text.match(/[A-Za-z]/g) || []).length,
  };
  const [source, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!count) throw new Error('한국어, 영어, 러시아어 중 하나로 입력해 주세요.');
  return source;
}

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function jsonResponse(payload, status, headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function textToHtml(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? match[2] : '';
}

function hiddenFields(formHtml) {
  const values = new URLSearchParams();
  for (const tag of formHtml.match(/<input\b[^>]*>/gi) || []) {
    const name = getAttribute(tag, 'name');
    const type = getAttribute(tag, 'type').toLowerCase();
    if (name && type === 'hidden') values.set(name, getAttribute(tag, 'value'));
  }
  return values;
}

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const raw = response.headers.get('Set-Cookie');
  return raw ? [raw] : [];
}

function appendCookies(cookies, response) {
  for (const item of responseCookies(response)) {
    const pair = item.split(';', 1)[0];
    const name = pair.split('=', 1)[0];
    const index = cookies.findIndex(cookie => cookie.startsWith(`${name}=`));
    if (index >= 0) cookies[index] = pair;
    else cookies.push(pair);
  }
}

function boardHtml(body, translatedBody) {
  const translated = translatedBody
    ? `<hr style="border:0;border-top:1px solid #ddd;margin:24px 0"><div style="color:#475569;font-style:italic;line-height:1.7">${textToHtml(translatedBody)}</div>`
    : '';
  return `<div style="line-height:1.8;white-space:normal">${textToHtml(body)}</div>${translated}`;
}

function clientId(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
}

export function createTranslationWorker({ fetchFn = fetch, now = Date.now } = {}) {
  const requests = new Map();

  function rateAllowed(id) {
    const timestamp = now();
    const recent = (requests.get(id) || []).filter(value => timestamp - value < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_PER_MINUTE) return false;
    recent.push(timestamp);
    requests.set(id, recent);
    return true;
  }

  async function translateOne(text, source, target, env) {
    const apiKey = String(env.DEEPL_API_KEY || '').trim();
    if (!apiKey) throw new Error('번역 서비스 설정이 아직 완료되지 않았습니다.');
    const baseUrl = String(env.DEEPL_API_BASE_URL || 'https://api-free.deepl.com').replace(/\/$/, '');
    const response = await fetchFn(`${baseUrl}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text], source_lang: DEEPL_SOURCE_CODES[source], target_lang: DEEPL_TARGET_CODES[target], preserve_formatting: true,
      }),
    });
    if (!response.ok) throw new Error(`DeepL API 오류 (${response.status})`);
    const data = await response.json();
    const result = data?.translations?.[0]?.text;
    if (typeof result !== 'string' || !result.trim()) throw new Error('DeepL 응답에서 번역 결과를 찾지 못했습니다.');
    return result.trim();
  }

  async function publishToSchoolBoard(payload, env) {
    const username = String(payload.credentials?.username || '').trim();
    const password = String(payload.credentials?.password || '');
    if (!username || !password) throw new Error('학교 홈페이지 아이디와 비밀번호를 입력해 주세요.');
    const cookies = [];
    const requestToSchool = async (path, init = {}) => {
      const headers = new Headers(init.headers || {});
      if (cookies.length) headers.set('Cookie', cookies.join('; '));
      const response = await fetchFn(`${SCHOOL_ORIGIN}${path}`, { ...init, headers, redirect: 'manual' });
      appendCookies(cookies, response);
      return response;
    };

    await requestToSchool(`/${SCHOOL_SYS_ID}/lo/login/loginTotalPage.do`);
    const loginForm = new URLSearchParams({
      agreAt: '', sysId: SCHOOL_SYS_ID, loginType: '2', searchPageYn: 'N', mberId: username, mberPassword: password,
    });
    const loginResponse = await requestToSchool(`/${SCHOOL_SYS_ID}/lo/login/login.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: loginForm.toString(),
    });
    const loginData = await loginResponse.json().catch(() => ({}));
    if (!['Y', 'NM'].includes(loginData.result)) throw new Error('학교 홈페이지 로그인에 실패했습니다.');

    const writeResponse = await requestToSchool(`/${SCHOOL_SYS_ID}/na/ntt/insertNttPage.do?mi=${BOARD_MI}&bbsId=${BOARD_ID}`);
    const writeHtml = await writeResponse.text();
    if (!writeHtml.includes('nttInsForm')) throw new Error('학교 계정에 국제교류 게시판 글쓰기 권한이 없거나 글쓰기 화면을 열 수 없습니다.');
    const form = hiddenFields(writeHtml);
    form.set('sysId', SCHOOL_SYS_ID);
    form.set('mi', BOARD_MI);
    form.set('bbsId', BOARD_ID);
    form.set('nttSj', payload.title);
    form.set('nttCn', boardHtml(payload.body, payload.translatedBody));
    form.set('secretAt', 'N');
    form.set('koglType', '0');
    form.set('filekinfo', '');
    const submitResponse = await requestToSchool(`/${SCHOOL_SYS_ID}/na/ntt/insertNttInfo.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: form.toString(),
    });
    const result = await submitResponse.json().catch(() => ({}));
    if (result.resultAt !== 'Y') {
      if (result.resultAt === 'P') throw new Error(`금칙어로 게시할 수 없습니다: ${String(result.prhibtWrd || '').slice(0, 120)}`);
      throw new Error('학교 홈페이지 게시 등록에 실패했습니다.');
    }
    return String(result.nttSn || '');
  }

  return {
    async fetch(request, env) {
      const headers = corsHeaders(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const url = new URL(request.url);
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse({
          ok: true,
          service: 'nz-exchange-news-translate',
          provider: 'DeepL',
          deepl_configured: Boolean(String(env.DEEPL_API_KEY || '').trim()),
          publisher_configured: Boolean(String(env.SCHOOL_BOARD_USERNAME || '').trim() && String(env.SCHOOL_BOARD_PASSWORD || '').trim()),
          submission_access_configured: Boolean(String(env.SUBMISSION_ACCESS_CODE || '').trim()),
          api_base: String(env.DEEPL_API_BASE_URL || 'https://api-free.deepl.com'),
        }, 200, headers);
      }
      if (!['/api/translate', '/api/publish'].includes(url.pathname) || request.method !== 'POST') return jsonResponse({ ok: false, error: '요청한 주소를 찾지 못했습니다.' }, 404, headers);
      if (!rateAllowed(clientId(request))) return jsonResponse({ ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429, headers);
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ ok: false, error: 'JSON 요청 본문이 필요합니다.' }, 400, headers); }

      if (url.pathname === '/api/publish') {
        const credentials = body?.credentials && typeof body.credentials === 'object' ? body.credentials : {};
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        const publishBody = typeof body?.body === 'string' ? body.body.trim() : '';
        const translatedBody = typeof body?.translatedBody === 'string' ? body.translatedBody.trim() : '';
        if (!body?.confirmed) return jsonResponse({ ok: false, error: '게시 내용을 확인한 뒤 최종 확인을 선택해 주세요.' }, 400, headers);
        if (!title || !publishBody) return jsonResponse({ ok: false, error: '게시할 제목과 본문을 입력해 주세요.' }, 400, headers);
        if (title.length > 200 || publishBody.length > MAX_TEXT || translatedBody.length > MAX_TEXT) return jsonResponse({ ok: false, error: '게시할 글이 허용 길이를 초과했습니다.' }, 400, headers);
        try {
          const boardPostId = await publishToSchoolBoard({ title, body: publishBody, translatedBody, credentials }, env);
          return jsonResponse({ ok: true, boardPostId }, 200, headers);
        } catch (error) {
          return jsonResponse({ ok: false, error: error instanceof Error ? error.message : '게시 등록에 실패했습니다.' }, 502, headers);
        }
      }

      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!text) return jsonResponse({ ok: false, error: '번역할 글을 입력해 주세요.' }, 400, headers);
      if (text.length > MAX_TEXT) return jsonResponse({ ok: false, error: `번역할 글은 ${MAX_TEXT}자 이내여야 합니다.` }, 400, headers);
      try {
        const source = detectLanguage(text);
        const targets = TARGETS[source];
        const values = await Promise.all(targets.map(target => translateOne(text, source, target, env)));
        return jsonResponse({ ok: true, provider: 'DeepL', sourceLanguage: source, sourceLanguageLabel: LANGUAGE_LABELS[source], translations: Object.fromEntries(targets.map((target, index) => [target, values[index]])) }, 200, headers);
      } catch (error) {
        return jsonResponse({ ok: false, error: error instanceof Error ? error.message : '번역에 실패했습니다.' }, 502, headers);
      }
    },
  };
}

export default createTranslationWorker();
