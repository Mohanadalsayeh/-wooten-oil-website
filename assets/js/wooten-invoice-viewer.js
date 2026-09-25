/* Ver575: shared invoice lists and details; all dynamic values use textContent. */
(()=>{
'use strict';
const admin=!!document.getElementById('admin-tab-invoice-database');
const customerButton=document.getElementById('dashboardInvoices');
if(!admin&&!customerButton)return;
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const date=v=>v&&/^\d{4}-\d{2}-\d{2}/.test(String(v))?String(v).slice(5,7)+'-'+String(v).slice(8,10)+'-'+String(v).slice(0,4):'—';
const amount=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?money.format(Number(v)):'—';
const stamp=v=>{if(!v)return 'Not imported yet';const d=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(v)?v:v.replace(' ','T')+'Z');return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{timeZone:'America/Chicago',timeZoneName:'short'}):'Unavailable';};
const list=document.createElement('dialog'),detail=document.createElement('dialog');
list.className=detail.className='iv-dialog';
list.setAttribute('aria-labelledby','ivListTitle');detail.setAttribute('aria-labelledby','ivDetailTitle');
list.innerHTML=`<header class="iv-head"><div><div class="iv-eyebrow">Invoices</div><h2 id="ivListTitle">Open Invoices</h2><p data-account></p></div><button type="button" class="iv-close" data-close aria-label="Close invoices">×</button></header><div class="iv-body"><form class="iv-tools"><label>Search invoices<input type="search" name="search" placeholder="Invoice number…" autocomplete="off"></label><label>Sort<select name="sort"><option value="invoice_desc">Invoice date newest</option><option value="invoice_asc">Invoice date oldest</option><option value="due_asc">Due date earliest</option><option value="balance_desc">Balance highest</option><option value="number_asc">Invoice number A–Z</option></select></label><button type="submit">Search</button><button type="button" class="iv-refresh" data-refresh>Refresh</button></form><p class="iv-status" data-status role="status" aria-live="polite"></p><p class="iv-updated" data-updated></p><div class="iv-table-wrap"><table data-auto-pdf="false"><thead><tr><th>Invoice No</th><th>Type</th><th>Division</th><th>Invoice Date</th><th>Due Date</th><th>Balance</th></tr></thead><tbody></tbody></table></div><div class="iv-pages"><button type="button" data-prev>Previous 20</button><span data-page aria-live="polite"></span><button type="button" data-next>Next 20</button></div></div><footer class="iv-foot"><span>Choose an invoice number to view its details.</span><button type="button" data-close>${admin?'Done':'Back to Dashboard'}</button></footer>`;
detail.innerHTML=`<header class="iv-head"><div><div class="iv-eyebrow">Invoice details</div><h2 id="ivDetailTitle">Invoice</h2></div><button type="button" class="iv-close" data-close aria-label="Close invoice details">×</button></header><div class="iv-body"><p class="iv-status" data-status role="status" aria-live="polite"></p><p class="iv-updated" data-updated></p><dl class="iv-details"></dl><p class="iv-note" hidden>Imported invoice summary. Item descriptions, quantities, and the original invoice document are not included in this data.</p></div><footer class="iv-foot"><span>Balances shown are from the saved MAS 90 data.</span><button type="button" data-close>Back</button></footer>`;
document.body.append(list,detail);
const q=(root,selector)=>root.querySelector(selector);
const form=q(list,'form'),search=form.elements.search,sort=form.elements.sort,body=q(list,'tbody');
let page=1,pages=1,selected='',customerName='',listSerial=0,detailSerial=0,listAbort,detailAbort,listBusy=false,searchTimer;
let listTrigger=null,detailTrigger=null;
const headerSort=WootenTableDataSort.register(body.closest('table'),['number','type','division','invoice','due','balance'],()=>{page=1;return load();},sort);
function message(root,text,error=false){const el=q(root,'[data-status]');el.textContent=text;el.classList.toggle('iv-error',error);}
function syncListControls(){form.querySelectorAll('button,input,select').forEach(e=>e.disabled=listBusy);q(list,'[data-prev]').disabled=listBusy||page<=1;q(list,'[data-next]').disabled=listBusy||page>=pages;list.setAttribute('aria-busy',String(listBusy));}
async function api(params,signal){
 const headers={Accept:'application/json'};
 if(admin){headers['X-Admin-Key']=document.getElementById('adminKey')?.value.trim()||'';if(!headers['X-Admin-Key'])throw Error('Sign in as an administrator first.');}
 const response=await fetch((admin?'/api/admin/open-invoices':'/api/customer/open-invoices')+'?'+new URLSearchParams(params),{headers,credentials:'same-origin',cache:'no-store',signal});
 const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'Invoices could not be loaded.');return data;
}
function updated(root,data){q(root,'[data-updated]').textContent='Last completed import: '+stamp(data.active?.completed_at);}
function link(label,action){const b=document.createElement('button');b.type='button';b.className='iv-link';b.textContent=label||'—';b.addEventListener('click',()=>action(b));return b;}
function openDialog(dialog,trigger){if(!dialog.open)dialog.showModal();q(dialog,'[data-close]').focus({preventScroll:true});return trigger||document.activeElement;}
async function load(){
 clearTimeout(searchTimer);listAbort?.abort();listAbort=new AbortController();const ticket=++listSerial;
 listBusy=true;syncListControls();body.replaceChildren();q(list,'[data-page]').textContent='';q(list,'[data-updated]').textContent='';message(list,'Loading invoices…');
 try{
  const data=await api({...(admin?{account_number:selected}:{}),search:search.value.trim(),sort:headerSort.key()||sort.value,page,page_size:20},listAbort.signal);
  if(ticket!==listSerial||!list.open)return;
  page=data.page;pages=data.pages;selected=data.account_number;
  customerName=admin?customerName:data.customer_name;
  q(list,'[data-account]').textContent=[customerName,'Customer # '+selected].filter(Boolean).join(' · ');
  updated(list,data);
  for(const row of data.rows){const tr=body.insertRow();tr.insertCell().append(link(row.invoice_no,b=>openInvoice(row,b)));
   for(const value of [row.invoice_type,row.division,date(row.invoice_date),date(row.due_date),amount(row.balance_cents/100)])tr.insertCell().textContent=value;
  }
  if(!data.rows.length){const td=body.insertRow().insertCell();td.colSpan=6;td.textContent='No invoices match this account and search.';}
  message(list,data.total.toLocaleString()+' matching invoice(s).');
  q(list,'[data-page]').textContent='Page '+page+' of '+pages+' · '+data.total.toLocaleString()+' records';
 }catch(e){if(ticket!==listSerial||e.name==='AbortError')return;message(list,e.message,true);pages=1;page=1;}
 finally{if(ticket===listSerial){listBusy=false;syncListControls();}}
}
function openCustomer(row={},trigger){
 if(!admin&& !customerButton)return;
 selected=admin?String(row.account_number||''):'';customerName=admin?String(row.customer_name||''):'';
 if(admin&&!selected)return;
 headerSort.clear();search.value='';sort.value='invoice_desc';page=1;pages=1;
 q(list,'[data-account]').textContent=admin?[customerName,'Customer # '+selected].filter(Boolean).join(' · '):'Loading your account…';
 q(list,'#ivListTitle').textContent=admin?'Customer Invoices':'Open Invoices';
 listTrigger=trigger||document.activeElement;openDialog(list,listTrigger);load();
}
async function openInvoice(row,trigger){
 detailAbort?.abort();detailAbort=new AbortController();const ticket=++detailSerial;
 const dl=q(detail,'dl');dl.replaceChildren();q(detail,'[data-updated]').textContent='';q(detail,'.iv-note').hidden=true;
 q(detail,'#ivDetailTitle').textContent='Invoice '+row.invoice_no;
 detailTrigger=trigger||document.activeElement;openDialog(detail,detailTrigger);message(detail,'Loading invoice details…');detail.setAttribute('aria-busy','true');
 try{
  const data=await api({detail:1,account_number:row.account_number,division:row.division,invoice_no:row.invoice_no,invoice_type:row.invoice_type},detailAbort.signal);
  if(ticket!==detailSerial||!detail.open)return;
  const fields=[['CustomerName','Customer name'],['CustomerNo','Customer number'],['InvoiceNo','Invoice number'],['InvoiceType','Invoice type'],['ARDivisionNo','Division'],['InvoiceDate','Invoice date',date],['InvoiceDueDate','Due date',date],['Balance','Remaining balance',amount],['CustomerPONo','Purchase order'],['TermsCode','Terms code'],['InvoiceDiscountDate','Discount date',date],['DiscountAmt','Discount amount',amount],['SalesTaxAmt','Sales tax',amount],['FreightAmt','Freight',amount],...(admin?[['SalespersonName','Salesperson'],['Comment','Internal comment']]:[])];
  for(const [key,label,format] of fields){const wrapper=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=format?format(data.invoice[key]):String(data.invoice[key]??'').trim()||'—';wrapper.append(dt,dd);dl.append(wrapper);}
  updated(detail,data);message(detail,'');q(detail,'.iv-note').hidden=false;
 }catch(e){if(ticket===detailSerial&&e.name!=='AbortError')message(detail,e.message,true);}
 finally{if(ticket===detailSerial)detail.setAttribute('aria-busy','false');}
}
for(const dialog of [list,detail])dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
list.addEventListener('close',()=>{++listSerial;listAbort?.abort();clearTimeout(searchTimer);body.replaceChildren();message(list,'');q(list,'[data-account]').textContent='';q(list,'[data-updated]').textContent='';listBusy=false;if(detail.open)detail.close();if(listTrigger?.isConnected)listTrigger.focus({preventScroll:true});});
detail.addEventListener('close',()=>{++detailSerial;detailAbort?.abort();q(detail,'dl').replaceChildren();message(detail,'');q(detail,'[data-updated]').textContent='';q(detail,'#ivDetailTitle').textContent='Invoice';if(detailTrigger?.isConnected)detailTrigger.focus({preventScroll:true});});
form.addEventListener('submit',e=>{e.preventDefault();page=1;load();});
sort.addEventListener('change',()=>{page=1;load();});
q(list,'[data-refresh]').addEventListener('click',load);
q(list,'[data-prev]').addEventListener('click',()=>{if(!listBusy&&page>1){page--;load();}});
q(list,'[data-next]').addEventListener('click',()=>{if(!listBusy&&page<pages){page++;load();}});
function clear(){++listSerial;++detailSerial;listAbort?.abort();detailAbort?.abort();if(detail.open)detail.close();if(list.open)list.close();body.replaceChildren();q(detail,'dl').replaceChildren();selected='';customerName='';}
window.WootenInvoiceViewer={openCustomer,openInvoice,clear};
if(customerButton){
 customerButton.addEventListener('click',()=>openCustomer({},customerButton));
 window.addEventListener('wooten:payment-account',clear);
 const number=document.getElementById('acctNumber');if(number)new MutationObserver(clear).observe(number,{childList:true,subtree:true,characterData:true});
 document.addEventListener('click',e=>{if(e.target.closest('#dashboardLogout,#portalLogout,#desktopCustomerLogout,#mobileCustomerLogout'))clear();},true);
}
window.addEventListener('wooten-admin-auth-changed',clear);
})();
