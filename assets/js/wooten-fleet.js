(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const central=v=>v?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}).format(new Date(v))+' CT':'Not synced yet';
function dollars(value){
 if(typeof value!=='string'||!/^(-?)(\d{1,12})\.(\d{2})$/.test(value))return '—';
 const [,sign,whole,cents]=value.match(/^(-?)(\d{1,12})\.(\d{2})$/);
 return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${cents}`;
}
function pages(current,last){const set=new Set([1,last,current-1,current,current+1]);if(current<=2){set.add(2);set.add(3);}if(current>=last-1){set.add(last-1);set.add(last-2);}return [...set].filter(n=>n>0&&n<=last).sort((a,b)=>a-b);}
function badge(value){return `<span class="fleet-badge ${/^(active|invoiced|processed)$/i.test(value)?'good':/declined|cancel|inactive/i.test(value)?'bad':''}">${esc(value||'Unknown')}</span>`;}
function mount(root,admin){
 let kind='cards',page=1,serial=0,controller=null,loaded=false;
 root.classList.add('wooten-fleet');
 root.innerHTML=`<div class="fleet-summary"><div class="fleet-stat"><strong data-count>—</strong><span>Cards in latest sync</span></div><div class="fleet-stat"><strong data-active>—</strong><span>Active cards</span></div></div><div class="fleet-tabs" role="group" aria-label="Fleet records"><button type="button" data-kind="cards" aria-pressed="true">Fleet cards</button><button type="button" data-kind="transactions" aria-pressed="false">Transactions</button></div><form class="fleet-toolbar"><label class="fleet-search">Search <input type="search" name="search" placeholder="Card, customer, transaction or invoice" autocomplete="off"></label>${admin?'<label class="fleet-check"><input type="checkbox" name="review"> Needs account review</label>':''}<button type="submit">Search</button><button type="button" data-refresh>Refresh</button></form><p class="fleet-meta" data-meta></p><div class="fleet-message" data-message role="status" aria-live="polite" hidden></div><div class="fleet-table-wrap" data-table></div><nav class="fleet-pages" aria-label="Fleet table pages" data-pages></nav>${admin?'<details class="fleet-device-panel"><summary>Intevacon synchronization</summary><div data-sync-status></div><div data-owner hidden><p>Create a separate sync credential for the Windows PC.</p><button type="button" data-create>Create sync credential</button><div data-token hidden></div></div></details>':''}`;
 const get=s=>root.querySelector(s);
 const message=(value,error=false)=>{const el=get('[data-message]');el.textContent=value;el.hidden=!value;el.classList.toggle('error',error);};
 async function api(path,options={}){
  const headers={Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})};
  if(admin){const key=document.getElementById('adminKey')?.value?.trim();if(!key)throw Error('Sign in as an administrator.');headers['X-Admin-Key']=key;}
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...headers,...options.headers}});
  const data=await response.json().catch(()=>({}));if(!response.ok||!data.success)throw Error(data.error||'Fleet records could not be loaded.');return data;
 }
 function display(data){
  get('[data-count]').textContent=data.summary.cards.toLocaleString();get('[data-active]').textContent=data.summary.active.toLocaleString();
  const window=data.window_from?` · Transactions received ${central(data.window_from)} – ${central(data.window_to)}`:'';
  get('[data-meta]').textContent=`Last sync: ${central(data.last_sync)}${window}${data.card_scope==='active'?' · Card export includes active cards only.':''}`;
  const headers=kind==='cards'?['Card number','Status','Cardholder','Assigned to','Driver / Vehicle']:['Transaction / Invoice','Total Sale',...(admin?['Billable Amount']:[]),'Dates / Location','Card / Cardholder','Status','Driver / Vehicle'];
  if(admin)headers.unshift('Portal account');
  let html='<table><thead><tr>'+headers.map(h=>`<th scope="col">${h}</th>`).join('')+'</tr></thead><tbody>';
  for(const r of data.items){
   let cells=[];if(admin)cells.push(esc(r.account_number||'Unmatched')+(r.needs_review?'<small>Needs account review</small>':''));
   if(kind==='cards')cells.push(esc(r.card_number),badge(r.status),esc(r.cardholder),esc(r.assigned_to||'—'),`${esc(r.driver_no||'—')} / ${esc(r.vehicle_no||'—')}`);
   else {
    cells.push(esc(r.transaction_id)+`<small>Invoice: ${esc(r.invoice_number||'—')}</small>`, `<span class="fleet-money">${dollars(r.total_sale)}</span>`);
    if(admin)cells.push(`<span class="fleet-money">${dollars(r.billable_amount)}</span>`);
    cells.push(`Local: ${esc(r.local_date_time||'—')}<small>Received: ${esc(r.received_at?central(r.received_at):'—')}</small>${r.processed_on?'<small>Processed: '+esc(r.processed_on)+'</small>':''}${r.posted_on?'<small>Posted: '+esc(r.posted_on)+'</small>':''}<small>${esc([r.merchant,r.merchant_city].filter(Boolean).join(' · '))}</small>`,
     `${esc(r.card_number)}<small>${esc(r.cardholder)}</small>`,
     `${badge(r.status)}<small>${esc(r.transaction_type)}${r.decline_reason?' · '+esc(r.decline_reason):''}</small>`);
    cells.push(`Driver: ${esc(r.driver||'—')}<small>Vehicle: ${esc(r.vehicle||'—')}${r.odometer?'<br>Odometer: '+esc(r.odometer):''}</small>`);
   }
   html+='<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
  }
  if(!data.items.length)html+=`<tr><td colspan="${headers.length}" class="fleet-empty">${data.last_sync?'No matching fleet records.':'Your fleet information will appear after the first successful sync.'}</td></tr>`;
  get('[data-table]').innerHTML=html+'</tbody></table>';
  let numbers='',previous=0;for(const n of pages(page,data.pages)){if(previous&&n-previous>1)numbers+='<span aria-hidden="true">…</span>';numbers+=`<button type="button" data-page="${n}" aria-label="Page ${n}" ${page===n?'aria-current="page"':''}>${n}</button>`;previous=n;}
  get('[data-pages]').innerHTML=`<span>Page ${page} of ${data.pages} · ${data.total.toLocaleString()} records</span><div class="fleet-page-numbers"><button type="button" data-page="${page-1}" ${page<=1?'disabled':''} aria-label="Previous page">‹</button>${numbers}<button type="button" data-page="${page+1}" ${page>=data.pages?'disabled':''} aria-label="Next page">›</button></div>`;
 }
 async function load(){
  controller?.abort();controller=new AbortController();const ticket=++serial;loaded=true;
  get('[data-table]').innerHTML='';get('[data-pages]').innerHTML='';message('Loading fleet records…');root.setAttribute('aria-busy','true');
  const query=new URLSearchParams({kind,page:String(page),search:get('[name=search]').value});if(admin&&get('[name=review]').checked)query.set('review','1');
  try{const data=await api((admin?'/api/admin/fleet/data':'/api/customer/fleet')+'?'+query,{signal:controller.signal});if(ticket!==serial)return;display(data);message('');}
  catch(e){if(ticket===serial&&e.name!=='AbortError')message(e.message,true);}
  finally{if(ticket===serial)root.removeAttribute('aria-busy');}
 }
 function clear(){controller?.abort();serial++;loaded=false;page=1;get('[data-table]').innerHTML='';get('[data-pages]').innerHTML='';get('[data-count]').textContent='—';get('[data-active]').textContent='—';get('[data-meta]').textContent='';message('');if(admin){get('[data-sync-status]').innerHTML='';get('[data-token]').innerHTML='';get('[data-token]').hidden=true;get('[data-owner]').hidden=true;}}
 root.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.kind){kind=btn.dataset.kind;page=1;root.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));load();}else if(btn.dataset.page){page=Number(btn.dataset.page);load();}else if(btn.hasAttribute('data-refresh')){load();if(admin)status();}});
 get('form').addEventListener('submit',e=>{e.preventDefault();page=1;load();});get('[name=review]')?.addEventListener('change',()=>{page=1;load();});
 async function status(){
  const ticket=serial;
  try{const data=await api('/api/admin/fleet/status');if(ticket!==serial)return;
   get('[data-owner]').hidden=!window.wootenAdminUser?.owner;
   get('[data-sync-status]').innerHTML='<p class="fleet-note">'+(data.runs[0]?`Latest run: ${esc(data.runs[0].state)} · ${esc(central(data.runs[0].started_at))}${data.runs[0].error?' · '+esc(data.runs[0].error):''}`:'No sync runs yet.')+'</p>'+data.devices.map(d=>`<div class="fleet-device-row"><span><strong>${esc(d.name)}</strong><small class="fleet-note"> · ${d.active?'Active':'Revoked'} · ${esc(central(d.last_seen))}${d.last_error?' · '+esc(d.last_error):''}</small></span>${d.active&&window.wootenAdminUser?.owner?`<button type="button" data-revoke="${esc(d.id)}">Revoke</button>`:''}</div>`).join('');
  }catch(e){if(ticket===serial)get('[data-sync-status]').textContent=e.message;}
 }
 if(admin){
  get('.fleet-device-panel').addEventListener('toggle',()=>{if(get('.fleet-device-panel').open)status();});
  get('[data-create]').addEventListener('click',async()=>{const btn=get('[data-create]');btn.disabled=true;const ticket=serial;try{const d=await api('/api/admin/fleet/devices',{method:'POST',body:JSON.stringify({name:'Intevacon Windows PC'})});if(ticket!==serial)return;const token=get('[data-token]');token.hidden=false;token.innerHTML=`<div class="fleet-token"><p>Copy this credential into Configure on the sync PC. It is shown once.</p><code>${esc(d.token)}</code><br><button type="button" data-hide-token>Hide credential</button></div>`;token.querySelector('[data-hide-token]').onclick=()=>{token.replaceChildren();token.hidden=true;};await status();}catch(e){if(ticket===serial)message(e.message,true);}finally{btn.disabled=false;}});
  get('[data-sync-status]').addEventListener('click',async e=>{const btn=e.target.closest('[data-revoke]');if(!btn)return;if(!confirm('Revoke this PC’s fleet sync credential? Its uploads will stop.'))return;btn.disabled=true;try{await api('/api/admin/fleet/devices/revoke',{method:'POST',body:JSON.stringify({id:btn.dataset.revoke})});await status();}catch(e){message(e.message,true);btn.disabled=false;}});
 }
 return {load,clear,status,get loaded(){return loaded;}};
}
const adminRoot=document.getElementById('adminFleetRoot');
if(adminRoot){
 const view=mount(adminRoot,true),panel=document.getElementById('admin-tab-fleet');
 const activate=()=>{if(!panel.hidden&&panel.classList.contains('is-active')&&window.wootenAdminUser&&!view.loaded){view.load();view.status();}};
 new MutationObserver(activate).observe(panel,{attributes:true,attributeFilter:['hidden','class']});
 window.addEventListener('wooten-admin-auth-changed',()=>{view.clear();activate();});activate();
}
const open=document.getElementById('dashboardFleet');
if(open){
 const dialog=document.createElement('dialog');dialog.className='fleet-modal wooten-fleet';dialog.setAttribute('aria-labelledby','fleetModalTitle');
 dialog.innerHTML='<div class="fleet-modal-inner"><header class="fleet-modal-header"><div><small>WOOTEN OIL</small><h2 id="fleetModalTitle">Fleet cards & transactions</h2></div><button type="button" data-close aria-label="Close fleet information">×</button></header><div class="fleet-modal-body"><div id="customerFleetRoot"></div></div><footer class="fleet-modal-footer"><span>View your cards and fuel activity</span><button type="button" data-close>Done</button></footer></div>';
 document.body.appendChild(dialog);const view=mount(dialog.querySelector('#customerFleetRoot'),false);
 open.addEventListener('click',()=>{view.clear();dialog.showModal();view.load();});
 dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
 dialog.addEventListener('close',()=>view.clear());
 window.addEventListener('wooten:payment-account',()=>{view.clear();if(dialog.open)dialog.close();});
}
})();
