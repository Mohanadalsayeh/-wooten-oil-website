(function(){
  'use strict';
  const button=document.createElement('button');
  button.type='button';button.id='customerFormsBackToTop';button.hidden=true;
  button.setAttribute('aria-label','Back to top');button.title='Back to top';
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 15 7-7 7 7"></path></svg>';
  document.body.appendChild(button);
  let active=null,frame=0;
  const visible=el=>!el.hidden&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
  function currentForm(){
    const forms=Array.from(document.querySelectorAll('dialog[open],[role="dialog"],.fuel-modal.open')).filter(el=>!el.classList.contains('cookie-consent')&&visible(el));
    // Native dialogs occupy the browser top layer, above ordinary overlays.
    forms.sort((a,b)=>(Number(a.matches('dialog[open]'))-Number(b.matches('dialog[open]')))||((parseInt(getComputedStyle(a).zIndex)||0)-(parseInt(getComputedStyle(b).zIndex)||0)));
    return forms.pop()||(document.body.classList.contains('request-fuel-page')?document.documentElement:null);
  }
  function scrollers(root){
    if(!root)return [];
    const candidates=[root,...root.querySelectorAll('*')];
    return candidates.filter(el=>el!==button&&!button.contains(el)&&el.scrollTop>0&&visible(el)&&(/auto|scroll|overlay/.test(getComputedStyle(el).overflowY)||el===document.scrollingElement));
  }
  function update(){
    frame=0;active=currentForm();
    const host=active&&active!==document.documentElement?active:document.body;
    if(button.parentElement!==host)host.appendChild(button);
    const show=!!active&&scrollers(active).some(el=>el.scrollTop>160);
    button.hidden=!show;
    document.body.classList.toggle('customer-form-back-top-active',!!active);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  button.addEventListener('click',()=>{
    const root=currentForm();
    const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
    scrollers(root).forEach(el=>el.scrollTo({top:0,behavior}));
    if(root){
      const heading=root.querySelector('.details-toolbar,h1,h2,h3');
      if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
    }
    schedule();
  });
  document.addEventListener('scroll',schedule,{capture:true,passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('hashchange',schedule);
  document.addEventListener('close',schedule,true);
  new MutationObserver(records=>{
    if(records.some(r=>r.target!==button&&!button.contains(r.target)&&!(r.target===document.body&&r.attributeName==='class')))schedule();
  }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open']});
  schedule();
})();
