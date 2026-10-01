/* Ver735: keep statement previews inside installed apps; never navigate the app to a PDF. */
const vendor=new URL('../vendor/pdfjs-5.6.205/',import.meta.url);
let renderer;
export function isStatementApp(){
  return navigator.standalone===true||['standalone','minimal-ui','fullscreen'].some(mode=>window.matchMedia?.('(display-mode: '+mode+')').matches);
}
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
  styles();
  const controller=new AbortController(),dialog=document.createElement('dialog');
  dialog.id='wootenStatementAppPreview';dialog.setAttribute('aria-labelledby','wspTitle');
  dialog.innerHTML=`<header><div class="wsp-heading"><h2 id="wspTitle" tabindex="-1">Statement Preview</h2><button class="wsp-close" type="button" aria-label="Close statement preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><p class="wsp-filename">Preparing your statements…</p><div class="wsp-toolbar"><button class="wsp-back" type="button">‹ Back to Statements</button><div class="wsp-zoom"><button class="wsp-out" type="button" aria-label="Zoom out" disabled>−</button><button class="wsp-fit" type="button" disabled>Fit width</button><button class="wsp-in" type="button" aria-label="Zoom in" disabled>+</button></div></div></header><div class="wsp-scroll"><p class="wsp-notice" role="status" aria-live="polite">Preparing your preview. Nothing is being sent.</p><div class="wsp-paper"></div></div><footer><div class="wsp-pages"><button class="wsp-prev" type="button" disabled>Previous</button><label>Page <input class="wsp-page" type="number" min="1" value="1" inputmode="numeric" aria-label="Preview page number" disabled> <span class="wsp-count">of —</span></label><button class="wsp-next" type="button" disabled>Next</button></div><button class="wsp-save" type="button" disabled>Save PDF</button></footer>`;
  const q=selector=>dialog.querySelector(selector),notice=q('.wsp-notice'),paper=q('.wsp-paper'),scroller=q('.wsp-scroll');
  const previous=q('.wsp-prev'),next=q('.wsp-next'),pageInput=q('.wsp-page'),save=q('.wsp-save');
  const zoomOut=q('.wsp-out'),zoomIn=q('.wsp-in'),fit=q('.wsp-fit');
  let closed=false,loadingTask=null,pdfDocument=null,renderTask=null,currentPage=1,zoom=1,serial=0,resizeTimer,downloadUrl=null;
  let previewFile=null,shareSupported=false;
  const oldOverflow=document.body.style.overflow;
  function close(){
    if(closed)return;
    closed=true;serial++;controller.abort();clearTimeout(resizeTimer);
    window.removeEventListener('resize',onResize);renderTask?.cancel();
    if(loadingTask)Promise.resolve(loadingTask.destroy()).catch(()=>{});
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);
    previewFile=null;paper.replaceChildren();dialog.close();dialog.remove();
    document.body.style.overflow=oldOverflow;
    returnFocus?.focus({preventScroll:true});
  }
  function navigation(busy=false){
    const unavailable=busy||!pdfDocument;
    previous.disabled=unavailable||currentPage<=1;next.disabled=unavailable||currentPage>=pdfDocument.numPages;
    pageInput.disabled=unavailable;pageInput.value=String(currentPage);
    zoomOut.disabled=unavailable||zoom<=1;zoomIn.disabled=unavailable||zoom>=3;fit.disabled=unavailable||zoom===1;
  }
  async function renderPage(){
    if(closed||!pdfDocument)return;
    const id=++serial;
    renderTask?.cancel();navigation(true);notice.textContent='Loading page '+currentPage+'…';
    try{
      const page=await pdfDocument.getPage(currentPage);
      if(closed||id!==serial)return;
      const natural=page.getViewport({scale:1}),width=Math.max(220,scroller.clientWidth-32);
      const viewport=page.getViewport({scale:Math.min(width,1100)/natural.width*zoom});
      // Limit the canvas on phones, even when zoomed in; keep only one rendered page.
      const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(8000000/(viewport.width*viewport.height)));
      const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Statement preview page '+currentPage+' of '+pdfDocument.numPages);
      canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
      canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
      const task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});renderTask=task;
      await task.promise;
      if(closed||id!==serial){canvas.width=canvas.height=0;return;}
      const oldCanvas=paper.querySelector('canvas');if(oldCanvas)oldCanvas.width=oldCanvas.height=0;
      paper.replaceChildren(canvas);page.cleanup();scroller.scrollTop=0;scroller.scrollLeft=0;notice.textContent='';
    }catch(error){
      if(!closed&&id===serial&&error.name!=='RenderingCancelledException'){
        paper.replaceChildren();notice.textContent='This page could not be displayed. You can save the PDF or return to statements.';
      }
    }finally{if(!closed&&id===serial){renderTask=null;navigation();}}
  }
  function onResize(){clearTimeout(resizeTimer);resizeTimer=setTimeout(renderPage,150);}
  previous.addEventListener('click',()=>{if(currentPage>1){currentPage--;renderPage();}});
  next.addEventListener('click',()=>{if(currentPage<pdfDocument?.numPages){currentPage++;renderPage();}});
  pageInput.addEventListener('change',()=>{currentPage=Math.max(1,Math.min(pdfDocument.numPages,Math.trunc(Number(pageInput.value))||1));renderPage();});
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
  q('.wsp-close').addEventListener('click',close);q('.wsp-back').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.body.append(dialog);document.body.style.overflow='hidden';dialog.showModal();q('#wspTitle').focus({preventScroll:true});
  window.addEventListener('resize',onResize);
  return {
    signal:controller.signal,
    get closed(){return closed;},
    close,
    message(text){if(!closed)notice.textContent=text;},
    async show(bytes,filename){
      if(closed)return;
      q('.wsp-filename').textContent=filename;
      previewFile=new File([bytes],filename,{type:'application/pdf'});
      try{shareSupported=!!navigator.canShare?.({files:[previewFile]})&&typeof navigator.share==='function';}catch{shareSupported=false;}
      save.textContent=shareSupported?'Share / Save PDF':'Save PDF';save.disabled=false;
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
}
