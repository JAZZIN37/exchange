import assert from 'node:assert/strict';
import test from 'node:test';

import { createTranslationWorker } from '../src/index.mjs';

const env = {
  DEEPL_API_KEY: 'test-key',
  DEEPL_API_BASE_URL: 'https://api-free.deepl.com',
  ALLOWED_ORIGINS: 'https://jazzin37.github.io',
};

function request(body, origin = 'https://jazzin37.github.io') {
  return new Request('https://worker.example/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '198.51.100.9' },
    body: JSON.stringify(body),
  });
}

test('translates Korean input and returns only non-source languages', async () => {
  const calls = [];
  const worker = createTranslationWorker({
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      const data = JSON.parse(init.body);
      const text = data.target_lang === 'EN-US' ? 'Exchange news' : 'Обменные новости';
      return Response.json({ translations: [{ text }] });
    },
    now: () => 1_000,
  });

  const response = await worker.fetch(request({ text: '국제교류 소식' }), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.translations, { en: 'Exchange news', ru: 'Обменные новости' });
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0].url).pathname, '/v2/translate');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://jazzin37.github.io');
});

test('rejects an empty translation request', async () => {
  const worker = createTranslationWorker({ fetchFn: async () => assert.fail('provider must not be called') });
  const response = await worker.fetch(request({ text: '   ' }), env);

  assert.equal(response.status, 400);
  assert.equal((await response.json()).ok, false);
});

test('does not grant CORS access to an unapproved origin', async () => {
  const worker = createTranslationWorker({ fetchFn: async () => Response.json({ translations: [{ text: 'x' }] }) });
  const response = await worker.fetch(request({ text: 'English text' }, 'https://evil.example'), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});
