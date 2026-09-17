(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const periodLabel=days=>({30:'Last 30 days',21:'Last 3 weeks',14:'Last 2 weeks',7:'Last 1 week'}[days]||'Last 30 days');
const central=v=>v?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}).format(new Date(v))+' CT':'Not synced yet';
function dollars(value){
 if(typeof value!=='string'||!/^(-?)(\d{1,12})\.(\d{2})$/.test(value))return '—';
 const [,sign,whole,cents]=value.match(/^(-?)(\d{1,12})\.(\d{2})$/);
 return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${cents}`;
}
function pages(current,last){const set=new Set([1,last,current-1,current,current+1]);if(current<=2){set.add(2);set.add(3);}if(current>=last-1){set.add(last-1);set.add(last-2);}return [...set].filter(n=>n>0&&n<=last).sort((a,b)=>a-b);}
function badge(value){return `<span class="fleet-badge ${/^(active|invoiced|processed)$/i.test(value)?'good':/declined|cancel|inactive/i.test(value)?'bad':''}">${esc(value||'Unknown')}</span>`;}
function fleetPager(page,last,total){
 let numbers='',previous=0;
 const number=n=>`<button type="button" class="wooten-page-number" data-page="${n}" aria-label="${n===page?'Page '+n+', current page':'Go to page '+n}" ${n===page?'aria-current="page"':''} ${last===1?'disabled':''}>${n}</button>`;
 for(const n of pages(page,last)){
  if(previous&&n-previous===2)numbers+=number(previous+1);
  else if(previous&&n-previous>2)numbers+='<span class="wooten-page-gap" aria-hidden="true">…</span>';
  numbers+=number(n);previous=n;
 }
 return `<button type="button" class="secondary wooten-page-prev" data-page="${page-1}" ${page<=1?'disabled':''}>Previous 20</button><span class="wooten-page-summary">Page ${page} of ${last}</span><span class="wooten-page-numbers" role="group" aria-label="Page numbers">${numbers}</span><button type="button" class="secondary wooten-page-next" data-page="${page+1}" ${page>=last?'disabled':''}>Next 20</button>`;
}
function driverVehicleDetails(r){
 return [['Driver #',r.driver_number],['Driver name',r.driver_name||r.driver],['Vehicle #',r.vehicle_number],['Vehicle description',r.vehicle_description||r.vehicle],['Raw VehicleID',r.raw_vehicle_id],['Odometer',r.odometer]].map(([label,value])=>label+': '+(value||'—'));
}
// The source transaction export's 18 checked columns, in source order.
const adminTransactionColumns=[
 ['Received On',r=>r.received_at?central(r.received_at):'—'],
 ['Tran #',r=>r.transaction_id],['Local Date/Time',r=>r.local_date_time],
 ['Entry Method',r=>r.entry_method],['Decline Reason',r=>r.decline_reason],
 ['Merchant',r=>r.merchant],['Auth Ref',r=>r.auth_ref],['Card Number',r=>r.card_number,'card'],
 ['Total Sale',r=>dollars(r.total_sale),'money'],['Billable Amount',r=>dollars(r.billable_amount),'money'],
 ['Cardholder',r=>r.cardholder],['Driver#',r=>r.driver_number],['Driver Name',r=>r.driver_name||r.driver],
 ['Vehicle#',r=>r.vehicle_number],['Vehicle Desc',r=>r.vehicle_description||r.vehicle],
 ['Raw VehicleID',r=>r.raw_vehicle_id],['Odometer',r=>r.odometer],['Processed On',r=>r.processed_on]
];
const customerTransactionColumns=[1,0,3,5,6,7,8,10,11,12,13,14,17].map((index)=>{
 const [label,value,type]=adminTransactionColumns[index];
 return [index===1?'Transaction Number':index===6?'Authorization Reference':label,value,type];
});
function customerTransactionCells(r){return customerTransactionColumns.map(([,value,type])=>{
 const text=esc(value(r)??'—')||'—';
 return type==='card'?'<strong class="fleet-card-number">'+text+'</strong>':type==='money'?'<span class="fleet-money">'+text+'</span>':text;
});}
function adminTransactionCells(r){return adminTransactionColumns.map(([,value,type])=>{
 const text=esc(value(r)??'—')||'—';
 return type==='card'?'<strong class="fleet-card-number">'+text+'</strong>':type==='money'?'<span class="fleet-money">'+text+'</span>':text;
});}
function fleetPdfData(kind,items){
 const account=r=>(r.account_number||'Unmatched')+(r.needs_review?' (Needs account review)':'');
 if(kind==='cards')return {headers:['Portal account','Card number','Status','Cardholder','Assigned to','Driver / Vehicle'],rows:items.map(r=>[account(r),r.card_number,r.status,r.cardholder,r.assigned_to||'—',[r.driver_no||'—',r.vehicle_no||'—'].join(' / ')])};
 return {headers:['Portal account','Transaction / Invoice','Total Sale','Billable Amount','Dates / Location','Card number','Cardholder','Status / Type','Entry / Auth Ref','Driver / Vehicle'],rows:items.map(r=>[account(r),r.transaction_id+' / Invoice: '+(r.invoice_number||'—'),dollars(r.total_sale),dollars(r.billable_amount),['Local: '+(r.local_date_time||'—'),'Received: '+central(r.received_at),r.processed_on?'Processed: '+r.processed_on:'',r.posted_on?'Posted: '+r.posted_on:'',[r.merchant,r.merchant_city].filter(Boolean).join(', ')].filter(Boolean).join('; '),r.card_number,r.cardholder,[r.status,r.transaction_type,r.decline_reason].filter(Boolean).join(' / '),'Entry method: '+(r.entry_method||'—')+' / Auth Ref: '+(r.auth_ref||'—'),driverVehicleDetails(r).join('; ')])};
}
function healthMarkup(data){
 const h=data.latest,success=data.last_success;
 let state=h?.state||'unknown',title='No data-pull status received yet.',detail='';
 if(state==='complete')title='Data pulled successfully';
 if(state==='collecting')title='Pulling data from Intevacon…';
 if(state==='uploading')title='Publishing collected data…';
 if(state==='failed'){title='Data pull failed';detail=h.error||'The PC did not provide a reason. Check Status.cmd.';}
 const time=h?.updated_at;
 const overdue=time&&Date.now()-Date.parse(time)>((data.control?.hours||2)+2)*60*60*1000;
 if(overdue){title='No recent sync report';state='overdue';detail='No update has been received within the expected sync interval. Check that the sync PC is on, signed in and connected. The portal cannot determine the reason while the PC is unreachable.'+(h.state==='failed'?' Last reported failure: '+(h.error||'Unknown'):'');}
 if(!h&&success){state='complete';title='Data pulled successfully';}
 const active=state==='collecting'||state==='uploading';
 const label=state==='collecting'?'Step 1 of 2 · Pulling data':state==='uploading'?'Step 2 of 2 · Publishing data':state==='complete'?'Sync complete':state==='failed'?'Sync failed':state==='overdue'?'Waiting for a new sync report':'Waiting for first sync';
 const bar=`<div class="fleet-sync-progress" data-progress-state="${state}"><span class="fleet-sync-progress-label">${esc(label)}</span><div class="fleet-sync-track" ${active?'role="progressbar" aria-label="'+esc(label)+'"':state==='complete'?'role="progressbar" aria-label="Sync complete" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"':'aria-hidden="true"'}><span class="fleet-sync-fill"></span></div></div>`;
 return `<strong>${esc(title)}</strong>${bar}${time?`<span>Last report: ${esc(central(time))}</span>`:''}${detail?`<p>${esc(detail)}</p>`:''}<span>Last successful pull: ${esc(central(success?.completed_at))}</span>${success?`<span>${Number(success.cards_expected).toLocaleString()} cards · ${Number(success.transactions_expected).toLocaleString()} transactions</span>`:''}`;
}
function mount(root,admin){
 let controlDirty=false;
 let kind='cards',page=1,serial=0,controller=null,loaded=false,exporting=false,lastSync=null,loadedQuery=null,refreshing=false;
 root.classList.add('wooten-fleet');
 root.innerHTML=`${admin?'<section class="fleet-health" data-health role="status" aria-live="polite">Loading sync status…</section>':''}${admin?'<section class="fleet-sync-controls" aria-label="Sync controls"><button type="button" class="primary" data-sync-now>Sync now</button><label>Pull data every <select data-sync-hours>'+Array.from({length:12},(_,i)=>'<option value="'+((i+1)*2)+'">'+((i+1)*2)+' hours</option>').join('')+'</select></label><label>Transaction history <select data-sync-days><option value="30">Last 30 days</option><option value="21">Last 3 weeks</option><option value="14">Last 2 weeks</option><option value="7">Last 1 week</option></select></label><button type="button" data-save-schedule>Save settings</button><p data-control-status role="status"></p></section>':''}<div class="fleet-summary"><div class="fleet-stat"><strong data-count>—</strong><span>Cards in latest sync</span></div><div class="fleet-stat"><strong data-active>—</strong><span>Active cards</span></div></div><div class="fleet-tabs" role="group" aria-label="Fleet records"><button type="button" data-kind="cards" aria-pressed="true">Fleet cards</button><button type="button" data-kind="transactions" aria-pressed="false">Transactions</button></div><form class="fleet-toolbar"><label class="fleet-search">Search <input type="search" name="search" placeholder="Search card, transaction, merchant, driver or vehicle" autocomplete="off"></label>${admin?'<label class="fleet-check"><input type="checkbox" name="review"> Needs account review</label>':''}<button type="submit">Search</button><button type="button" data-refresh>Refresh</button></form><p class="fleet-meta" data-meta></p><div class="fleet-message" data-message role="status" aria-live="polite" hidden></div>${admin?'<div class="fleet-export-actions"><button type="button" class="secondary table-pdf-export-button" data-export disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l4 4v16H6z"></path><path d="M14 2v5h5"></path><path d="M9 13h6M9 17h6"></path></svg><span>Export PDF</span></button></div>':''}<div class="fleet-table-wrap" data-table></div><nav class="fleet-pages" aria-label="Fleet table pages" data-pages></nav>${admin?'<details class="fleet-device-panel"><summary>Intevacon synchronization</summary><div data-sync-status></div><div data-owner hidden><p>Create a separate sync credential for the Windows PC.</p><button type="button" data-create>Create sync credential</button><div data-token hidden></div></div></details>':''}`;
 const get=s=>root.querySelector(s);
 {
  const pager=get('[data-pages]');pager.setAttribute('data-wooten-pager','');
  const resizePager=()=>pager.classList.toggle('wooten-pager-compact',pager.getBoundingClientRect().width<620);
  new ResizeObserver(resizePager).observe(pager);resizePager();
 }
 const message=(value,error=false)=>{const el=get('[data-message]');el.textContent=value;el.hidden=!value;el.classList.toggle('error',error);};
 async function api(path,options={}){
  const headers={Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})};
  if(admin){const key=document.getElementById('adminKey')?.value?.trim();if(!key)throw Error('Sign in as an administrator.');headers['X-Admin-Key']=key;}
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...headers,...options.headers}});
  const data=await response.json().catch(()=>({}));if(!response.ok||!data.success)throw Error(data.error||'Fleet records could not be loaded.');return data;
 }
 function display(data){
  lastSync=data.last_sync;
  get('[data-count]').textContent=data.summary.cards.toLocaleString();get('[data-active]').textContent=data.summary.active.toLocaleString();
  const window=data.window_from?` · Transactions received ${central(data.window_from)} – ${central(data.window_to)}`:'';
  get('[data-meta]').textContent=`Last sync: ${central(data.last_sync)}${window}${data.card_scope==='active'?' · Card export includes active cards only.':''}`;
  const headers=kind==='transactions'?(admin?adminTransactionColumns:customerTransactionColumns).map(([label])=>label):['Card number','Status','Cardholder','Assigned to','Driver / Vehicle'];
  if(admin)headers.unshift('Portal account');
  let html='<table data-auto-pdf="false" data-pdf-table-name="'+(kind==='cards'?'Fleet Cards':'Fleet Transactions')+'"><thead><tr>'+headers.map(h=>`<th scope="col">${h}</th>`).join('')+'</tr></thead><tbody>';
  for(const r of data.items){
   let cells=[];if(admin)cells.push(esc(r.account_number||'Unmatched')+(r.needs_review?'<small>Needs account review</small>':''));
   if(kind==='cards')cells.push('<strong class="fleet-card-number">'+esc(r.card_number)+'</strong>',badge(r.status),esc(r.cardholder),esc(r.assigned_to||'—'),`${esc(r.driver_no||'—')} / ${esc(r.vehicle_no||'—')}`);
   else if(admin)cells.push(...adminTransactionCells(r));
   else cells.push(...customerTransactionCells(r));
   html+='<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
  }
  if(!data.items.length)html+=`<tr><td colspan="${headers.length}" class="fleet-empty">${data.last_sync?'No matching fleet records.':'Your fleet information will appear after the first successful sync.'}</td></tr>`;
  get('[data-table]').innerHTML=html+'</tbody></table>';
  get('[data-pages]').innerHTML=fleetPager(page,data.pages,data.total);
  if(admin)get('[data-export]').disabled=exporting||!data.items.length;
 }
 async function exportPdf(){
  if(!admin||exporting)return;
  const button=get('[data-export]'),buttonLabel=button.querySelector('span'),ticket=serial,exportKind=kind,signal=controller?.signal;
  if(!window.WootenAdminTablePdf?.exportData){message('The PDF exporter is not available. Refresh the page and try again.',true);return;}
  exporting=true;button.disabled=true;
  const query=new URLSearchParams({kind:exportKind,search:get('[name=search]').value,page:'1'});
  if(get('[name=review]').checked)query.set('review','1');
  try{
   let first=null,items=[];
   for(let n=1;n<= (first?.pages||1);n++){
    buttonLabel.textContent=first?'Loading page '+n+' of '+first.pages+'…':'Loading records…';
    query.set('page',String(n));
    const data=await api('/api/admin/fleet/data?'+query,{signal});
    if(ticket!==serial)return;
    if(!first)first=data;
    if(data.last_sync!==first.last_sync||data.total!==first.total)throw Error('Fleet data changed during export. Please export again.');
    items.push(...data.items);
   }
   if(items.length!==first.total)throw Error('The complete fleet table could not be loaded. Please export again.');
   const data=fleetPdfData(exportKind,items);
   buttonLabel.textContent='Preparing PDF…';
   await window.WootenAdminTablePdf.exportData(exportKind==='cards'?'Fleet Cards':'Fleet Transactions',data.headers,data.rows,undefined,{fullCells:true});
   if(ticket===serial)message('Exported '+items.length.toLocaleString()+' records to PDF.');
  }catch(e){if(ticket===serial&&e.name!=='AbortError')message(e.message||'Fleet PDF export failed.',true);}
  finally{exporting=false;buttonLabel.textContent='Export PDF';button.disabled=!get('[data-table] tbody tr strong.fleet-card-number');}
 }
 if(admin)get('[data-export]').addEventListener('click',exportPdf);
 async function load(){
  if(admin)get('[data-export]').disabled=true;
  controller?.abort();controller=new AbortController();const ticket=++serial;loaded=true;
  get('[data-table]').innerHTML='';get('[data-pages]').innerHTML='';message('Loading fleet records…');root.setAttribute('aria-busy','true');
  const query=new URLSearchParams({kind,page:String(page),search:get('[name=search]').value});if(admin&&get('[name=review]').checked)query.set('review','1');
  try{const data=await api((admin?'/api/admin/fleet/data':'/api/customer/fleet')+'?'+query,{signal:controller.signal});if(ticket!==serial)return;loadedQuery=query.toString();display(data);message('');}
  catch(e){if(ticket===serial&&e.name!=='AbortError')message(e.message,true);}
  finally{if(ticket===serial)root.removeAttribute('aria-busy');}
 }
 // Only replace visible rows when a newly committed sync is available.
 async function refreshAfterSync(){
  if(!loadedQuery||refreshing||exporting||root.hasAttribute('aria-busy'))return;
  refreshing=true;
  const ticket=serial,query=new URLSearchParams(loadedQuery),signal=controller?.signal;
  try{
   const path=admin?'/api/admin/fleet/data':'/api/customer/fleet';
   let data=await api(path+'?'+query,{signal});
   if(ticket!==serial||exporting||!data.last_sync||data.last_sync===lastSync)return;
   if(Number(query.get('page'))>data.pages){
    query.set('page',String(data.pages));
    data=await api(path+'?'+query,{signal});
    if(ticket!==serial||exporting)return;
   }
   const table=get('[data-table]'),left=table.scrollLeft,top=table.scrollTop;
   page=Number(query.get('page'));loadedQuery=query.toString();display(data);
   table.scrollLeft=left;table.scrollTop=top;
   message('Fleet records refreshed after a successful sync.');
  }catch(e){
   // Keep the last successfully loaded rows; the next poll retries.
  }finally{refreshing=false;}
 }
 function clear(){controlDirty=false;loadedQuery=null;lastSync=null;if(admin)get('[data-export]').disabled=true;controller?.abort();serial++;loaded=false;page=1;get('[data-table]').innerHTML='';get('[data-pages]').innerHTML='';get('[data-count]').textContent='—';get('[data-active]').textContent='—';get('[data-meta]').textContent='';message('');if(admin){get('[data-sync-status]').innerHTML='';get('[data-health]').textContent='';get('[data-health]').removeAttribute('data-state');get('[data-token]').innerHTML='';get('[data-token]').hidden=true;get('[data-owner]').hidden=true;}}
 root.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.kind){kind=btn.dataset.kind;page=1;root.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));load();}else if(btn.dataset.page){page=Number(btn.dataset.page);load();}else if(btn.hasAttribute('data-refresh')){
 if(btn.disabled)return;
 btn.disabled=true;btn.textContent='Refreshing…';btn.setAttribute('aria-busy','true');
 Promise.all([load(),...(admin?[status()]:[])]).finally(()=>{
  btn.disabled=false;btn.textContent='Refresh';btn.removeAttribute('aria-busy');
 });
}});
 get('form').addEventListener('submit',e=>{e.preventDefault();page=1;load();});get('[name=review]')?.addEventListener('change',()=>{page=1;load();});
 async function status(){
  const ticket=serial;
  try{const data=await api('/api/admin/fleet/status');if(ticket!==serial)return;
   const control=data.control;
   if(control){
    if(!controlDirty){get('[data-sync-hours]').value=String(control.hours);get('[data-sync-days]').value=String(control.window_days||30);}
    const running=control.lease_until&&Date.parse(control.lease_until)>Date.now();
    get('[data-sync-now]').disabled=controlDirty||!!control.requested_at||!!running;
    const connected=control.poll_at&&Date.now()-Date.parse(control.poll_at)<3*60000;
    get('[data-control-status]').textContent=(control.requested_at?'Manual sync queued. ':running?'Sync is running. ':'')+'Schedule: every '+control.hours+' hours. Transaction history: '+periodLabel(control.window_days)+'. Cards: current list. '+(control.next_due?'Next scheduled pull: '+central(control.next_due)+'. ':'')+(running?'The PC is processing the sync.':connected?'Sync PC is checking for requests.':'Waiting for the sync PC. Install the updated agent and run Enable-Schedule.cmd; keep Windows signed in.');
   }
   get('[data-owner]').hidden=!window.wootenAdminUser?.owner;
   const health=get('[data-health]');health.innerHTML=healthMarkup(data);
   health.dataset.state=data.latest?.updated_at&&Date.now()-Date.parse(data.latest.updated_at)>((data.control?.hours||2)+2)*60*60*1000?'overdue':data.latest?.state||(data.last_success?'complete':'unknown');
   get('[data-sync-status]').innerHTML='<p class="fleet-note">'+(data.runs[0]?`Latest run: ${esc(data.runs[0].state)} · ${esc(central(data.runs[0].started_at))}${data.runs[0].error?' · '+esc(data.runs[0].error):''}`:'No sync runs yet.')+'</p>'+data.devices.map(d=>`<div class="fleet-device-row"><span><strong>${esc(d.name)}</strong><small class="fleet-note"> · ${d.active?'Active':'Revoked'} · ${esc(central(d.last_seen))}${d.last_error?' · '+esc(d.last_error):''}</small></span>${d.active&&window.wootenAdminUser?.owner?`<button type="button" data-revoke="${esc(d.id)}">Revoke</button>`:''}</div>`).join('');
   if(data.last_success?.completed_at&&data.last_success.completed_at!==lastSync)await refreshAfterSync();
  }catch(e){if(ticket===serial){get('[data-sync-status]').textContent=e.message;get('[data-health]').textContent='Could not refresh sync status. '+e.message;get('[data-health]').dataset.state='overdue';}}
 }
 if(admin){
  const settingsChanged=()=>{controlDirty=true;get('[data-sync-now]').disabled=true;message('Save settings to apply this schedule and history period. Then use Sync now to pull immediately.');};
  get('[data-sync-hours]').addEventListener('change',settingsChanged);
  get('[data-sync-days]').addEventListener('change',settingsChanged);
  get('[data-save-schedule]').addEventListener('click',async()=>{
   const btn=get('[data-save-schedule]');btn.disabled=true;
   try{await api('/api/admin/fleet/schedule',{method:'POST',body:JSON.stringify({hours:Number(get('[data-sync-hours]').value),window_days:Number(get('[data-sync-days]').value)})});controlDirty=false;message('Settings saved. The selected history will appear after the next successful pull. Use Sync now to pull immediately.');await status();}
   catch(e){message(e.message,true);}finally{btn.disabled=false;}
  });
  get('[data-sync-now]').addEventListener('click',async()=>{
   const btn=get('[data-sync-now]');btn.disabled=true;
   try{await api('/api/admin/fleet/request-sync',{method:'POST',body:'{}'});message('Sync requested. The PC will start when it next checks in.');await status();}
   catch(e){message(e.message,true);btn.disabled=false;}
  });
  get('.fleet-device-panel').addEventListener('toggle',()=>{if(get('.fleet-device-panel').open)status();});
  get('[data-create]').addEventListener('click',async()=>{const btn=get('[data-create]');btn.disabled=true;const ticket=serial;try{const d=await api('/api/admin/fleet/devices',{method:'POST',body:JSON.stringify({name:'Intevacon Windows PC'})});if(ticket!==serial)return;const token=get('[data-token]');token.hidden=false;token.innerHTML=`<div class="fleet-token"><p>Copy this credential into Configure on the sync PC. It is shown once.</p><code>${esc(d.token)}</code><br><button type="button" data-hide-token>Hide credential</button></div>`;token.querySelector('[data-hide-token]').onclick=()=>{token.replaceChildren();token.hidden=true;};await status();}catch(e){if(ticket===serial)message(e.message,true);}finally{btn.disabled=false;}});
  get('[data-sync-status]').addEventListener('click',async e=>{const btn=e.target.closest('[data-revoke]');if(!btn)return;if(!confirm('Revoke this PC’s fleet sync credential? Its uploads will stop.'))return;btn.disabled=true;try{await api('/api/admin/fleet/devices/revoke',{method:'POST',body:JSON.stringify({id:btn.dataset.revoke})});await status();}catch(e){message(e.message,true);btn.disabled=false;}});
 }
 return {load,clear,status,refreshAfterSync,get loaded(){return loaded;}};
}
const adminRoot=document.getElementById('adminFleetRoot');
if(adminRoot){
 const view=mount(adminRoot,true),panel=document.getElementById('admin-tab-fleet');
 const activate=()=>{if(!panel.hidden&&panel.classList.contains('is-active')&&window.wootenAdminUser&&!view.loaded){view.load();view.status();}};
 new MutationObserver(activate).observe(panel,{attributes:true,attributeFilter:['hidden','class']});
 window.addEventListener('wooten-admin-auth-changed',()=>{view.clear();activate();});activate();
 setInterval(()=>{if(!document.hidden&&!panel.hidden&&panel.classList.contains('is-active')&&window.wootenAdminUser)view.status();},30000);
}
const open=document.getElementById('dashboardFleet');
if(open){
 const dialog=document.createElement('dialog');dialog.className='fleet-modal wooten-fleet';dialog.setAttribute('aria-labelledby','fleetModalTitle');
 dialog.innerHTML='<div class="fleet-modal-inner"><header class="fleet-modal-header"><div><small>WOOTEN OIL</small><h2 id="fleetModalTitle">Fleet cards & transactions</h2></div><button type="button" data-close aria-label="Close fleet information">×</button></header><div class="fleet-modal-body"><div id="customerFleetRoot"></div></div><footer class="fleet-modal-footer"><span>View your cards and fuel activity</span><button type="button" data-close>Done</button></footer></div>';
 document.body.appendChild(dialog);const view=mount(dialog.querySelector('#customerFleetRoot'),false);
 open.addEventListener('click',()=>{view.clear();dialog.showModal();view.load();});
 const poll=()=>{if(dialog.open&&!document.hidden)view.refreshAfterSync();};
 setInterval(poll,30000);document.addEventListener('visibilitychange',poll);
 dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
 dialog.addEventListener('close',()=>view.clear());
 window.addEventListener('wooten:payment-account',()=>{view.clear();if(dialog.open)dialog.close();});
}
})();
