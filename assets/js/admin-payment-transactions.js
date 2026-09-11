(function(){
  'use strict';
  const get=id=>document.getElementById(id),panel=get('admin-tab-payment-transactions');
  if(!panel)return;
  const endpoint='/api/admin/payment-transactions',form=get('paymentTransactionsFilters'),body=get('ptRows'),modal=get('ptModal');
  const statusNames={approved:'Approved',pending:'Pending',declined:'Declined',canceled:'Cancel',unsubmitted:'Unsubmitted',expired:'Expired',failed:'Failed',review:'Review needed',unknown:'Unknown',posted:'Posted'};
  const providerNames={heartland:'Heartland',globalpayments:'Global Payments',unknown:'Unknown',mas90:'MAS 90 account history'};
  const environmentNames={sandbox:'Sandbox test',production:'Live',unknown:'Unknown',account_history:'Imported account payment'};
  const filterIds={q:'ptSearch',status:'ptStatus',environment:'ptEnvironment',provider:'ptProvider',from:'ptFrom',to:'ptTo',min_amount:'ptMinAmount',max_amount:'ptMaxAmount',sort:'ptSort'};
  let page=1,pages=1,total=0,applied=new URLSearchParams(),loaded=false,busy=false,exporting=false;
  let sequence=0,detailSequence=0,activeId='',current=null,detailLoading=false,opener=null,oldOverflow='',searchTimer;
  const controllers=new Set();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const credential=()=>String(get('adminKey')?.value||'').trim();
  function permitted(){const u=window.wootenAdminUser;return !!credential()&&!!u&&(u.owner||(u.permissions||[]).includes('customer_activity'));}
  function money(row){const n=Number(row.amount_cents)/100;return (row.currency||'USD')+' '+(Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—');}
  function date(value){
    if(!value)return '—';
    let text=String(value);if(/^\d{4}-\d\d-\d\d \d\d:/.test(text))text=text.replace(' ','T');
    if(!/(Z|[+-]\d\d:\d\d)$/.test(text))text+='Z';
    const d=new Date(text);return Number.isFinite(d.getTime())?d.toISOString().replace('T',' ').slice(0,19)+' UTC':String(value);
  }
  const status=row=>statusNames[row.status]||'Unknown';
  const environment=row=>environmentNames[row.environment]||'Unknown';
  const provider=row=>providerNames[row.provider]||'Unknown';
  function badge(row){return '<span class="pt-badge '+(Object.hasOwn(statusNames,row.status)?row.status:'unknown')+'">'+escape(status(row))+'</span>';}
  function notice(row){
    if(row.source==='mas90')return 'This receipt confirms a posted payment imported from the customer’s Wooten Oil account history. It does not represent a new online card payment.';
    const notes={approved:'This record confirms an approved online payment. Account balances may take up to 24 business hours to reflect it.',pending:'The payment outcome is awaiting confirmation. This status record is not proof of payment. Verify the outcome before another payment attempt.',declined:'This payment attempt was declined. This is not a receipt for a successful payment.',canceled:'This checkout was canceled. This is not proof of payment or a refund confirmation.',unsubmitted:'This checkout was prepared but has not been submitted. It is not a completed payment.',expired:'This checkout expired. This record does not confirm a successful payment.',failed:'This payment attempt failed. This record does not confirm a successful payment.',review:'This payment requires review. A successful payment has not been confirmed in the portal. Review the processor records before another attempt.',unknown:'The payment status could not be classified. This record does not confirm a successful payment.'};
    let note=notes[row.status]||notes.unknown;
    if(row.environment==='sandbox')note='SANDBOX TEST — no live funds were collected. '+(row.status==='approved'?'This confirms an approved test only. It does not pay the customer’s Wooten Oil account balance.':note);
    if(row.environment==='unknown')note='The payment environment is unknown. '+(row.status==='approved'?'The saved status is approved; verify the processor record before treating it as a live payment.':note);
    return note;
  }
  function title(row){if(row.source==='mas90')return 'Payment Receipt';return row.status==='approved'?(row.environment==='sandbox'?'Sandbox Payment Confirmation':row.environment==='production'?'Payment Receipt':'Payment Transaction'):'Payment Status Record';}
  function filterParams(){const p=new URLSearchParams();for(const [key,id] of Object.entries(filterIds)){const value=get(id).value.trim();if(value)p.set(key,value);}return p;}
  function message(text,tone='info'){const el=get('ptMessage');el.textContent=text;el.dataset.tone=tone;el.hidden=!text;}
  function controls(){
    const locked=busy||exporting||!permitted();
    form.querySelectorAll('input,select,button').forEach(el=>el.disabled=locked);
    get('ptRefresh').disabled=locked;get('ptExport').disabled=locked||!total;
    get('ptPrev').disabled=locked||page<=1;get('ptNext').disabled=locked||page>=pages;
  }
  async function api(path,signal){
    if(!permitted())throw new Error('Sign in with an admin account that has Customer Activity access.');
    const key=credential(),controller=new AbortController();controllers.add(controller);
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,20000);
    try{
      const response=await fetch(path,{headers:{'X-Admin-Key':key},cache:'no-store',signal:controller.signal});
      const data=await response.json();
      if(!permitted()||credential()!==key)throw new Error('Your admin session changed. Sign in again.');
      if(!response.ok||!data.success)throw new Error(data.error||'Payment transactions could not be loaded.');
      return data;
    }catch(error){if(error.name==='AbortError')throw new Error('The request was interrupted or timed out. Please try again.');throw error;}
    finally{clearTimeout(timer);controllers.delete(controller);signal?.removeEventListener('abort',abort);}
  }
  function skeleton(){body.innerHTML=Array.from({length:6},()=>'<tr aria-hidden="true">'+Array.from({length:7},()=>'<td><span class="pt-skeleton"></span></td>').join('')+'</tr>').join('');body.setAttribute('aria-busy','true');}
  function render(data){
    page=data.page;pages=data.pages;total=data.total;body.removeAttribute('aria-busy');
    get('ptCount').textContent=total.toLocaleString()+' matching transaction'+(total===1?'':'s');
    get('ptPage').textContent='Page '+page+' of '+pages;
    get('ptSummary').innerHTML=[['total','All matches'],['approved','Approved'],['pending','Pending'],['declined','Declined'],['canceled','Cancel'],['review','Review needed']].map(([key,label])=>'<div><span>'+label+'</span><strong>'+Number(data.summary[key]||0).toLocaleString()+'</strong></div>').join('');
    body.innerHTML=data.transactions.length?data.transactions.map(row=>'<tr data-transaction="'+escape(row.id)+'"><td>'+escape(date(row.created_at))+'</td><td><strong>'+escape(row.account_name||'Customer name unavailable')+'</strong><small>#'+escape(row.account_number)+'</small></td><td>'+escape(money(row))+'</td><td>'+badge(row)+'</td><td><span class="pt-badge '+(row.environment==='sandbox'?'sandbox':'')+'">'+escape(environment(row))+'</span></td><td>'+escape(provider(row))+'</td><td><button class="pt-open" type="button" aria-label="Open transaction '+escape(row.provider_reference||row.id)+'">'+escape(row.provider_reference||row.id)+'</button><small>'+escape(row.provider_transaction_id||'No processor transaction ID')+'</small></td></tr>').join(''):'<tr><td colspan="7" class="pt-empty">No transactions match these filters.</td></tr>';
  }
  async function load(nextPage=1,filters=applied){
    if(!permitted()||exporting)return;
    const token=++sequence;busy=true;applied=new URLSearchParams(filters);controls();message('');skeleton();
    const params=new URLSearchParams(applied);params.set('page',String(nextPage));params.set('page_size','20');
    try{const data=await api(endpoint+'?'+params);if(token!==sequence)return;render(data);loaded=true;}
    catch(error){if(token!==sequence)return;total=0;loaded=false;body.removeAttribute('aria-busy');body.innerHTML='<tr><td colspan="7" class="pt-empty">Transactions could not be loaded.</td></tr>';get('ptCount').textContent='Unable to load transactions';get('ptSummary').innerHTML='';message(error.message,'bad');}
    finally{if(token===sequence){busy=false;controls();}}
  }
  function fields(row){
    if(row.source==='mas90')return [['Customer',row.account_name],['Customer number',row.account_number],['Status','Posted'],['Source','MAS 90 account history'],['Payment date',row.payment_date],['Posting date',row.posting_date],['Check / payment reference',row.provider_reference],['Invoice number',row.invoice_no],['Deposit number',row.deposit_no],['Deposit date',row.deposit_date],['Imported',date(row.imported_at)],['Payment record ID',row.id],['Description / memo',row.result_message,true]];
    const last4=/^\d{4}$/.test(String(row.card_last4||''))?'•••• '+row.card_last4:'';
    return [['Customer',row.account_name||'Customer name unavailable'],['Customer number',row.account_number],['Status',status(row)],['Environment',environment(row)],['Processor',provider(row)],['Payment selection',row.payment_type==='full'?'Full balance':row.payment_type==='partial'?'Partial payment':row.payment_type],['Portal reference',row.provider_reference],['Processor transaction ID',row.provider_transaction_id],['Card',[row.card_brand,last4].filter(Boolean).join(' ')||'Not recorded'],['Created',date(row.created_at)],['Updated',date(row.updated_at)],['Completed',date(row.completed_at)],['Checkout expiration',date(row.expires_at)],['Last verification',row.last_check_ms?date(new Date(Number(row.last_check_ms)).toISOString()):'—'],['Processor status',row.provider_status],['Result code',row.result_code],['Portal transaction ID',row.id],['Result message',row.result_message,true],['Verification detail',row.verification_detail,true]];
  }
  function renderDetail(row){
    current=row;get('ptDetailTitle').textContent=title(row);
    get('ptDetailSummary').innerHTML='<strong>'+escape(money(row))+'</strong>'+badge(row);get('ptDetailSummary').hidden=false;
    get('ptDetail').innerHTML='<p class="pt-record-note '+(row.environment==='sandbox'?'sandbox':'')+'">'+escape(notice(row))+'</p><dl class="pt-fields">'+fields(row).map(([label,value,wide])=>'<div'+(wide?' class="pt-wide"':'')+'><dt>'+escape(label)+'</dt><dd>'+escape(value||'—')+'</dd></div>').join('')+'</dl>';
    get('ptPrint').disabled=false;get('ptDetailRefresh').disabled=false;get('ptDetailExport').disabled=false;
  }
  async function openDetail(id,refresh=false){
    if(!permitted())return;
    const token=++detailSequence;activeId=id;current=null;detailLoading=true;
    if(!refresh){opener=document.activeElement;oldOverflow=document.body.style.overflow;modal.hidden=false;document.body.style.overflow='hidden';get('ptClose').focus();}
    get('ptDetailSummary').hidden=true;get('ptDetailSummary').innerHTML='';get('ptDetailMessage').hidden=true;get('ptDetailExport').disabled=true;get('ptDetailScroll').scrollTop=0;
    get('ptDetailTitle').textContent='Transaction details';get('ptDetail').innerHTML='<p class="pt-message">Loading transaction…</p>';get('ptPrint').disabled=true;get('ptDetailRefresh').disabled=true;
    try{const data=await api(endpoint+'/'+(id.startsWith('imported/')?'imported/'+encodeURIComponent(id.slice(9)):encodeURIComponent(id)));if(token!==detailSequence||modal.hidden)return;renderDetail(data.transaction);}
    catch(error){if(token!==detailSequence||modal.hidden)return;get('ptDetail').innerHTML='<p class="pt-message" data-tone="bad">'+escape(error.message)+'</p>';get('ptDetailRefresh').disabled=false;}
    finally{if(token===detailSequence)detailLoading=false;}
  }
  function closeDetail(){detailSequence++;current=null;activeId='';detailLoading=false;if(!modal.hidden){modal.hidden=true;document.body.style.overflow=oldOverflow;opener?.focus();}get('ptDetail').innerHTML='';get('ptDetailSummary').innerHTML='';get('ptDetailSummary').hidden=true;get('ptDetailRefresh').disabled=true;get('ptDetailExport').disabled=true;get('ptPrint').disabled=true;}
  function printDetail(){
    if(!current||!permitted())return;
    const popup=window.open('','_blank');if(!popup){get('ptDetail').insertAdjacentHTML('afterbegin','<p class="pt-message">Allow pop-ups to open the printable transaction.</p>');return;}
    const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+escape(title(current))+'</title><style>@page{size:letter portrait;margin:.5in}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#20374c;margin:0;padding:24px}main{max-width:740px;margin:auto}header{border-bottom:2px solid #b91c30;padding-bottom:15px}h1{font-size:24px;margin:12px 0}header p{font-weight:bold;letter-spacing:.04em}.pt-record-head{display:flex;justify-content:space-between;align-items:center;margin:20px 0}.pt-record-head strong{font-size:25px}.pt-badge{font-weight:bold}.pt-record-note{border:1px solid #bfcddd;padding:14px;line-height:1.5}.pt-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px 22px}.pt-fields>div{break-inside:avoid;border-bottom:1px solid #dae2eb;padding-bottom:10px;min-width:0}.pt-wide{grid-column:1/-1}dt{color:#607487;font-size:11px;margin-bottom:5px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.actions{display:flex;gap:10px;margin:22px 0}button{padding:12px 20px;cursor:pointer}footer{font-size:10px;color:#607487;margin-top:24px}@media print{body{padding:0}.actions{display:none}}</style></head><body><main><header><p>WOOTEN OIL CO., INC.</p><h1>'+escape(title(current))+'</h1></header><div class="pt-record-head">'+get('ptDetailSummary').innerHTML+'</div>'+get('ptDetail').innerHTML+'<footer>Wooten Oil Customer Portal • Record printed '+escape(new Date().toISOString())+'. Online transaction timestamps are UTC.</footer><div class="actions"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div></main></body></html>';
    popup.document.open();popup.document.write(html);popup.document.close();popup.focus();setTimeout(()=>{try{if(!popup.closed)popup.print();}catch{}},350);
  }
  async function exportDetailPdf(){
    if(!current||!permitted()||get('ptDetailExport').disabled)return;
    const row=current,token=detailSequence,key=credential(),output=get('ptDetailMessage');
    const buttons=['ptDetailExport','ptPrint','ptDetailRefresh'].map(get);buttons.forEach(button=>button.disabled=true);
    const valid=()=>{if(token!==detailSequence||row!==current||!permitted()||key!==credential())throw new Error('The transaction export was canceled.');};
    output.hidden=false;output.dataset.tone='info';output.textContent='Preparing transaction PDF…';
    try{
      if(!window.WootenAdminTablePdf?.exportData)throw new Error('The PDF exporter is unavailable. Refresh the admin page.');
      const rows=[['Amount',money(row)],['Payment notice',notice(row)],...fields(row)].flatMap(([label,value])=>{
        // Keep long processor messages complete across PDF rows.
        const text=String(value||'—'),chunks=text.match(/[\s\S]{1,260}/g)||['—'];
        return chunks.map((chunk,index)=>[label+(index?' (continued)':''),chunk]);
      });
      await window.WootenAdminTablePdf.exportData(title(row),['Field','Value'],rows,(done,total,stage)=>{valid();output.textContent=stage+'…';},{recordCount:1});
      valid();output.dataset.tone='ok';output.textContent='Transaction PDF downloaded.';
    }catch(error){if(token===detailSequence&&current===row){output.dataset.tone='bad';output.textContent=error.message;}}
    finally{if(token===detailSequence&&current===row)buttons.forEach(button=>button.disabled=false);}
  }
  async function exportPdf(){
    if(busy||exporting||!permitted())return;
    const token=++sequence,key=credential(),filters=filterParams();exporting=true;clearTimeout(searchTimer);controls();message('');get('ptExportProgress').hidden=false;
    const valid=()=>{if(token!==sequence||key!==credential()||!permitted())throw new Error('Export canceled because the admin session changed.');};
    const progress=(done,all,text)=>{valid();get('ptExportLabel').textContent=text+' '+done.toLocaleString()+' of '+all.toLocaleString();get('ptProgress').value=all?Math.round(done/all*100):0;};
    try{
      if(!window.WootenAdminTablePdf?.exportData)throw new Error('The PDF exporter is unavailable. Refresh the admin page.');
      const rows=[],ids=new Set();let expected=null,snapshot=null,expectedPages=1;
      for(let n=1;n<=expectedPages;n++){
        valid();const params=new URLSearchParams(filters);params.set('page',String(n));params.set('page_size','200');if(snapshot!==null)params.set('snapshot',snapshot);
        const data=await api(endpoint+'?'+params);valid();
        if(expected===null){expected=data.total;snapshot=data.snapshot;expectedPages=data.pages;}
        if(data.total!==expected||data.pages!==expectedPages||data.page!==n)throw new Error('Transactions changed during export. Please export again to get a complete report.');
        for(const row of data.transactions){if(ids.has(row.id))throw new Error('Transactions changed during export. Please export again.');ids.add(row.id);rows.push(row);}
        progress(rows.length,expected,'Loading transactions');
      }
      if(!rows.length)throw new Error('No transactions match these filters.');
      if(rows.length!==expected)throw new Error('The complete transaction list could not be loaded. Please try again.');
      valid();const reportTitle='Payment Transactions'+(filters.get('environment')==='sandbox'?' - SANDBOX TESTS - NO LIVE FUNDS':'');
      await window.WootenAdminTablePdf.exportData(reportTitle,['Created (UTC)','Customer # / Name','Amount','Status','Environment','Processor','Portal reference / Transaction ID'],rows.map(row=>[date(row.created_at),row.account_number+' / '+row.account_name,money(row),status(row),row.environment==='sandbox'?'SANDBOX - NO LIVE FUNDS':environment(row),provider(row),(row.provider_reference||row.id)+' / '+(row.provider_transaction_id||'Not recorded')]),progress);
      valid();message('Exported all '+rows.length.toLocaleString()+' matching transactions to PDF.','ok');
    }catch(error){if(token===sequence)message(error.message,'bad');}
    finally{if(token===sequence){exporting=false;get('ptExportProgress').hidden=true;controls();}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();clearTimeout(searchTimer);load(1,filterParams());});
  get('ptSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>load(1,filterParams()),450);});
  form.addEventListener('change',event=>{if(event.target.id!=='ptSearch')load(1,filterParams());});
  get('ptReset').addEventListener('click',()=>{clearTimeout(searchTimer);form.reset();load(1,filterParams());});
  get('ptRefresh').addEventListener('click',()=>window.WootenRefreshUI.run(get('ptRefresh'),()=>load(1,filterParams())).finally(controls));
  get('ptPrev').addEventListener('click',()=>load(page-1));get('ptNext').addEventListener('click',()=>load(page+1));
  get('ptExport').addEventListener('click',exportPdf);
  body.addEventListener('click',event=>{const link=event.target.closest('button.pt-open');if(!link||link.disabled)return;const row=link.closest('[data-transaction]');if(row)openDetail(row.dataset.transaction);});
  get('ptDetailExport').addEventListener('click',exportDetailPdf);
  document.addEventListener('click',event=>{
    const link=event.target.closest('[data-activity-payment]');if(!link)return;
    const id=link.dataset.activityPayment;
    if(id.startsWith('portal-'))openDetail(id.slice(7));
    else if(/^mas90-\d+$/.test(id))openDetail('imported/'+id.slice(6));
  });
  get('ptClose').addEventListener('click',closeDetail);get('ptPrint').addEventListener('click',printDetail);
  get('ptDetailRefresh').addEventListener('click',()=>{if(activeId)window.WootenRefreshUI.run(get('ptDetailRefresh'),()=>openDetail(activeId,true)).finally(()=>{get('ptDetailRefresh').disabled=detailLoading||!activeId||!permitted();});});
  modal.addEventListener('click',event=>{if(event.target===modal)closeDetail();});
  document.addEventListener('keydown',event=>{
    if(modal.hidden)return;if(event.key==='Escape'){event.preventDefault();closeDetail();}
    if(event.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not([disabled]),[tabindex="0"]')];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  });
  function show(){if(!panel.hidden&&!loaded&&!busy&&permitted())load(1,filterParams());}
  new MutationObserver(show).observe(panel,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('wooten-admin-auth-changed',()=>{
    sequence++;detailSequence++;controllers.forEach(c=>c.abort());clearTimeout(searchTimer);closeDetail();loaded=false;busy=false;exporting=false;total=0;page=1;pages=1;form.reset();applied=new URLSearchParams();
    body.innerHTML='<tr><td colspan="7" class="pt-empty">Open Payment Transactions to load records.</td></tr>';get('ptSummary').innerHTML='';get('ptCount').textContent='Transactions have not been loaded.';get('ptPage').textContent='Page 1 of 1';get('ptExportProgress').hidden=true;message('');controls();show();
  });
  controls();show();
})();
