"""Real Chromium regression: complete PNG export, mobile parity, long text.
Run: python scripts/test-image-export.py --output <evidence-folder>
Requires playwright and pillow; uses installed Chrome. No school posts are made.
"""
import argparse
import base64
import functools
import http.server
import json
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--output',required=True)
parser.add_argument('--url')
args=parser.parse_args()
out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root/'static')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=args.url or f'http://127.0.0.1:{server.server_port}/'
reports=[]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    for name,viewport,long in [('desktop',{'width':1280,'height':900},False),('mobile',{'width':390,'height':844},False),('long',{'width':1280,'height':900},True)]:
        page=browser.new_page(viewport=viewport)
        page.on('dialog',lambda d:d.dismiss())
        # Never send a registration request, even if this test is pointed at the public app.
        page.route('**/api/publish',lambda r:r.abort())
        page.goto(base,wait_until='networkidle')
        page.evaluate("""() => {
          window.captureEvidence=[];const render=window.html2canvas;
          window.html2canvas=(paper,options)=>{
            window.captureEvidence.push({top:options.y,height:options.height,total:Math.ceil(paper.getBoundingClientRect().height),bodyFont:getComputedStyle(paper.querySelector('.body')).fontSize,translationFont:getComputedStyle(paper.querySelector('.translation-line:not([hidden])')).fontSize,hasTranslations:paper.textContent.includes('Учимся вместе'),hasFooter:paper.textContent.includes('PARTNERSHIP FOR GLOBAL CITIZENS'),hasLastLine:paper.textContent.includes('END OF ARTICLE')});
            return render(paper,options);
          };
        }""")
        page.locator('#previewTitle').fill('국제교류 소식 · Friendship · Дружба')
        body='서로의 학교생활을 소개하며 함께 배웠습니다. 글씨가 선명하게 보이는지 확인합니다.\n학교 간 우정과 배움을 이어 갑니다.'
        if long: body=('국제교류 가독성 검증입니다. 긴 문서의 모든 줄이 잘리지 않고 이어집니다.\n'*85)+'마지막 본문 문장 END OF ARTICLE'
        page.locator('#previewBody').fill(body)
        page.evaluate("""() => {
          for (const [id,text] of Object.entries({titleTranslationEn:'Learning together across borders',titleTranslationRu:'Учимся вместе без границ',bodyTranslationEn:'We shared our school life and learned together. Clear text must remain readable.',bodyTranslationRu:'Мы познакомились со школьной жизнью друг друга. Текст должен оставаться чётким.'})) {
            document.getElementById(id).textContent=text; document.getElementById(id).hidden=false;
          }
          const c=document.createElement('canvas');c.width=1200;c.height=500;
          const x=c.getContext('2d');x.fillStyle='#2563eb';x.fillRect(0,0,1200,500);x.fillStyle='#facc15';x.fillRect(60,60,1080,380);
          const photo=document.getElementById('previewImage');photo.src=c.toDataURL();photo.hidden=false;document.getElementById('photoEmpty').hidden=true;
        }""")
        page.locator('#prepareBtn').click()
        try:
            page.locator('#publishPreview img').first.wait_for(timeout=20000)
        except Exception as exc:
            raise AssertionError('The complete newspaper PNG must be generated and previewed before publication') from exc
        images=page.locator('#publishPreview img').evaluate_all('(imgs)=>imgs.map(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight}))')
        assert images and all(i['width']==1600 and 0<i['height']<=3200 for i in images),images
        if long: assert len(images)>1,'Long documents must be split without shrinking the text'
        if len(images)>1: assert images[-1]['height']>=100,'Do not emit a tiny trailing blank strip'
        evidence=page.evaluate('window.captureEvidence')
        assert sum(e['height'] for e in evidence)==evidence[0]['total'],'Capture must cover the complete newspaper'
        cursor=0
        for e in evidence:
            assert e['top']==cursor;cursor+=e['height']
            assert e['bodyFont']=='24px' and e['translationFont']=='22px'
            assert e['hasTranslations'] and e['hasFooter']
            if long: assert e['hasLastLine']
        for n,image in enumerate(images,1):
            path=out/f'{name}-{n:02}.png';path.write_bytes(base64.b64decode(image['src'].split(',')[1]));im=Image.open(path);im.verify()
        page.screenshot(path=str(out/f'{name}-preview.png'),full_page=True)
        reports.append({'case':name,'imageCount':len(images),'dimensions':[[i['width'],i['height']] for i in images],'summary':page.locator('#publishImageInfo').inner_text()})
        page.locator('#previewZoomBtn').click()
        assert page.locator('#publishPreview img').first.evaluate('(img)=>img.getBoundingClientRect().width')==1600
        if not args.url and name=='desktop':
            sent=[]
            # Fake credentials and mock endpoint are restricted to this local test.
            page.route('**/api/health',lambda r:r.fulfill(json={'ok':True,'publish_format':'newspaper-images-v1'}))
            def mock_publish(route):
                sent.append(route.request.post_data_json)
                route.fulfill(json={'ok':True,'verified':True,'imageCount':len(images),'boardPostId':'test-only'})
            page.route('**/api/publish',mock_publish)
            page.locator('#publishUsername').fill('local-fixture-user')
            page.locator('#publishPassword').fill('local-fixture-not-a-real-password')
            page.locator('#publishConfirmed').check()
            page.evaluate("document.getElementById('confirmPublishBtn').click();document.getElementById('confirmPublishBtn').click();")
            page.wait_for_function("document.getElementById('publishPassword').value === ''")
            assert len(sent)==1,'Double click must not duplicate publication'
            assert sent[0]['publishFormat']=='newspaper-images-v1'
            assert [i['dataUrl'] for i in sent[0]['newsImages']]==[i['src'] for i in images]
            assert page.locator('#confirmPublishBtn').is_disabled()
            assert page.locator('#publishUsername').input_value()==''
        page.close()
    browser.close()
server.shutdown()
assert reports[0]['dimensions']==reports[1]['dimensions'],'A small viewport must not shrink exported images'
(out/'browser-results.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':True,'cases':reports},ensure_ascii=False))
