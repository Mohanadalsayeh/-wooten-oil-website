/* Ver689: refresh status feedback, error recovery and stale-response protection. */
(function(){
 'use strict';
 const root=document.getElementById('websiteCardSync'),panel=document.getElementById('admin-tab-intevacon-api-test');if(!root||!panel)return;
 const get=s=>root.querySelector(s),key=()=>document.getElementById('adminKey')?.value.trim()||'';
 const allowed=()=>!!key()&&!!window.wootenAdminUser&&(window.WootenAdminAccess?.has?window.WootenAdminAccess.has(window.wootenAdminUser,'fleet_cards'):window.wootenAdminUser.owner===true||window.wootenAdminUser.permissions?.includes('fleet_cards'));
 const active=()=>!panel.hidden&&allowed();
 const date=v=>window.WootenIntevaconDates?.central(v)??(v?String(v):'—');
 let generation=0,busy=false,dirty=false,configured=false,controller=null;
 let syncRequestPending=false,serverRunning=false,serverRequested=false;
 let refreshOperation=null,messageSource='',savedSettings=null;
 const settings=()=>({enabled:get('[name=cardsEnabled]').checked,interval_seconds:Number(get('[name=cardsInterval]').value)});
 const settingsKey=v=>JSON.stringify({enabled:!!v.enabled,interval_seconds:Number(v.interval_seconds)});
 function saveControls(){dirty=savedSettings!==null&&settingsKey(settings())!==savedSettings;get('[data-card-save]').disabled=!allowed()||busy||savedSettings===null||!dirty;}
 const refreshButton=get('[data-card-refresh]');
 function refreshControls(){
  const manual=!!refreshOperation?.manual;
  refreshButton.disabled=busy||manual||!allowed();
  refreshButton.setAttribute('aria-busy',String(manual));
  refreshButton.textContent=manual?'Refreshing…':'Refresh status';
 }
 function cancelRefresh(){refreshOperation?.controller.abort();refreshOperation=null;refreshControls();}
 function syncControls(){
  const syncing=syncRequestPending||serverRunning||serverRequested;
  const label=serverRunning?'Syncing cards…':serverRequested?'Cards sync queued':syncRequestPending?'Requesting card sync…':'Sync Cards Now';
  get('[data-card-sync]').disabled=busy||!configured||syncing||!allowed();
  get('[data-card-sync]').setAttribute('aria-busy',String(syncing));
  get('[data-card-spinner]').hidden=!syncing;
  get('[data-card-sync-label]').textContent=label;
  window.WootenFleetTabs?.setBusy('cards',syncing,label);
  refreshControls();saveControls();
 }
 const message=(text,error=false,source='action')=>{messageSource=source;get('[data-card-message]').textContent=text;get('[data-card-message]').dataset.error=String(error);get('[data-card-message]').hidden=!text;};
 async function request(route,data,signal=controller?.signal){
  const response=await fetch('/api/admin/fleet/cards/'+route,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,headers:{'X-Admin-Key':key(),'Accept':'application/json',...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Card service request failed.');return result;
 }
 function display(data){
  configured=data.configured;
  const intervalLabel=[...get('[name=cardsInterval]').options].find(option=>Number(option.value)===Number(data.interval_seconds))?.textContent||('Every '+Number(data.interval_seconds)/3600+' hours');
  get('[data-card-schedule-summary]').textContent=data.enabled?'Enabled · '+intervalLabel:'Automatic sync off · '+intervalLabel;
  serverRunning=!!data.running;serverRequested=!!data.requested;
  if(!dirty){get('[name=cardsEnabled]').checked=data.enabled;get('[name=cardsInterval]').value=String(data.interval_seconds);}
  savedSettings=settingsKey(data);
  get('[data-card-count]').textContent=Number(data.cards).toLocaleString();
  get('[data-card-success]').textContent=date(data.last_success);
  get('[data-card-next]').textContent=data.needs_attention?'Action required':data.running?'Pull in Progress...':data.requested?'Queued':!data.enabled?'Automatic sync off':date(data.next_due);
  get('[data-card-checkin]').textContent=date(data.last_poll);
  get('[data-card-status]').textContent=!data.configured?'Set up the card service below to retrieve your first card list.':data.message||'Card service ready.';
  get('[data-card-status]').dataset.state=data.state;
  get('[data-card-unmatched]').textContent=data.unmatched?Number(data.unmatched).toLocaleString()+(Number(data.unmatched)===1?' card available':' cards available')+' to assign to customers.':'';
  get('[data-card-unmatched]').hidden=!data.unmatched;
  syncControls();
  get('[data-card-setup]').hidden=!data.can_manage_credentials;
  get('[data-card-credential]').disabled=busy||data.running;
  get('[data-card-credential]').textContent=data.configured?'Replace card sync credential':'Create card sync credential';
  window.dispatchEvent(new CustomEvent('wooten-card-list-status',{detail:{last_sync:data.last_success||null}}));
 }
 async function refresh(manual=false){
  if(!active()||busy||(refreshOperation&&!manual))return;
  refreshOperation?.controller.abort();
  const operation={controller:new AbortController(),generation,credential:key(),manual};refreshOperation=operation;refreshControls();
  const current=()=>refreshOperation===operation&&operation.generation===generation&&operation.credential===key()&&allowed();
  try{
   const data=await request('status',undefined,operation.controller.signal);
   if(current()){display(data);if(messageSource==='status')message('');}
  }catch(e){if(current()&&e.name!=='AbortError')message(e.message,true,'status');}
  finally{if(refreshOperation===operation){refreshOperation=null;refreshControls();}}
 }
 async function action(route,data){
  if(!allowed()||busy||(route==='settings'&&!dirty))return;
  busy=true;const ticket=++generation;cancelRefresh();controller?.abort();controller=new AbortController();root.setAttribute('aria-busy','true');
  syncRequestPending=route==='sync';syncControls();
  get('[data-card-sync]').disabled=true;get('[data-card-save]').disabled=true;get('[data-card-credential]').disabled=true;message('');
  try{
   const result=await request(route,data);if(ticket!==generation)return;
   if(route==='credential'){
    get('[data-card-secret]').value=result.credential;get('[data-card-secret-area]').hidden=false;
    message('Copy this credential to PORTAL_SYNC_CREDENTIAL in the card Worker. It will not be shown again.');
   }else if(route==='settings'){savedSettings=settingsKey(data);saveControls();message('Card schedule saved.');}
   const status=route==='credential'?await request('status'):result;if(ticket===generation){busy=false;syncRequestPending=false;display(status);}
  }catch(e){if(ticket===generation&&e.name!=='AbortError')message(e.message,true);}
  finally{if(ticket===generation){busy=false;syncRequestPending=false;syncControls();root.removeAttribute('aria-busy');saveControls();get('[data-card-credential]').disabled=serverRunning||!allowed();await refresh();}}
 }
 const scheduleExpand=get('.cards-schedule-expand');
 scheduleExpand.addEventListener('click',()=>{
  const controls=get('#cardsScheduleControls');controls.hidden=!controls.hidden;
  scheduleExpand.setAttribute('aria-expanded',String(!controls.hidden));
  scheduleExpand.setAttribute('aria-label',(controls.hidden?'Expand':'Collapse')+' automatic schedule');
  scheduleExpand.textContent=controls.hidden?'+':'−';
 });
 get('form').addEventListener('submit',e=>{e.preventDefault();action('settings',{enabled:get('[name=cardsEnabled]').checked,interval_seconds:Number(get('[name=cardsInterval]').value)});});
 for(const event of ['input','change'])get('form').addEventListener(event,saveControls);
 get('[data-card-sync]').addEventListener('click',()=>{if(confirm('Sync the complete fleet card list from Intevacon now? This will update the saved cards shown in the portal.'))action('sync',{});});
 refreshButton.addEventListener('click',()=>refresh(true));
 get('[data-card-credential]').addEventListener('click',()=>{
  if(configured&&!confirm('Replace the card sync credential? You will need to update the separate card Worker secret.'))return;
  action('credential',{});
 });
 get('[data-card-copy]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(get('[data-card-secret]').value);message('Credential copied. Paste it into the card Worker secret.');}catch{get('[data-card-secret]').type='text';get('[data-card-secret]').select();message('Select and copy the credential, then paste it into the card Worker secret.');}});
 window.addEventListener('wooten-admin-auth-changed',()=>{generation++;cancelRefresh();controller?.abort();controller=null;busy=false;syncRequestPending=false;serverRunning=false;serverRequested=false;dirty=false;savedSettings=null;configured=false;get('[data-card-schedule-summary]').textContent='Loading schedule…';syncControls();root.removeAttribute('aria-busy');get('[data-card-secret]').value='';get('[data-card-secret]').type='password';get('[data-card-secret-area]').hidden=true;get('[data-card-setup]').hidden=true;saveControls();message('');refresh();});
 window.addEventListener('wooten-admin-auth-ready',()=>refresh());
 new MutationObserver(()=>refresh()).observe(panel,{attributes:true,attributeFilter:['hidden','class']});
 setInterval(()=>{if(!document.hidden)refresh();},15000);syncControls();refresh();
})();
