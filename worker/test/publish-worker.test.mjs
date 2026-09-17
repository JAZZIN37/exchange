import assert from 'node:assert/strict';
import test from 'node:test';

import { createTranslationWorker } from '../src/index.mjs';

const env = {
  DEEPL_API_KEY: 'translation-key',
  DEEPL_API_BASE_URL: 'https://api-free.deepl.com',
  ALLOWED_ORIGINS: 'https://jazzin37.github.io',
  SCHOOL_BOARD_USERNAME: 'publisher-user',
  SCHOOL_BOARD_PASSWORD: 'publisher-password',
  SUBMISSION_ACCESS_CODE: 'partner-code',
};

function publishRequest(payload) {
  return new Request('https://worker.example/api/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://jazzin37.github.io',
      'CF-Connecting-IP': '198.51.100.10',
    },
    body: JSON.stringify(payload),
  });
}

test('publishes a confirmed partner submission through the authorized board account', async () => {
  const calls = [];
  const worker = createTranslationWorker({
    fetchFn: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.includes('/lo/login/loginTotalPage.do')) {
        return new Response('<html>login</html>', { headers: { 'Set-Cookie': 'JSESSIONID=session-1; Path=/' } });
      }
      if (url.includes('/lo/login/login.do')) {
        return Response.json({ result: 'Y' }, { headers: { 'Set-Cookie': 'LOGIN=ok; Path=/' } });
      }
      if (url.includes('/na/ntt/insertNttPage.do')) {
        return new Response(`
          <form id="nttInsForm">
            <input type="hidden" name="sysId" value="anseong-e">
            <input type="hidden" name="mi" value="6436">
            <input type="hidden" name="bbsId" value="3783">
            <input type="hidden" name="secretAt" value="N">
            <textarea name="nttCn"></textarea>
          </form>`);
      }
      if (url.includes('/na/ntt/insertNttInfo.do')) {
        return Response.json({ resultAt: 'Y', nttSn: '17' });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const response = await worker.fetch(publishRequest({
    credentials: { username: 'publisher-user', password: 'publisher-password' },
    title: '국제교류 소식',
    body: '한국어 본문',
    translatedBody: 'English body',
    confirmed: true,
  }), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.boardPostId, '17');
  assert.equal(calls.length, 4);
  assert.match(String(calls[3].init.body), /nttSj=%EA%B5%AD%EC%A0%9C%EA%B5%90%EB%A5%98/);
  assert.match(String(calls[3].init.body), /nttCn=/);
});

test('rejects a publish request without school credentials before contacting the school site', async () => {
  const worker = createTranslationWorker({ fetchFn: async () => assert.fail('school site must not be called') });
  const response = await worker.fetch(publishRequest({
    title: '제목', body: '본문', confirmed: true,
  }), env);

  assert.equal(response.status, 502);
  assert.equal((await response.json()).ok, false);
});

test('health exposes only publisher configuration readiness, never secret values', async () => {
  const worker = createTranslationWorker();
  const response = await worker.fetch(new Request('https://worker.example/api/health'), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.publisher_configured, true);
  assert.equal(data.submission_access_configured, true);
  assert.equal(JSON.stringify(data).includes('publisher-password'), false);
});
