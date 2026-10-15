/* Ver771: stop the selected sync queue on any failure; retry only unfinished sources. */
(()=>{
'use strict';
const ids=['statementPreview','statementGenerateSend','scheduleGenerateMonthly','scheduleRunMonthly','scheduleTestMonthly','scheduleGenerateWeekly','scheduleRunWeekly','scheduleTestWeekly','schedulePreviewMidmonth','scheduleRunMidmonth','scheduleTestMidmonth','scheduleTestAll'];
const sources=[['mas90','MAS 90 — Customers, payments & invoices'],['cards','Intevacon — Customer fleet cards'],['transactions','Intevacon — Transactions']];
let target=null,bypass=null,busy=false,done=false,session='',epoch=0,currentUsername='';
let cancelRequested=false,cancelTask=null,activeSource=null,activeRequestId=null,activeRunPromise=null,startSent=false,startReady=Promise.resolve(),releaseStart=null;
let activeReport=null;const sourceSummaries={};
const cancelled=()=>{if(cancelRequested)throw Error('Synchronization cancelled.');};
const started=()=>{releaseStart?.();releaseStart=null;};
const key=()=>document.getElementById('adminKey')?.value.trim()||'';
const dialog=document.createElement('dialog');dialog.id='woStatementSync';dialog.setAttribute('aria-labelledby','woStatementSyncTitle');
dialog.innerHTML='<header><h2 id="woStatementSyncTitle">Update data before continuing</h2><button type="button" data-close aria-label="Cancel">×</button></header><div class="ss-body"><p data-action></p><p>Select the data to synchronize first. Leave everything unchecked to use saved data.</p><div data-rows></div><div data-password hidden><label>Signed-in admin: <strong data-username>Checking…</strong></label><label>Your admin password<input type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" data-master></label><small>Enter the password for the username shown above. Customers, payments, and invoices synchronize together.</small></div><p data-message role="status" aria-live="polite"></p></div><footer><button type="button" data-cancel>Cancel</button><button type="button" data-apply>Apply</button></footer>';
document.body.append(dialog);const q=s=>dialog.querySelector(s);const rows={};
for(const [id,label] of sources){
 const row=document.createElement('section');row.className='ss-row ss-accordion';row.dataset.source=id;
 row.innerHTML='<div class="ss-accordion-head"><label class="ss-choice ss-switch-label" aria-label="Select sync"><span class="ss-toggle"><input type="checkbox"><span class="ss-track" aria-hidden="true"></span></span></label><span class="ss-source-icon" aria-hidden="true"></span><button class="ss-source-copy" type="button" data-tree-label><span data-choice-label></span><small data-source-caption></small></button><span class="ss-status-badge" data-badge>Saved data</span><button class="ss-accordion-toggle" type="button" data-tree-toggle aria-expanded="false" aria-label="Expand sync details"><span aria-hidden="true">⌄</span></button></div><div class="ss-progress"><small data-last>Last updated: Checking…</small><progress max="100" value="0" aria-label="'+label+' progress"></progress><small data-status>Use saved data</small></div><div class="ss-details" data-details hidden></div>';
 row.querySelector('[data-choice-label]').textContent=label;row.querySelector('.ss-switch-label').setAttribute('aria-label','Select '+label+' for synchronization');
 row.querySelector('[data-source-caption]').textContent=id==='mas90'?'Customers, payments, and open invoices':id==='cards'?'Customer card lists and assignments':'Fuel card transactions';
 row.querySelector('.ss-source-icon').innerHTML=id==='mas90'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></svg>':id==='cards'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20M6 16h5"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8"/></svg>';
 q('[data-rows]').append(row);
 rows[id]={node:row,input:row.querySelector('input'),last:row.querySelector('[data-last]'),progress:row.querySelector('progress'),status:row.querySelector('[data-status]'),badge:row.querySelector('[data-badge]'),details:row.querySelector('[data-details]'),toggle:row.querySelector('[data-tree-toggle]'),done:false,loaded:false};
 rows[id].input.addEventListener('change',()=>{if(id==='mas90')q('[data-master]').value='';done=false;q('[data-apply]').textContent='Apply';rows[id].status.textContent=rows[id].input.checked?'Ready to synchronize':'Use saved data';q('[data-password]').hidden=!rows.mas90.input.checked;updateBadge(id);});
 rows[id].toggle.addEventListener('click',()=>{const expanded=rows[id].toggle.getAttribute('aria-expanded')==='true';setExpanded(id,!expanded);if(!expanded&&!rows[id].loaded&&id!=='transactions')loadExistingSnapshot(id);});
 row.querySelector('[data-tree-label]').addEventListener('click',()=>rows[id].toggle.click());
}
function setExpanded(id,value){const r=rows[id];r.details.hidden=!value;r.toggle.setAttribute('aria-expanded',String(value));r.toggle.setAttribute('aria-label',(value?'Collapse':'Expand')+' '+sources.find(x=>x[0]===id)[1]+' details');}
function updateBadge(id){const r=rows[id];const st=r.status.textContent||'';const value=r.done?'Completed':st.startsWith('Failed')?'Failed':st.startsWith('Cancelled')?'Cancelled':r.input.checked?'Selected':'Saved data';r.badge.textContent=value;r.badge.dataset.state=value.toLowerCase().replace(/\s/g,'-');}
// Ver1087 — Transaction-sync reports. Only this statement workflow requests audited ingestion.
// Intevacon Transactions retains the saved per-run audits introduced in Ver1087.
const reportContainer=rows.transactions.details;
reportContainer.innerHTML='<div class="ss-report-content" data-report-content hidden></div><div class="ss-history-block"><button type="button" data-history-reports>Previous sync reports</button><div data-reports-list hidden></div></div>';
const reportContent=reportContainer.querySelector('[data-report-content]');
const historyList=reportContainer.querySelector('[data-reports-list]');
const safeText=value=>String(value==null?'':value);
const cell=(tag,text)=>{const el=document.createElement(tag);el.textContent=safeText(text);return el;};
function reportDates(report){const start=report?.from||'',end=report?.to||'';return {from:start?start.replace('T',' ')+' CT':'Unavailable',to:end?end.replace('T',' ')+' CT':'Unavailable'};}
function makeReportGrid(report){
 const grid=document.createElement('div');grid.className='ss-report-grid';
 const stats=report.stats||{},entries=[['Received from API',stats.received],['New transactions',stats.added],['Updated existing',stats.updated],['Unchanged / skipped',stats.unchanged],['Failed / rejected',stats.failed],['Saved (new + updated)',stats.saved]];
 for(const [label,value] of entries){const tile=document.createElement('div');tile.className='ss-report-stat';tile.append(cell('small',label),cell('strong',value===undefined?'—':Number(value).toLocaleString()));grid.append(tile);}
 return grid;
}
function renderReport(report,expand=true){
 if(!report)return;
 activeReport=report;rows.transactions.loaded=true;reportContent.replaceChildren();
 const heading=cell('h4','Intevacon Transaction Sync Report');reportContent.append(heading);
 const state=cell('p',report.status==='completed'?'Completed successfully':report.status==='completed_with_errors'?'Completed with rejected records — statement processing stopped':report.status==='failed'?'Failed — statement processing stopped':report.status==='cancelled'?'Cancelled':'Processing');state.className='ss-report-result';reportContent.append(state);
 if(report.error){const reason=cell('p','Error: '+report.error);reason.className='ss-report-error';reportContent.append(reason);}
 reportContent.append(makeReportGrid(report));
 const dates=reportDates(report),period=cell('p',`Processed period: ${dates.from} → ${dates.to}`);period.className='ss-report-dates';reportContent.append(period);
 reportContent.append(cell('p','Run: '+safeText(report.id)+' · Finished: '+date(report.completedAt)));
 if(report.stats?.failed){
  const failed=cell('h5','Rejected transaction details');reportContent.append(failed);
  const table=document.createElement('table');table.className='ss-report-failure-table';
  const head=document.createElement('thead'),tr=document.createElement('tr');for(const name of ['Transaction ID','Customer ID','Card','Reason'])tr.append(cell('th',name));head.append(tr);table.append(head);
  const tbody=document.createElement('tbody');for(const issue of report.failures||[]){const r=document.createElement('tr');for(const field of ['transaction_id','customer_id','card_number','reason'])r.append(cell('td',issue[field]||'—'));tbody.append(r);}table.append(tbody);reportContent.append(table);
  if(report.failuresTruncated)reportContent.append(cell('p',`${report.failuresTruncated} more rejected transactions are not shown. Review the full run status.`));
 }
 const actions=document.createElement('div');actions.className='ss-report-export';actions.innerHTML='<button type="button" data-report-xlsx>Export Excel</button><button type="button" data-report-pdf>Print / Save PDF</button>';reportContent.append(actions);
 reportContent.hidden=false;if(expand)setExpanded('transactions',true);
}
function resetReport(){activeReport=null;reportContent.hidden=true;reportContent.replaceChildren();historyList.replaceChildren();historyList.hidden=true;for(const [id,r] of Object.entries(rows)){r.loaded=false;delete sourceSummaries[id];if(id!=='transactions')r.details.replaceChildren();setExpanded(id,false);}}
reportContainer.querySelector('[data-history-reports]').addEventListener('click',async()=>{
 if(!historyList.hidden){historyList.hidden=true;return;}
 historyList.replaceChildren(cell('p','Loading saved reports…'));historyList.hidden=false;setExpanded('transactions',true);
 try{const result=await api('fleet/results?history=1'),reports=result.reports||[];historyList.replaceChildren();
  if(!reports.length){historyList.append(cell('p','No previous statement synchronization reports.'));return;}
  for(const saved of reports){const button=cell('button',`${date(saved.completedAt)} · ${saved.status} · ${saved.received??'—'} received`);button.type='button';button.className='ss-report-history-item';button.addEventListener('click',async()=>{button.disabled=true;try{const detail=await api('fleet/results?run_id='+encodeURIComponent(saved.id));renderReport(detail.report);historyList.hidden=true;}catch(e){historyList.replaceChildren(cell('p','Cannot open report: '+e.message));}finally{button.disabled=false;}});historyList.append(button);}
 }catch(e){historyList.replaceChildren(cell('p','Could not load previous reports: '+e.message));}
});
function reportRows(report){
 const s=report.stats||{},d=reportDates(report);
 return [['Field','Value'],['Run ID',report.id||''],['Status',report.status||''],['From (Central)',d.from],['To (Central)',d.to],['Completed (Central)',date(report.completedAt)],['Received',s.received??''],['New',s.added??''],['Updated',s.updated??''],['Unchanged / skipped',s.unchanged??''],['Failed / rejected',s.failed??''],['Saved (new + updated)',s.saved??''],['Error',report.error||'']];
}
function downloadExcel(report){if(!window.XLSX){alert('Excel export library is unavailable. Reload the portal and try again.');return;}
 const wb=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(reportRows(report));XLSX.utils.book_append_sheet(wb,sheet,'Summary');
 const errors=[['Transaction ID','Customer ID','Masked Card','Failure Reason','Retry available'],...(report.failures||[]).map(f=>[f.transaction_id,f.customer_id,f.card_number,f.reason,f.retryable?'Yes':'No'])];
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(errors),'Rejected Records');
 XLSX.writeFile(wb,'Intevacon-Statement-Sync-'+(report.completedAt||'').slice(0,10)+'-'+(report.id||'report').slice(0,8)+'.xlsx');
}
const htmlEscape=v=>safeText(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function printReport(report){const win=window.open('','_blank');if(!win){alert('Allow popups to print or save this synchronization report as PDF.');return;}
 const rowHtml=reportRows(report).map(([a,b])=>`<tr><th>${htmlEscape(a)}</th><td>${htmlEscape(b)}</td></tr>`).join('');
 const failedHtml=(report.failures||[]).map(f=>`<tr><td>${htmlEscape(f.transaction_id)}</td><td>${htmlEscape(f.customer_id)}</td><td>${htmlEscape(f.card_number)}</td><td>${htmlEscape(f.reason)}</td></tr>`).join('');
 win.document.write(`<!doctype html><html><head><title>Intevacon Statement Sync Report</title><style>body{font:14px Arial;padding:28px;color:#193953}h1{font-size:21px}h2{font-size:17px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{text-align:left;padding:8px;border-bottom:1px solid #dae5ee;word-break:break-word}th{background:#eef4fa}@media print{body{padding:0}}</style></head><body><h1>Wooten Oil — Intevacon Statement Sync Report</h1><table>${rowHtml}</table><h2>Rejected transactions</h2><table><tr><th>Transaction</th><th>Customer</th><th>Card</th><th>Reason</th></tr>${failedHtml}</table><p>${htmlEscape(report.failuresTruncated||0)} additional rejections omitted from this view.</p></body></html>`);
 win.document.close();win.focus();win.print();
}
reportContent.addEventListener('click',event=>{const b=event.target.closest('button');if(!b||!activeReport)return;if(b.matches('[data-report-xlsx]'))downloadExcel(activeReport);if(b.matches('[data-report-pdf]'))printReport(activeReport);});
// These summary cards use real status fields only. Missing per-record counts are not inferred.
function statValue(v){return v==null||v===''?'Not reported':typeof v==='number'&&Number.isFinite(v)?v.toLocaleString():safeText(v);}
function renderSummary(id,summary,open=true){
 sourceSummaries[id]=summary;const r=rows[id];r.loaded=true;r.details.replaceChildren();
 const panel=document.createElement('div');panel.className='ss-summary-panel';
 const title=cell('h4',summary.title);panel.append(title);
 const message=cell('p',summary.note);message.className='ss-summary-note';panel.append(message);
 const grid=document.createElement('div');grid.className='ss-summary-grid';
 for(const [label,value] of summary.stats){const tile=document.createElement('div');tile.className='ss-summary-stat';tile.append(cell('small',label),cell('strong',statValue(value)));grid.append(tile);}
 panel.append(grid);
 const meta=document.createElement('div');meta.className='ss-summary-meta';
 for(const [label,value] of summary.metadata||[]){const entry=document.createElement('p');entry.append(cell('strong',label+': '),document.createTextNode(safeText(value)));meta.append(entry);}panel.append(meta);
 const actions=document.createElement('div');actions.className='ss-report-export';
 const excel=cell('button','Export Excel');excel.type='button';excel.addEventListener('click',()=>downloadSummary(summary));
 const pdf=cell('button','Print / Save PDF');pdf.type='button';pdf.addEventListener('click',()=>printSummary(summary));
 actions.append(excel,pdf);panel.append(actions);r.details.append(panel);if(open)setExpanded(id,true);
}
function summaryRows(summary){return [['Item','Value'],['Source',summary.title],['About',summary.note],...(summary.metadata||[]),...(summary.stats||[])];}
function downloadSummary(summary){if(!window.XLSX){alert('Excel export library unavailable. Reload and try again.');return;}
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summaryRows(summary)),'Sync Summary');
 XLSX.writeFile(wb,summary.filename+'.xlsx');}
function printSummary(summary){const win=window.open('','_blank');if(!win){alert('Allow popups to print this report.');return;}
 const table=summaryRows(summary).map(row=>'<tr>'+row.map(v=>'<td>'+htmlEscape(v)+'</td>').join('')+'</tr>').join('');
 win.document.write('<!doctype html><html><head><title>Sync Report</title><style>body{font:14px Arial,sans-serif;color:#193953;padding:30px}h1{font-size:22px}table{border-collapse:collapse;width:100%}td{padding:9px;border-bottom:1px solid #e3ebf2}tr:first-child{background:#eaf3fc;font-weight:700}</style></head><body><h1>'+htmlEscape(summary.title)+'</h1><table>'+table+'</table></body></html>');win.document.close();win.focus();win.print();}
function masSummary(d,run,source='run'){
 const reliable=run?.summary_available===true;
 const get=(field,fallback)=>reliable?Number(run[field]??0):fallback;
 const lastImportRun=d?.remote_sync_request;
 const sameRun=!!run?.request_id&&lastImportRun?.request_id===run.request_id;
 const invoice=d?.invoice_result;
 const fallbackCustomer=source==='saved'?d?.customers_last_record_count:null;
 const fallbackPayment=source==='saved'?d?.payments_last_record_count:null;
 return {title:'MAS 90 — Customers, payments & invoices',filename:'MAS90-Statement-Sync-'+new Date().toISOString().slice(0,10),
 note:reliable?'Counts reported for the completed MAS 90 run.':'Run-specific record counts are not fully available. Saved import counts, if shown, are from the latest database snapshot, not necessarily this run.',
 stats:[['Customers processed',get('customers_success_count',fallbackCustomer)],['Payments processed',get('payments_success_count',fallbackPayment)],['Payments inserted',get('payments_inserted_count',null)],['Payments duplicates',get('payments_duplicate_count',null)],['Invoices processed',invoice?.valid_invoices??invoice?.valid_rows??null],['Failed rows',reliable?Number(run.customers_failure_count||0)+Number(run.payments_failure_count||0):null]],
 metadata:[['Status',source==='run'?'Completed sync':'Saved data snapshot'],['Run ID',run?.request_id||'Not available'],['Requested',run?.requested_at?date(run.requested_at):'Not available'],['Completed',date(run?.completed_at||d?.import_control_completed_at)],['Customers last updated',date(d?.customers_last_success_at)],['Payments last updated',date(d?.payments_last_success_at)],['Invoices last updated',date(d?.invoice_database?.last_import_at)]]};
}
function cardsSummary(d,source='run'){
 return {title:'Intevacon — Customer fleet cards',filename:'Intevacon-Cards-Statement-Sync-'+new Date().toISOString().slice(0,10),
 note:'Counts describe the latest complete card snapshot; the cards API does not report how many records were newly added or changed during this run.',
 stats:[['Total cards in snapshot',d?.cards??null],['Unassigned cards',d?.unmatched??null],['Assigned cards',d?.cards!=null&&d?.unmatched!=null?Number(d.cards)-Number(d.unmatched):null],['New cards',null],['Updated cards',null],['Failed records',null]],
 metadata:[['Status',source==='run'?'Completed sync':'Saved data snapshot'],['Last successful sync',date(d?.last_success)],['Cards snapshot period','Full card list (no From / To range returned)'],['Service message',d?.message||'Not available']]};
}
async function loadExistingSnapshot(id){
 const r=rows[id];r.loaded=true;r.details.replaceChildren(cell('p','Loading latest saved synchronization information…'));
 try{const result=id==='mas90'?await api('import-status'):await api('fleet/cards/status');
  if(!dialog.open)return;
  if(id==='mas90')renderSummary(id,masSummary(result,null,'saved'));else renderSummary(id,cardsSummary(result,'saved'));
 }catch(e){if(dialog.open)r.details.replaceChildren(cell('p','Summary unavailable: '+e.message));}
}
function date(v){if(!v)return 'Never';const raw=typeof v==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v)?v.replace(' ','T')+'Z':v;const d=new Date(raw);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(d)+' CT':'Unavailable';}
function last(id,value,unknown=false){rows[id].last.textContent='Last updated: '+(unknown?'Unavailable':date(value));}
function masLast(d){const items=['customers','payments'].map(id=>{const value=d[id+'_last_success_at']||(d[id+'_last_import_status']==='completed'?d[id+'_last_import_at']:null);return id[0].toUpperCase()+id.slice(1)+': '+(!value&&d[id+'_last_import_at']?'Unavailable':date(value));});items.push('Invoices: '+date(d.invoice_database?.last_import_at));rows.mas90.last.textContent=items.join(' · ');}
function progress(id,text,value){const r=rows[id];r.status.textContent=text;r.node.classList.toggle('ss-failed',text.startsWith('Failed'));if(value==null)r.progress.removeAttribute('value');else r.progress.value=value;updateBadge(id);}
function complete(id,time){if(cancelRequested)return;rows[id].done=true;progress(id,'Completed',100);last(id,time);setExpanded(id,true);}
async function api(path,body){if(!session||key()!==session)throw Error('Admin session changed. Close this window and sign in again.');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),120000);try{const response=await fetch('/api/admin/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'X-Admin-Key':session,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(key()!==session)throw Error('Admin session changed.');if(!response.ok||data.success===false){const error=Error(data.error||'Request failed.');error.data=data;error.status=response.status;throw error;}return data;}finally{clearTimeout(timeout);}}
async function timestamps(ticket){await Promise.allSettled([
 (async()=>{try{const d=await api('auth/me');if(ticket!==epoch)return;currentUsername=String(d.user?.username||'');q('[data-username]').textContent=currentUsername||'Unavailable';}catch{if(ticket===epoch){currentUsername='';q('[data-username]').textContent='Unavailable — sign in again';}}})(),
 (async()=>{try{const d=await api('import-status');if(ticket!==epoch||busy)return;masLast(d);}catch{if(ticket===epoch&&!busy)last('mas90',null,true);}})(),
 (async()=>{try{const d=await api('fleet/cards/status');if(ticket===epoch&&!busy)last('cards',d.last_success);}catch{if(ticket===epoch&&!busy)last('cards',null,true);}})(),
 (async()=>{try{const d=await api('fleet/schedule');if(ticket===epoch&&!busy)last('transactions',d.history?.lastSuccess);}catch{if(ticket===epoch&&!busy)last('transactions',null,true);}})()
]);}
function lock(value){busy=value;for(const r of Object.values(rows))r.input.disabled=value;q('[data-apply]').disabled=value;q('[data-cancel]').disabled=false;q('[data-close]').disabled=false;q('[data-master]').disabled=value;}
function close(){if(busy)return;epoch++;dialog.close();q('[data-master]').value='';target?.focus();target=null;}
function resume(){if(key()!==session){q('[data-message]').textContent='Your admin session changed. Close and try again.';return;}const original=target;if(!original||!original.isConnected||original.disabled){q('[data-message]').textContent='The original action is no longer available. Close and check your statement selection.';return;}close();bypass=original;try{original.click();}finally{bypass=null;}}
window.addEventListener('click',event=>{const b=event.target.closest?.('button');if(!b||!ids.includes(b.id)||b===bypass||b.disabled)return;event.preventDefault();event.stopImmediatePropagation();if(dialog.open)return;target=b;session=key();done=false;cancelRequested=false;cancelTask=null;activeSource=null;activeRequestId=null;q('[data-master]').value='';q('[data-master]').defaultValue='';currentUsername='';q('[data-username]').textContent='Checking…';const ticket=++epoch;for(const r of Object.values(rows)){r.input.checked=false;r.done=false;r.progress.value=0;r.status.textContent='Use saved data';r.last.textContent='Last updated: Checking…';r.node.classList.remove('ss-failed');}resetReport();Object.keys(rows).forEach(updateBadge);q('[data-action]').textContent='Continue to: '+b.textContent.trim();q('[data-password]').hidden=true;q('[data-message]').textContent='';q('[data-apply]').textContent='Apply';lock(false);dialog.showModal();timestamps(ticket);},true);
async function requestCancel(){
 if(!busy&&!cancelRequested){close();return;}
 if(cancelTask)return;
 if(!cancelRequested&&!confirm('Cancel the selected synchronization jobs? Completed updates will be kept. The statement action will not run.'))return;
 cancelRequested=true;done=false;q('[data-message]').textContent='Cancelling synchronization…';q('[data-cancel]').disabled=true;q('[data-close]').disabled=true;
 cancelTask=(async()=>{
  try{
   await startReady;
   if(activeSource==='mas90'&&activeRequestId){try{const d=await api('mas90-sync-cancel',{confirmed:true,request_id:activeRequestId});if(d.remote_sync_request?.status==='cancel_requested')q('[data-message]').textContent='MAS 90 will stop at the next safe checkpoint.';}catch(e){if(e.data?.remote_sync_request?.request_id!==activeRequestId||!['completed','cancelled','failed','completed_with_errors'].includes(e.data?.remote_sync_request?.status))throw e;}}
   else if(activeSource==='mas90'&&startSent)throw Error('MAS 90 start result is unknown. Check and cancel it in the Automation Health Center');
   else if(activeSource==='cards'&&activeRequestId)await api('fleet/cards/cancel',{request_id:activeRequestId});
   else if(activeSource==='transactions'&&activeRequestId)await api('fleet/cancel',{request_id:activeRequestId});
   await activeRunPromise?.catch(()=>{});
   for(const [id,r] of Object.entries(rows))if(r.input.checked&&!r.done)progress(id,'Cancelled — statement action not started',0);
   lock(false);close();
  }catch(e){lock(false);q('[data-apply]').disabled=true;q('[data-message]').textContent='Could not confirm cancellation: '+e.message+'. Click Cancel to retry; check service status before starting again.';}
  finally{cancelTask=null;}
 })();await cancelTask;
}
q('[data-close]').onclick=requestCancel;q('[data-cancel]').onclick=requestCancel;dialog.addEventListener('cancel',event=>{event.preventDefault();requestCancel();});
const pause=()=>new Promise(resolve=>setTimeout(resolve,4000));
function masProgressMessage(report){
 const message=String(report.message||'').trim();
 if(['failed','cancelled','interrupted','completed_with_errors'].includes(report.status))return message||'MAS 90 synchronization failed.';
 // Older office scripts still use two-dataset wording for the combined job.
 // Translate only those known general messages; keep per-dataset stages/errors.
 const legacy={
  'Exporting all customers and recent payment data from MAS 90.':'Exporting customers, payments, and invoices from MAS 90.',
  'MAS 90 is exporting customer and payment records.':'MAS 90 is exporting customer, payment, and invoice records.',
  'Counting and validating the exported customer and payment records.':'Counting and validating the exported customer, payment, and invoice records.'
 };
 return Object.hasOwn(legacy,message)?legacy[message]:message||'Waiting for the office computer…';
}
async function mas90(password){
 const selected=['customers','payments','invoices'];
 startSent=true;const response=await api('mas90-sync-request',{confirmed:true,current_admin_password:password});const id=response.remote_sync_request?.request_id;activeRequestId=id;started();cancelled();if(!id)throw Error('No MAS 90 request ID returned.');
 const until=Date.now()+30*60000;
 while(Date.now()<until){cancelled();const d=await api('import-status'),r=d.remote_sync_request;if(r?.request_id!==id)throw Error('MAS 90 request changed; verify the Health Center.');
  const reported=Number(r.progress_percent);progress('mas90',masProgressMessage(r),Number.isFinite(reported)&&reported>0?Math.min(99,reported):null);
  if(['failed','cancelled','interrupted','completed_with_errors'].includes(r.status))throw Error(r.message||'MAS 90 synchronization failed.');
  if(r.status==='completed'){if(selected.some(k=>Number(r[k+'_failure_count']||d.invoice_result?.[k+'_failure_count']||0)>0))throw Error('MAS 90 reported failed records. Review the Automation Health Center.');complete('mas90',r.completed_at);masLast(d);renderSummary('mas90',masSummary(d,r));return;}
  await pause();
 }
 throw Error('MAS 90 is still pending. Check the office computer and Automation Health Center before retrying.');
}
async function cards(){const before=await api('fleet/cards/status');cancelled();if(!before.configured)throw Error('The fleet card service is not configured.');const requestId=crypto.randomUUID();activeRequestId=requestId;await api('fleet/cards/sync',{request_id:requestId});started();cancelled();const until=Date.now()+20*60000;while(Date.now()<until){cancelled();const d=await api('fleet/cards/status');progress('cards',d.message||'Waiting for fleet card sync…',null);if(d.last_success&&d.last_success!==before.last_success&&!d.running&&!d.requested){complete('cards',d.last_success);renderSummary('cards',cardsSummary(d));return;}if(d.needs_attention||['failed','error'].includes(d.state))throw Error(d.message||'Fleet card sync failed.');await pause();}throw Error('Card synchronization has not completed. Check Fleet Cards status before retrying.');}
function centralMinute(value){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);const g=t=>p.find(x=>x.type===t).value;return g('year')+'-'+g('month')+'-'+g('day')+'T'+g('hour')+':'+g('minute');}
async function transactions(){
 const status=await api('fleet/schedule');cancelled();
 const selected=Number(status.config?.days),days=[1,2,7,14,30].includes(selected)?selected:2;
 const now=new Date(),to=centralMinute(now),from=centralMinute(new Date(now.getTime()-days*86400000));
 progress('transactions','Retrieving the last '+(days<3?days*24+' hours':days+' days')+'…',null);
 activeRequestId=crypto.randomUUID();started();
 let d;
 try{d=await api('fleet/sync',{from,to,cardNumber:'',request_id:activeRequestId,report:true});}
 catch(e){if(e.data?.report)renderReport(e.data.report);throw e;}
 cancelled();if(d.readOnly!==true||!d.report||d.report.id!==activeRequestId)throw Error('Unexpected audited transaction sync response.');
 renderReport(d.report);
 if(d.report.status!=='completed'||Number(d.report.stats?.failed||0)>0)throw Error('Transactions were rejected. Expand Transactions to review details.');
 complete('transactions',d.completedAt||d.retrieved_at);
} 
q('[data-apply]').onclick=async()=>{
 if(busy)return;if(done){resume();return;}const selected=Object.keys(rows).filter(id=>rows[id].input.checked&&!rows[id].done);if(!selected.length){resume();return;}
 const mas=selected.includes('mas90');if(mas&&!currentUsername){q('[data-message]').textContent='The signed-in admin could not be confirmed. Close and sign in again.';return;}const password=q('[data-master]').value;if(mas&&!password){q('[data-message]').textContent='Enter your signed-in admin password to authorize MAS 90 synchronization.';q('[data-master]').focus();return;}
 lock(true);q('[data-apply]').textContent='Synchronizing…';q('[data-message]').textContent='Keep this window open. The statement action will wait until you click OK.';
 // Work through the checked sources in display order. Each source owns its progress bar,
 // and a later sync cannot begin while an earlier one is still running or polling.
 const jobs=[['mas90',()=>mas90(password)],['cards',cards],['transactions',transactions]].filter(([id])=>selected.includes(id));
 for(const [id] of jobs)progress(id,'Queued — waiting for the previous update',0);
 q('[data-master]').value='';
 let allSucceeded=true,failedSource=null;
 for(const [id,run] of jobs){
  if(cancelRequested)break;activeSource=id;activeRequestId=null;startSent=false;startReady=new Promise(resolve=>{releaseStart=resolve;});
  progress(id,'Starting synchronization…',null);
  try{activeRunPromise=run();await activeRunPromise;}
  catch(e){
   if(cancelRequested)break;
   allSucceeded=false;failedSource=id;
   if(!rows[id].done)progress(id,'Failed: '+(e.name==='AbortError'?'Request timed out. Check sync status before retrying.':e.message),0);if(id!=='transactions'){rows[id].loaded=true;rows[id].details.replaceChildren(cell('p','Sync failed: '+e.message));setExpanded(id,true);}else if(activeReport){setExpanded(id,true);}
   const failedIndex=jobs.findIndex(([source])=>source===id);
   for(const [pendingId] of jobs.slice(failedIndex+1))progress(pendingId,'Not started — waiting for the failed update to be corrected',0);
   break;
  }finally{started();}
 }
 if(cancelRequested)return;
 activeSource=null;activeRequestId=null;
 lock(false);done=allSucceeded;q('[data-apply]').textContent=done?'OK':'Retry failed updates';q('[data-message]').textContent=done?'Selected updates completed. Click OK to continue to '+target.textContent.trim()+'.':'Synchronization stopped. Remaining updates and the statement action have not started. Correct the failed update, then retry.';
 if(failedSource==='mas90'){q('[data-password]').hidden=false;q('[data-master]').focus();}
};
})();
