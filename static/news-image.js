/* Full newspaper export: fixed layout, lossless PNG, line-safe vertical tiles. */
(() => {
  const WIDTH=800, SCALE=2, TILE_HEIGHT=1200, MAX_IMAGES=20;
  const MAX_IMAGE_BYTES=4*1024*1024, MAX_TOTAL_BYTES=10*1024*1024;
  function slices(paper) {
    const origin=paper.getBoundingClientRect().top;
    const height=Math.ceil(paper.getBoundingClientRect().height);
    const intervals=[];
    const add=r=>{if(r.width&&r.height)intervals.push([Math.max(0,Math.floor(r.top-origin)-1),Math.ceil(r.bottom-origin)+1]);};
    for(const element of paper.querySelectorAll('.paper-header,.meta,.photo,.footer')) add(element.getBoundingClientRect());
    const walker=document.createTreeWalker(paper,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())) {
      if(!node.textContent.trim())continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const r of range.getClientRects())add(r);
    }
    intervals.sort((a,b)=>a[0]-b[0]);
    const occupied=[];
    for(const r of intervals) {
      const last=occupied[occupied.length-1];
      if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else occupied.push(r);
    }
    const tiles=[];
    for(let top=0;top<height;) {
      let bottom=height-top<=1600 ? height : top+TILE_HEIGHT;
      const crossing=occupied.find(([a,b])=>a<bottom&&b>bottom);
      if(bottom<height&&crossing)bottom=crossing[0];
      if(bottom<=top||tiles.length>=MAX_IMAGES)throw new Error('신문이 너무 깁니다. 내용을 나누어 게시해 주세요.');
      tiles.push({top,height:bottom-top});top=bottom;
    }
    return tiles;
  }
  async function render(source) {
    if(typeof window.html2canvas!=='function')throw new Error('이미지 변환 도구를 불러오지 못했습니다. 새로고침해 주세요.');
    await document.fonts.ready;
    const paper=source.cloneNode(true);paper.removeAttribute('id');paper.classList.add('export-paper');
    for(const el of paper.querySelectorAll('[id]'))el.removeAttribute('id');
    for(const el of paper.querySelectorAll('[contenteditable]'))el.setAttribute('contenteditable','false');
    const host=document.createElement('div');
    host.style.cssText='position:fixed;left:-10000px;top:0;width:800px;pointer-events:none;z-index:-1;';
    host.setAttribute('aria-hidden','true');host.append(paper);document.body.append(host);
    try {
      await Promise.all([...paper.querySelectorAll('img:not([hidden])')].map(img=>img.decode()));
      const tiles=slices(paper),images=[];let totalBytes=0;
      for(const tile of tiles) {
        const canvas=await html2canvas(paper,{width:WIDTH,height:tile.height,y:tile.top,scale:SCALE,windowWidth:1200,windowHeight:1000,scrollX:0,scrollY:0,backgroundColor:'#fffdf7',useCORS:true,logging:false});
        if(canvas.width!==WIDTH*SCALE||canvas.height!==tile.height*SCALE)throw new Error('이미지 크기를 확인하지 못했습니다.');
        const dataUrl=canvas.toDataURL('image/png');
        if(!dataUrl.startsWith('data:image/png;base64,'))throw new Error('PNG 이미지 생성에 실패했습니다.');
        const bytes=Math.ceil((dataUrl.length-22)*3/4);totalBytes+=bytes;
        if(bytes>MAX_IMAGE_BYTES||totalBytes>MAX_TOTAL_BYTES)throw new Error('이미지 용량이 너무 큽니다. 사진 용량을 줄이거나 내용을 나누어 주세요. 글씨 크기는 자동으로 줄이지 않습니다.');
        images.push({dataUrl,width:canvas.width,height:canvas.height});
        canvas.width=canvas.height=0;
      }
      return {images,totalBytes,logicalWidth:WIDTH,scale:SCALE};
    } finally {host.remove();}
  }
  window.NewsImage={render};
})();
