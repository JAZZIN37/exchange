"""Independent read-only check: login, main, board list, write page. Never submits."""
import http.cookiejar
import json
import os
import re
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener
from html.parser import HTMLParser

class SearchForm(HTMLParser):
    def __init__(self):
        super().__init__(); self.active=False; self.fields={}
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='form': self.active=attrs.get('id')=='srchForm'
        if self.active and tag=='input' and attrs.get('type')=='hidden' and attrs.get('name') not in (None, 'mi', 'bbsId'):
            self.fields[attrs['name']]=attrs.get('value','')
    def handle_endtag(self, tag):
        if tag=='form': self.active=False

base = 'https://anseong-e.goean.kr'
jar = http.cookiejar.CookieJar()
opener = build_opener(HTTPCookieProcessor(jar))
headers = {'User-Agent': 'Mozilla/5.0', 'Referer': base + '/anseong-e/lo/login/loginTotalPage.do', 'Origin': base}

def req(path, data=None):
    with opener.open(Request(base + path, data=urlencode(data).encode() if data else None, headers=headers), timeout=25) as r:
        return r.status, r.read().decode('utf-8',errors='replace')

req('/anseong-e/lo/login/loginTotalPage.do')
status, raw = req('/anseong-e/lo/login/login.do', {
    'agreAt':'', 'sysId':'anseong-e','loginType':'2','searchPageYn':'N',
    'mberId':os.environ['SCHOOL_BOARD_USERNAME'], 'mberPassword':os.environ['SCHOOL_BOARD_PASSWORD'],
})
data = json.loads(raw)
print(json.dumps({'client':'stdlib CookieJar + Referer/Origin','loginHttp':status,'loginResult':data.get('result'), 'cookieNames':[c.name for c in jar], 'requestedAccountMatches':os.environ['SCHOOL_BOARD_USERNAME'].strip() == 'exchange2026'},ensure_ascii=False))
if data.get('result') != 'Y': raise SystemExit('Login not successful; no further requests')
search_form = SearchForm()
for path in ['/anseong-e/main.do','/anseong-e/na/ntt/selectNttList.do?mi=6436&bbsId=3783','/anseong-e/na/ntt/insertNttPage.do?mi=6436&bbsId=3783']:
    status,html=req(path)
    if 'selectNttList' in path: search_form.feed(html)
    print(json.dumps({'path':path,'status':status,'logoutLink': bool(re.search(r'logout(?:\.do|\()',html,re.I)), 'writeLink': 'insertNttPage.do' in html,'writeForm': bool(re.search(r'<form[^>]*id=[\"\']nttInsForm',html)), 'permissionDenied':'쓰기권한이 없습니다' in html},ensure_ascii=False))
# Replicate the observed school UI's POST of srchForm (not a post creation).
headers['Referer']=base+'/anseong-e/na/ntt/selectNttList.do?mi=6436&bbsId=3783'
status, html=req('/anseong-e/na/ntt/insertNttPage.do?mi=6436&bbsId=3783', search_form.fields)
result={'method':'POST as official write button','status':status,'postedFieldNames':list(search_form.fields),'writeForm':bool(re.search(r'<form[^>]*id=[\"\']nttInsForm',html)),'permissionDenied':'쓰기권한이 없습니다' in html}
if result['writeForm']:
    result['forms']=re.findall(r'<form\b[^>]*>',html)
    result['inputNames']=re.findall(r'<(?:input|textarea|select)\b[^>]*name=[\"\']([^\"\']+)',html)
    pos=html.find('insertNttInfo.do')
    result['submitScript']=html[max(0,pos-1800):pos+1600] if pos>=0 else ''
for k,v in list(result.items()):
    if isinstance(v,str): result[k]=v.replace(os.environ['SCHOOL_BOARD_USERNAME'],'[REDACTED]').replace(os.environ['SCHOOL_BOARD_PASSWORD'],'[REDACTED]')
print(json.dumps(result,ensure_ascii=False))
