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
list.className='iv-dialog iv-list-dialog';detail.className='iv-dialog iv-classic-dialog';
list.setAttribute('aria-labelledby','ivListTitle');detail.setAttribute('aria-labelledby','ivDetailTitle');
list.innerHTML=`<header class="iv-head"><div><div class="iv-eyebrow">Invoices</div><h2 id="ivListTitle">Open Invoices</h2><p data-account></p></div><button type="button" class="iv-close" data-close aria-label="Close invoices">×</button></header><div class="iv-body"><form class="iv-tools"><label>Search invoices<input type="search" name="search" placeholder="Invoice number…" autocomplete="off"></label><label>Sort<select name="sort"><option value="invoice_desc">Invoice date newest</option><option value="invoice_asc">Invoice date oldest</option><option value="due_asc">Due date earliest</option><option value="balance_desc">Balance highest</option><option value="number_asc">Invoice number A–Z</option></select></label><button type="submit">Search</button><button type="button" class="iv-refresh" data-refresh>Refresh</button></form><p class="iv-status" data-status role="status" aria-live="polite"></p><div class="iv-table-toolbar"><p class="iv-updated" data-updated></p><div class="iv-export-actions"><button type="button" class="iv-export" data-export disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l4 4v16H6z"></path><path d="M14 2v5h5"></path><path d="M9 13h6M9 17h6"></path></svg><span>Export PDF</span></button></div></div><div class="iv-table-wrap"><table data-auto-pdf="false"><thead><tr><th>Invoice No</th><th>Type</th><th>Division</th><th>Invoice Date</th><th>Due Date</th><th>Balance</th></tr></thead><tbody></tbody></table></div><div class="iv-pages"><button type="button" data-prev>Previous 20</button><span data-page aria-live="polite"></span><button type="button" data-next>Next 20</button></div></div><footer class="iv-foot"><span>Choose an invoice number to view its details.</span><button type="button" data-close>${admin?'Done':'Back to Dashboard'}</button></footer>`;
detail.innerHTML=`<header class="iv-head iv-classic-head"><div class="iv-company"><strong>WOOTEN OIL CO INC.</strong><p>Invoice details</p></div><div class="iv-document-heading"><h2 id="ivDetailTitle">Invoice</h2><p data-invoice-meta></p></div><button type="button" class="iv-close" data-close aria-label="Close invoice details">×</button></header><div class="iv-body"><p class="iv-status" data-status role="status" aria-live="polite"></p><div data-detail-content></div><p class="iv-note" hidden>Original invoice PDF is not available.<button type="button" class="iv-original" disabled>View original invoice</button></p></div><footer class="iv-foot"><span class="iv-updated" data-updated></span><button type="button" data-close>Back</button></footer>`;
document.body.append(list,detail);
const q=(root,selector)=>root.querySelector(selector);
const form=q(list,'form'),search=form.elements.search,sort=form.elements.sort,body=q(list,'tbody');
let page=1,pages=1,selected='',customerName='',listSerial=0,detailSerial=0,listAbort,detailAbort,listBusy=false,searchTimer;
let listTrigger=null,detailTrigger=null,exporting=false,exportAbort,matchedTotal=0;
const headerSort=WootenTableDataSort.register(body.closest('table'),['number','type','division','invoice','due','balance'],()=>{page=1;return load();},sort);
function message(root,text,error=false){const el=q(root,'[data-status]');el.textContent=text;el.classList.toggle('iv-error',error);}
function syncListControls(){body.closest('table').setAttribute('aria-busy',String(listBusy||exporting));const refresh=q(list,'[data-refresh]');refresh.textContent=listBusy?'Refreshing...':'Refresh';refresh.setAttribute('aria-busy',String(listBusy));q(list,'[data-export]').disabled=listBusy||exporting||!matchedTotal;form.querySelectorAll('button,input,select').forEach(e=>e.disabled=listBusy||exporting);q(list,'[data-prev]').disabled=listBusy||exporting||page<=1;q(list,'[data-next]').disabled=listBusy||exporting||page>=pages;list.setAttribute('aria-busy',String(listBusy));}
async function api(params,signal){
 const headers={Accept:'application/json'};
 if(admin){headers['X-Admin-Key']=document.getElementById('adminKey')?.value.trim()||'';if(!headers['X-Admin-Key'])throw Error('Sign in as an administrator first.');}
 const response=await fetch((admin?'/api/admin/open-invoices':'/api/customer/open-invoices')+'?'+new URLSearchParams(params),{headers,credentials:'same-origin',cache:'no-store',signal});
 const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'Invoices could not be loaded.');return data;
}
function updated(root,data){q(root,'[data-updated]').textContent='Last completed import: '+stamp(data.active?.completed_at);}
function link(label,action){const b=document.createElement('button');b.type='button';b.className='iv-link';b.textContent=label||'—';b.addEventListener('click',()=>action(b));return b;}
function openDialog(dialog,trigger){if(!dialog.open)dialog.showModal();q(dialog,'[data-close]').focus({preventScroll:true});return trigger||document.activeElement;}
function showListSkeleton(){
 const count=Math.max(1,Math.min(20,body.children.length||8));
 body.replaceChildren();body.setAttribute('aria-busy','true');
 for(let i=0;i<count;i++){
  const tr=body.insertRow();tr.className='iv-skeleton-row';tr.setAttribute('aria-hidden','true');tr.setAttribute('data-no-sort','');
  for(let c=0;c<6;c++){const bar=document.createElement('span');bar.className='iv-skeleton-bar';tr.insertCell().append(bar);}
 }
}
async function load(){
 if(exporting)return;
 clearTimeout(searchTimer);listAbort?.abort();listAbort=new AbortController();const ticket=++listSerial;
 listBusy=true;syncListControls();showListSkeleton();message(list,'Loading invoices…');
 try{
  const data=await api({...(admin?{account_number:selected}:{}),search:search.value.trim(),sort:headerSort.key()||sort.value,page,page_size:20},listAbort.signal);
  if(ticket!==listSerial||!list.open)return;
  body.replaceChildren();
  matchedTotal=data.total;page=data.page;pages=data.pages;selected=data.account_number;
  customerName=admin?customerName:data.customer_name;
  q(list,'[data-account]').textContent=[customerName,'Customer # '+selected].filter(Boolean).join(' · ');
  updated(list,data);
  for(const row of data.rows){const tr=body.insertRow();tr.insertCell().append(link(row.invoice_no,b=>openInvoice(row,b)));
   for(const value of [row.invoice_type,row.division,date(row.invoice_date),date(row.due_date),amount(row.balance_cents/100)])tr.insertCell().textContent=value;
  }
  if(!data.rows.length){const td=body.insertRow().insertCell();td.colSpan=6;td.textContent='No invoices match this account and search.';}
  message(list,data.total.toLocaleString()+' matching invoice(s).');
  q(list,'[data-page]').textContent='Page '+page+' of '+pages+' · '+data.total.toLocaleString()+' records';
 }catch(e){if(ticket!==listSerial||e.name==='AbortError')return;matchedTotal=0;body.replaceChildren();q(list,'[data-page]').textContent='';message(list,e.message,true);pages=1;page=1;}
 finally{if(ticket===listSerial){listBusy=false;body.setAttribute('aria-busy','false');syncListControls();}}
}
async function exportPdf(){
 if(listBusy||exporting||!matchedTotal)return;
 const ticket=listSerial,account=selected,label=q(q(list,'[data-export]'),'span');
 const params={...(admin?{account_number:account}:{}),search:search.value.trim(),sort:headerSort.key()||sort.value,page_size:500};
 exportAbort=new AbortController();exporting=true;syncListControls();
 try{
  let first=null;const rows=[];
  for(let n=1;n<=(first?.pages||1);n++){
   label.textContent=first?'Loading '+n+' / '+first.pages+'…':'Loading invoices…';
   const data=await api({...params,page:n},exportAbort.signal);
   if(ticket!==listSerial||!list.open)return;
   if(data.account_number!==account)throw Error('Your account changed. Please export again.');
   if(!first)first=data;
   if(data.total!==first.total||data.pages!==first.pages||data.page!==n||data.active?.completed_at!==first.active?.completed_at)throw Error('Invoice data changed during export. Please try again.');
   rows.push(...data.rows);
  }
  if(rows.length!==first.total||!rows.length)throw Error('No complete invoice result is available to export.');
  label.textContent='Preparing PDF…';
  const blob=await window.WootenInvoicePdf.build('Open Invoices - Customer '+account,
   ['Invoice No','Type','Division','Invoice Date','Due Date','Balance'],
   rows.map(r=>[r.invoice_no,r.invoice_type,r.division,date(r.invoice_date),date(r.due_date),amount(r.balance_cents/100)]),customerName||first.customer_name||rows[0]?.customer_name||'');
  if(ticket!==listSerial||!list.open||exportAbort.signal.aborted)return;
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  const dateParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'2-digit',day:'2-digit',year:'numeric'}).formatToParts(new Date());
  const exportDate=['month','day','year'].map(type=>dateParts.find(part=>part.type===type).value).join('');
  link.href=url;link.download='Open-Invoices-'+account+'-'+exportDate+'.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  message(list,'Exported '+rows.length.toLocaleString()+' invoice(s) to PDF.');
 }catch(e){if(ticket===listSerial&&e.name!=='AbortError')message(list,e.message||'Invoice PDF export failed.',true);}
 finally{if(ticket===listSerial){exporting=false;label.textContent='Export PDF';syncListControls();}}
}
q(list,'[data-export]').addEventListener('click',exportPdf);
function openCustomer(row={},trigger){
 if(!admin&& !customerButton)return;
 selected=admin?String(row.account_number||''):'';customerName=admin?String(row.customer_name||''):'';
 if(admin&&!selected)return;
 matchedTotal=0;headerSort.clear();search.value='';sort.value='invoice_desc';page=1;pages=1;
 q(list,'[data-account]').textContent=admin?[customerName,'Customer # '+selected].filter(Boolean).join(' · '):'Loading your account…';
 q(list,'#ivListTitle').textContent=admin?'Customer Invoices':'Open Invoices';
 listTrigger=trigger||document.activeElement;openDialog(list,listTrigger);load();
}
async function openInvoice(row,trigger){
 detailAbort?.abort();detailAbort=new AbortController();const ticket=++detailSerial;
 const content=q(detail,'[data-detail-content]');content.replaceChildren();q(detail,'[data-invoice-meta]').textContent='';q(detail,'[data-updated]').textContent='';q(detail,'.iv-note').hidden=true;
 q(detail,'#ivDetailTitle').textContent=row.invoice_no||'Invoice';
 detailTrigger=trigger||document.activeElement;openDialog(detail,detailTrigger);message(detail,'Loading invoice details…');detail.setAttribute('aria-busy','true');
 try{
  const data=await api({detail:1,account_number:row.account_number,division:row.division,invoice_no:row.invoice_no,invoice_type:row.invoice_type},detailAbort.signal);
  if(ticket!==detailSerial||!detail.open)return;
  const invoice=data.invoice;
  const value=key=>String(invoice[key]??'').trim()||'—';
  q(detail,'#ivDetailTitle').textContent=value('InvoiceNo');
  q(detail,'[data-invoice-meta]').textContent='Invoice · '+value('InvoiceType')+' · Division '+value('ARDivisionNo');
  const summary=document.createElement('div');summary.className='iv-classic-summary';
  const customer=document.createElement('div'),label=document.createElement('div'),name=document.createElement('div'),account=document.createElement('p');
  label.className='iv-classic-label';label.textContent='Customer';name.className='iv-classic-name';name.textContent=value('CustomerName');account.textContent='Account # '+value('CustomerNo');customer.append(label,name,account);
  const balance=document.createElement('div'),balanceLabel=document.createElement('div'),balanceValue=document.createElement('div');balance.className='iv-classic-balance';balanceLabel.className='iv-classic-label';balanceLabel.textContent='Remaining balance';balanceValue.className='iv-classic-amount';balanceValue.textContent=amount(invoice.Balance);balance.append(balanceLabel,balanceValue);summary.append(customer,balance);content.append(summary);
  const columns=document.createElement('div');columns.className='iv-classic-columns';
  function section(title,fields){
   const section=document.createElement('section'),heading=document.createElement('h3'),dl=document.createElement('dl');heading.textContent=title;dl.className='iv-classic-fields';
   for(const [key,label,format] of fields){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=format?format(invoice[key]):value(key);row.append(dt,dd);dl.append(row);}
   section.append(heading,dl);return section;
  }
  columns.append(section('Dates & terms',[['InvoiceDate','Invoice date',date],['InvoiceDueDate','Due date',date],['TermsCode','Terms code'],['InvoiceDiscountDate','Discount date',date]]),section('References',[['CustomerPONo','Purchase order'],['InvoiceType','Invoice type'],['ARDivisionNo','Division'],['DiscountAmt','Discount amount',amount]]));content.append(columns);
  const items=document.createElement('div');items.className='iv-itemized';
  items.innerHTML='<h3>Items</h3><div class="iv-item-table-wrap"><table data-auto-pdf="false" aria-label="Invoice items"><thead><tr><th class="no-sort">Description</th><th class="no-sort">Quantity</th><th class="no-sort">Unit price</th><th class="no-sort">Amount</th></tr></thead><tbody><tr><td colspan="4" class="iv-items-unavailable">Item descriptions, quantities, and unit prices are not available in the current import.</td></tr></tbody></table></div>';
  content.append(items);
  const totals=section('Invoice amounts',[['SalesTaxAmt','Sales tax',amount],['FreightAmt','Freight',amount],['Balance','Remaining balance',amount]]);totals.className='iv-classic-totals';
  const totalsList=q(totals,'dl');
  for(const [label,before] of [['Subtotal',totalsList.firstElementChild],['Invoice total',totalsList.lastElementChild]]){
   const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent='Not available';row.className='iv-amount-unavailable';row.append(dt,dd);totalsList.insertBefore(row,before);
  }
  content.append(totals);
  if(admin){const internal=section('Office information',[['SalespersonName','Salesperson'],['Comment','Internal comment']]);internal.className='iv-classic-office';content.append(internal);}
  updated(detail,data);message(detail,'');q(detail,'.iv-note').hidden=false;
 }catch(e){if(ticket===detailSerial&&e.name!=='AbortError')message(detail,e.message,true);}
 finally{if(ticket===detailSerial)detail.setAttribute('aria-busy','false');}
}
for(const dialog of [list,detail])dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
list.addEventListener('close',()=>{++listSerial;exportAbort?.abort();exporting=false;matchedTotal=0;q(q(list,'[data-export]'),'span').textContent='Export PDF';listAbort?.abort();clearTimeout(searchTimer);body.replaceChildren();message(list,'');q(list,'[data-account]').textContent='';q(list,'[data-updated]').textContent='';listBusy=false;body.setAttribute('aria-busy','false');syncListControls();if(detail.open)detail.close();if(listTrigger?.isConnected)listTrigger.focus({preventScroll:true});});
detail.addEventListener('close',()=>{++detailSerial;detailAbort?.abort();q(detail,'[data-detail-content]').replaceChildren();q(detail,'[data-invoice-meta]').textContent='';message(detail,'');q(detail,'[data-updated]').textContent='';q(detail,'#ivDetailTitle').textContent='Invoice';if(detailTrigger?.isConnected)detailTrigger.focus({preventScroll:true});});
form.addEventListener('submit',e=>{e.preventDefault();page=1;load();});
sort.addEventListener('change',()=>{page=1;load();});
q(list,'[data-refresh]').addEventListener('click',load);
q(list,'[data-prev]').addEventListener('click',()=>{if(!listBusy&&page>1){page--;load();}});
q(list,'[data-next]').addEventListener('click',()=>{if(!listBusy&&page<pages){page++;load();}});
function clear(){++listSerial;++detailSerial;listAbort?.abort();detailAbort?.abort();if(detail.open)detail.close();if(list.open)list.close();body.replaceChildren();q(detail,'[data-detail-content]').replaceChildren();q(detail,'[data-invoice-meta]').textContent='';selected='';customerName='';}
window.WootenInvoiceViewer={openCustomer,openInvoice,clear};
if(customerButton){
 customerButton.addEventListener('click',()=>openCustomer({},customerButton));
 window.addEventListener('wooten:payment-account',clear);
 const number=document.getElementById('acctNumber');if(number)new MutationObserver(clear).observe(number,{childList:true,subtree:true,characterData:true});
 document.addEventListener('click',e=>{if(e.target.closest('#dashboardLogout,#portalLogout,#desktopCustomerLogout,#mobileCustomerLogout'))clear();},true);
}
window.addEventListener('wooten-admin-auth-changed',clear);
})();
