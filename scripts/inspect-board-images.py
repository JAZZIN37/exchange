"""Read-only inspection of editor image configuration. Never uploads or posts."""
import http.cookiejar
import json
import os
import re
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener

base = 'https://anseong-e.goean.kr'
opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
headers = {'User-Agent': 'Mozilla/5.0', 'Referer': base + '/anseong-e/lo/login/loginTotalPage.do', 'Origin': base}
username = os.environ['SCHOOL_BOARD_USERNAME']
password = os.environ['SCHOOL_BOARD_PASSWORD']

def req(path, data=None):
    assert path in ['/anseong-e/lo/login/loginTotalPage.do', '/anseong-e/lo/login/login.do', '/anseong-e/na/ntt/insertNttPage.do?mi=6436&bbsId=3783']
    with opener.open(Request(base + path, data=urlencode(data).encode() if data else None, headers=headers), timeout=25) as response:
        return response.read().decode('utf-8', errors='replace')

req('/anseong-e/lo/login/loginTotalPage.do')
data = json.loads(req('/anseong-e/lo/login/login.do', {
    'agreAt':'', 'sysId':'anseong-e', 'loginType':'2', 'searchPageYn':'N',
    'mberId':username, 'mberPassword':password,
}))
print(json.dumps({'loginSucceeded': data.get('result') == 'Y'}))
if data.get('result') != 'Y': raise SystemExit('Login not successful')
html = req('/anseong-e/na/ntt/insertNttPage.do?mi=6436&bbsId=3783')
result = {'writeForm': bool(re.search(r'<form\b[^>]*id=[\"\']nttInsForm', html)),
          'scripts': re.findall(r'<script[^>]*src=[\"\']([^\"\']+)', html),
          'imageConfig': [line.strip() for line in html.splitlines() if re.search(r'upload|editor|filekinfo|fileSize|allow.*ext|image.*[Pp]ath', line, re.I) and not re.search(r'password|mberId|token', line, re.I)]}
safe = json.dumps(result, ensure_ascii=False).replace(username, '[REDACTED]').replace(password, '[REDACTED]')
print(safe)
