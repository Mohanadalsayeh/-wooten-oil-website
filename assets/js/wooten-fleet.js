// Ver676: customer fleet views and printouts show quantities without sale pricing.
// Ver674: consistent display dates for saved website cards and fresh API transactions.
/* Ver656 — customer-initiated API refresh with session-scoped cards and transactions. */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const periodLabel=days=>({30:'Last 30 days',21:'Last 3 weeks',14:'Last 2 weeks',7:'Last 1 week'}[days]||'Last 30 days');
const central=v=>window.WootenIntevaconDates?.central(v,'Not synced yet')??(v?String(v):'Not synced yet');
const quantity=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:6}):'—';
const sourceDate=v=>window.WootenIntevaconDates?.source(v)??(v?String(v).replace('T',' '):'—');
const fieldLabel=k=>({ID:'Transaction number',CustomerID:'Customer ID',AuthRef:'Authorization reference',InvoiceID:'Intevacon invoice ID',CardHolderOrgID:'Cardholder organization ID',MerchantOrgID:'Merchant organization ID',RawVehicleID:'Raw vehicle ID',RawDriverID:'Raw driver ID'}[k]||k.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Z])ID$/,'$1 ID'));
const fieldValue=(key,value)=>value==null||value===''?'—':typeof value==='boolean'?(value?'Yes':'No'):/DateTime$/.test(key)?sourceDate(value):typeof value==='number'?(/Amount|TotalAmountOfSale/.test(key)?dollars(value.toFixed(2)):quantity(value)):String(value);
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
 ['Trans #',r=>r.transaction_id,'transaction'],['Local Date/Time',r=>sourceDate(r.local_date_time)],
 ['Entry Method',r=>r.entry_method],['Decline Reason',r=>r.decline_reason],
 ['Merchant',r=>r.merchant],['Auth Ref',r=>r.auth_ref],['Card Number',r=>r.card_number,'card'],
 ['Total Sale',r=>dollars(r.total_sale),'money'],['Billable Amount',r=>dollars(r.billable_amount),'money'],
 ['Cardholder',r=>r.cardholder],['Driver#',r=>r.driver_number],['Driver Name',r=>r.driver_name||r.driver],
 ['Vehicle#',r=>r.vehicle_number],['Vehicle Desc',r=>r.vehicle_description||r.vehicle],
 ['Raw VehicleID',r=>r.raw_vehicle_id],['Odometer',r=>r.odometer],['Processed On',r=>sourceDate(r.processed_on)]
];
const customerTransactionColumns=[
 ['Trans #',r=>r.transaction_id,'transaction','transaction_id'],['Received On',r=>sourceDate(r.received_at),'','received_at'],
 ['Card Number',r=>r.card_number,'card','card_number'],['Fuel Quantity',r=>quantity(r.fuel_quantity),'quantity','fuel_quantity'],
 ['Status',r=>r.status,'','status'],['Merchant',r=>r.merchant,'','merchant'],
 ['Cardholder',r=>r.cardholder,'','cardholder'],['Invoice #',r=>r.invoice_number,'','invoice_number'],
 ['Driver #',r=>r.driver_number,'','driver_number'],['Driver Name',r=>r.driver_name,'','driver_name'],
 ['Vehicle #',r=>r.vehicle_number,'','vehicle_number'],['Vehicle Description',r=>r.vehicle_description,'','vehicle_description'],
 ['Auth Ref',r=>r.auth_ref,'','auth_ref'],['Entry Method',r=>r.entry_method,'','entry_method'],['Processed On',r=>sourceDate(r.processed_on),'','processed_on']
];
const customerCardColumns=[
 ['Card Number',r=>r.card_number,'card','card_number'],['Status',r=>r.status,'','status'],
 ['Cardholder',r=>r.cardholder,'','cardholder'],['Card Type',r=>r.card_type,'','card_type'],
 ['Assigned To',r=>r.assigned_to,'','assigned_to'],['Driver #',r=>r.driver_no,'','driver_no'],
 ['Vehicle #',r=>r.vehicle_no,'','vehicle_no'],['Last Used On',r=>sourceDate(r.last_used_on),'','last_used_on']
];
function customerCardCells(r,index){return customerCardColumns.map(([,value,type])=>{
 const text=esc(value(r)??'—')||'—';
 return type==='card'?'<button type="button" class="iv-link fleet-card-link" data-fleet-card="'+index+'">'+text+'</button>':text;
});}
function customerSourceFields(value){return Object.entries(value||{}).filter(([key,value])=>!['Details','Taxes'].includes(key)&&!/amount|price|sale|billable|cost|fee|discount|tax/i.test(key)&&value!=null&&value!==''&&typeof value!=='object').map(([key,value])=>[fieldLabel(key),fieldValue(key,value)]);}
function sourceFields(row){return customerSourceFields(row.source);}
function productGroups(row){return (row.source?.Details||[]).map((product,index)=>({
 title:'Product '+(index+1)+' - '+(product.ProductName||'Details'),rows:customerSourceFields(product)
}));}
function productsMarkup(row){
 const products=row.source?.Details||[];if(!products.length)return '<p>No product details were supplied for this transaction.</p>';
 const rows=products.map(p=>'<tr>'+[p.ProductName,p.ProductCode,quantity(p.Quantity),p.ProductCategory].map(v=>'<td>'+esc(v??'—')+'</td>').join('')+'</tr>').join('');
 return '<h3>Products and quantities</h3><div class="iv-table-wrap fleet-product-table"><table data-auto-pdf="false"><thead><tr>'+['Product','Code','Quantity','Category'].map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div><details class="fleet-product-info"><summary>More product details</summary>'+productGroups(row).map(group=>'<h4>'+esc(group.title)+'</h4><dl class="iv-classic-fields fleet-detail-fields">'+group.rows.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>').join('')+'</details>';
}
function customerTransactionCells(r,index){return customerTransactionColumns.map(([,value,type])=>{
 const text=esc(value(r)??'—')||'—';
 return type==='transaction'&&r.transaction_id?'<button type="button" class="iv-link fleet-transaction-link" data-fleet-transaction="'+index+'">'+text+'</button>':type==='card'?'<strong class="fleet-card-number">'+text+'</strong>':type==='money'?'<span class="fleet-money">'+text+'</span>':text;
});}
function adminTransactionCells(r,index){return adminTransactionColumns.map(([,value,type])=>{
 const text=esc(value(r)??'—')||'—';
 return type==='transaction'&&r.transaction_id?'<button type="button" class="iv-link fleet-transaction-link" data-fleet-transaction="'+index+'">'+text+'</button>':type==='card'?'<strong class="fleet-card-number">'+text+'</strong>':type==='money'?'<span class="fleet-money">'+text+'</span>':text;
});}
function fleetPdfData(kind,items){
 const account=r=>(r.account_number||'Unmatched')+(r.needs_review?' (Needs account review)':'');
 if(kind==='cards')return {headers:['Portal account','Card number','Status','Cardholder','Assigned to','Driver / Vehicle'],rows:items.map(r=>[account(r),r.card_number,r.status,r.cardholder,r.assigned_to||'—',[r.driver_no||'—',r.vehicle_no||'—'].join(' / ')])};
 return {headers:['Portal account','Transaction / Invoice','Total Sale','Billable Amount','Dates / Location','Card number','Cardholder','Status / Type','Entry / Auth Ref','Driver / Vehicle'],rows:items.map(r=>[account(r),r.transaction_id+' / Invoice: '+(r.invoice_number||'—'),dollars(r.total_sale),dollars(r.billable_amount),['Local: '+sourceDate(r.local_date_time),'Received: '+central(r.received_at),r.processed_on?'Processed: '+sourceDate(r.processed_on):'',r.posted_on?'Posted: '+sourceDate(r.posted_on):'',[r.merchant,r.merchant_city].filter(Boolean).join(', ')].filter(Boolean).join('; '),r.card_number,r.cardholder,[r.status,r.transaction_type,r.decline_reason].filter(Boolean).join(' / '),'Entry method: '+(r.entry_method||'—')+' / Auth Ref: '+(r.auth_ref||'—'),driverVehicleDetails(r).join('; ')])};
}
function fleetSortKeys(kind,admin){
 if(!admin)return (kind==='cards'?customerCardColumns:customerTransactionColumns).map(column=>column[3]);
 const all=['received_at','transaction_id','local_date_time','entry_method','decline_reason','merchant','auth_ref','card_number','total_sale','billable_amount','cardholder','driver_number','driver_name','vehicle_number','vehicle_description','raw_vehicle_id','odometer','processed_on'];
 const keys=kind==='cards'?['card_number','status','cardholder','assigned_to','driver_no']:admin?all:[1,0,3,5,6,7,8,10,11,12,13,14,17].map(i=>all[i]);
 return admin?['account_number',...keys]:keys;
}
function fleetSkeleton(kind,admin){
 const headers=!admin?(kind==='cards'?customerCardColumns:customerTransactionColumns).map(([label])=>label):kind==='transactions'?adminTransactionColumns.map(([label])=>label):['Card number','Status','Cardholder','Assigned to','Driver / Vehicle'];
 if(admin)headers.unshift('Portal account');
 const row=(heading,index)=>'<div class="fleet-skeleton-row">'+headers.map((label,column)=>heading?'<div class="fleet-skeleton-heading">'+esc(label)+'</div>':'<div class="fleet-skeleton-cell"><span class="fleet-skeleton-bar" style="width:'+([72,85,60][(column+index)%3])+'%"></span></div>').join('')+'</div>';
 return '<div class="fleet-skeleton" aria-hidden="true" style="--fleet-skeleton-columns:'+headers.length+'">'+row(true,0)+Array.from({length:5},(_,i)=>row(false,i)).join('')+'</div>';
}

function pullTimingMarkup(data){
 const h=data.latest,active=['collecting','uploading'].includes(h?.state);
 const start=Date.parse(h?.started_at),end=active?Date.now():Date.parse(h?.updated_at);
 let duration='Not available';
 if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start){
  const seconds=Math.floor((end-start)/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
  duration=(hours?hours+'h ':'')+minutes+'m '+seconds%60+'s'+(active?' elapsed':'');
 }
 const control=data.control||{},running=active||(control.lease_until&&Date.parse(control.lease_until)>Date.now());
 const next='Off — manual only';
 const note=running?'A requested pull is currently in progress.':control.requested_at?'Manual sync queued — waiting for the sync service.':'Click Sync Now when you want to retrieve data.';
 return '<div class="fleet-pull-timings"><div><span>'+(active?'Current pull duration':'Last pull duration')+'</span><strong>'+esc(duration)+'</strong></div><div><span>Last successful pull</span><strong>'+esc(central(data.last_success?.completed_at))+'</strong></div><div><span>'+'Automatic pulls'+'</span><strong>'+esc(next)+'</strong>'+(note?'<span class="fleet-next-pull-note">'+esc(note)+'</span>':'')+'</div></div>';
}
function syncButtonState(control={},dirty=false,pending=false){
 const running=!!(control.lease_until&&Date.parse(control.lease_until)>Date.now());
 return {disabled:dirty||pending||!!control.requested_at||running,
  label:pending?'Queuing…':running?'Syncing…':control.requested_at?'Sync queued':'Sync Now',
  detail:dirty?'Save settings before requesting a sync.':pending?'The sync request is being submitted.':running?'A sync is already running.':control.requested_at?'A manual sync is already queued. It will start when the sync service checks in.':''};
}
function healthMarkup(data){
 const h=data.latest,success=data.last_success;
 let state=h?.state||'unknown',title='No data-pull status received yet.',detail='';
 if(state==='complete')title='Data pulled successfully';
 if(state==='collecting')title='Pulling data from Intevacon…';
 if(state==='uploading')title='Publishing collected data…';
 if(state==='failed'){title='Data pull failed';detail=h.error||'The sync service did not provide a reason. Check its status and logs.';}
 const time=h?.updated_at;
 const overdue=false;
 if(overdue){title='No recent sync report';state='overdue';detail='No update has been received within the expected sync interval. Check the selected sync service and its connection. No recent completion has been reported.'+(h.state==='failed'?' Last reported failure: '+(h.error||'Unknown'):'');}
 if(!h&&success){state='complete';title='Data pulled successfully';}
 if(state==='failed')detail=(h.error||'The pull did not complete.')+' Automatic retries are off. Click Sync Now to try again.';
 const active=state==='collecting'||state==='uploading';
 const label=state==='collecting'?'Step 1 of 2 · Pulling data':state==='uploading'?'Step 2 of 2 · Publishing data':state==='complete'?'Sync complete':state==='failed'?'Sync failed':state==='overdue'?'Waiting for a new sync report':'Waiting for first sync';
 const bar=`<div class="fleet-sync-progress" data-progress-state="${state}"><span class="fleet-sync-progress-label">${esc(label)}</span><div class="fleet-sync-track" ${active?'role="progressbar" aria-label="'+esc(label)+'"':state==='complete'?'role="progressbar" aria-label="Sync complete" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"':'aria-hidden="true"'}><span class="fleet-sync-fill"></span></div></div>`;
 return `<div class="fleet-health-heading"><span class="fleet-health-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7.5" ry="3"></ellipse><path d="M4.5 5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5M4.5 11v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"></path><path d="M15.5 8.5h5m-2.2-2.2 2.2 2.2-2.2 2.2"></path></svg></span><strong>${esc(title)}</strong></div>${bar}${time?`<span>Last report: ${esc(central(time))}</span>`:''}${detail?`<p>${esc(detail)}</p>`:''}${pullTimingMarkup(data)}${success?`<span>${Number(success.cards_expected).toLocaleString()} cards · ${Number(success.transactions_expected).toLocaleString()} transactions</span>`:''}`;
}
function mount(root,admin){
 let controlDirty=false;
 let lastControl={},syncRequestPending=false;
 let sortKey='',sortDirection='asc';
 let kind='cards',page=1,serial=0,controller=null,loaded=false,exporting=false,lastSync=null,loadedQuery=null,refreshing=false;
 let customerRetry=null,customerNotice='',customerNoticeError=false,lastLiveState=null,customerRequest=null,customerRequestPending=false,customerRangePreset=true;
 root.classList.add('wooten-fleet');
 root.innerHTML=`${admin?'<section class="fleet-health" data-health role="status" aria-live="polite">Loading sync status…</section>':''}${admin?'<section class="fleet-sync-controls" aria-label="Sync controls"><button type="button" class="primary" data-sync-now>Sync Now</button><label>Automatic interval (off) <select data-sync-hours disabled title="Automatic pulls are disabled">'+Array.from({length:12},(_,i)=>'<option value="'+((i+1)*2)+'">'+((i+1)*2)+' hours</option>').join('')+'</select></label><label>Transaction history <select data-sync-days><option value="30">Last 30 days</option><option value="21">Last 3 weeks</option><option value="14">Last 2 weeks</option><option value="7">Last 1 week</option></select></label><button type="button" data-save-schedule>Save settings</button><p data-control-status role="status"></p></section>':''}<div class="fleet-summary"><div class="fleet-stat"><strong data-count>—</strong><span>Cards in latest sync</span></div><div class="fleet-stat"><strong data-active>—</strong><span>Active cards</span></div>${admin?'<div class="fleet-stat" style="grid-column:1/-1"><strong data-pulled-count>—</strong><span data-pulled-label>Transactions in latest successful pull</span><small data-pulled-window></small></div>':''}</div><div class="fleet-tabs" role="group" aria-label="Fleet records"><button type="button" data-kind="cards" aria-pressed="true">Fleet cards</button><button type="button" data-kind="transactions" aria-pressed="false">Transactions</button></div><form class="fleet-toolbar"><label class="fleet-search">Search <input type="search" name="search" placeholder="Search card, transaction, merchant, driver or vehicle" autocomplete="off"></label>${admin?'<label class="fleet-check"><input type="checkbox" name="review"> Needs account review</label>':''}<button type="submit">Search</button><button type="button" data-refresh>Refresh</button></form><p class="fleet-meta" data-meta></p><div class="fleet-message" data-message role="status" aria-live="polite" hidden></div>${admin?'<div class="fleet-export-actions"><button type="button" class="secondary table-pdf-export-button" data-export disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l4 4v16H6z"></path><path d="M14 2v5h5"></path><path d="M9 13h6M9 17h6"></path></svg><span>Export PDF</span></button></div>':''}<div class="fleet-table-wrap" data-table></div><nav class="fleet-pages" aria-label="Fleet table pages" data-pages></nav>${admin?'<details class="fleet-device-panel"><summary>Intevacon synchronization</summary><div data-sync-status></div><div data-owner hidden><p>Create a separate credential for each sync service (office PC or cloud).</p><button type="button" data-create>Create sync credential</button><div data-token hidden></div></div></details>':''}`;
 const get=s=>root.querySelector(s);
 let transactionRows=[],cardRows=[],transactionOpener=null,transactionAccount='',transactionPrintData=null;
 const transactionPdfUrls=[];
 window.addEventListener('pagehide',()=>{transactionPdfUrls.splice(0).forEach(url=>URL.revokeObjectURL(url));});
 const transactionDialog=document.createElement('dialog');
 transactionDialog.className='iv-dialog iv-classic-dialog fleet-transaction-dialog';
 transactionDialog.setAttribute('aria-label','Fleet transaction details');
 document.body.append(transactionDialog);
 transactionDialog.addEventListener('click',e=>{
  const card=e.target.closest('[data-view-card-transactions]');
  if(card){get('[name=search]').value=card.dataset.viewCardTransactions;kind='transactions';page=1;sortKey='';root.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));transactionDialog.close();load({refresh:!customerRequest||customerRequestPending});return;}
  if(e.target.closest('[data-transaction-close]'))transactionDialog.close();
  if(e.target.closest('[data-transaction-print]')&&transactionDialog.open&&transactionPrintData){
   const output=transactionDialog.querySelector('[data-transaction-print-status]');output.textContent='';
   try{
    if(!window.WootenInvoicePdf?.buildDetail)throw Error('The PDF exporter is unavailable. Refresh the page and try again.');
    const blob=window.WootenInvoicePdf.buildDetail(transactionPrintData),url=URL.createObjectURL(blob);
    const tab=window.open(url,'_blank');
    if(!tab){URL.revokeObjectURL(url);throw Error('Please allow pop-ups to open the transaction PDF.');}
    tab.opener=null;transactionPdfUrls.push(url);
   }catch(error){output.textContent=error.message||'The transaction PDF could not be created.';}
  }
 });
 transactionDialog.addEventListener('close',()=>{transactionPrintData=null;transactionDialog.replaceChildren();if(transactionOpener?.isConnected)transactionOpener.focus({preventScroll:true});transactionOpener=null;});
 function openTransaction(row,opener){
  transactionOpener=opener;
  const pdfFields=admin?adminTransactionColumns.filter(([, ,type])=>type!=='transaction').map(([label,value])=>[label,String(value(row)??'—')]):[['Fuel quantity',quantity(row.fuel_quantity)],...sourceFields(row)];
  const split=Math.ceil(pdfFields.length/2);
  const balanceLabel=admin?'Total Sale':'Fuel quantity',balance=admin?dollars(row.total_sale):quantity(row.fuel_quantity);
  transactionPrintData={title:'Fleet Transaction',number:String(row.transaction_id||''),meta:'Intevacon',customerLabel:'Cardholder',customer:row.cardholder||'—',account:'Account # '+(row.account_number||transactionAccount||'Unmatched'),balanceLabel,balance,updated:'Last sync: '+central(lastSync),groups:[{title:'Transaction details',rows:pdfFields.slice(0,split)},{title:'Additional details',rows:pdfFields.slice(split)}]};
  const fields=(admin?adminTransactionColumns:customerTransactionColumns).filter(([, ,type])=>type!=='transaction'&&type!=='money');
  const fieldRows=fields.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value(row)??'—')+'</dd></div>').join('');
  transactionDialog.innerHTML='<header class="iv-head iv-classic-head"><div class="iv-company"><span class="fleet-detail-brand" aria-hidden="true">WO</span><div><strong>WOOTEN OIL CO INC.</strong><p>513 East Sanford Avenue<br>Covington, TN 38019<br>(901) 476-2684<br>support@wootenoil.com</p></div></div><div class="iv-document-heading"><div>Fleet Transaction</div><h2>'+esc(row.transaction_id)+'</h2><p>Intevacon</p></div><button type="button" class="iv-close" data-transaction-close aria-label="Close transaction details">×</button></header><div class="iv-body"><div class="iv-classic-summary"><div><div class="iv-classic-label">Cardholder</div><div class="iv-classic-name">'+esc(row.cardholder||'—')+'</div><p>Card # '+esc(row.card_number||'—')+'</p><p>Account # '+esc(row.account_number||transactionAccount||'Unmatched')+'</p></div><div class="iv-classic-balance"><div class="iv-classic-label">'+esc(balanceLabel)+'</div><div class="iv-classic-amount">'+esc(balance)+'</div>'+(admin?'<p>Billable amount: '+esc(dollars(row.billable_amount))+'</p>':'')+'</div></div><h3>Transaction details</h3><dl class="iv-classic-fields fleet-detail-fields">'+fieldRows+'</dl></div><footer class="iv-foot"><span class="iv-updated">Last sync: '+esc(central(lastSync))+'</span><div class="iv-detail-actions"><button type="button" class="iv-print" data-transaction-print>Print Transaction</button><button type="button" data-transaction-close>Back</button></div></footer><p data-transaction-print-status role="status" style="margin:0;padding:0 24px;color:#9c2525"></p>';
  transactionDialog.showModal();transactionDialog.querySelector('[data-transaction-close]').focus({preventScroll:true});
  if(!admin){
   transactionPrintData.stackedGroups=true;transactionPrintData.groups.push(...productGroups(row));
   const fields=transactionDialog.querySelector('.fleet-detail-fields');
   fields.innerHTML=pdfFields.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('');
   fields.insertAdjacentHTML('afterend',productsMarkup(row));
  }
 }

 function openCard(row,opener){
  transactionOpener=opener;
  const fields=[['Card number',row.card_number],['Card status',row.status],['Card type',row.card_type],['Cardholder',row.cardholder],['Account',transactionAccount],['Customer ID',row.customer_id],['Assigned to',row.assigned_to],['Driver ID',row.driver_id],['Driver number',row.driver_no],['Vehicle ID',row.vehicle_id],['Vehicle number',row.vehicle_no],['Last used on',sourceDate(row.last_used_on)]].map(([label,value])=>[label,value==null||value===''?'—':String(value)]);
  transactionPrintData={title:'Fleet Card',stackedGroups:true,number:row.card_number,meta:'Intevacon card details',customerLabel:'Cardholder',customer:row.cardholder||'—',account:'Account # '+transactionAccount,balanceLabel:'Card status',balance:row.status||'Unknown',updated:'Cards last updated: '+central(lastSync),groups:[{title:'Card details',rows:fields}]};
  transactionDialog.innerHTML='<header class="iv-head iv-classic-head"><div class="iv-company"><span class="fleet-detail-brand" aria-hidden="true">WO</span><div><strong>WOOTEN OIL CO INC.</strong><p>513 East Sanford Avenue<br>Covington, TN 38019<br>(901) 476-2684<br>support@wootenoil.com</p></div></div><div class="iv-document-heading"><div>Fleet Card</div><h2>'+esc(row.card_number)+'</h2></div><button type="button" class="iv-close" data-transaction-close aria-label="Close card details">×</button></header><div class="iv-body"><p>Card details from the latest complete Intevacon website export.</p><dl class="iv-classic-fields fleet-detail-fields">'+fields.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl><button type="button" data-view-card-transactions="'+esc(row.card_number)+'">View card transactions</button></div><footer class="iv-foot"><span class="iv-updated">Cards last updated: '+esc(central(lastSync))+'</span><div class="iv-detail-actions"><button type="button" class="iv-print" data-transaction-print>Print Card</button><button type="button" data-transaction-close>Back</button></div></footer><p data-transaction-print-status role="status"></p>';
  transactionDialog.showModal();transactionDialog.querySelector('[data-transaction-close]').focus({preventScroll:true});
 }

 function updateSyncButton(){
  if(!admin)return;
  const state=syncButtonState(lastControl,controlDirty,syncRequestPending),button=get('[data-sync-now]');
  button.disabled=state.disabled;button.textContent=state.label;button.title=state.detail;
 }
 if(!admin){
  get('.fleet-summary').innerHTML='<div class="fleet-stat"><strong data-count>—</strong><span>Cards with activity</span></div><div class="fleet-stat"><strong data-active>—</strong><span>Transactions in selected dates</span></div><div class="fleet-stat"><strong data-quantity>—</strong><span>Reported fuel quantity</span></div>';
  const toolbar=document.createElement('div');toolbar.className='fleet-customer-toolbar';
  root.prepend(toolbar);toolbar.append(get('.fleet-tabs'),get('.fleet-toolbar'));
  const search=get('.fleet-search'),input=search.querySelector('input');
  input.setAttribute('aria-label','Search fleet cards and transactions');
  search.replaceChildren(input);
  get('[data-table]').after(get('[data-meta]'));
  const dates=document.createElement('section');dates.className='fleet-live-dates';dates.setAttribute('aria-label','Transaction dates');
  dates.innerHTML='<label for="customerFleetFrom">From<input id="customerFleetFrom" name="fleetFrom" type="datetime-local" min="2010-01-01T00:00" required></label><label for="customerFleetTo">To<input id="customerFleetTo" name="fleetTo" type="datetime-local" required></label><div class="fleet-live-date-actions"><button type="button" data-load-dates>Load dates</button><button type="button" data-last-30>Last 30 days</button></div><p>Choose up to 92 days. Load dates retrieves current results from Intevacon.</p>';
  toolbar.after(dates);
  const live=document.createElement('p');live.className='fleet-live-status';live.setAttribute('data-live-status','');live.setAttribute('role','status');live.hidden=true;
  get('[data-table]').before(live);
  resetCustomerDates();
  get('[data-load-dates]').addEventListener('click',()=>{customerRangePreset=false;page=1;load({refresh:true});});
  get('[data-last-30]').addEventListener('click',()=>{resetCustomerDates();page=1;load({refresh:true});});
  for(const field of dates.querySelectorAll('input'))field.addEventListener('input',()=>{customerRangePreset=false;});

 }

 {
  const pager=get('[data-pages]');pager.setAttribute('data-wooten-pager','');
  const resizePager=()=>pager.classList.toggle('wooten-pager-compact',pager.getBoundingClientRect().width<620);
  new ResizeObserver(resizePager).observe(pager);resizePager();
 }
 // Customer progress/errors and the retrieved timestamp share one visible status area.
 const message=(value,error=false)=>{const el=get('[data-message]');el.textContent=value;el.hidden=!value;el.classList.toggle('error',error);if(!admin){const live=get('[data-live-status]');live.hidden=!!value||lastLiveState!=='success'||!live.textContent;}};
 async function api(path,options={}){
  const headers={Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})};
  if(admin){const key=document.getElementById('adminKey')?.value?.trim();if(!key)throw Error('Sign in as an administrator.');headers['X-Admin-Key']=key;}
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...headers,...options.headers}});
  const data=await response.json().catch(()=>({}));if(!response.ok||!data.success)throw Error(data.error||'Fleet records could not be loaded.');return data;
 }
 function display(data){
  transactionRows=kind==='transactions'?data.items:[];cardRows=kind==='cards'?data.items:[];transactionAccount=data.account_number||'';
  lastSync=data.last_sync;page=data.page||page;
  const websiteCards=!admin&&data.card_source==='website';
  lastLiveState=websiteCards?(data.last_sync?'success':'not_loaded'):data.live?.state??null;
  if(data.live?.state==='success')customerRequestPending=false;
  get('[data-count]').textContent=data.summary.cards.toLocaleString();get('[data-active]').textContent=(admin||websiteCards?data.summary.active:data.summary.transactions).toLocaleString();
  const window=data.window_from?` · Transactions received ${(admin?central:sourceDate)(data.window_from)} – ${(admin?central:sourceDate)(data.window_to)}`:'';
  get('[data-meta]').textContent=`Last sync: ${central(data.last_sync)}${window}${data.card_scope==='active'?' · Card export includes active cards only.':''}`;
  if(!admin){
   const live=get('[data-live-status]');live.hidden=lastLiveState!=='success'||!get('[data-message]').hidden;
   live.textContent=websiteCards?(data.last_sync?'Cards last updated: '+central(data.last_sync):''):data.live?.state==='success'?'Fresh from Intevacon · Retrieved '+central(data.live.fetchedAt):'';
   live.dataset.state=lastLiveState||'not_loaded';
  }
  if(websiteCards)get('[data-meta]').textContent=data.notice;
  if(!admin&&!websiteCards){get('[data-quantity]').textContent=quantity(data.summary.fuel_quantity);get('[data-meta]').textContent+=' · '+data.summary.quantity_reported_count+' of '+data.summary.transactions+' transactions report fuel quantity. Dates use MM/DD/YYYY hh:mm AM/PM; transaction times follow Intevacon’s reported time.';}
  const headers=!admin?(kind==='cards'?customerCardColumns:customerTransactionColumns).map(([label])=>label):kind==='transactions'?adminTransactionColumns.map(([label])=>label):['Card number','Status','Cardholder','Assigned to','Driver / Vehicle'];
  if(admin)headers.unshift('Portal account');
  let html='<table data-auto-pdf="false" data-pdf-table-name="'+(kind==='cards'?'Fleet Cards':'Fleet Transactions')+'"><thead><tr>'+headers.map((h,i)=>{const key=fleetSortKeys(kind,admin)[i];return `<th scope="col" data-fleet-align="${['total_sale','billable_amount','fuel_quantity','transaction_count'].includes(key)?'right':'left'}" data-no-sort aria-sort="${sortKey===key?(sortDirection==='asc'?'ascending':'descending'):'none'}"><button type="button" class="wo-table-sort-button" data-fleet-sort="${key}" aria-label="Sort by ${esc(h)}"><span class="wo-table-sort-label">${esc(h)}</span><span class="wo-table-sort-icon" aria-hidden="true"></span></button></th>`;}).join('')+'</tr></thead><tbody>';
  for(const r of data.items){
   let cells=[];if(admin)cells.push(esc(r.account_number||'Unmatched')+(r.needs_review?'<small>Needs account review</small>':''));
   if(kind==='cards'&&!admin)cells.push(...customerCardCells(r,data.items.indexOf(r)));
   else if(kind==='cards')cells.push('<strong class="fleet-card-number">'+esc(r.card_number)+'</strong>',badge(r.status),esc(r.cardholder),esc(r.assigned_to||'—'),`${esc(r.driver_no||'—')} / ${esc(r.vehicle_no||'—')}`);
   else if(admin)cells.push(...adminTransactionCells(r,data.items.indexOf(r)));
   else cells.push(...customerTransactionCells(r,data.items.indexOf(r)));
   html+='<tr>'+cells.map((c,i)=>'<td data-fleet-align="'+(['total_sale','billable_amount','fuel_quantity','transaction_count'].includes(fleetSortKeys(kind,admin)[i])?'right':'left')+'">'+c+'</td>').join('')+'</tr>';
  }
  if(!data.items.length)html+=`<tr><td colspan="${headers.length}" class="fleet-empty">${!admin?(websiteCards?(data.last_sync?'No matching cards in your account.':'Your cards will appear after the first complete card sync.'):(data.last_sync?'No matching fleet records in the selected dates.':'No fresh results loaded for these dates yet.')):(data.last_sync?'No matching fleet records.':'Your fleet information will appear after the first successful sync.')}</td></tr>`;
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
  if(sortKey){query.set('sort',sortKey);query.set('direction',sortDirection);}
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
 function resetCustomerDates(){
  if(admin)return;
  customerRangePreset=true;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const to=`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  get('[name=fleetTo]').value=to;get('[name=fleetFrom]').value=new Date(Date.parse(to+':00Z')-30*86400000).toISOString().slice(0,16);
 }
 function startCustomerRequest(){
  if(customerRangePreset)resetCustomerDates();
  const from=get('[name=fleetFrom]'),to=get('[name=fleetTo]');
  if(!from.reportValidity()||!to.reportValidity())return false;
  const elapsed=Date.parse(to.value+':00Z')-Date.parse(from.value+':00Z');
  if(!Number.isFinite(elapsed)||elapsed<=0||elapsed>92*86400000){message('Choose a To date after From, covering no more than 92 days.',true);return false;}
  customerRequest={from:from.value,to:to.value,view:crypto.randomUUID()};customerRequestPending=true;
  return true;
 }
 function customerRefreshState(refresh){
  if(admin)return;
  clearTimeout(customerRetry);customerRetry=null;
  customerNotice=refresh?.state==='success'?'':refresh?.message||'';customerNoticeError=refresh?.state==='error';
  if(['error','success','expired'].includes(refresh?.state))customerRequestPending=false;
  const button=get('[data-refresh]'),waiting=refresh?.state==='waiting';
  button.disabled=waiting;button.textContent=waiting?'Waiting…':'Refresh';button.toggleAttribute('aria-busy',waiting);
  if(waiting){
   const retry=()=>{
    if(document.hidden||root.hasAttribute('aria-busy')){customerRetry=setTimeout(retry,5000);return;}
    customerRetry=null;load({refresh:true,background:true});
   };
   customerRetry=setTimeout(retry,Math.max(1000,Math.min(1800000,Number(refresh.retryAfterSeconds||5)*1000)));
  }
 }
 function customerView(){
  if(admin)return;
  const cards=kind==='cards';root.dataset.kind=kind;
  get('.fleet-live-dates').hidden=cards;
  get('[data-count]').nextElementSibling.textContent=cards?'Cards in your account':'Cards with activity';
  get('[data-active]').nextElementSibling.textContent=cards?'Active cards':'Transactions in selected dates';
  get('[data-quantity]').parentElement.hidden=cards;
  get('[data-refresh]').title=cards?'Reload the saved card list. Card collection runs separately.':'Retrieve fresh transactions from Intevacon.';
 }
 async function load({refresh=false,background=false}={}){
  const cardsView=!admin&&kind==='cards',apiRefresh=refresh&&!admin&&!cardsView;
  customerView();
  if(cardsView)customerRefreshState(null);
  if(apiRefresh&&!background&&!startCustomerRequest()){const button=get('[data-refresh]');button.disabled=false;button.textContent='Refresh';button.removeAttribute('aria-busy');return;}
  if(admin)get('[data-export]').disabled=true;
  if(!admin&&!apiRefresh&&!customerRetry){const button=get('[data-refresh]');button.disabled=false;button.textContent='Refresh';button.removeAttribute('aria-busy');}
  if(apiRefresh){clearTimeout(customerRetry);customerRetry=null;const button=get('[data-refresh]');button.disabled=true;button.textContent='Refreshing…';button.setAttribute('aria-busy','true');}
  controller?.abort();controller=new AbortController();const ticket=++serial;loaded=true;
  if(!background){get('[data-table]').innerHTML=fleetSkeleton(kind,admin);get('[data-pages]').innerHTML='';}
  message(cardsView?'Loading your fleet cards…':apiRefresh?'Checking your fleet activity with Intevacon…':'Loading fleet records…');root.setAttribute('aria-busy','true');
  const query=background&&loadedQuery?new URLSearchParams(loadedQuery):new URLSearchParams({kind,page:String(page),search:get('[name=search]').value});
  if(admin&&get('[name=review]').checked)query.set('review','1');
  if(sortKey){query.set('sort',sortKey);query.set('direction',sortDirection);}
  if(!admin&&!cardsView&&customerRequest)query.set('view',customerRequest.view);
  if(!admin)loadedQuery=query.toString();
  try{
   const path=admin?'/api/admin/fleet/data':cardsView?'/api/customer/fleet/cards':'/api/customer/fleet';
   const data=await api(path+'?'+query,{signal:controller.signal,...(apiRefresh?{method:'POST',body:JSON.stringify(customerRequest)}:{})});
   if(ticket!==serial)return;loadedQuery=query.toString();display(data);
   if(cardsView){message(data.last_sync?'':data.notice);return;}
   if(!admin&&(apiRefresh||data.refresh||data.live?.state==='success')){
    const waiting=customerRequestPending&&!apiRefresh&&data.live?.state==='not_loaded';
    customerRefreshState(waiting?{state:'waiting',retryAfterSeconds:5,message:'Waiting for your fresh API request…'}:data.refresh||(data.live?.state==='success'?{state:'success'}:null));
   }
   message(admin?'':customerNotice,customerNoticeError);
  }catch(e){if(ticket===serial&&e.name!=='AbortError'){if(!background)get('[data-table]').innerHTML='';if(apiRefresh)customerRefreshState({state:'error',message:e.message});message(e.message,true);}}
  finally{if(ticket===serial){root.removeAttribute('aria-busy');if(cardsView){const button=get('[data-refresh]');button.disabled=false;button.textContent='Refresh';button.removeAttribute('aria-busy');}}}
 }

 // Only replace visible rows when a newly committed sync is available.
 async function refreshAfterSync(){
  if(!loadedQuery||refreshing||exporting||root.hasAttribute('aria-busy'))return;
  refreshing=true;
  const ticket=serial,query=new URLSearchParams(loadedQuery),signal=controller?.signal;
  try{
   const path=admin?'/api/admin/fleet/data':kind==='cards'?'/api/customer/fleet/cards':'/api/customer/fleet';
   let data=await api(path+'?'+query,{signal});
   if(ticket!==serial||exporting||(data.last_sync===lastSync&&(data.card_source==='website'?(data.last_sync?'success':'not_loaded'):data.live?.state??null)===lastLiveState))return;
   if(Number(query.get('page'))>data.pages){
    query.set('page',String(data.pages));
    data=await api(path+'?'+query,{signal});
    if(ticket!==serial||exporting)return;
   }
   const table=get('[data-table]'),left=table.scrollLeft,top=table.scrollTop;
   page=Number(query.get('page'));loadedQuery=query.toString();display(data);
   table.scrollLeft=left;table.scrollTop=top;
   if(!admin&&kind==='cards'){message(data.last_sync?'':data.notice);return;}
   if(!admin&&(data.live?.state==='success'||data.live?.state==='error'||!customerRetry))customerRefreshState(data.refresh||{state:'success',message:'Fresh Intevacon results loaded for the selected dates.'});
   message(admin?'Fleet records refreshed after a successful sync.':customerNotice,customerNoticeError);
  }catch(e){
   // Keep the last successfully loaded rows; the next poll retries.
  }finally{refreshing=false;}
 }
 function clear(){if(!admin){kind='cards';sortKey='';sortDirection='asc';get('[name=search]').value='';root.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind==='cards')));customerView();}lastLiveState=null;customerRequest=null;customerRequestPending=false;if(!admin){customerRefreshState(null);resetCustomerDates();get('[data-live-status]').hidden=true;get('[data-live-status]').textContent='';}transactionPrintData=null;transactionRows=[];cardRows=[];transactionAccount='';if(!admin){get('[data-quantity]').textContent='—';}if(transactionDialog.open)transactionDialog.close();transactionDialog.replaceChildren();if(admin){get('[data-pulled-count]').textContent='—';get('[data-pulled-label]').textContent='Transactions in latest successful pull';get('[data-pulled-window]').textContent='';}controlDirty=false;loadedQuery=null;lastSync=null;if(admin)get('[data-export]').disabled=true;controller?.abort();serial++;loaded=false;page=1;get('[data-table]').innerHTML='';get('[data-pages]').innerHTML='';get('[data-count]').textContent='—';get('[data-active]').textContent='—';get('[data-meta]').textContent='';message('');if(admin){get('[data-sync-status]').innerHTML='';get('[data-health]').textContent='';get('[data-health]').removeAttribute('data-state');get('[data-token]').innerHTML='';get('[data-token]').hidden=true;get('[data-owner]').hidden=true;}}
 root.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.hasAttribute('data-fleet-card')){const row=cardRows[Number(btn.dataset.fleetCard)];if(row)openCard(row,btn);}else if(btn.hasAttribute('data-fleet-transaction')){const row=transactionRows[Number(btn.dataset.fleetTransaction)];if(row)openTransaction(row,btn);}else if(btn.dataset.fleetSort){sortDirection=sortKey===btn.dataset.fleetSort&&sortDirection==='asc'?'desc':'asc';sortKey=btn.dataset.fleetSort;page=1;load();}else if(btn.dataset.kind){sortKey='';sortDirection='asc';kind=btn.dataset.kind;page=1;root.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));load({refresh:!admin&&kind==='transactions'&&(!customerRequest||customerRequestPending)});}else if(btn.dataset.page){page=Number(btn.dataset.page);load();}else if(btn.hasAttribute('data-refresh')){
 if(btn.disabled)return;
 btn.disabled=true;btn.textContent='Refreshing…';btn.setAttribute('aria-busy','true');
 Promise.all([load({refresh:!admin}),...(admin?[status()]:[])]).finally(()=>{
  if(admin){btn.disabled=false;btn.textContent='Refresh';btn.removeAttribute('aria-busy');}
 });
}});
 get('form').addEventListener('submit',e=>{e.preventDefault();page=1;load();});get('[name=review]')?.addEventListener('change',()=>{page=1;load();});
 async function status(){
  const ticket=serial;
  try{const data=await api('/api/admin/fleet/status');if(ticket!==serial)return;
   const completed=data.last_success;
   const count=completed?.transactions_expected;
   get('[data-pulled-count]').textContent=count!=null&&Number.isFinite(Number(count))?Number(count).toLocaleString():'—';
   const from=Date.parse(completed?.window_from),to=Date.parse(completed?.window_to);
   const days=Number.isFinite(from)&&Number.isFinite(to)&&to>=from?Math.round((to-from)/86400000):0;
   get('[data-pulled-label]').textContent='Transactions in latest successful pull'+(days?' · '+periodLabel(days):'');
   get('[data-pulled-window]').textContent=completed?(days?central(completed.window_from)+' – '+central(completed.window_to):'Completed '+central(completed.completed_at)):'No successful pull yet';
   const control=data.control;
   const running=control?.lease_until&&Date.parse(control.lease_until)>Date.now();
   if(control){
    if(!controlDirty){get('[data-sync-hours]').value=String(control.hours);get('[data-sync-days]').value=String(control.window_days||30);}
    lastControl=control;updateSyncButton();
    const cloud=control.runner==='cloud';
    const connected=control.poll_at&&Date.now()-Date.parse(control.poll_at)<3*60000;
    get('[data-control-status]').textContent=(control.requested_at?'Manual sync queued. ':running?'Sync is running. ':'')+'Automatic pulls and scheduled retries are off. Transaction history: '+periodLabel(control.window_days)+'. '+(connected?'The sync service is ready for Sync Now requests.':'Waiting for the sync service to check in.');
   }
   get('[data-owner]').hidden=!window.wootenAdminUser?.owner;
   const health=get('[data-health]');health.innerHTML=healthMarkup(data);
   health.dataset.state=data.latest?.state||(data.last_success?'complete':'unknown');
   get('[data-sync-status]').innerHTML='<p class="fleet-note">'+(data.runs[0]?`Latest run: ${esc(data.runs[0].state)} · ${esc(central(data.runs[0].started_at))}${data.runs[0].error?' · '+esc(data.runs[0].error):''}`:'No sync runs yet.')+'</p>'+data.devices.map(d=>`<div class="fleet-device-row"><span><strong>${esc(d.name)}</strong><small class="fleet-note"> · ${d.active?'Active':'Revoked'} · ${esc(central(d.last_seen))}${d.last_error?' · '+esc(d.last_error):''}</small></span>${d.active&&window.wootenAdminUser?.owner?`<button type="button" data-revoke="${esc(d.id)}">Revoke</button>`:''}</div>`).join('');
   if(data.last_success?.completed_at&&data.last_success.completed_at!==lastSync)await refreshAfterSync();
  }catch(e){if(ticket===serial){get('[data-sync-status]').textContent=e.message;get('[data-health]').textContent='Could not refresh sync status. '+e.message;get('[data-health]').dataset.state='overdue';}}
 }
 if(admin){
  const settingsChanged=()=>{controlDirty=true;updateSyncButton();message('Save settings to apply this history period. Then use Sync Now to pull immediately.');};
  get('[data-sync-hours]').addEventListener('change',settingsChanged);
  get('[data-sync-days]').addEventListener('change',settingsChanged);
  get('[data-save-schedule]').addEventListener('click',async()=>{
   const btn=get('[data-save-schedule]');btn.disabled=true;
   try{await api('/api/admin/fleet/schedule',{method:'POST',body:JSON.stringify({hours:Number(get('[data-sync-hours]').value),window_days:Number(get('[data-sync-days]').value)})});controlDirty=false;message('Settings saved. The selected history will appear after the next successful pull. Use Sync Now to pull immediately.');await status();}
   catch(e){message(e.message,true);}finally{btn.disabled=false;}
  });
  get('[data-sync-now]').addEventListener('click',async()=>{
   const btn=get('[data-sync-now]');
   if(btn.disabled||controlDirty)return;
   const days=Number(get('[data-sync-days]').value);
   if(!window.confirm('Start a fleet cards and transactions sync?\n\nPull the latest cards and the last '+days+' days of transactions. '+(lastControl.runner==='cloud'?'Cloud will start on its next check, normally within one minute. You may close this page.':'Keep the sync PC powered on and signed in.')+'\n\nAutomatic pulls and scheduled retries are off. This request starts one pull.'))return;
   syncRequestPending=true;updateSyncButton();
   try{await api('/api/admin/fleet/request-sync',{method:'POST',body:'{}'});lastControl={...lastControl,requested_at:lastControl.requested_at||new Date().toISOString()};message('Sync requested. '+(lastControl.runner==='cloud'?'Cloud':'The PC')+' will start when it next checks in.');await status();}
   catch(e){message(e.message,true);}
   finally{syncRequestPending=false;updateSyncButton();}
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
 dialog.innerHTML='<div class="fleet-modal-inner"><header class="fleet-modal-header"><div class="details-toolbar"><button type="button" class="dashboard-back" data-close aria-label="Back to Dashboard"><svg class="dashboard-back-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg><span>Dashboard</span></button><span class="dashboard-form-name"><span class="dashboard-form-separator" aria-hidden="true">&#92;</span><span id="fleetModalTitle">Fleet Cards &amp; Transactions</span></span></div></header><div class="fleet-modal-body"><div id="customerFleetRoot"></div></div><footer class="fleet-modal-footer"><span>View your cards and fuel activity</span><button type="button" data-close>Done</button></footer></div>';
 document.body.appendChild(dialog);const view=mount(dialog.querySelector('#customerFleetRoot'),false);
 const searchField=dialog.querySelector('input[name="search"]');
 searchField.autofocus=true;
 open.addEventListener('click',()=>{view.clear();dialog.showModal();searchField.focus({preventScroll:true});view.load({refresh:true});});
 const poll=()=>{if(dialog.open&&!document.hidden)view.refreshAfterSync();};
 setInterval(poll,30000);document.addEventListener('visibilitychange',poll);
 dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
 dialog.addEventListener('close',()=>view.clear());
 window.addEventListener('wooten:payment-account',()=>{view.clear();if(dialog.open)dialog.close();});
 document.addEventListener('click',event=>{if(event.target.closest('#dashboardLogout,#portalLogout,#desktopCustomerLogout,#mobileCustomerLogout')){view.clear();if(dialog.open)dialog.close();}},true);
}
})();
