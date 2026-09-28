/* Ver674: numeric date/time display; card sync activity from Ver672 retained. */
(function(){
 'use strict';
 const root=document.getElementById('websiteCardSync'),panel=document.getElementById('admin-tab-intevacon-api-test');if(!root||!panel)return;
 const get=s=>root.querySelector(s),key=()=>document.getElementById('adminKey')?.value.trim()||'';
 const allowed=()=>!!key()&&!!window.wootenAdminUser&&(window.WootenAdminAccess?.has?window.WootenAdminAccess.has(window.wootenAdminUser,'fleet_cards'):window.wootenAdminUser.owner===true||window.wootenAdminUser.permissions?.includes('fleet_cards'));
 const active=()=>!panel.hidden&&allowed();
 const date=v=>window.WootenIntevaconDates?.central(v)??(v?String(v):'—');
 let generation=0,busy=false,dirty=false,configured=false,controller=null;
 let syncRequestPending=false,serverRunning=false,serverRequested=false;
 function syncControls(){
  const syncing=syncRequestPending||serverRunning||serverRequested;
  const label=serverRunning?'Syncing cards…':serverRequested?'Cards sync queued':syncRequestPending?'Requesting card sync…':'Sync Cards Now';
  get('[data-card-sync]').disabled=busy||!configured||syncing||!allowed();
  get('[data-card-sync]').setAttribute('aria-busy',String(syncing));
  get('[data-card-spinner]').hidden=!syncing;
  get('[data-card-sync-label]').textContent=label;
  window.WootenFleetTabs?.setBusy('cards',syncing,label);
 }
 const message=(text,error=false)=>{get('[data-card-message]').textContent=text;get('[data-card-message]').dataset.error=String(error);get('[data-card-message]').hidden=!text;};
 async function request(route,data){
  const response=await fetch('/api/admin/fleet/cards/'+route,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller?.signal,headers:{'X-Admin-Key':key(),'Accept':'application/json',...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Card service request failed.');return result;
 }
 function display(data){
  configured=data.configured;
  serverRunning=!!data.running;serverRequested=!!data.requested;
  if(!dirty){get('[name=cardsEnabled]').checked=data.enabled;get('[name=cardsInterval]').value=String(data.interval_seconds);}
  get('[data-card-count]').textContent=Number(data.cards).toLocaleString();
  get('[data-card-success]').textContent=date(data.last_success);
  get('[data-card-next]').textContent=data.needs_attention?'Action required':data.running?'Pull in progress':data.requested?'Queued':!data.enabled?'Automatic sync off':date(data.next_due);
  get('[data-card-checkin]').textContent=date(data.last_poll);
  get('[data-card-status]').textContent=!data.configured?'Set up the card service below to retrieve your first card list.':data.message||'Card service ready.';
  get('[data-card-status]').dataset.state=data.state;
  get('[data-card-unmatched]').textContent=data.unmatched?Number(data.unmatched).toLocaleString()+' cards have no Customer ID and are not shown to customers.':'';
  get('[data-card-unmatched]').hidden=!data.unmatched;
  syncControls();
  get('[data-card-setup]').hidden=!data.can_manage_credentials;
  get('[data-card-credential]').disabled=busy||data.running;
  get('[data-card-credential]').textContent=data.configured?'Replace card sync credential':'Create card sync credential';
 }
 async function refresh(){
  if(!active()||busy)return;const ticket=generation;
  try{const data=await request('status');if(ticket===generation)display(data);}catch(e){if(ticket===generation&&e.name!=='AbortError')message(e.message,true);}
 }
 async function action(route,data){
  if(!allowed()||busy)return;
  busy=true;const ticket=++generation;controller?.abort();controller=new AbortController();root.setAttribute('aria-busy','true');
  syncRequestPending=route==='sync';syncControls();
  get('[data-card-sync]').disabled=true;get('[data-card-save]').disabled=true;get('[data-card-credential]').disabled=true;message('');
  try{
   const result=await request(route,data);if(ticket!==generation)return;
   if(route==='credential'){
    get('[data-card-secret]').value=result.credential;get('[data-card-secret-area]').hidden=false;
    message('Copy this credential to PORTAL_SYNC_CREDENTIAL in the card Worker. It will not be shown again.');
   }else if(route==='settings'){dirty=false;message('Card schedule saved.');}
   const status=route==='credential'?await request('status'):result;if(ticket===generation){busy=false;syncRequestPending=false;display(status);}
  }catch(e){if(ticket===generation&&e.name!=='AbortError')message(e.message,true);}
  finally{if(ticket===generation){busy=false;syncRequestPending=false;syncControls();root.removeAttribute('aria-busy');get('[data-card-save]').disabled=false;get('[data-card-credential]').disabled=serverRunning||!allowed();await refresh();}}
 }
 get('form').addEventListener('submit',e=>{e.preventDefault();action('settings',{enabled:get('[name=cardsEnabled]').checked,interval_seconds:Number(get('[name=cardsInterval]').value)});});
 get('form').addEventListener('change',()=>{dirty=true;});
 get('[data-card-sync]').addEventListener('click',()=>action('sync',{}));
 get('[data-card-refresh]').addEventListener('click',refresh);
 get('[data-card-credential]').addEventListener('click',()=>{
  if(configured&&!confirm('Replace the card sync credential? You will need to update the separate card Worker secret.'))return;
  action('credential',{});
 });
 get('[data-card-copy]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(get('[data-card-secret]').value);message('Credential copied. Paste it into the card Worker secret.');}catch{get('[data-card-secret]').type='text';get('[data-card-secret]').select();message('Select and copy the credential, then paste it into the card Worker secret.');}});
 window.addEventListener('wooten-admin-auth-changed',()=>{generation++;controller?.abort();controller=null;busy=false;syncRequestPending=false;serverRunning=false;serverRequested=false;dirty=false;configured=false;syncControls();root.removeAttribute('aria-busy');get('[data-card-secret]').value='';get('[data-card-secret]').type='password';get('[data-card-secret-area]').hidden=true;get('[data-card-setup]').hidden=true;get('[data-card-save]').disabled=false;message('');refresh();});
 new MutationObserver(refresh).observe(panel,{attributes:true,attributeFilter:['hidden','class']});
 setInterval(()=>{if(!document.hidden)refresh();},15000);syncControls();refresh();
})();
