import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslationWorker } from '../src/index.mjs';

// Synthetic PNG header fixture. Browser tests cover actual decodable pixels.
function image(width=1600,height=2000) {
  const b=Buffer.alloc(45); Buffer.from([137,80,78,71,13,10,26,10]).copy(b);
  b.writeUInt32BE(13,8); b.write('IHDR',12); b.writeUInt32BE(width,16); b.writeUInt32BE(height,20);
  b[24]=8; b[25]=2; b.write('IEND',37);
  return {dataUrl:`data:image/png;base64,${b.toString('base64')}`,width,height};
}
const origin='https://anseong-e.goean.kr';
const imagePath='/dext5editordata/2026/09/test-image.png';
const sample=image();
const payload={credentials:{username:'test-user',password:'test-only-password'},title:'신문 <제목>',body:'본문',translatedBody:'Translation',confirmed:true,publishFormat:'newspaper-images-v1',newsImages:[sample]};
function request(data) {return new Request('https://worker.test/api/publish',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://jazzin37.github.io'},body:JSON.stringify(data)});}
function harness({uploadResult=`${imagePath}?1600^2000`, imageResult=sample, stored=true}={}) {
  const calls=[];
  const worker=createTranslationWorker({fetchFn:async(url,init={})=>{
    calls.push({url,init});
    if(url.includes('loginTotalPage'))return new Response('',{headers:{'Set-Cookie':'JSESSIONID=test; Path=/'}});
    if(url.endsWith('login.do'))return Response.json({result:'Y'});
    if(url.includes('insertNttPage'))return new Response('<form id="nttInsForm"><input type="hidden" name="sysId" value="anseong-e"></form>');
    if(url.includes('/handler/upload_handler.jsp'))return new Response(uploadResult);
    if(url===origin+imagePath)return new Response(Buffer.from(imageResult.dataUrl.split(',')[1],'base64'),{headers:{'Content-Type':'image/png'}});
    if(url.includes('insertNttInfo'))return Response.json({resultAt:'Y',nttSn:'123'});
    if(url.includes('selectNttInfo'))return new Response(stored?`<img src="${imagePath}">`:'<p>image removed</p>');
    assert.fail(`Unexpected request ${url}`);
  }});
  return {calls,send:async(data=payload)=>{const response=await worker.fetch(request(data),{}); return {status:response.status,data:await response.json()};}};
}

test('uploads the complete newspaper PNG and embeds a full-width clickable original',async()=>{
  const app=harness(); const result=await app.send();
  assert.equal(result.status,200);
  const upload=app.calls.find(c=>c.url.includes('/handler/upload_handler.jsp'));
  assert.ok(upload,'newspaper must be uploaded, not silently replaced by text');
  assert.ok(upload.init.body instanceof FormData);
  assert.equal(upload.init.body.get('Filedata').type,'image/png');
  assert.equal(upload.init.headers.get('Cookie'),'JSESSIONID=test');
  const decode=v=>Buffer.from(Buffer.from(v,'base64').toString().slice(1),'base64').toString();
  assert.equal(decode(upload.init.body.get('image_convert_width')),'0');
  const submitted=new URLSearchParams(app.calls.find(c=>c.url.includes('insertNttInfo')).init.body).get('nttCn');
  assert.match(submitted,/<img[^>]+width="800"/);
  assert.ok(submitted.includes(`href="${origin}${imagePath}"`));
  assert.ok(submitted.includes('height:auto'));
  assert.ok(!submitted.includes('data:image'));
  assert.equal(result.data.verified,true);
  assert.equal(result.data.imageCount,1);
});

test('advertises support so stale text-only backends cannot receive image posts',async()=>{
  const response=await createTranslationWorker().fetch(new Request('https://worker.test/api/health'),{});
  assert.equal((await response.json()).publish_format,'newspaper-images-v1');
});

test('rejects an oversized image request before parsing or contacting school',async()=>{
  const worker=createTranslationWorker({fetchFn:async()=>assert.fail('must not contact school')});
  const response=await worker.fetch(new Request('https://worker.test/api/publish',{method:'POST',body:' '.repeat(16*1024*1024)}),{});
  assert.equal(response.status,413);
});

for(const [name,change] of [
  ['missing images',{newsImages:[]}],
  ['invalid format',{publishFormat:'other'}],
  ['SVG injection',{newsImages:[{...sample,dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}]}],
  ['thumbnail instead of full size',{newsImages:[image(400)]}],
  ['forged dimensions',{newsImages:[{...sample,width:400}]}],
  ['too many images',{newsImages:Array(21).fill(sample)}],
  ['consent must be boolean',{confirmed:'yes'}],
]) test(`rejects ${name} without contacting school`,async()=>{
  const worker=createTranslationWorker({fetchFn:async()=>assert.fail('must not contact school')});
  const response=await worker.fetch(request({...payload,...change}),{});
  assert.equal(response.status,400);
});
for(const uploadResult of ['[FAIL]File Upload Error','https://evil.example/steal.png','/dext5editordata/../other.png','<script>alert(1)</script>'])test(`does not submit when upload response is unsafe: ${uploadResult}`,async()=>{
  const app=harness({uploadResult});const result=await app.send();
  assert.equal(result.data.ok,false);assert.ok(!app.calls.some(c=>c.url.includes('insertNttInfo')));
});
test('does not publish when the school downsizes the image',async()=>{
  const app=harness({imageResult:image(800,1000)});const result=await app.send();
  assert.equal(result.data.ok,false);assert.ok(!app.calls.some(c=>c.url.includes('insertNttInfo')));
});
test('does not claim verified success when stored HTML lost the image',async()=>{
  const app=harness({stored:false});const result=await app.send();
  assert.equal(result.data.ok,true);assert.equal(result.data.verified,false);
  assert.equal(app.calls.filter(c=>c.url.includes('insertNttInfo')).length,1);
});
test('all tiles are uploaded and embedded in order',async()=>{
  const app=harness();const result=await app.send({...payload,newsImages:[sample,sample]});
  assert.equal(result.data.imageCount,2);
  assert.equal(app.calls.filter(c=>c.url.includes('/handler/upload_handler.jsp')).length,2);
  const submitted=new URLSearchParams(app.calls.find(c=>c.url.includes('insertNttInfo')).init.body).get('nttCn');
  assert.equal((submitted.match(/<img/g)||[]).length,2);
});
