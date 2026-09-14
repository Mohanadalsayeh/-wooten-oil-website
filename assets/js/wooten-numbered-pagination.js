/* Ver446: shared, direct page navigation. Existing loaders own data and filters. */
(() => {
  'use strict';
  const selector = '.db-pagination,.twilio-results-pager,.pt-pagination,.doc-admin-pagination-controls,.schedule-result-pagination-controls,.customer-documents-page-controls,.admin-activity-pagination-controls';
  const states = new WeakMap();
  function pageList(page, pages, compact, narrow) {
    if(narrow)return [page];
    if (compact) return [...new Set([Math.max(1,page-1),page,Math.min(pages,page+1)])];
    const kept = new Set([1,pages,page]);
    for(let i=Math.max(1,page-1);i<=Math.min(pages,page+1);i++) kept.add(i);
    if(page<=2) for(let i=1;i<=Math.min(3,pages);i++) kept.add(i);
    if(page>=pages-1) for(let i=Math.max(1,pages-2);i<=pages;i++) kept.add(i);
    const result=[];
    [...kept].sort((a,b)=>a-b).forEach(n=>{
      const last=result[result.length-1];
      if(last && n-last===2) result.push(last+1);
      else if(last && n-last>2) result.push('…');
      result.push(n);
    });
    return result;
  }
  function render(pager) {
    const children=[...pager.children];
    const buttons=children.filter(n=>n.tagName==='BUTTON');
    const prev=buttons[0],next=buttons[buttons.length-1];
    const info=children.find(n=>n.tagName!=='BUTTON'&&!n.classList.contains('wooten-page-numbers')&&/Page\s+[\d,]+\s+of\s+[\d,]+/i.test(n.textContent));
    if(!prev||!next||prev===next||!info)return;
    const match=info.textContent.match(/Page\s+([\d,]+)\s+of\s+([\d,]+)/i);
    const page=Number(match[1].replaceAll(',','')),pages=Number(match[2].replaceAll(',',''));
    if(!Number.isSafeInteger(page)||!Number.isSafeInteger(pages)||page<1||pages<page)return;
    const canJump=typeof prev.wootenGoToPage==='function'||prev.hasAttribute('data-activity-page-section')||prev.hasAttribute('data-tree-action');
    if(!canJump)return;
    let state=states.get(pager);
    if(!state){
      const numbers=document.createElement('span');
      numbers.className='wooten-page-numbers';
      numbers.setAttribute('role','group');numbers.setAttribute('aria-label','Page numbers');
      pager.insertBefore(numbers,next);
      state={numbers,busy:false,key:''};states.set(pager,state);
      pager.dataset.wootenPager='';info.classList.add('wooten-page-summary');
      prev.classList.add('wooten-page-prev');next.classList.add('wooten-page-next');
      if(!pager.hasAttribute('aria-label'))pager.setAttribute('aria-label','Table pagination');
      resize.observe(pager);
    }
    state.prev=prev;state.next=next;state.page=page;state.pages=pages;
    const width=pager.getBoundingClientRect().width;
    const compact=width<620,narrow=width<360;
    pager.classList.toggle('wooten-pager-compact',compact);
    const values=pageList(page,pages,compact,narrow);
    const key=[page,pages,compact,narrow,state.busy,prev.disabled&&next.disabled].join(':');
    if(state.key===key)return;
    state.key=key;
    const focused=state.numbers.contains(document.activeElement);
    state.numbers.replaceChildren(...values.map(value=>{
      if(value==='…'){const dot=document.createElement('span');dot.className='wooten-page-gap';dot.textContent=value;dot.setAttribute('aria-hidden','true');return dot;}
      const button=document.createElement('button');
      button.type='button';button.className='wooten-page-number';button.textContent=String(value);
      button.dataset.wootenTargetPage=String(value);button.setAttribute('aria-label','Go to page '+value);
      if(value===page){button.setAttribute('aria-current','page');button.setAttribute('aria-label','Page '+value+', current page');}
      button.disabled=state.busy||(prev.disabled&&next.disabled);
      button.addEventListener('click',async event=>{
        event.preventDefault();event.stopPropagation();
        if(value===state.page||state.busy)return;
        if(typeof prev.wootenGoToPage==='function'){
          state.busy=true;pager.setAttribute('aria-busy','true');render(pager);
          try{await prev.wootenGoToPage(value);}
          finally{state.busy=false;pager.removeAttribute('aria-busy');render(pager);}
        }else{
          // Dispatch one existing delegated page action, never repeated Next clicks.
          const proxy=prev.cloneNode(true);proxy.removeAttribute('id');proxy.disabled=false;proxy.hidden=true;
          proxy.dataset.wootenTargetPage=String(value);
          if(proxy.hasAttribute('data-activity-page'))proxy.dataset.activityPage=String(value);
          pager.append(proxy);proxy.click();proxy.remove();
        }
      });
      return button;
    }));
    if(focused)state.numbers.querySelector('[aria-current="page"]')?.focus({preventScroll:true});
  }
  const resize=new ResizeObserver(entries=>entries.forEach(({target})=>render(target)));
  let scheduled=false;
  function scan(){scheduled=false;document.querySelectorAll(selector).forEach(render);}
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(scan);}}
  // Protect shared loaders against a second Prev/Next click during a number jump.
  document.addEventListener('click',event=>{
    const pager=event.target.closest('[data-wooten-pager]');
    if(pager&&states.get(pager)?.busy){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  new MutationObserver(records=>{
    if(records.some(r=>!r.target.closest?.('.wooten-page-numbers')))schedule();
  }).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','disabled','style']});
  scan();
})();
