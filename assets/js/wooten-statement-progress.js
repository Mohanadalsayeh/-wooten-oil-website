/* Ver520: keep the progress shortcut in Statement Run Report only. */
(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
  const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):String(value||'');
  const key=()=>document.getElementById('adminKey')?.value.trim()||'';
  let host,ids=[],snapshots=[],page=1,serial=0,busy=false,timer=0,lastFocus=null,recent=[],pendingTitle='',pendingDate='',localMessage='',sessionUser=null,exporting=false;
  let preparing=false,progressUnavailable=false;
  const pageSize=40,seenAuto=new Set(),openedAt=Date.now();
  const labels={queued:'Queued',sending:'Sending…',sent:'Sent successfully',accepted:'Sent to provider',delivered:'Delivered',failed:'Failed',not_selected:'Not selected',not_sent:'Not sent',test:'Test — not sent'};
  const openingPdfs=new Set(),pdfUrls=new Set();
  function isProcessing(){return preparing||(ids.length>0&&(snapshots.length!==ids.length||snapshots.some(job=>!job.complete||['running','queued'].includes(job.status))));}
  async function api(path,options={}){
    const response=await fetch(path,{...options,headers:{'X-Admin-Key':key(),'Accept':'application/json',...(options.headers||{})},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.success===false)throw new Error(data.error||'Statement progress could not be loaded.');
    return data;
  }
  function mount(){
    if(host)return;
    host=document.createElement('div');host.className='sp-overlay';host.hidden=true;
    host.innerHTML=`<section class="sp-dialog" role="dialog" aria-modal="true" aria-labelledby="sp-title" aria-describedby="sp-notice">
      <header class="sp-header"><div><p class="sp-eyebrow">Wooten Oil • Statement progress</p><h2 id="sp-title"></h2><p id="sp-date"></p></div><button type="button" class="sp-close" data-sp-close aria-label="Close statement progress window">&times;</button></header>
      <div class="sp-toolbar"><p id="sp-summary" role="status" aria-live="polite">Preparing…</p><div class="sp-overall" data-state="idle"><div class="sp-overall-heading"><strong id="sp-overall-label">Overall progress</strong><span id="sp-overall-status">Preparing…</span></div><div id="sp-overall-track" class="sp-overall-track" role="progressbar" aria-labelledby="sp-overall-label" aria-valuemin="0" aria-valuemax="100"><span id="sp-overall-fill"></span></div></div></div>
      <div class="sp-actions"><div class="sp-history-field"><label for="sp-history">Recent statement run</label><select id="sp-history" class="sp-history"><option value="">Select a statement run…</option></select></div><button type="button" class="sp-button sp-export" data-sp-export disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l4 4v16H6z"></path><path d="M14 2v5h5"></path><path d="M9 13h6M9 17h6"></path></svg><span>Export PDF</span></button></div>
      <div class="sp-error" id="sp-error" role="status" hidden></div><div class="sp-pdf-status" id="sp-pdf-status" role="status" aria-live="polite" hidden></div>
      <div class="sp-table-wrap"><table class="sp-table" data-auto-pdf="false"><thead><tr><th scope="col">Customer / ID</th><th scope="col">Total balance</th><th scope="col">Progress</th><th scope="col">Customer portal</th><th scope="col">Email PDF</th><th scope="col">SMS text</th></tr></thead><tbody id="sp-rows"></tbody></table></div>
      <footer class="sp-footer"><p id="sp-notice"></p><div class="sp-footer-actions"><div class="sp-pager"><button type="button" class="sp-button" data-sp-prev>Previous</button><span id="sp-page"></span><button type="button" class="sp-button" data-sp-next>Next</button></div><button type="button" class="sp-button sp-done" data-sp-close>Done</button></div></footer>
    </section>`;
    document.body.appendChild(host);
    host.addEventListener('click',event=>{
      const target=event.target.closest?.('button,[data-sp-pdf]');if(!target||target.disabled)return;
      if(target.matches('[data-sp-close]')){event.preventDefault();close();return;}
      if(target.matches('[data-sp-prev]')){page--;render();return;}
      if(target.matches('[data-sp-next]')){page++;render();return;}
      if(target.matches('[data-sp-export]')){exportReport();return;}
      if(target.matches('[data-sp-pdf]')){event.preventDefault();event.stopPropagation();openPdf(target.dataset.spJob,target.dataset.spPdf);}
    });
    host.querySelector('.sp-history').addEventListener('change',event=>{if(!event.target.disabled&&!isProcessing()&&event.target.value)watch([event.target.value]);});
    host.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key!=='Tab')return;
      const nodes=[...host.querySelectorAll('button:not(:disabled),a[href],select:not(:disabled)')].filter(el=>el.getClientRects().length),first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
    for(const [id,label] of [['scheduleReport','View statement progress']]){
      const target=document.getElementById(id);if(!target)continue;
      const button=document.createElement('button');button.type='button';button.className='secondary sp-reopen';button.textContent=label;
      button.addEventListener('click',async()=>{try{await discover(false);if(ids.length)show();else if(recent.length)watch([recent[0].id]);else prepare('Statement progress','');}catch(error){prepare('Statement progress','');errorText(error.message);}});target.before(button);
    }
  }
  function errorText(message){mount();const el=host.querySelector('#sp-error');el.textContent=message||'';el.hidden=!message;}
  function show(){mount();if(host.hidden){lastFocus=document.activeElement;host.hidden=false;document.body.classList.add('sp-open');host.querySelector('[data-sp-close]').focus({preventScroll:true});}render();poll();}
  function close(){if(!host)return;host.hidden=true;document.body.classList.remove('sp-open');clearTimeout(timer);lastFocus?.focus?.({preventScroll:true});}
  function prepare(title,date){serial++;ids=[];snapshots=[];page=1;localMessage='';preparing=true;progressUnavailable=false;pendingTitle=title||'Account Statements';pendingDate=date||'';mount();errorText('');pdfStatus('');show();}
  async function watch(jobIds,options={}){ids=[...new Set(jobIds.filter(Boolean))];serial++;page=1;snapshots=[];localMessage='';preparing=ids.length>0;progressUnavailable=false;if(options.title)pendingTitle=options.title;mount();errorText('');pdfStatus('');show();await poll();}
  async function startManual(options){prepare('Account Statements — Manual Send',options.statement_date);const data=await api('/api/admin/statements/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options)});await watch([data.job_id]);return data.job_id;}
  async function poll(){
    clearTimeout(timer);if(!ids.length||host?.hidden)return;
    if(busy){timer=setTimeout(poll,500);return;}
    const version=serial,auth=key();busy=true;
    try{
      const results=await Promise.all(ids.map(id=>api('/api/admin/statements/progress?job_id='+encodeURIComponent(id))));
      if(version!==serial||auth!==key())return;
      snapshots=results.map(r=>r.job);preparing=false;progressUnavailable=false;render();errorText(localMessage);
    }catch(error){if(version===serial){progressUnavailable=true;render();errorText(error.message+' Retrying progress; no resend is triggered.');}}
    finally{busy=false;if(!host?.hidden&&ids.length)timer=setTimeout(poll,4000);}
  }
  function rowHtml(row,job){
    const channels=['portal','email','sms'].map(name=>row.channels?.[name]||{status:'queued'});
    const isDone=['complete','failed','stopped'].includes(row.stage),hasError=row.stage==='failed'||row.stage==='stopped'||channels.some(c=>c.status==='failed');
    const selected=channels.filter(c=>c.status!=='not_selected'),finished=selected.filter(c=>!['queued','sending'].includes(c.status)).length;
    const percent=isDone?100:Math.round(((row.pdf_ready?1:0)+finished)/(1+selected.length)*100);
    const status=hasError?(isDone?'Completed with errors':'Sending — issue reported'):row.stage==='complete'?(job.options.dry_run?'Test complete':'Processing complete'):row.stage==='generating'?'Generating PDF':row.stage==='sending'?'Sending statements':row.stage==='stopped'?'Stopped':'Queued';
    const name=row.pdf_ready?'<button type="button" class="sp-customer-link" data-sp-job="'+esc(job.id)+'" data-sp-pdf="'+esc(row.account_number)+'" aria-label="Open PDF statement for '+esc(row.account_name)+'"><span>'+esc(row.account_name)+'</span></button>':'<span class="sp-customer-pending">'+esc(row.account_name)+'</span>';
    return '<tr class="'+(hasError?'sp-has-error':'')+'"><td>'+name+'<small>Customer # '+esc(row.account_number)+(job.source==='test'?' • Test':'')+'</small>'+(!row.pdf_ready?'<small>PDF '+(isDone?'unavailable':'pending')+'</small>':'')+'</td><td class="sp-balance">'+money(row.total_balance)+'</td><td><span class="'+(hasError?'sp-row-error':'')+'">'+esc(status)+'</span><progress max="100" value="'+percent+'" aria-label="Progress for '+esc(row.account_name)+'"></progress><small>'+percent+'%'+(row.error?' • '+esc(row.error):'')+'</small></td>'+channels.map(c=>'<td><span class="sp-badge" data-state="'+esc(c.status)+'">'+esc(labels[c.status]||c.status)+'</span>'+(c.reason?'<small>'+esc(c.reason)+'</small>':'')+'</td>').join('')+'</tr>';
  }
  function render(){
    if(!host)return;
    const rows=snapshots.flatMap(job=>job.rows.map(row=>({row,job}))),total=rows.length,processed=snapshots.reduce((n,j)=>n+j.processed,0),failed=snapshots.reduce((n,j)=>n+j.failed,0),processing=isProcessing(),complete=snapshots.length>0&&!processing,dry=snapshots.length&&snapshots.every(j=>j.options.dry_run);
    host.querySelector('#sp-title').textContent=snapshots.length===1?snapshots[0].title:snapshots.length>1?'Test — All Selected Statement Cycles':pendingTitle;
    const dates=[...new Set(snapshots.map(j=>day(j.statement_date)))];host.querySelector('#sp-date').textContent='Statement date: '+(dates.join(' / ')||day(pendingDate)||'Preparing…');
    host.querySelector('#sp-summary').textContent=snapshots.length?processed.toLocaleString()+' of '+total.toLocaleString()+' processed • '+failed.toLocaleString()+' with errors'+(complete?' • Complete':''):'Preparing selected customers…';
    const percent=complete?100:total?Math.max(0,Math.min(99,Math.round(processed/total*100))):0;
    const status=processing?(progressUnavailable?'Waiting for update…':!snapshots.length?'Preparing…':processed>=total?'Finalizing…':'Processing…'):complete?(failed?'Completed with errors':'Complete'):localMessage?'Stopped':'Ready';
    const progressText=(total||complete?percent+'% • ':'')+status;
    host.querySelector('#sp-overall-status').textContent=progressText;
    const track=host.querySelector('#sp-overall-track'),indeterminate=processing&&!total;
    if(indeterminate)track.removeAttribute('aria-valuenow');else track.setAttribute('aria-valuenow',String(percent));
    track.setAttribute('aria-valuetext',progressText);
    host.querySelector('#sp-overall-fill').style.width=(indeterminate?30:percent)+'%';
    host.querySelector('.sp-overall').hidden=complete;
    host.querySelector('.sp-overall').dataset.state=processing?(progressUnavailable?'waiting':'running'):complete?(failed?'errors':'complete'):'idle';
    host.querySelector('[data-sp-export]').disabled=processing||exporting||!total;
    host.querySelector('#sp-notice').textContent=dry?'Test only — nothing is sent. Click a customer name to open their generated PDF.':complete?'Click a customer name to open their PDF. Email acceptance is not inbox confirmation; SMS delivery updates when reported.':'Keep this page open for manual runs and tests. You can close this window and reopen progress. Customer PDF links appear as files are generated.';
    const pages=Math.max(1,Math.ceil(total/pageSize));page=Math.max(1,Math.min(page,pages));
    const body=host.querySelector('#sp-rows'),html=rows.slice((page-1)*pageSize,page*pageSize).map(({row,job})=>rowHtml(row,job)).join('')||'<tr><td colspan="6" class="sp-empty">'+(snapshots.length?'No customers in this run.':'Preparing statement progress…')+'</td></tr>';
    if(body.innerHTML!==html){const focused=document.activeElement,account=focused?.dataset?.spPdf,job=focused?.dataset?.spJob;body.innerHTML=html;if(account){[...body.querySelectorAll('[data-sp-pdf]')].find(el=>el.dataset.spPdf===account&&el.dataset.spJob===job)?.focus({preventScroll:true});}}
    host.querySelector('#sp-page').textContent='Page '+page+' of '+pages;host.querySelector('[data-sp-prev]').disabled=page<=1;host.querySelector('[data-sp-next]').disabled=page>=pages;
    const select=host.querySelector('.sp-history'),options='<option value="">Select a statement run…</option>'+recent.map(j=>'<option value="'+esc(j.id)+'">'+esc(j.title+' • '+day(j.statement_date)+' • '+(window.WootenTime?.dateTime(j.created_at)||j.created_at+' UTC'))+'</option>').join('');
    select.disabled=processing;
    if(select.innerHTML!==options)select.innerHTML=options;
    select.value=ids.length===1&&recent.some(j=>j.id===ids[0])?ids[0]:'';
  }
  async function finish(message){localMessage=message||'';if(!ids.length)preparing=false;render();await poll();if(message)errorText(message);}
  function pdfStatus(message,url,account){
    mount();const box=host.querySelector('#sp-pdf-status');box.textContent=message;box.hidden=!message;
    if(url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.className='sp-pdf-open';link.textContent='Open PDF';link.setAttribute('aria-label','Open PDF statement for customer '+account);box.append(' ',link);}
  }
  async function openPdf(id,account){
    const token=id+':'+account;if(openingPdfs.has(token))return;openingPdfs.add(token);
    const auth=key(),version=serial;let tab=null;
    pdfStatus('Opening statement for customer '+account+'…');
    try{
      // Reserve a tab during the click, and retain a real link if popups are blocked.
      try{tab=window.open('about:blank','_blank');if(tab)tab.opener=null;}catch{tab=null;}
      const response=await fetch('/api/admin/statements/progress/pdf?'+new URLSearchParams({job_id:id,account}),{headers:{'X-Admin-Key':auth,'Accept':'application/pdf'},cache:'no-store'});
      if(!response.ok){
        const type=response.headers.get('Content-Type')||'';
        const reason=type.includes('json')?(await response.json().catch(()=>({}))).error:await response.text();
        throw new Error(reason||'This statement PDF could not be opened. Please refresh progress and try again.');
      }
      if(!String(response.headers.get('Content-Type')).toLowerCase().includes('application/pdf'))throw new Error('The server did not return a PDF. Refresh the portal and try again.');
      if(auth!==key()){tab?.close();return;}
      const blob=await response.blob();if(auth!==key()){tab?.close();return;}
      const url=URL.createObjectURL(blob);
      pdfUrls.add(url);let opened=false;
      try{if(tab&&!tab.closed){tab.location.href=url;opened=true;}}catch{tab?.close();}
      if(version===serial)pdfStatus(opened?'Statement opened for customer '+account+'.':'Statement ready for customer '+account+'. Click Open PDF to view it.',url,account);
      setTimeout(()=>{URL.revokeObjectURL(url);pdfUrls.delete(url);if(host?.querySelector('.sp-pdf-open')?.getAttribute('href')===url)pdfStatus('Click the customer name to open this statement again.');},300000);
    }catch(error){tab?.close();if(auth===key()&&version===serial)pdfStatus(error.message);}
    finally{openingPdfs.delete(token);}
  }
  async function exportReport(){
    if(isProcessing()||exporting||!snapshots.some(job=>job.rows.length))return;
    if(!window.WootenAdminTablePdf?.exportData){errorText('The PDF exporter is not available. Refresh the portal and try again.');return;}
    const button=host.querySelector('[data-sp-export]'),label=button.querySelector('span');
    exporting=true;button.disabled=true;label.textContent='Exporting…';
    try{
      const rows=snapshots.flatMap(job=>job.rows.map(row=>[
        row.account_name+'\nCustomer # '+row.account_number+(snapshots.length>1?'\n'+job.title:''),money(row.total_balance),
        (row.stage==='complete'?(job.options.dry_run?'Test complete':Object.values(row.channels||{}).some(c=>c.status==='failed')?'Completed with errors':'Processing complete'):row.stage)+(row.error?'\n'+row.error:''),
        ...['portal','email','sms'].map(name=>{const c=row.channels?.[name]||{status:'queued'};return (labels[c.status]||c.status)+(c.reason?'\n'+c.reason:'');})
      ]));
      await window.WootenAdminTablePdf.exportData(host.querySelector('#sp-title').textContent+' — '+host.querySelector('#sp-date').textContent,['Customer / ID','Total balance','Progress','Customer portal','Email PDF','SMS text'],rows);
    }catch(error){errorText(error.message||'The statement progress report could not be exported.');}
    finally{exporting=false;label.textContent='Export PDF';render();}
  }
  async function discover(auto=true){
    const user=window.wootenAdminUser;
    if(!key()||!window.WootenAdminAccess?.has(user,'statements')){if(sessionUser){close();ids=[];snapshots=[];recent=[];preparing=false;progressUnavailable=false;seenAuto.clear();sessionUser=null;}return;}
    const identity=String(user.id||user.username||user.display_name);
    if(sessionUser!==identity){seenAuto.clear();sessionUser=identity;}
    const auth=key(),data=await api('/api/admin/statements/progress');if(auth!==key())return;
    recent=data.jobs||[];render();
    if(auto&&host?.hidden!==false){
      // New automatic jobs open while the admin is here. Older completed jobs stay in history.
      const candidates=recent.filter(j=>j.source==='automatic'&&!seenAuto.has(j.id));
      const item=candidates.find(j=>Date.parse(j.created_at.replace(' ','T')+'Z')>=openedAt)||candidates[0];
      if(item){
        candidates.forEach(j=>seenAuto.add(j.id));
        const state=await api('/api/admin/statements/progress?job_id='+encodeURIComponent(item.id));
        if(auth===key()&&(!state.job.complete||Date.parse(item.created_at.replace(' ','T')+'Z')>=openedAt))await watch([item.id]);
      }
    }
  }
  window.WootenStatementProgress={prepare,watch,startManual,finish,refresh:poll,close,openPdf};
  function boot(){mount();window.addEventListener('wooten-admin-auth-changed',()=>{
    if(!key()||!window.WootenAdminAccess?.has(window.wootenAdminUser,'statements')){serial++;close();ids=[];snapshots=[];recent=[];preparing=false;progressUnavailable=false;seenAuto.clear();sessionUser=null;pdfUrls.forEach(url=>URL.revokeObjectURL(url));pdfUrls.clear();pdfStatus('');render();}
    else discover().catch(()=>{});
  });setInterval(()=>{if(!document.hidden)discover().catch(()=>{});},30000);setTimeout(()=>discover().catch(()=>{}),3000);document.addEventListener('click',event=>{const link=event.target.closest('[data-statement-progress-run]');if(link){event.preventDefault();event.stopPropagation();watch(['schedule-'+link.dataset.statementProgressRun]);}});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
