
(function(){
  const loadBtn=document.getElementById('statementLoadCustomers');
  const sendBtn=document.getElementById('statementGenerateSend');
  const list=document.getElementById('statementCustomerList');
  const search=document.getElementById('statementCustomerSearch');
  const date=document.getElementById('statementBatchDate');
  const paymentCount=document.getElementById('statementPaymentCount');
  const emailPdf=document.getElementById('statementEmailPdf');
  const portalNotification=document.getElementById('statementPortalNotification');
  const smsLink=document.getElementById('statementSmsLink');
  const phoneScope=document.getElementById('statementPhoneScope');
  const emailScope=document.getElementById('statementEmailScope');
  const selectAllVisible=document.getElementById('statementSelectAllVisible');
  const selectAllCustomers=document.getElementById('statementSelectAllCustomers');
  const clearSelection=document.getElementById('statementClearSelection');
  const selectedCount=document.getElementById('statementSelectedCount');
  const status=document.getElementById('statementBatchStatus');
  const progress=document.getElementById('statementBatchProgress');
  const sendReport=document.getElementById('statementSendReport');
  const customerPagination=document.getElementById('statementCustomerPagination');
  const customerPrev=document.getElementById('statementCustomerPrev');
  const customerNext=document.getElementById('statementCustomerNext');
  const customerPageInfo=document.getElementById('statementCustomerPageInfo');

  if(!loadBtn||!sendBtn||!list) return;

  let customers=[];
  const selected=new Set();
  let customerPage=1;
  const customerPageSize=20;

  function todayLocal(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  if(date && !date.value) date.value=todayLocal();

  function money(v){
    const n=Number(v||0);
    return n.toLocaleString('en-US',{style:'currency',currency:'USD'});
  }
  function customerAddress(c){
    const street=[c.address1,c.address2,c.address3].map(v=>String(v||'').trim()).filter(Boolean).join(', ');
    const cityState=[String(c.city||'').trim(),String(c.state||'').trim()].filter(Boolean).join(', ');
    const cityLine=[cityState,String(c.zip_code||'').trim()].filter(Boolean).join(' ');
    return [street,cityLine].filter(Boolean).join(' • ');
  }
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function eligibleCustomers(){
    return customers.filter(c=>{
      const hasPhone=!!String(c.phone||'').trim();
      const hasEmail=!!String(c.email||'').trim();
      const phoneChoice=phoneScope?phoneScope.value:'all';
      const emailChoice=emailScope?emailScope.value:'all';
      const phoneMatch=phoneChoice==='all'||(phoneChoice==='with'?hasPhone:!hasPhone);
      const emailMatch=emailChoice==='all'||(emailChoice==='with'?hasEmail:!hasEmail);
      return phoneMatch&&emailMatch;
    });
  }
  function scopeSelectLabel(){
    const phoneChoice=phoneScope?phoneScope.value:'all';
    const emailChoice=emailScope?emailScope.value:'all';
    if(phoneChoice==='all'&&emailChoice==='all')return 'Select All Customers';
    const parts=[];
    if(phoneChoice==='with')parts.push('With Phone');
    if(phoneChoice==='without')parts.push('Without Phone');
    if(emailChoice==='with')parts.push('With Email');
    if(emailChoice==='without')parts.push('Without Email');
    return 'Select All '+parts.join(' & ');
  }
  function filteredCustomers(){
    const q=String(search&&search.value||'').trim().toLowerCase();
    const eligible=eligibleCustomers();
    if(!q) return eligible;
    return eligible.filter(c=>[
      c.account_number,c.account_name,c.email,c.phone
    ].join(' ').toLowerCase().includes(q));
  }
  function visibleCustomers(){
    const filtered=filteredCustomers();
    const pages=Math.max(1,Math.ceil(filtered.length/customerPageSize));
    customerPage=Math.min(customerPage,pages);
    const start=(customerPage-1)*customerPageSize;
    return filtered.slice(start,start+customerPageSize);
  }
  function updatePagination(){
    const filtered=filteredCustomers();
    const pages=Math.max(1,Math.ceil(filtered.length/customerPageSize));
    customerPage=Math.min(customerPage,pages);
    const start=filtered.length?((customerPage-1)*customerPageSize)+1:0;
    const end=Math.min(customerPage*customerPageSize,filtered.length);
    if(customerPagination)customerPagination.hidden=filtered.length<=customerPageSize;
    if(customerPrev)customerPrev.disabled=customerPage<=1;
    if(customerNext)customerNext.disabled=customerPage>=pages;
    if(customerPageInfo)customerPageInfo.textContent='Showing '+start+'–'+end+' of '+filtered.length+' • Page '+customerPage+' of '+pages;
  }
  function updateCount(){
    if(selectedCount) selectedCount.textContent=selected.size+' selected';
    if(selectAllVisible){
      const visible=visibleCustomers();
      const checked=visible.length>0 && visible.every(c=>selected.has(c.account_number));
      selectAllVisible.checked=checked;
      selectAllVisible.indeterminate=!checked && visible.some(c=>selected.has(c.account_number));
    }
    updatePagination();
  }
  function render(){
    const visible=visibleCustomers();
    if(!visible.length){
      list.innerHTML='<div class="statement-list-empty">'+(customers.length?'No customers match your search.':'No customers loaded.')+'</div>';
      updateCount();
      return;
    }
    list.innerHTML=visible.map(c=>{
      const acct=esc(c.account_number);
      const hasEmail=!!String(c.email||'').trim();
      const hasPhone=!!String(c.phone||'').trim();
      return '<label class="statement-customer-row">'+
        '<input type="checkbox" class="statement-customer-check" data-account="'+acct+'" '+(selected.has(c.account_number)?'checked':'')+'>'+
        '<span class="statement-customer-name"><strong>'+esc(c.account_name||'Customer')+'</strong><small>Customer # '+acct+'</small><small class="statement-customer-address">'+esc(customerAddress(c)||'No address on file')+'</small></span>'+
        '<span class="statement-money statement-current">'+money(c.current_balance)+'</span>'+
        '<span class="statement-money statement-previous">'+money(c.previous_balance)+'</span>'+
        '<span class="statement-money statement-total">'+money(c.total_balance)+'</span>'+
        '<span class="statement-email '+(hasPhone||hasEmail?'':'statement-no-email')+'">'+
          esc(hasPhone?c.phone:'No phone on file')+'<br>'+esc(hasEmail?c.email:'No email on file')+'</span>'+
      '</label>';
    }).join('');
    updateCount();
  }

  function setStatus(message,ok){
    status.className='status show '+(ok===true?'ok':ok===false?'bad':'');
    status.textContent=message||'';
  }
  function showSendReport({selectedTotal=0,processed=0,succeeded=0,failed=0,portalSent=0,emailSent=0,smsSent=0,batches=0,complete=true,error=''}){
    if(!sendReport)return;
    const metric=(value,label)=>'<div class="statement-send-report-metric"><strong>'+Number(value||0).toLocaleString()+'</strong><span>'+esc(label)+'</span></div>';
    sendReport.innerHTML='<div class="statement-send-report-head"><div><h3>Statement Sending Status Report</h3><p>Statement date: '+esc(date.value||todayLocal())+(error?' • '+esc(error):'')+'</p></div><span class="statement-send-report-status '+(complete?'':'failed')+'">'+(complete?'Completed':'Stopped Early')+'</span></div><div class="statement-send-report-grid">'+
      metric(selectedTotal,'Customers selected')+metric(processed,'Customers processed')+metric(succeeded,'Statements successful')+metric(failed,'Statements failed')+
      metric(portalSent,'Portal sent')+metric(emailSent,'Email sent')+metric(smsSent,'SMS sent')+metric(batches,'Batches processed')+'</div>';
    sendReport.hidden=false;
  }

  async function loadCustomers(){
    const key=document.getElementById('adminKey').value.trim();
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');setStatus('Enter your Admin Import Key in the Admin Login window first.',false);return;}
    loadBtn.disabled=true;loadBtn.textContent='Loading Customers…';
    beginAdminActionProgress('statementCustomerLoad','Loading statement customers…');
    await new Promise(resolve=>requestAnimationFrame(resolve));
    try{
      const res=await fetch('/api/admin/statement-customers',{
        headers:{'X-Admin-Key':key,'Accept':'application/json'},
        cache:'no-store'
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.success===false) throw new Error(data.error||'Customers could not be loaded.');
      const loadedCustomers=Array.isArray(data.customers)?data.customers:[];
      customers=[];
      customerPage=1;
      if(!loadedCustomers.length){render();updateAdminActionProgress('statementCustomerLoad',0,0,'Loading customers in batches…');}
      for(let i=0;i<loadedCustomers.length;i+=200){
        const chunk=loadedCustomers.slice(i,i+200);
        customers.push(...chunk);
        render();
        updateAdminActionProgress('statementCustomerLoad',customers.length,loadedCustomers.length,'Loading customers in batches…');
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      for(const account of Array.from(selected)){
        if(!customers.some(c=>c.account_number===account)) selected.delete(account);
      }
      render();
      setStatus(customers.length+' customers loaded. Select the customers who should receive a statement.',true);
    }catch(e){
      customers=[];selected.clear();render();
      setStatus(e.message||'Customers could not be loaded.',false);
    }finally{
      hideAdminActionProgress('statementCustomerLoad');
      loadBtn.disabled=false;loadBtn.textContent='Load Customers';
    }
  }

  loadBtn.addEventListener('click',loadCustomers);
  search.addEventListener('input',function(){customerPage=1;render();});
  function contactFiltersChanged(){
    customerPage=1;
    const eligible=new Set(eligibleCustomers().map(c=>c.account_number));
    for(const account of Array.from(selected)) if(!eligible.has(account)) selected.delete(account);
    if(selectAllCustomers) selectAllCustomers.textContent=scopeSelectLabel();
    render();
  }
  if(phoneScope)phoneScope.addEventListener('change',contactFiltersChanged);
  if(emailScope)emailScope.addEventListener('change',contactFiltersChanged);
  if(customerPrev)customerPrev.addEventListener('click',function(){if(customerPage>1){customerPage--;render();}});
  if(customerNext)customerNext.addEventListener('click',function(){const pages=Math.max(1,Math.ceil(filteredCustomers().length/customerPageSize));if(customerPage<pages){customerPage++;render();}});

  list.addEventListener('change',function(e){
    const box=e.target.closest('.statement-customer-check');
    if(!box) return;
    const acct=box.getAttribute('data-account');
    if(box.checked) selected.add(acct); else selected.delete(acct);
    updateCount();
  });

  selectAllVisible.addEventListener('change',function(){
    visibleCustomers().forEach(c=>{
      if(selectAllVisible.checked) selected.add(c.account_number);
      else selected.delete(c.account_number);
    });
    render();
  });

  selectAllCustomers.addEventListener('click',function(){
    eligibleCustomers().forEach(c=>selected.add(c.account_number));
    render();
  });

  clearSelection.addEventListener('click',function(){
    selected.clear();
    render();
  });

  async function sendChunk(key,accounts){
    const res=await fetch('/api/admin/statements/generate',{
      method:'POST',
      headers:{
        'X-Admin-Key':key,
        'Content-Type':'application/json',
        'Accept':'application/json'
      },
      body:JSON.stringify({
        accounts,
        statement_date:date.value||todayLocal(),
        payment_count:Number(paymentCount&&paymentCount.value||0),
        portal_notification:!!portalNotification.checked,
        email_pdf:!!emailPdf.checked,
        sms_link:!!smsLink.checked
      })
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok && !Array.isArray(data.results)) throw new Error(data.error||'Statement batch failed.');
    return data;
  }

  sendBtn.addEventListener('click',async function(){
    const key=document.getElementById('adminKey').value.trim();
    const accounts=Array.from(selected);
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');setStatus('Enter your Admin Import Key in the Admin Login window first.',false);return;}
    if(!accounts.length){setStatus('Select at least one customer.',false);return;}
    if(!date.value){setStatus('Choose the statement date.',false);return;}
    if(!portalNotification.checked&&!emailPdf.checked&&!smsLink.checked){setStatus('Choose at least one delivery method: Portal, Email, or SMS.',false);return;}

    const confirmed=window.confirm(
      'Generate and send '+accounts.length+' statement'+(accounts.length===1?'':'s')+'?\\n\\n'+
      'Delivery: '+[
        portalNotification.checked?'Customer Portal':'',
        emailPdf.checked?'Email PDF':'',
        smsLink.checked?'SMS secure link':''
      ].filter(Boolean).join(' + ')+'.'
    );
    if(!confirmed) return;

    sendBtn.disabled=true;loadBtn.disabled=true;
    sendBtn.textContent='Generating Statements…';
    progress.innerHTML='';
    if(sendReport){sendReport.hidden=true;sendReport.innerHTML='';}
    beginAdminActionProgress('statementSend','Generating and sending statements in batches…');
    updateAdminActionProgress('statementSend',0,accounts.length,'Generating and sending statements in batches…');
    setStatus('Generating professional PDF statements. Please keep this page open…');

    let completed=0,succeeded=0,failed=0,portalSent=0,emailSent=0,smsSent=0,batchesProcessed=0;
    try{
      for(let i=0;i<accounts.length;i+=10){
        const chunk=accounts.slice(i,i+10);
        const data=await sendChunk(key,chunk);
        batchesProcessed++;
        const rows=Array.isArray(data.results)?data.results:[];
        rows.forEach(r=>{
          completed++;
          if(r.success) succeeded++; else failed++;
          if(r.portal_notified)portalSent++;
          if(r.email_sent)emailSent++;
          if(r.sms_sent)smsSent++;
          const div=document.createElement('div');
          div.className='statement-result-row '+(r.success?'ok':'bad');
          const delivered=[];
          if(r.portal_notified) delivered.push('Portal');
          if(r.email_sent) delivered.push('Email');
          if(r.sms_sent) delivered.push('SMS');
          div.innerHTML=
            '<span><strong>'+esc(r.account_name||r.account_number||'Customer')+'</strong> '+
            (r.success?'— '+esc(r.filename||'Statement PDF'):(r.error?'— '+esc(r.error):''))+
            '</span>'+
            '<span>'+(r.success?(delivered.join(' + ')||'PDF generated'):'Failed')+'</span>';
          progress.prepend(div);
        });

        sendBtn.textContent='Generating… '+Math.min(i+chunk.length,accounts.length)+' / '+accounts.length;
        updateAdminActionProgress('statementSend',Math.min(i+chunk.length,accounts.length),accounts.length,'Generating and sending statements in batches…');
        setStatus('Processed '+completed+' of '+accounts.length+' statements…');
      }

      setStatus(
        succeeded+' statement'+(succeeded===1?'':'s')+' generated successfully'+
        (failed?' • '+failed+' failed':'')+'.',
        failed===0
      );
      showSendReport({selectedTotal:accounts.length,processed:completed,succeeded,failed,portalSent,emailSent,smsSent,batches:batchesProcessed,complete:true});

      if(succeeded){
        // Keep the generated statements available in the Documents list.
        const firstSelected=accounts[0];
        const docAccount=document.getElementById('docAccount');
        if(docAccount && accounts.length===1){
          docAccount.value=firstSelected;
          const docLoadBtn=document.getElementById('docLoadBtn');
          if(docLoadBtn) docLoadBtn.click();
        }
      }
    }catch(e){
      setStatus(e.message||'Statement generation stopped because of an error.',false);
      showSendReport({selectedTotal:accounts.length,processed:completed,succeeded,failed,portalSent,emailSent,smsSent,batches:batchesProcessed,complete:false,error:e.message||'Statement generation stopped because of an error.'});
    }finally{
      hideAdminActionProgress('statementSend');
      sendBtn.disabled=false;loadBtn.disabled=false;
      sendBtn.textContent='Generate & Send Statements';
    }
  });
})();
