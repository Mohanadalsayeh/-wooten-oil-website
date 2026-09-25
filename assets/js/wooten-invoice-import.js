(()=>{
const get=id=>document.getElementById(id),panel=get('invoiceImportPanel');if(!panel)return;
let rows=[],previewFile=null,busy=false,cancel=false,runId='';
let previewRows=[],previewMatches=[],previewPage=1,previewPages=1,searchTimer;
const previewPageSize=20;
const headerSort=WootenTableDataSort.register(get('invoicePreviewTable'),['account_number','customer_name','invoice_no','invoice_type','invoice_date','due_date','balance'],()=>{if(!busy&&previewFile)renderPreview();},get('invoicePreviewSort'));
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const text=value=>String(value??'').trim();
const dateKey=value=>value instanceof Date?(Number.isFinite(value.getTime())?value.toISOString().slice(0,10):''):text(value).slice(0,10);
const displayDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(5,7)+'-'+value.slice(8,10)+'-'+value.slice(0,4):value||'—';
async function preparePreview(source){
  // Keep display/search data separate from the complete, original upload rows.
  previewRows=await mapPreviewRowsInBatches(source,row=>{
    const account=text(row.CustomerNo);
    const result={account_number:/^\d{1,7}$/.test(account)?account.padStart(7,'0'):account,
      customer_name:text(row.CustomerName),invoice_no:text(row.InvoiceNo),invoice_type:text(row.InvoiceType),
      invoice_date:dateKey(row.InvoiceDate),due_date:dateKey(row.InvoiceDueDate),
      balance:row.Balance===null||text(row.Balance)===''?NaN:Number(row.Balance)};
    result.searchText=[result.account_number,result.customer_name,result.invoice_no,result.invoice_type,result.invoice_date,result.due_date].join(' ').toLowerCase();
    return result;
  },"invoices",500);
  const select=get('invoicePreviewType');
  select.replaceChildren();
  for(const [value,label] of [['all','All types'],...[...new Set(previewRows.map(row=>row.invoice_type).filter(Boolean))].sort().map(value=>[value,value])]){
    const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
  }
  select.value='all';
}
function filteredRows(){
  const query=get('invoicePreviewSearch').value.trim().toLowerCase(),type=get('invoicePreviewType').value;
  const balance=get('invoicePreviewBalance').value,sort=get('invoicePreviewSort').value;
  return headerSort.apply(previewRows.filter(row=>{
    if(query&&!row.searchText.includes(query))return false;
    if(type!=='all'&&row.invoice_type!==type)return false;
    if(balance==='positive'&&!(row.balance>0))return false;
    if(balance==='zero'&&!(Math.abs(row.balance)<0.005))return false;
    if(balance==='credit'&&!(row.balance<0))return false;
    return true;
  }).sort((a,b)=>{
    if(sort==='customer_asc')return a.account_number.localeCompare(b.account_number);
    if(sort==='customer_desc')return b.account_number.localeCompare(a.account_number);
    if(sort==='balance_desc')return (Number.isFinite(b.balance)?b.balance:0)-(Number.isFinite(a.balance)?a.balance:0);
    if(sort==='balance_asc')return (Number.isFinite(a.balance)?a.balance:0)-(Number.isFinite(b.balance)?b.balance:0);
    if(sort==='invoice_asc')return a.invoice_date.localeCompare(b.invoice_date);
    return b.invoice_date.localeCompare(a.invoice_date);
  }));
}
function syncPagination(){
  get('invoicePreviewPagination').hidden=!previewFile||previewMatches.length<=previewPageSize;
  get('invoicePreviewPage').textContent='Page '+previewPage+' of '+previewPages+' • '+previewMatches.length.toLocaleString()+' records';
  get('invoicePreviewPrev').disabled=busy||previewPage<=1;
  get('invoicePreviewNext').disabled=busy||previewPage>=previewPages;
}
function renderPreview(reset=true){
  if(reset){previewPage=1;previewMatches=filteredRows();}
  const filtered=previewMatches,body=get('invoicePreviewBody');
  previewPages=Math.max(1,Math.ceil(filtered.length/previewPageSize));
  previewPage=Math.max(1,Math.min(previewPage,previewPages));
  const start=(previewPage-1)*previewPageSize,end=Math.min(start+previewPageSize,filtered.length);
  body.replaceChildren();
  get('invoicePreviewTools').style.display='grid';
  get('invoicePreviewWrap').style.display='block';
  get('invoicePreviewTable').dataset.pdfEmpty=filtered.length?'false':'true';
  get('invoicePreviewCount').textContent=filtered.length.toLocaleString()+' matching invoice row(s) • showing '+(filtered.length?start+1:0).toLocaleString()+'–'+end.toLocaleString();
  for(const row of filtered.slice(start,end)){
    const tr=document.createElement('tr');
    for(const value of [row.account_number,row.customer_name,row.invoice_no,row.invoice_type,displayDate(row.invoice_date),displayDate(row.due_date),Number.isFinite(row.balance)?money.format(row.balance):'—']){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }
    body.append(tr);
  }
  if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='No invoices match the current search and filters.';tr.append(td);body.append(tr);}
  syncPagination();
}
function goToPreviewPage(target){
  if(busy||!previewFile||!Number.isFinite(Number(target)))return;
  // Resolve a pending search before moving through the matching results.
  if(searchTimer){clearTimeout(searchTimer);searchTimer=null;renderPreview();return;}
  previewPage=Math.max(1,Math.min(previewPages,Math.trunc(Number(target))));
  renderPreview(false);
}
get('invoicePreviewPrev').addEventListener('click',()=>goToPreviewPage(previewPage-1));
get('invoicePreviewNext').addEventListener('click',()=>goToPreviewPage(previewPage+1));
get('invoicePreviewPrev').wootenGoToPage=goToPreviewPage;
function clearPreview(){
  clearTimeout(searchTimer);searchTimer=null;previewRows=[];previewMatches=[];previewPage=1;previewPages=1;
  get('invoicePreviewSearch').value='';get('invoicePreviewType').value='all';
  get('invoicePreviewBalance').value='all';get('invoicePreviewSort').value='invoice_desc';
  get('invoicePreviewTools').style.display='none';get('invoicePreviewWrap').style.display='none';
  get('invoicePreviewBody').replaceChildren();get('invoicePreviewTable').dataset.pdfEmpty='true';
  get('invoicePreviewCount').textContent='0 shown';
  get('invoiceImportSummary').style.display='none';
  ['imRows','imValid','imSkipped','imImported'].forEach(id=>{get(id).textContent='0';});
  syncPagination();
}
window.WootenInvoiceImport={filteredRows,refreshLastUpload};
get('invoicePreviewSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=null;if(!busy&&previewFile)searchTimer=setTimeout(()=>{searchTimer=null;if(!busy&&previewFile)renderPreview()},200)});
get('invoicePreviewSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(searchTimer);searchTimer=null;if(!busy&&previewFile)renderPreview()}});
['invoicePreviewType','invoicePreviewBalance','invoicePreviewSort'].forEach(id=>get(id).addEventListener('change',()=>{clearTimeout(searchTimer);searchTimer=null;if(!busy&&previewFile)renderPreview()}));
const key=()=>get('adminKey')?.value.trim()||'';
const status=(s,ok=true)=>{get('invoiceStatus').textContent=s;get('invoiceStatus').className='status show '+(ok?'ok':'bad');get('invoiceStatus').style.display='block';};
function lock(value){busy=value;panel.querySelectorAll('button,input,select').forEach(e=>{if(e.id!=='invoiceCancel')e.disabled=value});get('invoiceCancel').hidden=!value||!runId;get('invoiceUpload').disabled=value||!rows.length||!previewFile;syncPagination();}
async function api(body,headers={}){if(!key())throw Error('Sign in as an administrator first.');const response=await fetch('/api/admin/open-invoices-import',{method:body?'POST':'GET',headers:{'X-Admin-Key':key(),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'Invoice request failed');return data;}
let savedSerial=0,lastSavedFetch=0,savedRequestPending=false;
async function saved(){
  const requestKey=key(),serial=++savedSerial;
  if(!requestKey)return;
  const data=await api();
  if(serial!==savedSerial||requestKey!==key())return;
  const active=data.active;
  setImportLastUpdate('invoices',active?.completed_at||'',active?.actor||'',String(active?.mode||'').startsWith('automatic')?'automatic':'manual','completed',active?.expected||0,active?.batches||1,active?.batches||1);
}
function refreshLastUpload(){
  if(!key()||!WootenAdminAccess.has(window.wootenAdminUser,'database')||busy||savedRequestPending||Date.now()-lastSavedFetch<30000)return;
  savedRequestPending=true;lastSavedFetch=Date.now();
  saved().catch(()=>{}).finally(()=>{savedRequestPending=false;});
}
window.addEventListener('wooten-admin-auth-changed',()=>{
  savedSerial++;lastSavedFetch=0;
  setImportLastUpdate('invoices','');
  refreshLastUpload();
});
refreshLastUpload();
get('invoiceFile').addEventListener('change',()=>{rows=[];previewFile=null;clearPreview();get('invoiceImportProgress').hidden=true;get('invoiceStatus').textContent='';get('invoiceStatus').style.display='none';lock(false)});
get('invoicePreview').addEventListener('click',async()=>{
  if(busy)return;
  const file=get('invoiceFile').files[0];
  if(!file||!/\.mdb$/i.test(file.name)){status('Choose a Microsoft Access .mdb invoice file.',false);return;}
  lock(true);rows=[];previewFile=null;clearPreview();
  get('invoiceImportProgress').hidden=true;
  const previewButton=get('invoicePreview');
  previewButton.setAttribute('aria-busy','true');previewButton.textContent='Loading Invoices…';
  try{
    updatePreviewProgress('invoices',{phase:'reading'});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(!window.wootenReadAccessFile)throw Error('The Access reader is still loading. Try again shortly.');
    const result=await window.wootenReadAccessFile(file,'invoices');
    if(!result.rows.length)throw Error('The invoice file is empty. The existing invoice list will not be cleared.');
    rows=result.rows;previewFile=file;
    await preparePreview(rows);
    get('imRows').textContent=rows.length;
    get('imValid').textContent=previewRows.length;
    // Invoice snapshots keep every source row; no rows are silently skipped.
    get('imSkipped').textContent='0';
    get('invoiceImportSummary').style.display='grid';
    renderPreview();
    status(rows.length.toLocaleString()+' invoice records ready to import from '+result.tableName+'.');
  }catch(e){
    rows=[];previewFile=null;clearPreview();status(e.message,false);
  }finally{
    hidePreviewProgress('invoices');
    previewButton.removeAttribute('aria-busy');previewButton.textContent='Preview Invoices';
    lock(false);
  }
});
get('invoiceUpload').addEventListener('click',async()=>{
  if(busy||!previewFile||!rows.length)return;
  const total=rows.length,batches=Math.ceil(total/200);
  let processed=0,currentBatch=1;
  cancel=false;
  get('invoiceCancel').disabled=false;
  runId=crypto.randomUUID();
  lock(true);
  const base={'X-Import-Run-Id':runId,'X-Import-Mode':'manual','X-Import-Run-Total':String(total),'X-Import-Batch-Count':String(batches)};
  updateImportProgress('invoices',{processed:0,total,imported:0,batch:1,batches,label:'Importing open invoices'});
  try{
    for(let i=0;i<total;i+=200){
      if(cancel)throw Error('Import cancelled. The previous completed invoice list remains available.');
      currentBatch=Math.floor(i/200)+1;
      const chunk=rows.slice(i,i+200);
      updateImportProgress('invoices',{processed,total,imported:0,batch:currentBatch,batches,label:'Importing open invoices'});
      status('Uploading invoice batch '+currentBatch+' of '+batches+'…');
      await api({invoices:chunk},{...base,'X-Import-Batch-Number':String(currentBatch)});
      processed+=chunk.length;
      updateImportProgress('invoices',{processed,total,imported:0,batch:currentBatch,batches,label:'Importing open invoices'});
    }
    if(cancel)throw Error('Import cancelled. The previous completed invoice list remains available.');
    get('invoiceCancel').disabled=true;
    status('Finalizing invoice import…');
    updateImportProgress('invoices',{processed,total,imported:0,batch:batches,batches,label:'Finalizing invoice import'});
    await api({action:'complete'},base);
    get('imImported').textContent=total;
    updateImportProgress('invoices',{processed:total,total,imported:total,batch:batches,batches,state:'complete',label:'Invoice import complete'});
    get('invoiceImportProgress').hidden=true;
    await saved().catch(()=>{});
    window.dispatchEvent(new Event('wooten-invoices-imported'));
    status(total.toLocaleString()+' invoices imported successfully. 0 failed.');
  }catch(e){
    await api({action:'cancel'},base).catch(()=>{});
    updateImportProgress('invoices',{processed,total,imported:0,batch:currentBatch,batches,state:'failed',label:cancel?'Invoice import cancelled':'Invoice import stopped'});
    status(e.message,false);
  }finally{
    runId='';
    lock(false);
  }
});
get('invoiceCancel').addEventListener('click',()=>{cancel=true;get('invoiceCancel').disabled=true;status('Cancelling after the current batch…')});

})();
