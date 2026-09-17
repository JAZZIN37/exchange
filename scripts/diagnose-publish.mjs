// Manual, read-only school integration probe. Never sends insertNttInfo.do.
import { createTranslationWorker } from '../worker/src/index.mjs';

const school = 'https://anseong-e.goean.kr';
const username = process.env.SCHOOL_BOARD_USERNAME;
const password = process.env.SCHOOL_BOARD_PASSWORD;
if (!username || !password) throw new Error('Diagnostic credentials not configured');
let submitBlocked = false;
const trace = [];
const worker = createTranslationWorker({ fetchFn: async (url, init = {}) => {
  const u = new URL(url);
  if (u.origin !== school) throw new Error('Unexpected origin');
  if (u.pathname.endsWith('/insertNttInfo.do')) {
    submitBlocked = true;
    trace.push({ stage: 'submit-intercepted-NOT-SENT', fields: [...new URLSearchParams(init.body).keys()] });
    // A deliberately unsuccessful local response, not a school-server result.
    return Response.json({ resultAt: 'DIAGNOSTIC_NOT_SUBMITTED' });
  }
  if (!['/loginTotalPage.do', '/login.do', '/insertNttPage.do'].some(p => u.pathname.endsWith(p))) {
    throw new Error('Unexpected read endpoint');
  }
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
  const entry = { path: u.pathname, status: res.status, contentType: res.headers.get('content-type'), cookieCount: res.headers.getSetCookie().length, sentSession: Boolean(new Headers(init.headers).get('cookie')) };
  const text = await res.clone().text();
  if (u.pathname.endsWith('/login.do')) {
    try {
      const data = JSON.parse(text);
      entry.result = Object.fromEntries(['result', 'agreCnt', 'cpmCnt', 'xssChk'].filter(k => k in data).map(k => [k, data[k]]));
      entry.returnPath = data.returnUrl ? new URL(data.returnUrl, school).pathname : null;
    } catch { entry.json = false; }
  }
  if (u.pathname.endsWith('/insertNttPage.do')) {
    entry.hasWriteForm = /<form\b[^>]*\bid=["']nttInsForm["']/i.test(text);
    entry.permissionDenied = text.includes('쓰기권한이 없습니다');
    entry.formNames = [...text.matchAll(/<(?:input|textarea|select)\b[^>]*\bname=["']([^"']+)["']/gi)].map(x => x[1]);
    entry.scriptSources = [...text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(x => new URL(x[1], school).pathname);
    entry.submitScript = text.includes('insertNttInfo.do') ? text.slice(Math.max(0,text.indexOf('insertNttInfo.do')-1400),text.indexOf('insertNttInfo.do')+1500) : '';
    // Only publish non-sensitive defaults, never token/session/account values.
    entry.safeDefaults = [...text.matchAll(/<input\b[^>]*>/gi)].map(x => x[0]).filter(x => /name=["'](?:sysId|mi|bbsId|secretAt|koglType|filekinfo|nttTy)["']/.test(x));
  }
  trace.push(entry);
  return res;
}});
const response = await worker.fetch(new Request('https://diagnostic.invalid/api/publish', { method: 'POST', headers: {'Content-Type':'application/json', Origin:'https://jazzin37.github.io'}, body:JSON.stringify({ credentials:{username,password}, confirmed:true, title:'Diagnostic only', body:'This diagnostic never submits a post.' }) }), {ALLOWED_ORIGINS:'https://jazzin37.github.io'});
const result = await response.json();
let output = JSON.stringify({ probeOnly:true, submitBlocked, http:response.status, response:result, trace }, null, 2);
for (const sensitive of [username,password]) output = output.split(sensitive).join('[REDACTED]');
console.log(output);
