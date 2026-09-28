/* Ver664 — separate save/test results and visible test cooldown. */
(function(){
 'use strict';
 const role=document.getElementById('adminNotificationBell')?'admin':'customer',storageKey='wooten-push-device-'+role;
 const q=s=>dialog.querySelector(s),key=()=>document.getElementById('adminKey')?.value.trim()||'';
 const signedIn=()=>role==='admin'?!!key()&&!!window.wootenAdminUser:document.body.classList.contains('customer-signed-in');
 const identity=()=>role==='admin'?(signedIn()?(window.wootenAdminUser.owner?'owner':String(window.wootenAdminUser.id||window.wootenAdminUser.username)):''):(signedIn()?document.getElementById('acctNumber')?.textContent.trim()||'':'');
 const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const installed=()=>navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches;
 const supported=()=>window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 const read=()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'null');}catch{return null;}};
 const save=v=>{if(v)localStorage.setItem(storageKey,JSON.stringify(v));else localStorage.removeItem(storageKey);};
 let config=null,busy=false,generation=0,reg=null,opener=null,currentIdentity=identity(),pendingOpen=new URL(location.href).searchParams.get('portal-notifications');
 let testReadyAt=0,testTimer=null,testWaiting=false,renewSubscription=false;
 const dialog=document.createElement('dialog');dialog.id='wootenPushDialog';dialog.setAttribute('aria-labelledby','wootenPushTitle');
 dialog.innerHTML='<header class="push-head"><h2 id="wootenPushTitle">Device Notifications</h2><button type="button" class="push-close" aria-label="Close notification settings"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="push-body"><p>Receive Wooten Oil alerts on this device. Your notification bell and history stay available whether these alerts are on or off.</p><p data-state role="status">Checking notification settings…</p><p data-install hidden>On iPhone or iPad, use Share → Add to Home Screen, open the Wooten Oil app, sign in, and enable notifications here.</p><fieldset class="push-options"><legend>Notify me about</legend><div data-options></div></fieldset><p data-result role="status" hidden></p></div><footer class="push-foot"><div class="push-actions"><button type="button" data-enable>Enable Notifications</button><button type="button" data-test hidden>Send Test</button><button type="button" data-disable hidden>Turn Off on This Device</button></div></footer>';
 document.body.append(dialog);
 const health=document.createElement('p');health.dataset.health='';health.hidden=true;health.setAttribute('role','status');q('[data-state]').after(health);
 function result(text,error=false){testWaiting=false;q('[data-result]').textContent=text;q('[data-result]').dataset.error=String(error);q('[data-result]').hidden=!text;}
 function updateTestButton(){
  clearTimeout(testTimer);testTimer=null;
  const seconds=Math.max(0,Math.ceil((testReadyAt-Date.now())/1000));
  q('[data-test]').textContent=seconds?'Send Test ('+seconds+'s)':'Send Test';
  q('[data-test]').disabled=busy||!config?.device?.enabled||seconds>0;
  if(testWaiting){if(seconds)q('[data-result]').textContent='Please wait '+seconds+' seconds before sending another test.';else result('You can send another test now.');}
  if(seconds&&dialog.open)testTimer=setTimeout(updateTestButton,250);
 }
 function setTestCooldown(seconds){testReadyAt=Date.now()+Math.max(0,Number(seconds)||0)*1000;updateTestButton();}
 function setBusy(value){busy=value;dialog.setAttribute('aria-busy',String(value));q('[data-enable]').dataset.busy=String(value);for(const b of dialog.querySelectorAll('.push-actions button'))b.disabled=value;for(const c of dialog.querySelectorAll('input'))c.disabled=value;updateTestButton();}
 async function api(action,data){
  const response=await fetch('/api/push/'+role+'/'+action,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(role==='admin'?{'X-Admin-Key':key()}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const payload=await response.json();if(!response.ok||!payload.success){const error=Error(payload.error||'Notification settings are unavailable.');error.code=payload.code;error.retryAfter=payload.retry_after_seconds;throw error;}return payload;
 }
 async function registration(create=false){
  if(reg)return reg;
  reg=await navigator.serviceWorker.getRegistration('/push/'+role+'/');
  if(reg&&reg.scope!==new URL('/push/'+role+'/',location.origin).href)reg=null;
  if(!reg&&create)reg=await navigator.serviceWorker.register('/push/'+role+'/sw.js',{scope:'/push/'+role+'/',updateViaCache:'none'});
  if(reg&&!reg.active){await new Promise((resolve,reject)=>{const worker=reg.installing||reg.waiting;const timeout=setTimeout(()=>reject(Error('Notification service did not start. Try again.')),15000);const check=()=>{if(reg.active){clearTimeout(timeout);resolve();}else if(worker?.state==='redundant'){clearTimeout(timeout);reject(Error('Notification service needs to be refreshed.'));}};worker?.addEventListener('statechange',check);check();});}
  return reg;
 }
 async function workerState(enabled,device=''){
  const r=await registration(false);if(!r?.active)return;
  await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(Error('Notification service did not respond.'));},5000);channel.port1.onmessage=()=>{clearTimeout(timer);channel.port1.close();resolve();};r.active.postMessage({type:'wooten-push-state',enabled,device},[channel.port2]);});
 }
 async function remove(saved=read()){
  // Disable display first, then revoke on the server. Keep the token for retry if offline.
  if(supported())await workerState(false).catch(()=>{});
  if(saved){
   const response=await fetch('/api/push/revoke',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({id:saved.id,token:saved.token})});
   if(!response.ok)throw Error('Could not turn off server alerts. Reconnect and try again.');
  }
  if(supported())await(await registration(false))?.pushManager.getSubscription().then(s=>s?.unsubscribe());
  if(!saved||read()?.id===saved.id)save(null);
 }
 function render(data){
  config=data;
  const enabled=!!data?.device?.enabled&&Notification.permission==='granted';
  q('[data-options]').replaceChildren();
  for(const option of data.categories){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=option.id;input.checked=data.device?data.device.categories.includes(option.id):true;label.append(input,document.createTextNode(option.label));q('[data-options]').append(label);}
  q('[data-options]').style.display='grid';q('[data-options]').style.gap='10px';
  q('[data-enable]').textContent=enabled?'Save Alert Choices':'Enable Notifications';
  q('[data-test]').hidden=!enabled;q('[data-disable]').hidden=!read();
  q('[data-state]').textContent=enabled?'Notifications are on for this account on this device.':data.device?.last_error||'Notifications are off on this device.';
  if(!data.configured)q('[data-state]').textContent='Device notifications are awaiting portal setup. Your notification bell continues to work.';
  q('[data-enable]').disabled=busy||!data.configured||!data.categories.length||Notification.permission==='denied';
  if(Notification.permission==='denied')q('[data-state]').textContent='Notifications are blocked in your browser settings. Allow notifications for wootenoil.com, then reopen these settings.';
  const stale=role==='admin'&&data.configured&&(!data.last_dispatch||Date.now()-data.last_dispatch>5*60000);
  health.hidden=!stale;health.textContent=stale?'The background notification schedule has not checked in recently. Check the main portal Worker cron setup.':'';
  updateTestButton();
 }
 async function refresh(){
  if(!signedIn())return;const ticket=++generation;
  q('[data-install]').hidden=!(ios()&&!installed());
  if(!supported()||(ios()&&!installed())){q('[data-state]').textContent=ios()&&!installed()?'Add the portal to your Home Screen to enable device notifications.':'This browser cannot display device notifications. Your notification bell still works.';q('[data-enable]').disabled=true;q('[data-options]').replaceChildren();q('[data-test]').hidden=true;q('[data-disable]').hidden=!read();return;}
  setBusy(true);try{
   const saved=read(),data=await api('status'+(saved?'?device='+encodeURIComponent(saved.id):''));
   if(ticket!==generation||!signedIn())return;
   if(saved&&(saved.principal!==data.principal||!data.device)){await remove(saved);if(ticket!==generation)return;data.device=null;}
   const r=await registration(false),subscription=await r?.pushManager.getSubscription();
   if(data.device?.enabled&&!subscription)data.device.enabled=false;
   setTestCooldown(data.device?.test_retry_after_seconds||0);setBusy(false);render(data);
  }catch(e){if(ticket===generation){result(e.message,true);q('[data-enable]').disabled=true;}}
  finally{if(ticket===generation){busy=false;dialog.setAttribute('aria-busy','false');q('[data-enable]').dataset.busy='false';q('[data-disable]').disabled=false;}}
 }
 function open(button){if(!signedIn())return;opener=button;result('');if(!dialog.open)dialog.showModal();refresh();}
 q('.push-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{clearTimeout(testTimer);testTimer=null;opener?.focus();});
 q('[data-enable]').addEventListener('click',async()=>{
  if(busy||!config?.configured||!signedIn())return;
  const wasEnabled=!!config.device?.enabled;
  const selected=[...q('[data-options]').querySelectorAll('input:checked')].map(e=>e.value);if(!selected.length){result('Choose at least one alert type.',true);return;}
  // The permission prompt starts directly in the user's click handler (required by Safari).
  const permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
  setBusy(true);result('');const ticket=generation;let created=null;
  try{
   if(await permission!=='granted')throw Error('Notifications were not enabled. You can continue using the bell.');
   if(ticket!==generation||!signedIn())return;
   // Confirm local storage is usable before registering an account-bound subscription.
   localStorage.setItem(storageKey+'-check','1');localStorage.removeItem(storageKey+'-check');
   if(renewSubscription){await remove();renewSubscription=false;}
   const r=await registration(true);let sub=await r.pushManager.getSubscription();
   if(sub){const expected=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const actual=new Uint8Array(sub.options?.applicationServerKey||[]);if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i])){await remove();sub=null;}}
   if(!sub)sub=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))});
   if(ticket!==generation||!signedIn()){await sub.unsubscribe();return;}
   const data=await api('subscribe',{subscription:sub.toJSON(),categories:selected});created={id:data.id,token:data.revoke_token,principal:data.principal,identity:identity()};
   if(ticket!==generation||!signedIn()){await remove(created);return;}
   save(created);await workerState(true,data.id);await refresh();result(wasEnabled?'Alert choices saved.':'Notifications enabled on this device. Use Send Test to check delivery.');
  }catch(e){if(created)await remove(created).catch(()=>{});if(ticket===generation)result(e.message,true);}
  finally{if(ticket===generation){setBusy(false);if(config)render(config);}}
 });
 q('[data-test]').addEventListener('click',async()=>{
  const saved=read(),ticket=generation;if(busy||!saved||Date.now()<testReadyAt)return;
  setBusy(true);result('Sending test…');
  try{
   const data=await api('test',{id:saved.id});if(ticket!==generation||!signedIn())return;
   setTestCooldown(data.retry_after_seconds??60);result(data.message);
  }catch(e){
   if(ticket!==generation||!signedIn())return;
   if(e.retryAfter!==undefined)setTestCooldown(e.retryAfter);
   if(e.code==='device_not_enabled'&&config){config.device=null;renewSubscription=true;setTestCooldown(0);}
   result(e.message,e.code!=='test_cooldown');testWaiting=e.code==='test_cooldown';
  }finally{if(ticket===generation){setBusy(false);if(config)render(config);}}
 });
 q('[data-disable]').addEventListener('click',async()=>{if(busy)return;setBusy(true);result('');try{await remove();await refresh();result('Device notifications are off. Your notification bell is still available.');}catch(e){result(e.message,true);}finally{setBusy(false);}});
 function addControls(container){if(!container||container.querySelector('.wooten-push-menu-controls'))return;const area=document.createElement('div');area.className='wooten-push-menu-controls';const button=document.createElement('button');button.type='button';button.className='wooten-push-settings-button';button.textContent='Device Notifications';button.addEventListener('click',e=>{e.stopPropagation();open(button);});area.append(button);container.append(area);}
 addControls(document.getElementById(role==='admin'?'adminNotificationMenu':'headerNotificationMenu'));
 if(role==='customer')addControls(document.getElementById('dashboardNotificationPanel'));
 function refreshBell(){
  if(role==='admin'){
   if(typeof window.wootenRefreshAdminNotifications==='function')window.wootenRefreshAdminNotifications();
   else document.getElementById('adminNotificationRefresh')?.click();
  }else window.wootenRenderCustomerNotifications?.({supersede:true});
 }
 function openPending(){
  if(!pendingOpen||!signedIn())return;
  const target=pendingOpen;pendingOpen=null;
  const url=new URL(location.href);url.searchParams.delete('portal-notifications');history.replaceState(history.state,'',url.href);
  if(role==='admin'){
   if(target==='fleet'){document.getElementById('admin-tab-btn-fleet')?.click();return;}
   if(target==='mas90'){document.getElementById('admin-tab-btn-automation')?.click();return;}
   const bell=document.getElementById('adminNotificationBell');if(bell?.getAttribute('aria-expanded')!=='true')bell?.click();
  }else{const bell=document.getElementById('mobileHeaderNotifications');if(bell?.getAttribute('aria-expanded')!=='true')bell?.click();}
  refreshBell();
 }
 async function changed(){
  const next=identity();if(next===currentIdentity){openPending();return;}
  const prior=currentIdentity;currentIdentity=next;generation++;config=null;testReadyAt=0;testWaiting=false;renewSubscription=false;setBusy(false);dialog.close();
  // Explicit sign-out or account switch revokes this device; closing a tab does not.
  const saved=read();if(saved&&(!next||(saved.identity&&saved.identity!==next)||prior&&prior!==next))await remove(saved).catch(()=>{});
  openPending();
 }
 if(role==='admin')window.addEventListener('wooten-admin-auth-changed',changed);
 else{
  new MutationObserver(changed).observe(document.body,{attributes:true,attributeFilter:['class']});
  const account=document.getElementById('acctNumber');if(account)new MutationObserver(changed).observe(account,{childList:true,subtree:true,characterData:true});
 }
 if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',e=>{
  if(e.data?.role!==role||e.data.device!==read()?.id||!signedIn())return;
  if(e.data.type==='wooten-push-open'){pendingOpen=e.data.target||'notifications';openPending();}
  if(e.data.type==='wooten-push-refresh')refreshBell();
 });
 window.addEventListener('storage',event=>{if(event.key===storageKey&&dialog.open)refresh();});
 window.addEventListener('online',()=>{const s=read();if(s&&!signedIn())remove(s).catch(()=>{});else if(dialog.open)refresh();});
 // Authentication may finish after page load; existing auth observers handle that event.
 setTimeout(openPending,0);
 window.WootenPush={open:()=>open(document.activeElement)};
})();
