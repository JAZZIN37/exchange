const MAX_TEXT = 8000;
const RATE_LIMIT_PER_MINUTE = 20;
const RATE_WINDOW_MS = 60_000;
const LANGUAGE_LABELS = { ko: 'Korean', en: 'English', ru: 'Russian' };
const DEEPL_SOURCE_CODES = { ko: 'KO', en: 'EN', ru: 'RU' };
const DEEPL_TARGET_CODES = { ko: 'KO', en: 'EN-US', ru: 'RU' };
const TARGETS = { ko: ['en', 'ru'], en: ['ko', 'ru'], ru: ['en', 'ko'] };

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
  return new Set(String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));
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
        text: [text],
        source_lang: DEEPL_SOURCE_CODES[source],
        target_lang: DEEPL_TARGET_CODES[target],
        preserve_formatting: true,
      }),
    });
    if (!response.ok) throw new Error(`DeepL API 오류 (${response.status})`);
    const data = await response.json();
    const result = data?.translations?.[0]?.text;
    if (typeof result !== 'string' || !result.trim()) throw new Error('DeepL 응답에서 번역 결과를 찾지 못했습니다.');
    return result.trim();
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
          api_base: String(env.DEEPL_API_BASE_URL || 'https://api-free.deepl.com'),
        }, 200, headers);
      }
      if (url.pathname !== '/api/translate' || request.method !== 'POST') {
        return jsonResponse({ ok: false, error: '요청한 주소를 찾지 못했습니다.' }, 404, headers);
      }
      if (!rateAllowed(clientId(request))) {
        return jsonResponse({ ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429, headers);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ ok: false, error: 'JSON 요청 본문이 필요합니다.' }, 400, headers);
      }
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!text) return jsonResponse({ ok: false, error: '번역할 글을 입력해 주세요.' }, 400, headers);
      if (text.length > MAX_TEXT) {
        return jsonResponse({ ok: false, error: `번역할 글은 ${MAX_TEXT}자 이내여야 합니다.` }, 400, headers);
      }
      try {
        const source = detectLanguage(text);
        const targets = TARGETS[source];
        const values = await Promise.all(targets.map(target => translateOne(text, source, target, env)));
        return jsonResponse({
          ok: true,
          provider: 'DeepL',
          sourceLanguage: source,
          sourceLanguageLabel: LANGUAGE_LABELS[source],
          translations: Object.fromEntries(targets.map((target, index) => [target, values[index]])),
        }, 200, headers);
      } catch (error) {
        return jsonResponse({ ok: false, error: error instanceof Error ? error.message : '번역에 실패했습니다.' }, 502, headers);
      }
    },
  };
}

export default createTranslationWorker();
