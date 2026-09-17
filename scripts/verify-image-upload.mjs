// Manual integration probe: uploads a labelled synthetic PNG, NEVER creates a post.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTranslationWorker} from '../worker/src/index.mjs';
import {pngSize} from '../worker/src/board-images.mjs';
const png=new Uint8Array(await readFile(new URL('../worker/test/fixtures/image-upload-probe.png',import.meta.url)));
const size=pngSize(png);
const credentials={username:process.env.SCHOOL_BOARD_USERNAME,password:process.env.SCHOOL_BOARD_PASSWORD};
assert.ok(credentials.username && credentials.password,'Existing school secrets required');
let stopped=false,uploads=0,verifiedReads=0,imageUrls=[];
const worker=createTranslationWorker({fetchFn:async(url,init={})=>{
  const parsed=new URL(url);
  assert.equal(parsed.origin,'https://anseong-e.goean.kr');
  if(parsed.pathname.endsWith('/insertNttInfo.do')) {
    const html=new URLSearchParams(init.body).get('nttCn');
    imageUrls=[...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(imageUrls.length,1);
    assert.ok(html.includes('width="800"'));
    stopped=true;
    throw new Error('PROBE_STOP_BEFORE_SUBMIT');
  }
  assert.ok(['/anseong-e/lo/login/loginTotalPage.do','/anseong-e/lo/login/login.do','/anseong-e/na/ntt/insertNttPage.do','/editor/dext5editor/handler/upload_handler.jsp'].includes(parsed.pathname) || /^\/dext5editordata\/[A-Za-z0-9/_-]+\.png$/.test(parsed.pathname),'Unexpected remote request');
  if(parsed.pathname.includes('/handler/'))uploads++;
  if(parsed.pathname.startsWith('/dext5editordata/'))verifiedReads++;
  const response=await fetch(url,init);
  if(parsed.pathname.includes('/handler/')) {
    const raw=await response.clone().text();
    console.log(JSON.stringify({uploadHttp:response.status,responseLength:raw.length,hasImagePath:raw.includes('/dext5editordata/'),hasFailure:raw.includes('[FAIL]'),hasScript:raw.includes('<script')}));
  }
  return response;
}});
const response=await worker.fetch(new Request('https://probe.invalid/api/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credentials,title:'[TEST] Image adapter probe — no post',body:'Synthetic image adapter test. No board post is created.',confirmed:true,publishFormat:'newspaper-images-v1',newsImages:[{...size,dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64')}]})}),{});
const result=await response.json();
assert.ok(stopped && uploads===1 && verifiedReads===1,result.error || 'Probe did not reach verified image stage');
assert.equal(result.error,'PROBE_STOP_BEFORE_SUBMIT');
console.log(JSON.stringify({imageUploadVerified:true,boardPostCreated:false,uploadCount:uploads,originalDimensions:size,imageUrls}));
