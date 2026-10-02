/* Ver752: continuous pages, isolated scrolling and PDF printing. Previous: use a fresh, closable statement viewer in apps and browser tabs. */
const vendor=new URL('../vendor/pdfjs-5.6.205/',import.meta.url);
let renderer;
let activePreview=null;
function loadRenderer(){
  if(!renderer)renderer=import(new URL('pdf.min.mjs',vendor).href).then(pdfjs=>{
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',vendor).href;
    return pdfjs;
  }).catch(error=>{renderer=null;throw error;});
  return renderer;
}
function styles(){
  if(document.getElementById('wootenStatementAppPreviewStyle'))return;
  const style=document.createElement('style');style.id='wootenStatementAppPreviewStyle';
  style.textContent=`
    html.wsp-open,html.wsp-open body{overflow:hidden!important;overscroll-behavior:none!important}
    #wootenStatementAppPreview{overflow:hidden!important;max-height:100dvh!important}
    #wootenStatementAppPreview .wsp-sheet{position:relative;margin:0 auto 20px;background:white;box-shadow:0 3px 14px #17364d26}
    #wootenStatementAppPreview .wsp-actions{display:flex;gap:8px;flex-wrap:wrap}
    #wootenStatementAppPreview .wsp-print{background:#1d6596;color:white}

    #wootenStatementAppPreview{position:fixed;inset:0;margin:0;padding:0;border:0;width:100%;max-width:none;height:100vh;height:100dvh;max-height:none;background:#edf2f7;color:#17364d;font:16px/1.4 Inter,Segoe UI,Arial,sans-serif;box-sizing:border-box;overflow:hidden}
    #wootenStatementAppPreview[open]{display:flex;flex-direction:column}
    #wootenStatementAppPreview *{box-sizing:border-box}
    #wootenStatementAppPreview::backdrop{background:#17364d99}
    #wootenStatementAppPreview header{flex:none;padding:calc(12px + env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 12px max(16px,env(safe-area-inset-left));background:#fff;border-bottom:1px solid #cddde9}
    #wootenStatementAppPreview .wsp-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
    #wootenStatementAppPreview h2{font:700 22px/1.2 Inter,Segoe UI,Arial,sans-serif;margin:0;color:#102c42}
    #wootenStatementAppPreview button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;min-width:44px;width:auto;margin:0;padding:10px 14px;border:1px solid #cddde9;border-radius:10px;background:#edf4f8;color:#17364d;font:600 15px/1.3 Inter,Segoe UI,Arial,sans-serif;cursor:pointer;box-shadow:none;text-decoration:none}
    #wootenStatementAppPreview button:hover{background:#e2edf5}
    #wootenStatementAppPreview button:focus-visible,#wootenStatementAppPreview input:focus-visible{outline:3px solid #2369a7;outline-offset:2px}
    #wootenStatementAppPreview button:disabled{opacity:.45;cursor:default}
    #wootenStatementAppPreview .wsp-close{padding:8px;width:44px;height:44px;flex:none}
    #wootenStatementAppPreview .wsp-close svg{width:22px;height:22px}
    #wootenStatementAppPreview .wsp-customer{margin:8px 0 0;font-size:16px;font-weight:700;overflow-wrap:anywhere}
    #wootenStatementAppPreview .wsp-filename{margin:6px 0 0;font-size:12px;color:#60798d;overflow-wrap:anywhere}
    #wootenStatementAppPreview .wsp-toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;padding-top:10px;flex-wrap:wrap}
    #wootenStatementAppPreview .wsp-zoom{display:flex;align-items:center;gap:6px}
    #wootenStatementAppPreview .wsp-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:16px}
    #wootenStatementAppPreview .wsp-notice{margin:0 auto 12px;max-width:900px;color:#36546b;font-size:15px}
    #wootenStatementAppPreview .wsp-notice:empty{display:none}
    #wootenStatementAppPreview .wsp-paper{width:max-content;max-width:none;min-width:100%;text-align:center}
    #wootenStatementAppPreview canvas{display:block;margin:0 auto;background:#fff;box-shadow:0 3px 14px #17364d26}
    #wootenStatementAppPreview footer{flex:none;background:#fff;border-top:1px solid #cddde9;padding:12px max(16px,env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    #wootenStatementAppPreview .wsp-pages{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
    #wootenStatementAppPreview .wsp-pages label{display:flex;align-items:center;gap:6px;margin:0;font-weight:500;font-size:14px;color:#17364d}
    #wootenStatementAppPreview input{width:60px;min-width:0;height:44px;padding:6px;border:1px solid #cddde9;border-radius:8px;text-align:center;font:16px Inter,Segoe UI,Arial,sans-serif;background:#fff;color:#17364d}
    #wootenStatementAppPreview .wsp-save{background:#1d6596;color:#fff;border-color:#1d6596}
    #wootenStatementAppPreview .wsp-save:hover{background:#184f77}
    #wootenStatementAppPreview [hidden]{display:none!important}
    @media(max-width:600px){#wootenStatementAppPreview footer{justify-content:center}#wootenStatementAppPreview .wsp-pages{width:100%;gap:6px}#wootenStatementAppPreview .wsp-save{width:100%}#wootenStatementAppPreview h2{font-size:20px}}
  `;
  document.head.append(style);
}
export function openStatementAppPreview(returnFocus){
  activePreview?.close();
  styles();
  const controller=new AbortController(),dialog=document.createElement('dialog');
  dialog.id='wootenStatementAppPreview';dialog.setAttribute('aria-labelledby','wspTitle');
  dialog.innerHTML=`<header><div class="wsp-heading"><h2 id="wspTitle" tabindex="-1">Statement Preview</h2><button class="wsp-close" type="button" aria-label="Close statement preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><p class="wsp-customer"></p><p class="wsp-filename">Preparing your statements…</p><div class="wsp-toolbar"><button class="wsp-back" type="button">‹ Back to Statements</button><div class="wsp-zoom"><button class="wsp-out" type="button" aria-label="Zoom out" disabled>−</button><button class="wsp-fit" type="button" disabled>Fit width</button><button class="wsp-in" type="button" aria-label="Zoom in" disabled>+</button></div></div></header><div class="wsp-scroll"><p class="wsp-notice" role="status" aria-live="polite">Preparing your preview. Nothing is being sent.</p><div class="wsp-paper"></div></div><footer><div class="wsp-pages"><button class="wsp-prev" type="button" disabled>Previous</button><label>Page <input class="wsp-page" type="number" min="1" value="1" inputmode="numeric" aria-label="Preview page number" disabled> <span class="wsp-count">of —</span></label><button class="wsp-next" type="button" disabled>Next</button></div><div class="wsp-actions"><button class="wsp-print" type="button" disabled>Print</button><button class="wsp-save" type="button" disabled>Save PDF</button></div></footer>`;
  const q=selector=>dialog.querySelector(selector),notice=q('.wsp-notice'),paper=q('.wsp-paper'),scroller=q('.wsp-scroll');
  const previous=q('.wsp-prev'),next=q('.wsp-next'),pageInput=q('.wsp-page'),save=q('.wsp-save');
  const zoomOut=q('.wsp-out'),zoomIn=q('.wsp-in'),fit=q('.wsp-fit');
  let closed=false,loadingTask=null,pdfDocument=null,renderTask=null,currentPage=1,zoom=1,serial=0,resizeTimer,downloadUrl=null;
  let previewFile=null,shareSupported=false, sheets=[],painting=false,paintAgain=false,layoutSerial=0;
  const print=q('.wsp-print');
  const hadScrollLock=document.documentElement.classList.contains('wsp-open');
  const oldOverflow=document.body.style.overflow;
  function close(){
    if(closed)return;
    closed=true;serial++;controller.abort();clearTimeout(resizeTimer);
    window.removeEventListener('resize',onResize);renderTask?.cancel();
    if(loadingTask)Promise.resolve(loadingTask.destroy()).catch(()=>{});
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);
    previewFile=null;paper.replaceChildren();dialog.close();dialog.remove();activePreview=null;
    document.body.style.overflow=oldOverflow;
    if(!hadScrollLock)document.documentElement.classList.remove('wsp-open');
    returnFocus?.focus({preventScroll:true});
  }
  function navigation(busy=false){
    const unavailable=busy||!pdfDocument;
    previous.disabled=unavailable||currentPage<=1;next.disabled=unavailable||currentPage>=pdfDocument.numPages;
    pageInput.disabled=unavailable;pageInput.value=String(currentPage);
    zoomOut.disabled=unavailable||zoom<=1;zoomIn.disabled=unavailable||zoom>=3;fit.disabled=unavailable||zoom===1;
  }
  async function paintVisible(){
    if(painting){paintAgain=true;return;}
    if(closed||!pdfDocument||!sheets.length)return;
    painting=true;
    const generation=layoutSerial;
    try{
      const top=scroller.scrollTop,bottom=top+scroller.clientHeight;
      let best=0,bestDistance=Infinity;
      for(let i=0;i<sheets.length;i++){
        const item=sheets[i],y=item.element.offsetTop-paper.offsetTop;
        const distance=Math.abs(y-top);
        if(distance<bestDistance){best=i;bestDistance=distance;}
      }
      currentPage=best+1;navigation();
      for(let i=0;i<sheets.length;i++){
        const item=sheets[i],y=item.element.offsetTop-paper.offsetTop;
        const near=y+item.height>=top-scroller.clientHeight&&y<=bottom+scroller.clientHeight;
        if(!near){const old=item.element.querySelector('canvas');if(old){old.width=old.height=0;old.remove();}continue;}
        if(item.element.querySelector('canvas'))continue;
        const page=await pdfDocument.getPage(i+1);
        if(closed||generation!==layoutSerial)break;
        const viewport=page.getViewport({scale:item.width/item.natural.width});
        const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(8000000/(viewport.width*viewport.height)));
        const canvas=document.createElement('canvas');
        canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Statement page '+(i+1)+' of '+sheets.length);
        canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
        canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
        renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});
        await renderTask.promise;
        if(closed||generation!==layoutSerial){canvas.width=canvas.height=0;break;}
        item.element.replaceChildren(canvas);page.cleanup();
      }
    }catch(error){if(!closed&&error.name!=='RenderingCancelledException')notice.textContent='A page could not display. Scroll to retry, or save the PDF.';}
    finally{painting=false;renderTask=null;if(paintAgain&&!closed){paintAgain=false;paintVisible();}}
  }
  function goToPage(value){
    if(!sheets.length)return;
    currentPage=Math.max(1,Math.min(sheets.length,Math.trunc(Number(value))||1));
    const element=sheets[currentPage-1].element;
    scroller.scrollTop=element.offsetTop-paper.offsetTop;navigation();paintVisible();
  }
  async function renderPage(){
    if(closed||!pdfDocument)return;
    const generation=++layoutSerial,target=currentPage;
    renderTask?.cancel();navigation(true);notice.textContent='Preparing pages…';
    try{
      if(!sheets.length){
        for(let n=1;n<=pdfDocument.numPages;n++){
          const page=await pdfDocument.getPage(n);
          if(closed||generation!==layoutSerial)return;
          const element=document.createElement('div');element.className='wsp-sheet';
          element.setAttribute('aria-label','Page '+n);sheets.push({element,natural:page.getViewport({scale:1})});
          paper.append(element);page.cleanup();
        }
      }
      const width=Math.min(Math.max(220,scroller.clientWidth-32),1100)*zoom;
      for(const item of sheets){
        item.width=width;item.height=width*item.natural.height/item.natural.width;
        const canvas=item.element.querySelector('canvas');if(canvas)canvas.width=canvas.height=0;
        item.element.replaceChildren();item.element.style.width=width+'px';item.element.style.height=item.height+'px';
      }
      notice.textContent='';goToPage(target);
    }catch(error){if(!closed)notice.textContent='The preview could not display. Save the PDF to view it.';}
    finally{if(!closed&&generation===layoutSerial)navigation();}
  }
  function onResize(){clearTimeout(resizeTimer);resizeTimer=setTimeout(renderPage,150);}
  scroller.addEventListener('scroll',()=>paintVisible(),{passive:true});
  previous.addEventListener('click',()=>goToPage(currentPage-1));
  next.addEventListener('click',()=>goToPage(currentPage+1));
  pageInput.addEventListener('change',()=>goToPage(pageInput.value));
  pageInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();pageInput.dispatchEvent(new Event('change'));}});
  zoomOut.addEventListener('click',()=>{zoom=Math.max(1,zoom-.5);renderPage();});
  zoomIn.addEventListener('click',()=>{zoom=Math.min(3,zoom+.5);renderPage();});
  fit.addEventListener('click',()=>{zoom=1;renderPage();});
  save.addEventListener('click',async()=>{
    if(!previewFile)return;
    if(shareSupported){
      try{await navigator.share({files:[previewFile],title:'Wooten Oil statement preview'});}
      catch(error){if(error.name!=='AbortError')notice.textContent='The sharing menu could not open. Please try again.';}
      return;
    }
    // A download is explicit; previewing never navigates the installed app.
    if(!downloadUrl)downloadUrl=URL.createObjectURL(previewFile);
    const link=document.createElement('a');link.href=downloadUrl;link.download=previewFile.name;link.hidden=true;
    dialog.append(link);link.click();link.remove();
  });
  print.addEventListener('click',()=>{
    if(!previewFile)return;
    if(!downloadUrl)downloadUrl=URL.createObjectURL(previewFile);
    const printWindow=window.open(downloadUrl,'_blank');
    if(!printWindow){notice.textContent='Allow pop-ups to open the PDF for printing, or use Save PDF.';return;}
    // Keep the portal open; the PDF viewer provides native Print (or Share > Print on iPhone).
    printWindow.opener=null;
  });
  q('.wsp-close').addEventListener('click',close);q('.wsp-back').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.body.append(dialog);document.body.style.overflow='hidden';document.documentElement.classList.add('wsp-open');dialog.showModal();q('#wspTitle').focus({preventScroll:true});
  window.addEventListener('resize',onResize);
  activePreview={
    signal:controller.signal,
    get closed(){return closed;},
    close,
    message(text){if(!closed)notice.textContent=text;},
    async show(bytes,filename,selectionLabel=''){
      if(closed)return;
      q('.wsp-customer').textContent=selectionLabel;
      q('.wsp-filename').textContent=filename;
      previewFile=new File([bytes],filename,{type:'application/pdf'});
      try{shareSupported=!!navigator.canShare?.({files:[previewFile]})&&typeof navigator.share==='function';}catch{shareSupported=false;}
      save.textContent=shareSupported?'Share / Save PDF':'Save PDF';save.disabled=false;print.disabled=false;
      try{
        const pdfjs=await loadRenderer();if(closed)return;
        loadingTask=pdfjs.getDocument({data:new Uint8Array(bytes).slice(),isEvalSupported:false,standardFontDataUrl:new URL('standard_fonts/',vendor).href});
        pdfDocument=await loadingTask.promise;if(closed)return;
        q('.wsp-count').textContent='of '+pdfDocument.numPages;pageInput.max=String(pdfDocument.numPages);
        await renderPage();
      }catch(error){
        if(!closed)notice.textContent='The preview could not display here. You can save the PDF or use Back to Statements.';
      }
    }
  };
  return activePreview;
}
