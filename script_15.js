
(function(){
  const loadBtn=document.getElementById('communicationLogLoad');
  const from=document.getElementById('communicationLogFrom');
  const to=document.getElementById('communicationLogTo');
  const type=document.getElementById('communicationLogType');
  const search=document.getElementById('communicationLogSearch');
  const status=document.getElementById('communicationLogStatus');
  const customersEl=document.getElementById('communicationLogCustomers');
  const pagination=document.getElementById('communicationLogCustomersPagination');
  const prev=document.getElementById('communicationLogCustomersPrev');
  const next=document.getElementById('communicationLogCustomersNext');
  const pageInfo=document.getElementById('communicationLogCustomersPageInfo');
  if(!loadBtn||!customersEl||customersEl.dataset.treeMode!=='true')return;

  let customerPage=1;
  let customers=[];
  let totalCustomers=0;
  const openNodes=new Map();

  function dateValue(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  const now=new Date();
  const earlier=new Date(now);earlier.setDate(earlier.getDate()-90);
  if(!to.value)to.value=dateValue(now);
  if(!from.value)from.value=dateValue(earlier);
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function formatDate(v){
    const d=new Date(String(v||'').replace(' ','T')+'Z');
    return Number.isNaN(d.getTime())?String(v||''):d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function setStatus(message,ok){status.className='status show '+(ok===true?'ok':ok===false?'bad':'');status.textContent=message||'';}
  function params(account,page){
    const p=new URLSearchParams();
    if(from.value)p.set('from',from.value);
    if(to.value)p.set('to',to.value);
    if(type.value)p.set('type',type.value);
    if(search.value.trim())p.set('q',search.value.trim());
    if(account)p.set('account_number',account);
    p.set('page',String(page||1));
    p.set('page_size','20');
    return p;
  }
  async function requestLog(account,page){
    const key=document.getElementById('adminKey').value.trim();
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to view the communication log.');throw new Error('Enter your Admin Import Key first.');}
    const response=await fetch('/api/admin/communication-log?'+params(account,page).toString(),{headers:{'X-Admin-Key':key,'Accept':'application/json'},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.success===false)throw new Error(data.error||'Communication log could not be loaded.');
    return data;
  }
  function channel(label,sent,attempted){
    if(!attempted&&!sent)return '';
    return '<span class="communication-channel '+(sent?'sent':'failed')+'">'+esc(label)+' '+(sent?'Sent':'Failed')+'</span>';
  }
  function entriesHtml(rows){
    if(!rows.length)return '<div class="communication-log-empty">No activity was found for this customer in the selected period.</div>';
    return rows.map(r=>{
      const error=String(r.error_text||'');
      const emailAttempted=!!r.email_sent||/email/i.test(error);
      const smsAttempted=!!r.sms_sent||/sms|phone|twilio/i.test(error);
      const smsStatus=String(r.sms_status||((r.sms_sent&&r.sms_sid)?'pending':'')).toLowerCase();
      const smsLabel={delivered:'Delivered',failed:'Failed',pending:'Pending',opted_out:'Opted Out'}[smsStatus]||'';
      const smsError=String(r.sms_error_message||'');
      const smsDelivery=smsLabel?'<div class="sms-delivery"><span class="sms-status '+esc(smsStatus)+'">SMS '+esc(smsLabel)+'</span>'+
        (smsStatus==='failed'?'<button class="sms-resend" type="button" data-sms-resend="'+Number(r.id||0)+'">Resend SMS</button>':'')+
        (smsError?'<p class="sms-error-detail">'+(r.sms_error_code?'Twilio '+esc(r.sms_error_code)+': ':'')+esc(smsError)+'</p>':'')+'</div>':'';
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
        '</div>'+smsDelivery+(error&&!smsError?'<p class="statement-no-email">'+esc(error)+'</p>':'')+'</article>';
    }).join('');
  }
  function childHtml(account,state){
    if(state.loading)return '<div class="communication-log-empty">Loading customer history…</div>';
    if(state.error)return '<div class="communication-log-empty">'+esc(state.error)+'</div>';
    const start=state.total?((state.page-1)*20)+1:0;
    const end=Math.min(state.page*20,state.total);
    return '<div class="communication-tree-summary"><span>Showing '+start+'–'+end+' of '+state.total+' communication logs</span><span>Page '+state.page+' of '+state.pages+'</span></div>'+
      '<div class="communication-log-entries">'+entriesHtml(state.entries||[])+'</div>'+
      (state.total>20?'<div class="db-pagination communication-pagination">'+
        '<button class="secondary" type="button" data-tree-action="prev" data-account="'+esc(account)+'" '+(state.page<=1?'disabled':'')+'>Previous 20</button>'+
        '<div class="db-page-info">Page '+state.page+' of '+state.pages+'</div>'+
        '<button class="secondary" type="button" data-tree-action="next" data-account="'+esc(account)+'" '+(state.page>=state.pages?'disabled':'')+'>Next 20</button>'+
      '</div>':'');
  }
  function renderCustomers(){
    if(!customers.length){customersEl.innerHTML='<div class="communication-log-empty">No recorded activity was found for this period.</div>';return;}
    customersEl.innerHTML=customers.map(r=>{
      const account=String(r.account_number||'');
      const state=openNodes.get(account);
      const open=!!state;
      return '<div class="communication-tree-node '+(open?'is-open':'')+'" data-tree-node="'+esc(account)+'">'+
        '<button class="communication-customer-row" type="button" data-tree-customer="'+esc(account)+'" aria-expanded="'+(open?'true':'false')+'" data-name="'+esc(r.account_name||'Customer')+'">'+
          '<span class="communication-tree-chevron"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg></span>'+
          '<span class="communication-customer-name"><strong>'+esc(r.account_name||'Customer')+'</strong><small>Customer # '+esc(account)+'</small></span>'+
          '<span class="communication-count"><strong>'+Number(r.total_count||0)+'</strong><small>Total</small></span>'+
          '<span class="communication-count"><strong>'+Number(r.notification_count||0)+'</strong><small>Notices</small></span>'+
          '<span class="communication-count"><strong>'+Number(r.statement_count||0)+'</strong><small>Statements</small></span>'+
          '<span class="communication-count"><strong>'+Number(r.invoice_count||0)+'</strong><small>Invoices</small></span>'+
          '<span class="communication-last">Last sent<br><strong>'+esc(formatDate(r.last_sent_at))+'</strong></span>'+
        '</button>'+
        '<div class="communication-tree-children" '+(open?'':'hidden')+'>'+ (open?childHtml(account,state):'') +'</div>'+
      '</div>';
    }).join('');
  }
  function renderMainPagination(data){
    const page=Math.max(1,Number(data.page||1));
    const pages=Math.max(1,Number(data.pages||1));
    if(pagination)pagination.hidden=Number(data.total||0)<=20;
    if(prev)prev.disabled=page<=1;
    if(next)next.disabled=page>=pages;
    if(pageInfo)pageInfo.textContent='Page '+page+' of '+pages+' • '+Number(data.total||0)+' customers';
  }
  async function loadCustomers(reset){
    if(reset){customerPage=1;openNodes.clear();}
    loadBtn.disabled=true;loadBtn.textContent='Loading Log…';
    beginAdminActionProgress('communicationLogLoad','Loading communication log…');
    await new Promise(resolve=>requestAnimationFrame(resolve));
    try{
      const data=await requestLog('',customerPage);
      customerPage=Number(data.page||customerPage);
      totalCustomers=Number(data.total||0);
      const loadedCustomers=Array.isArray(data.customers)?data.customers:[];
      customers=[];
      if(!loadedCustomers.length){renderCustomers();updateAdminActionProgress('communicationLogLoad',0,0,'Loading communication customers in batches…');}
      for(let i=0;i<loadedCustomers.length;i+=5){
        const chunk=loadedCustomers.slice(i,i+5);
        customers.push(...chunk);
        renderCustomers();
        updateAdminActionProgress('communicationLogLoad',customers.length,loadedCustomers.length,'Loading communication customers in batches…');
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      renderCustomers();renderMainPagination(data);
      setStatus('Showing '+customers.length+' of '+totalCustomers+' customers. Click a customer to expand their communication history.',true);
    }catch(error){setStatus(error.message||'Communication log could not be loaded.',false);}
    finally{hideAdminActionProgress('communicationLogLoad');loadBtn.disabled=false;loadBtn.textContent='Load Communication Log';}
  }
  async function loadNode(account,page){
    const current=openNodes.get(account);
    if(!current)return;
    openNodes.set(account,{loading:true,page:page||1,pages:current.pages||1,total:current.total||0,entries:[]});
    renderCustomers();
    try{
      const data=await requestLog(account,page||1);
      openNodes.set(account,{loading:false,page:Number(data.page||1),pages:Number(data.pages||1),total:Number(data.total||0),entries:Array.isArray(data.entries)?data.entries:[]});
    }catch(error){
      openNodes.set(account,{loading:false,page:1,pages:1,total:0,entries:[],error:error.message||'History could not be loaded.'});
    }
    renderCustomers();
  }
  loadBtn.addEventListener('click',()=>loadCustomers(true));
  customersEl.addEventListener('click',function(e){
    const documentButton=e.target.closest('[data-open-document]');
    if(documentButton){
      e.preventDefault();e.stopPropagation();
      const id=Number(documentButton.getAttribute('data-open-document')||0);
      if(id&&typeof window.openAdminCustomerDocument==='function')window.openAdminCustomerDocument(id);
      return;
    }
    const resend=e.target.closest('[data-sms-resend]');
    if(resend){
      e.preventDefault();e.stopPropagation();
      const id=Number(resend.getAttribute('data-sms-resend')||0);
      const node=resend.closest('[data-tree-node]');
      const account=node?node.getAttribute('data-tree-node'):'';
      const state=openNodes.get(account);
      const key=document.getElementById('adminKey').value.trim();
      if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to resend this SMS.');return;}
      resend.disabled=true;resend.textContent='Resending…';
      fetch('/api/admin/communication-log/resend',{method:'POST',headers:{'X-Admin-Key':key,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({id:id})})
        .then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok||data.success===false)throw new Error(data.error||'SMS could not be resent.');return data;})
        .then(()=>{setStatus('SMS resend was accepted by Twilio and is pending delivery.',true);return loadNode(account,state&&state.page||1);})
        .catch(error=>{setStatus(error.message||'SMS could not be resent.',false);resend.disabled=false;resend.textContent='Resend SMS';});
      return;
    }
    const pager=e.target.closest('[data-tree-action]');
    if(pager){
      e.preventDefault();e.stopPropagation();
      const account=pager.getAttribute('data-account');
      const state=openNodes.get(account);if(!state)return;
      const nextPage=pager.getAttribute('data-tree-action')==='next'?state.page+1:state.page-1;
      if(nextPage>=1&&nextPage<=state.pages)loadNode(account,nextPage);
      return;
    }
    const row=e.target.closest('[data-tree-customer]');if(!row)return;
    const account=row.getAttribute('data-tree-customer');
    if(openNodes.has(account)){openNodes.delete(account);renderCustomers();return;}
    openNodes.set(account,{loading:true,page:1,pages:1,total:0,entries:[]});
    loadNode(account,1);
  });
  if(prev)prev.addEventListener('click',function(){if(customerPage>1){customerPage--;openNodes.clear();loadCustomers(false);}});
  if(next)next.addEventListener('click',function(){customerPage++;openNodes.clear();loadCustomers(false);});
  [from,to,type].forEach(el=>el&&el.addEventListener('change',()=>loadCustomers(true)));
  let timer;search.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(()=>loadCustomers(true),350);});
})();
