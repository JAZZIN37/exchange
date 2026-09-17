// Mirrors the school's DEXT5 image dialog (PNG, no server resizing).
export const IMAGE_FORMAT = 'newspaper-images-v1';
export const IMAGE_WIDTH = 1600;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 20;
const SCHOOL_ORIGIN = 'https://anseong-e.goean.kr';
const UPLOAD_PATH = '/editor/dext5editor/handler/upload_handler.jsp';

export function pngSize(bytes) {
  const signature = [137,80,78,71,13,10,26,10];
  if (bytes.length < 45 || !signature.every((n,i)=>bytes[i]===n) ||
      String.fromCharCode(...bytes.subarray(12,16)) !== 'IHDR') throw new Error('PNG 이미지가 올바르지 않습니다.');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {width:view.getUint32(16),height:view.getUint32(20)};
}

export function decodeNewsImages(images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > MAX_IMAGES) throw new Error('신문 이미지를 다시 생성해 주세요. (1~20장)');
  let total = 0;
  return images.map((image,index)=>{
    const dataUrl = image?.dataUrl;
    if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_IMAGE_BYTES/3)*4+22 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw new Error('PNG 이미지 한 장은 4MB 이하여야 합니다.');
    const bytes = Uint8Array.from(atob(dataUrl.slice(22)),c=>c.charCodeAt(0));
    total += bytes.length;
    if (bytes.length > MAX_IMAGE_BYTES || total > MAX_TOTAL_BYTES) throw new Error('신문 이미지 전체 용량은 10MB 이하여야 합니다. 사진 크기를 줄여 주세요.');
    const size = pngSize(bytes);
    if (size.width !== IMAGE_WIDTH || size.height < 1 || size.height > 3200 || size.width !== image.width || size.height !== image.height) throw new Error('신문 이미지 크기가 올바르지 않습니다. 미리보기를 다시 생성해 주세요.');
    return {...size,bytes,name:`exchange-news-${String(index+1).padStart(2,'0')}.png`};
  });
}

function encodeParameter(value) { return btoa('R'+btoa(value)); }

export function uploadForm(image) {
  const form = new FormData();
  form.set('pe','1');
  const params = {
    document_domain:'anseong-e.goean.kr',proxy_url:'',uploadtype:'image',
    savefilename:'exchange-news',savefileext:'png',serverdomain:'/',
    tosavepathurl:'dext5editordata',savafoldernamerule:'YYYY/MM/',savafilenamerule:'GUID',
    image_convert_format:'',image_convert_width:'0',image_convert_height:'0',cd:'0',originalfilename:image.name,
  };
  for (const [key,value] of Object.entries(params)) form.set(key,encodeParameter(value));
  form.set('Userdata','');
  form.set('Filedata',new Blob([image.bytes],{type:'image/png'}),image.name);
  return form;
}

export function uploadedImageUrl(raw) {
  // DEXT5 responds with an image URL followed by ?width^height.
  const text = raw.trim();
  const match = text.match(/^(https:\/\/anseong-e\.goean\.kr)?(\/dext5editordata\/[A-Za-z0-9/_-]+\.png)(?:\?\d+\^\d+)?$/i);
  if (!match) throw new Error('학교 홈페이지에서 이미지 업로드 주소를 확인하지 못했습니다. 글은 등록하지 않았습니다.');
  return SCHOOL_ORIGIN+match[2];
}

export async function uploadNewsImages(images, requestToSchool) {
  const urls=[];
  for (const image of images) {
    const response = await requestToSchool(UPLOAD_PATH,{method:'POST',body:uploadForm(image)});
    if (!response.ok) throw new Error('학교 홈페이지 이미지 업로드에 실패했습니다. 글은 등록하지 않았습니다.');
    const url = uploadedImageUrl(await response.text());
    const stored = await requestToSchool(new URL(url).pathname);
    if (!stored.ok || !(stored.headers.get('Content-Type') || '').toLowerCase().startsWith('image/png')) throw new Error('업로드한 PNG 이미지를 확인하지 못했습니다. 글은 등록하지 않았습니다.');
    const size = pngSize(new Uint8Array(await stored.arrayBuffer()));
    if (size.width !== image.width || size.height !== image.height) throw new Error('학교 서버에서 이미지 크기가 변경되어 게시를 중단했습니다.');
    urls.push(url);
  }
  return urls;
}

export function imageBoardHtml(urls,title) {
  const escape = v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return '<p>이미지를 누르면 글씨를 크게 볼 수 있습니다. / Click an image to view the full-size original. / Нажмите на изображение для увеличения.</p>' +
    urls.map((url,i)=>`<p style="margin:0"><a href="${escape(url)}" target="_blank" rel="noopener noreferrer"><img src="${escape(url)}" width="800" alt="${escape(title)} — ${i+1}/${urls.length}" style="display:block;width:100%;max-width:800px;height:auto;margin:0 auto;border:0"></a></p>`).join('');
}
