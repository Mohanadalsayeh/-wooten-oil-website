/* Ver738: admin-only explicit search. Shared viewers are unchanged on customer pages. */
(function(){
 'use strict';
 if(window.WootenAdminExplicitSearch)return;
 const selector='input[type="search"]',allowed=new WeakSet(),wired=new WeakSet();
 const existing={notifyRecipientSearch:'notifyRecipientSearchBtn',statementCustomerSearch:'statementCustomerSearchButton',activityCustomerSearch:'activityCustomerSearchBtn'};
 const actions={dbSearch:'dbLoadBtn',livePaymentSearch:'livePaymentLoadBtn',invoiceDbSearch:'invoiceDbLoad',invoiceDbComment:'invoiceDbLoad',requestCenterSearch:'requestCenterLoad',applicationSearch:'applicationLoad'};
 const isSearch=el=>el instanceof HTMLInputElement&&el.matches(selector);
 function dispatch(input,type){const event=type==='keydown'?new KeyboardEvent(type,{key:'Enter',code:'Enter',bubbles:true,cancelable:true}):new Event(type,{bubbles:true,cancelable:true});allowed.add(event);input.dispatchEvent(event);}
 function formButton(input){return input.form&&Array.from(input.form.querySelectorAll('button')).find(b=>b.type==='submit'&&/search/i.test(b.textContent));}
 function buttonFor(input){return document.getElementById(existing[input.id])||formButton(input);}
 function run(input){
  if(input.disabled||input.readOnly)return;
  const button=buttonFor(input)||document.getElementById(actions[input.id]);
  if(button){if(!button.disabled)button.click();return;}
  // These handlers already expose an immediate Enter action; do not also emit input.
  if(input.id==='invoicePreviewSearch'){dispatch(input,'keydown');return;}
  // Reuse each legacy filter's own pagination, validation, and request cancellation.
  // Only this deliberate event may reach its old input listener.
  dispatch(input,'input');
 }
 function attach(input){
  if(wired.has(input))return;wired.add(input);input.setAttribute('enterkeyhint','search');
  if(buttonFor(input))return;
  const button=document.createElement('button');button.type='button';button.className='secondary wooten-explicit-search-button';button.textContent='Search';
  button.setAttribute('aria-label','Search '+(input.getAttribute('aria-label')||input.labels?.[0]?.textContent.trim()||input.placeholder||'records'));
  if(input.id)button.setAttribute('aria-controls',input.id);
  button.addEventListener('click',()=>run(input));
  const iconWrap=input.parentElement.matches('.admin-activity-search-wrap,.schedule-report-search-field')?input.parentElement:null;
  (iconWrap||input).insertAdjacentElement('afterend',button);
  const disabled=()=>button.disabled=input.disabled||input.readOnly;
  new MutationObserver(disabled).observe(input,{attributes:true,attributeFilter:['disabled','readonly']});disabled();
 }
 // Capture on window before existing controllers: typing, pasting, clearing the
 // native X, or blurring never reaches a legacy automatic-search listener.
 for(const type of ['input','change','search','keyup'])window.addEventListener(type,event=>{
  if(isSearch(event.target)&&!allowed.has(event))event.stopImmediatePropagation();
 },true);
 window.addEventListener('keydown',event=>{
  if(!isSearch(event.target)||allowed.has(event))return;
  if(event.key==='Enter')event.stopImmediatePropagation();
  if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if(!event.repeat)run(event.target);}
 },true);
 function scan(root){if(isSearch(root))attach(root);root.querySelectorAll?.(selector).forEach(attach);}
 const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)scan(node);});
 function start(){scan(document);observer.observe(document.documentElement,{childList:true,subtree:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
 window.WootenAdminExplicitSearch={run,scan};
})();
