
(function(){
  const treeModeHost=document.getElementById('communicationLogCustomers');
  if(treeModeHost&&treeModeHost.dataset.treeMode==='true')return;
  const loadBtn=document.getElementById('communicationLogLoad');
  const backBtn=document.getElementById('communicationLogBack');
  const from=document.getElementById('communicationLogFrom');
  const to=document.getElementById('communicationLogTo');
  const type=document.getElementById('communicationLogType');
  const search=document.getElementById('communicationLogSearch');
  const status=document.getElementById('communicationLogStatus');
  const customersEl=document.getElementById('communicationLogCustomers');
  const detailEl=document.getElementById('communicationLogDetail');
  const entriesEl=document.getElementById('communicationLogEntries');
  const customerNameEl=document.getElementById('communicationLogCustomerName');
  const customerMetaEl=document.getElementById('communicationLogCustomerMeta');
  const customersPagination=document.getElementById('communicationLogCustomersPagination');
  const customersPrev=document.getElementById('communicationLogCustomersPrev');
  const customersNext=document.getElementById('communicationLogCustomersNext');
  const customersPageInfo=document.getElementById('communicationLogCustomersPageInfo');
  const entriesPagination=document.getElementById('communicationLogEntriesPagination');
  const entriesPrev=document.getElementById('communicationLogEntriesPrev');
  const entriesNext=document.getElementById('communicationLogEntriesNext');
  const entriesPageInfo=document.getElementById('communicationLogEntriesPageInfo');
  if(!loadBtn||!customersEl||!detailEl) return;

  let customerPage=1;
  let detailPage=1;
  let activeAccount='';
  let customerTotal=0;

  function dateValue(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  const now=new Date();
  const earlier=new Date(now);earlier.setDate(earlier.getDate()-90);
  if(!to.value) to.value=dateValue(now);
  if(!from.value) from.value=dateValue(earlier);
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function formatDate(v){
    const d=new Date(String(v||'').replace(' ','T')+'Z');
    return Number.isNaN(d.getTime())?String(v||''):d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function setStatus(message,ok){status.className='status show '+(ok===true?'ok':ok===false?'bad':'');status.textContent=message||'';}
  function params(account,page){
    const p=new URLSearchParams();
    if(from.value)p.set('from',from.value);if(to.value)p.set('to',to.value);
    if(type.value)p.set('type',type.value);if(search.value.trim())p.set('q',search.value.trim());
    if(account)p.set('account_number',account);
    p.set('page',String(page||1));
    p.set('page_size','20');
    return p;
  }
  async function requestLog(account,page){
    const key=document.getElementById('adminKey').value.trim();
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to view the communication log.');throw new Error('Enter your Admin Import Key first.');}
    const res=await fetch('/api/admin/communication-log?'+params(account,page).toString(),{headers:{'X-Admin-Key':key,'Accept':'application/json'},cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.success===false)throw new Error(data.error||'Communication log could not be loaded.');
    return data;
  }
  function renderPagination(container,prev,next,info,data){
    const total=Number(data&&data.total||0);
    const page=Math.max(1,Number(data&&data.page||1));
    const pages=Math.max(1,Number(data&&data.pages||1));
    if(container) container.hidden=total<=20;
    if(prev) prev.disabled=page<=1;
    if(next) next.disabled=page>=pages;
    if(info) info.textContent='Page '+page+' of '+pages+' • '+total+' record'+(total===1?'':'s');
  }
  function renderCustomers(rows){
    detailEl.hidden=true;customersEl.hidden=false;
    if(!rows.length){customersEl.innerHTML='<div class="communication-log-empty">No recorded activity was found for this period.</div>';return;}
    customersEl.innerHTML=rows.map(r=>
      '<button class="communication-customer-row" type="button" data-account="'+esc(r.account_number)+'" data-name="'+esc(r.account_name)+'" data-phone="'+esc(r.phone||'')+'" data-email="'+esc(r.email||'')+'">'+
        '<span class="communication-customer-name"><strong>'+esc(r.account_name||'Customer')+'</strong><small>Customer # '+esc(r.account_number)+'</small></span>'+
        '<span class="communication-count"><strong>'+Number(r.total_count||0)+'</strong><small>Total</small></span>'+
        '<span class="communication-count"><strong>'+Number(r.notification_count||0)+'</strong><small>Notices</small></span>'+
        '<span class="communication-count"><strong>'+Number(r.statement_count||0)+'</strong><small>Statements</small></span>'+
        '<span class="communication-count"><strong>'+Number(r.invoice_count||0)+'</strong><small>Invoices</small></span>'+
        '<span class="communication-last">Last sent<br><strong>'+esc(formatDate(r.last_sent_at))+'</strong></span>'+
      '</button>'
    ).join('');
  }
  function channel(label,sent,attempted){
    if(!attempted&&!sent)return '';
    return '<span class="communication-channel '+(sent?'sent':'failed')+'">'+esc(label)+' '+(sent?'Sent':'Failed')+'</span>';
  }
  function renderEntries(rows){
    if(!rows.length){entriesEl.innerHTML='<div class="communication-log-empty">No activity was found for this customer in the selected period.</div>';return;}
    entriesEl.innerHTML=rows.map(r=>{
      const error=String(r.error_text||'');
      const emailAttempted=!!r.email_sent||/email/i.test(error);
      const smsAttempted=!!r.sms_sent||/sms|phone|twilio/i.test(error);
      const documentId=Number(r.document_id||0);
      const detailText=String(r.detail||'');
      const pdfMatch=documentId?detailText.match(/[^\s<>"']+\.pdf/i):null;
      const detailHtml=pdfMatch
        ?esc(detailText.slice(0,pdfMatch.index))+'<button class="communication-pdf-link" type="button" data-open-document="'+documentId+'">'+esc(pdfMatch[0])+'</button>'+esc(detailText.slice(pdfMatch.index+pdfMatch[0].length))
        :esc(detailText);
      const titleText=esc(r.title||'Customer Communication');
      const titleHtml=documentId&&!pdfMatch?'<button class="communication-pdf-link" type="button" data-open-document="'+documentId+'">'+titleText+'</button>':titleText;
      return '<article class="communication-entry '+esc(r.event_type||'notification')+'">'+
        '<div class="communication-entry-head"><strong>'+esc(String(r.event_type||'notification').toUpperCase())+' — '+titleHtml+'</strong><span class="communication-entry-time">'+esc(formatDate(r.created_at))+'</span></div>'+
        '<p>'+detailHtml+'</p><div class="communication-channels">'+
        channel('Portal',!!r.portal_sent,!!r.portal_sent)+channel('Email',!!r.email_sent,emailAttempted)+channel('SMS',!!r.sms_sent,smsAttempted)+
        '</div>'+(error?'<p class="statement-no-email">'+esc(error)+'</p>':'')+'</article>';
    }).join('');
  }
  async function loadCustomers(resetPage){
    if(resetPage===true) customerPage=1;
    loadBtn.disabled=true;loadBtn.textContent='Loading Log…';
    try{
      const data=await requestLog('',customerPage);
      customerPage=Number(data.page||customerPage);
      customerTotal=Number(data.total||0);
      renderCustomers(Array.isArray(data.customers)?data.customers:[]);
      renderPagination(customersPagination,customersPrev,customersNext,customersPageInfo,data);
      setStatus('Showing '+(data.customers||[]).length+' of '+Number(data.total||0)+' customer communication record(s).',true);
    }
    catch(e){setStatus(e.message||'Communication log could not be loaded.',false);}
    finally{loadBtn.disabled=false;loadBtn.textContent='Load Communication Log';}
  }
  async function loadCustomerEntries(){
    if(!activeAccount)return;
    entriesEl.innerHTML='<div class="communication-log-empty">Loading customer history…</div>';
    try{
      const data=await requestLog(activeAccount,detailPage);
      detailPage=Number(data.page||detailPage);
      renderEntries(Array.isArray(data.entries)?data.entries:[]);
      renderPagination(entriesPagination,entriesPrev,entriesNext,entriesPageInfo,data);
    }catch(err){
      entriesEl.innerHTML='<div class="communication-log-empty">'+esc(err.message||'History could not be loaded.')+'</div>';
      if(entriesPagination)entriesPagination.hidden=true;
    }
  }
  loadBtn.addEventListener('click',function(){loadCustomers(true);});
  customersEl.addEventListener('click',async function(e){
    const row=e.target.closest('.communication-customer-row');if(!row)return;
    const account=row.getAttribute('data-account');
    activeAccount=account;
    detailPage=1;
    customerNameEl.textContent=row.getAttribute('data-name')||'Customer';
    customerMetaEl.textContent='Customer # '+account+' • '+(row.getAttribute('data-phone')||'No phone')+' • '+(row.getAttribute('data-email')||'No email');
    customersEl.hidden=true;detailEl.hidden=false;
    if(customersPagination)customersPagination.hidden=true;
    await loadCustomerEntries();
  });
  backBtn.addEventListener('click',function(){
    detailEl.hidden=true;customersEl.hidden=false;activeAccount='';
    if(customersPagination)customersPagination.hidden=customerTotal<=20;
  });
  if(customersPrev)customersPrev.addEventListener('click',function(){if(customerPage>1){customerPage--;loadCustomers(false);}});
  if(customersNext)customersNext.addEventListener('click',function(){customerPage++;loadCustomers(false);});
  if(entriesPrev)entriesPrev.addEventListener('click',function(){if(detailPage>1){detailPage--;loadCustomerEntries();}});
  if(entriesNext)entriesNext.addEventListener('click',function(){detailPage++;loadCustomerEntries();});
  [from,to,type].forEach(el=>el&&el.addEventListener('change',function(){loadCustomers(true);}));
  let timer;search.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(function(){loadCustomers(true);},350);});
})();
