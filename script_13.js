
(function(){
  const panel=document.getElementById('documentSectionStatementScheduling');
  if(!panel)return;
  const get=id=>document.getElementById(id);
  const weeklyEnabled=get('scheduleWeeklyEnabled'),weeklyDay=get('scheduleWeeklyDay'),weeklyHour=get('scheduleWeeklyHour'),weeklyFrequency=get('scheduleWeeklyFrequency'),weeklyAnchor=get('scheduleWeeklyAnchorDate'),weeklyAnchorField=get('scheduleWeeklyAnchorField');
  const midmonthEnabled=get('scheduleMidmonthEnabled'),midmonthDay=get('scheduleMidmonthDay'),midmonthHour=get('scheduleMidmonthHour');
  const monthlyEnabled=get('scheduleMonthlyEnabled'),monthlyDay=get('scheduleMonthlyDay'),monthlyHour=get('scheduleMonthlyHour');
  const positiveOnly=get('schedulePositiveOnly'),paymentCount=get('schedulePaymentCount'),portal=get('schedulePortal'),email=get('scheduleEmail'),sms=get('scheduleSms');
  const saveBtn=get('scheduleSave'),refreshBtn=get('scheduleRefresh'),status=get('scheduleStatus'),report=get('scheduleReport');
  const previewTargets={monthly:get('schedulePreviewMonthlyResults'),midmonth:get('schedulePreviewMidmonthResults'),weekly:get('schedulePreviewWeeklyResults')};
  const previewCustomerData={monthly:[],midmonth:[],weekly:[]};
  const bulkSelections={monthly:new Set(),weekly:new Set()};
  const openPreviewTypes=new Set();
  let loaded=false,loading=false;

  document.querySelectorAll('[data-hour-select]').forEach(select=>{
    if(select.options.length)return;
    for(let hour=0;hour<24;hour++){
      const option=document.createElement('option');option.value=String(hour);
      const suffix=hour>=12?'PM':'AM';const shown=hour%12||12;
      option.textContent=shown+':00 '+suffix+' Central';select.appendChild(option);
    }
  });

  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function money(value){return Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD'});}
  function displayDate(value){
    if(!value)return '';
    const raw=String(value).replace(' ','T')+(String(value).includes('T')?'':'Z');const date=new Date(raw);
    return Number.isNaN(date.getTime())?String(value):date.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function setStatus(message,ok){status.className='status show '+(ok===true?'ok':ok===false?'bad':'');status.textContent=message||'';}
  function key(){return (get('adminKey').value||'').trim();}
  function configBody(){return {
    weekly_enabled:weeklyEnabled.checked,weekly_weekday:Number(weeklyDay.value),weekly_hour:Number(weeklyHour.value),weekly_frequency:weeklyFrequency.value,weekly_anchor_date:weeklyAnchor.value,
    midmonth_enabled:false,midmonth_day:Number(midmonthDay.value),midmonth_hour:Number(midmonthHour.value),
    monthly_enabled:monthlyEnabled.checked,monthly_day:Number(monthlyDay.value),monthly_hour:Number(monthlyHour.value),
    positive_balance_only:positiveOnly.checked,payment_count:Number(paymentCount.value),portal_enabled:portal.checked,email_enabled:email.checked,sms_enabled:sms.checked
  };}
  function syncWeeklyFrequency(){
    const enabled=weeklyEnabled.checked;
    const biweekly=weeklyFrequency.value==='biweekly';
    weeklyAnchorField.hidden=!biweekly;
    weeklyAnchor.required=enabled&&biweekly;
    weeklyFrequency.disabled=!enabled;
    weeklyHour.disabled=!enabled;
    weeklyAnchor.disabled=!enabled;
    weeklyDay.disabled=!enabled||biweekly;
    if(biweekly&&weeklyAnchor.value){const selected=new Date(weeklyAnchor.value+'T12:00:00');if(!Number.isNaN(selected.getTime()))weeklyDay.value=String(selected.getDay());}
  }
  function selectedAccounts(type){return [...(bulkSelections[type]||new Set())].filter(Boolean);}
  function syncRunSelectionState(type){
    const count=bulkSelections[type]?.size||0;
    const cycleOn=type==='weekly'?weeklyEnabled.checked:monthlyEnabled.checked;
    const ids=type==='weekly'?['scheduleTestWeekly','scheduleRunWeekly']:['scheduleTestMonthly','scheduleRunMonthly'];
    ids.forEach(id=>{const button=get(id);if(!button)return;button.disabled=!cycleOn||count===0;button.title=count?('Will process '+count.toLocaleString()+' selected customer'+(count===1?'':'s')+'.'):'Open Preview '+(type==='weekly'?'B':'A')+' Customers and select at least one customer first.';});
  }
  function syncCycleEnabledState(){
    const monthlyOn=monthlyEnabled.checked,weeklyOn=weeklyEnabled.checked;
    monthlyDay.disabled=!monthlyOn;monthlyHour.disabled=!monthlyOn;
    const monthlyPreview=get('schedulePreviewMonthly');if(monthlyPreview)monthlyPreview.disabled=!monthlyOn;
    const weeklyPreview=get('schedulePreviewWeekly');if(weeklyPreview)weeklyPreview.disabled=!weeklyOn;
    syncRunSelectionState('monthly');syncRunSelectionState('weekly');
    syncWeeklyFrequency();
    const testAll=get('scheduleTestAll');if(testAll)testAll.disabled=(!monthlyOn&&!weeklyOn)||((bulkSelections.monthly?.size||0)+(bulkSelections.weekly?.size||0)===0);
  }
  function applyConfig(config){
    weeklyEnabled.checked=Number(config.weekly_enabled)!==0;weeklyDay.value=String(config.weekly_weekday??1);weeklyHour.value=String(config.weekly_hour??8);weeklyFrequency.value=String(config.weekly_frequency||'weekly')==='biweekly'?'biweekly':'weekly';weeklyAnchor.value=/^\d{4}-\d{2}-\d{2}$/.test(String(config.weekly_anchor_date||''))?String(config.weekly_anchor_date):'';syncWeeklyFrequency();
    midmonthEnabled.checked=false;midmonthDay.value=String(config.midmonth_day??15);midmonthHour.value=String(config.midmonth_hour??8);
    monthlyEnabled.checked=Number(config.monthly_enabled)!==0;monthlyDay.value=String(config.monthly_day??1);monthlyHour.value=String(config.monthly_hour??8);
    positiveOnly.checked=Number(config.positive_balance_only)!==0;paymentCount.value=String(config.payment_count??1);portal.checked=Number(config.portal_enabled)!==0;email.checked=Number(config.email_enabled)!==0;sms.checked=Number(config.sms_enabled)!==0;
    syncCycleEnabledState();
  }
  function deliveryReasonText(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    const key=raw.toLowerCase();
    const map={
      no_email:'No email address is on file for this customer.',
      email_not_configured:'Email delivery service is not configured.',
      email_not_selected:'Email delivery is disabled for this customer.',
      email_disabled:'Email delivery is disabled in Statement & Delivery Settings.',
      no_phone:'No phone number is on file for this customer.',
      sms_not_selected:'SMS delivery is disabled for this customer.',
      sms_disabled:'SMS delivery is disabled in Statement & Delivery Settings.',
      duplicate_send_prevented:'Duplicate delivery was prevented for safety.',
      portal_insert_failed:'The portal notification could not be created.'
    };
    if(map[key])return map[key];
    if(key.includes('21610'))return 'Customer has opted out of SMS messages (Twilio 21610).';
    return raw.replace(/_/g,' ');
  }
  function deliveryResultCell(label,sent,reason){
    const message=deliveryReasonText(reason);
    const notAttempted=!sent&&/(disabled in statement|not attempted|dry test)/i.test(message);
    const state=sent?'sent':notAttempted?'not-attempted':'failed';
    const statusText=sent?'Sent':notAttempted?'Not attempted':'Not sent';
    const detail=sent?'':(message||'No failure reason was saved for this older run.');
    return '<span class="schedule-result-channel '+state+'"><b>'+esc(label)+': '+statusText+'</b>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</span>';
  }
  function deliveryWarningReasonText(value,channel){
    const raw=String(value||'').trim();
    if(!raw)return channel==='email'?'Email not delivered':'SMS not delivered';
    const key=raw.toLowerCase();
    const map={
      no_email:'No email on file',
      email_not_configured:'Email service not configured',
      email_not_selected:'Email disabled for this customer',
      email_disabled:'Email disabled in settings',
      no_phone:'No phone on file',
      sms_not_selected:'SMS disabled for this customer',
      sms_disabled:'SMS disabled in settings',
      duplicate_send_prevented:'Duplicate delivery prevented',
      portal_insert_failed:'Portal notification could not be created'
    };
    if(map[key])return map[key];
    if(key.includes('21610'))return 'SMS opted out';
    if(key.includes('statement generation failed'))return 'Statement generation failed';
    return raw.replace(/_/g,' ');
  }
  function emailSmsWarningMarkup(row,isTest,isTestSend){
    if(isTest&&!isTestSend)return '';
    if(row.email_sent||row.sms_sent)return '';
    const generationReason=!row.success&&row.error?('Statement generation failed: '+row.error):'';
    const emailReason=deliveryWarningReasonText(row.email_warning||generationReason,'email');
    const smsReason=deliveryWarningReasonText(row.sms_warning||generationReason,'sms');
    const summary=emailReason===smsReason?emailReason:(emailReason+' + '+smsReason);
    return '<span class="schedule-delivery-warning" title="Email and SMS were not delivered."><span class="schedule-delivery-warning-icon" aria-hidden="true">&#9888;</span><span class="schedule-delivery-warning-text">Email + SMS not delivered — '+esc(summary)+'</span></span>';
  }
  function renderRuns(runs){
    if(!Array.isArray(runs)||!runs.length){report.innerHTML='<div class="schedule-empty">No scheduled statement runs have been recorded yet.</div>';return;}
    report.innerHTML=runs.map(run=>{
      const rows=Array.isArray(run.results)?run.results:[];
      const isTest=String(run.run_type||'').startsWith('test_');
      const isTestSend=isTest&&String(run.run_key||'').startsWith('testsend:');
      const baseType=isTest?String(run.run_type).slice(5):run.run_type;
      const details=rows.length?rows.map(row=>(isTest&&!isTestSend)
        ?'<div class="schedule-result-row"><strong>'+esc(row.account_name||row.account_number||'Customer')+'<small style="display:block;color:#758596"># '+esc(row.account_number||'')+'</small></strong><span>PDF: '+(row.success?'Generated':'Failed')+'</span><span>Payments: '+Number(row.payment_count||0)+'</span><span>Balance: '+esc(money(row.total_balance||0))+(row.error?' • '+esc(row.error):'')+'</span></div>'
        :(function(){const generationReason=!row.success&&row.error?('Statement generation failed: '+row.error):'';return '<div class="schedule-result-row"><div class="schedule-customer-cell"><strong>'+esc(row.account_name||row.account_number||'Customer')+'<small style="display:block;color:#758596"># '+esc(row.account_number||'')+'</small></strong>'+emailSmsWarningMarkup(row,isTest,isTestSend)+'</div>'+deliveryResultCell('Portal',!!row.portal_notified,row.portal_warning||generationReason)+deliveryResultCell('Email',!!row.email_sent,row.email_warning||generationReason)+deliveryResultCell('SMS',!!row.sms_sent,row.sms_warning||generationReason)+'</div>';}())).join(''):'<div class="schedule-empty">No customers matched this run.</div>';
      const type=baseType==='weekly'?'B — Weekly / Biweekly Cycle':baseType==='midmonth'?'Legacy Mid-Month Run':'A — Monthly Cycle';
      const deliveryMetrics=isTest&&!isTestSend
        ?'<span class="schedule-run-metric">Dry test — no delivery attempted</span>'
        :'<span class="schedule-run-metric">Portal '+Number(run.portal_success||0)+' / '+Number(run.portal_failure||0)+' not sent</span><span class="schedule-run-metric">Email '+Number(run.email_success||0)+' / '+Number(run.email_failure||0)+' not sent</span><span class="schedule-run-metric">SMS '+Number(run.sms_success||0)+' / '+Number(run.sms_failure||0)+' not sent</span>';
      return '<details class="schedule-run"><summary><div class="schedule-run-title"><strong>'+(isTest?(isTestSend?'TEST SEND (LEGACY) — ':'TEST RUN — '):'')+type+'</strong><span>'+esc(displayDate(run.started_at))+' • '+esc(run.status||'')+'</span></div><div class="schedule-run-metrics">'+
        (isTest?'<span class="schedule-run-metric">'+(isTestSend?'TEST SEND (LEGACY)':'TEST RUN')+'</span>':'')+'<span class="schedule-run-metric">'+Number(run.customer_count||0).toLocaleString()+' customers</span><span class="schedule-run-metric">'+Number(run.processed_count||0).toLocaleString()+' processed</span><span class="schedule-run-metric">'+Math.max(0,Number(run.customer_count||0)-Number(run.processed_count||0)).toLocaleString()+' remaining</span><span class="schedule-run-metric good">'+Number(run.success_count||0).toLocaleString()+' generated</span>'+
        (Number(run.failure_count||0)?'<span class="schedule-run-metric bad">'+Number(run.failure_count)+' failed</span>':'')+
        deliveryMetrics+'</div></summary><div class="schedule-run-detail">'+details+'</div></details>';
    }).join('');
  }
  async function request(path,options={},allowReportedFailure=false){
    const adminKey=key();if(!adminKey){window.ensureAdminLoginKey('Enter your Admin Import Key to manage statement scheduling.');throw new Error('Enter your Admin Import Key first.');}
    const response=await fetch(path,{...options,headers:{...(options.headers||{}),'X-Admin-Key':adminKey,'Accept':'application/json'},cache:'no-store'});
    const data=await response.json().catch(()=>({}));if(!response.ok||(!allowReportedFailure&&data.success===false))throw new Error(data.error||'Statement scheduling request failed.');return data;
  }
  async function requireSelectedRecipientServer(requireTestAll=false){
    const probe=await request('/api/admin/statement-scheduling?compact=1');
    if(probe?.capabilities?.selected_statement_recipients_v2!==true){
      throw new Error('SAFETY STOP: the deployed statement server is an older version that may use every customer in the cycle. No Test/Run was started. Deploy the current worker/server code before using Test or Run.');
    }
    if(probe?.capabilities?.statement_batch_claim_v1!==true){
      throw new Error('SAFETY STOP: the deployed statement server does not have duplicate batch protection. No Test/Run was started. Deploy the Ver110 worker/server code first.');
    }
    if(probe?.capabilities?.statement_channel_dedupe_v1!==true){
      throw new Error('SAFETY STOP: the deployed statement server does not have per-customer Email/SMS/Portal duplicate-send protection. No Test/Run was started. Deploy the Ver110 worker/server code first.');
    }
    if(requireTestAll&&probe?.capabilities?.statement_dry_test_v1!==true){
      throw new Error('SAFETY STOP: the deployed statement server does not support no-delivery Test All mode. Deploy the current worker/server code before using Test All Cycles.');
    }
    if(requireTestAll&&probe?.capabilities?.selected_statement_test_all_v1!==true){
      throw new Error('SAFETY STOP: the deployed statement server does not support selected-customer Test All Cycles. No statements were sent. Deploy the Ver107 worker/server code first.');
    }
    return probe;
  }
  function normalizeSelectedAccount(value){const digits=String(value||'').replace(/\D/g,'');return digits?digits.padStart(7,'0'):'';}
  function verifySelectedRunTargets(data,accounts){
    const requested=[...new Set((accounts||[]).map(normalizeSelectedAccount).filter(Boolean))];
    const returned=[...new Set((Array.isArray(data?.target_accounts)?data.target_accounts:[]).map(normalizeSelectedAccount).filter(Boolean))];
    const same=requested.length===returned.length&&requested.every(account=>returned.includes(account));
    if(data?.selection_enforced!==true||Number(data?.total)!==requested.length||!same||data?.resumed===true){
      throw new Error('SAFETY STOP: the server did not confirm the exact selected-customer list. No test processing was continued. Selected: '+requested.length.toLocaleString()+', server targets: '+Number(data?.total||returned.length||0).toLocaleString()+'.');
    }
  }
  async function saveSettings(showMessage=true){
    if(weeklyEnabled.checked&&weeklyFrequency.value==='biweekly'&&!weeklyAnchor.value){weeklyAnchor.focus();throw new Error('Select the first biweekly Cycle B run date.');}
    const data=await request('/api/admin/statement-scheduling',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(configBody())});
    applyConfig(data.config||{});renderRuns(data.runs||[]);loaded=true;if(showMessage)setStatus('Statement scheduling settings saved.',true);return data;
  }
  async function load(){
    if(loading)return;loading=true;
    try{const data=await request('/api/admin/statement-scheduling');applyConfig(data.config||{});renderRuns(data.runs||[]);loaded=true;setStatus('Scheduling settings and reports loaded.',true);}
    catch(error){setStatus(error.message||'Scheduling could not be loaded.',false);}finally{loading=false;}
  }
  function previewCustomerRow(row,type){
    const cycle=String(row.statement_cycle||'A').toUpperCase();
    const account=String(row.account_number||'');
    return '<div class="schedule-preview-row" data-schedule-customer="'+esc(account)+'"><label class="schedule-bulk-check" title="Select for Test / Run or cycle move"><input type="checkbox" data-bulk-cycle-customer data-preview-type="'+type+'" value="'+esc(account)+'" '+(bulkSelections[type]?.has(account)?'checked':'')+' aria-label="Select '+esc(row.account_name||account)+' for Test or Run"></label><strong>'+esc(row.account_name||'Customer')+'<small style="display:block;color:#758596"># '+esc(account)+'</small></strong><span class="schedule-preview-balance">'+esc(money(row.total_balance))+'</span><div class="schedule-customer-cycle"><select aria-label="Statement cycle for '+esc(row.account_name||account||'customer')+'"><option value="A" '+(cycle==='A'?'selected':'')+'>A — Monthly</option><option value="B" '+(cycle==='B'?'selected':'')+'>B — Weekly / Biweekly</option></select><button type="button" data-save-statement-cycle>Save Cycle</button></div></div>';
  }
  function updateBulkControls(type){const preview=previewTargets[type],selected=bulkSelections[type]?.size||0,count=preview?.querySelector('[data-bulk-selected-count]'),move=preview?.querySelector('[data-bulk-move]'),clear=preview?.querySelector('[data-bulk-clear]');if(count)count.textContent=selected.toLocaleString()+' selected for Test / Run';if(move)move.disabled=selected===0;if(clear)clear.disabled=selected===0;syncRunSelectionState(type);const testAll=get('scheduleTestAll');if(testAll)testAll.disabled=(!monthlyEnabled.checked&&!weeklyEnabled.checked)||((bulkSelections.monthly?.size||0)+(bulkSelections.weekly?.size||0)===0);}
  function setBulkProgress(type,processed,total,moved,failed,label='Moving customers…'){
    const host=previewTargets[type]?.querySelector('[data-bulk-progress]');if(!host)return;
    const percent=total?Math.min(100,Math.round(processed/total*100)):100;host.hidden=false;
    const title=host.querySelector('[data-bulk-progress-label]'),count=host.querySelector('[data-bulk-progress-count]'),track=host.querySelector('[data-bulk-progress-track]'),bar=host.querySelector('[data-bulk-progress-bar]');
    if(title)title.textContent=label;if(count)count.textContent=processed.toLocaleString()+' / '+total.toLocaleString()+' • '+moved.toLocaleString()+' moved'+(failed?' • '+failed.toLocaleString()+' failed':'');if(bar)bar.style.width=percent+'%';if(track)track.setAttribute('aria-valuenow',String(percent));
  }
  function renderPreviewMatches(type,query=''){
    const preview=previewTargets[type],summary=preview?.querySelector('.schedule-preview-summary');
    if(!summary)return;
    const normalized=String(query||'').trim().toLowerCase();
    const all=previewCustomerData[type]||[];
    const matches=normalized?all.filter(row=>(String(row.account_name||'')+' '+String(row.account_number||'')).toLowerCase().includes(normalized)):all;
    const shown=matches.slice(0,100);
    const count=summary.querySelector('[data-schedule-preview-count]');
    if(count)count.innerHTML=normalized
      ?'<strong class="schedule-preview-count-number">'+matches.length.toLocaleString()+'</strong> customer(s) match this search'+(matches.length>100?' • showing first 100':'')+'.'
      :'<strong class="schedule-preview-count-number">'+all.length.toLocaleString()+'</strong> customer(s) match the saved schedule'+(all.length>100?' • showing first 100':'')+'. Select the customer(s) you want Test / Run to process. The same selection can also be used for a bulk cycle move.';
    const list=summary.querySelector('.schedule-preview-list');
    if(list)list.innerHTML=shown.length?shown.map(row=>previewCustomerRow(row,type)).join(''):'<div class="schedule-empty">'+(normalized?'No customers match this search.':'No customers match this schedule.')+'</div>';
    updateBulkControls(type);
  }
  async function showPreview(type,saveFirst=true){
    const preview=previewTargets[type];
    if(!preview)return;
    openPreviewTypes.add(type);
    preview.innerHTML='<div class="schedule-preview-summary"><strong>Loading customers…</strong></div>';
    try{
      if(saveFirst)await saveSettings(false);setStatus('Loading scheduled customers…');
      const data=await request('/api/admin/statement-scheduling/preview?type='+encodeURIComponent(type));
      const title=type==='weekly'?'B — Weekly / Biweekly Customers':type==='midmonth'?'Legacy Mid-Month Customers':'A — Monthly Cycle Customers';
      previewCustomerData[type]=data.customers||[];
      const total=previewCustomerData[type].length;
      const destination=type==='weekly'?'A':'B';
      preview.innerHTML='<div class="schedule-preview-summary"><strong>'+title+'</strong><p data-schedule-preview-count></p><input class="schedule-preview-search" type="search" data-schedule-preview-search data-preview-type="'+type+'" placeholder="Search customer name or number…" aria-label="Search '+title+'"><div class="schedule-bulk-toolbar"><button type="button" data-bulk-select-matching data-preview-type="'+type+'">Select All Matching</button><button type="button" data-bulk-clear data-preview-type="'+type+'" disabled>Clear Selection</button><button type="button" data-bulk-move data-preview-type="'+type+'" data-target-cycle="'+destination+'" disabled>Move Selected to Cycle '+destination+'</button><span class="schedule-bulk-count" data-bulk-selected-count>0 selected</span></div><div class="preview-progress schedule-bulk-progress" data-bulk-progress hidden><div class="preview-progress-head"><strong data-bulk-progress-label>Moving customers…</strong><span data-bulk-progress-count>Preparing</span></div><div class="preview-progress-track" data-bulk-progress-track role="progressbar" aria-label="Bulk customer cycle move progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-bulk-progress-bar></span></div></div><div class="schedule-preview-list"></div></div>';
      renderPreviewMatches(type,'');
      setStatus(Number(data.count||0)+' customers match the '+(type==='weekly'?'Cycle B':type==='midmonth'?'legacy mid-month':'monthly A')+' schedule.',true);
    }catch(error){preview.innerHTML='<div class="schedule-empty">'+esc(error.message||'Preview could not be loaded.')+'</div>';setStatus(error.message||'Preview could not be loaded.',false);}
  }
  panel.addEventListener('input',event=>{
    const input=event.target.closest('[data-schedule-preview-search]');
    if(!input)return;
    renderPreviewMatches(input.dataset.previewType,input.value);
    input.focus();
  });
  panel.addEventListener('change',event=>{
    const checkbox=event.target.closest('[data-bulk-cycle-customer]');if(!checkbox)return;
    const type=checkbox.dataset.previewType,selection=bulkSelections[type];if(!selection)return;
    if(checkbox.checked)selection.add(checkbox.value);else selection.delete(checkbox.value);updateBulkControls(type);
  });
  panel.addEventListener('click',async event=>{
    const bulkButton=event.target.closest('[data-bulk-select-matching],[data-bulk-clear],[data-bulk-move]');
    if(bulkButton){
      const type=bulkButton.dataset.previewType,selection=bulkSelections[type],preview=previewTargets[type];if(!selection||!preview)return;
      const query=String(preview.querySelector('[data-schedule-preview-search]')?.value||'').trim().toLowerCase();
      const matches=(previewCustomerData[type]||[]).filter(row=>!query||(String(row.account_name||'')+' '+String(row.account_number||'')).toLowerCase().includes(query));
      if(bulkButton.hasAttribute('data-bulk-select-matching')){matches.forEach(row=>selection.add(String(row.account_number||'')));renderPreviewMatches(type,query);return;}
      if(bulkButton.hasAttribute('data-bulk-clear')){selection.clear();renderPreviewMatches(type,query);return;}
      const targetCycle=bulkButton.dataset.targetCycle;if(!['A','B'].includes(targetCycle)||!selection.size)return;
      const accounts=[...selection];
      if(!window.confirm('Move '+accounts.length.toLocaleString()+' selected customer'+(accounts.length===1?'':'s')+' to Cycle '+targetCycle+'?'))return;
      preview.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);bulkButton.textContent='Moving…';
      try{
        const batchSize=50;let processed=0,moved=0,failed=0;const errors=[];setBulkProgress(type,0,accounts.length,0,0,'Preparing customer batches…');
        for(let start=0;start<accounts.length;start+=batchSize){
          const batch=accounts.slice(start,start+batchSize);
          try{const data=await request('/api/admin/customer-statement-cycle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account_numbers:batch,statement_cycle:targetCycle})});moved+=Number(data.updated||0);}
          catch(error){failed+=batch.length;errors.push(error.message||'A customer batch failed.');}
          processed+=batch.length;setBulkProgress(type,processed,accounts.length,moved,failed,processed>=accounts.length?'Bulk move complete':'Moving customer batches…');setStatus('Moving customers: '+processed.toLocaleString()+' of '+accounts.length.toLocaleString()+' processed.',failed===0?undefined:false);
        }
        await new Promise(resolve=>window.setTimeout(resolve,500));
        selection.clear();
        for(const previewType of ['monthly','weekly'])await showPreview(previewType,false);
        setStatus(moved.toLocaleString()+' customer'+(moved===1?'':'s')+' moved to Cycle '+targetCycle+(failed?' • '+failed.toLocaleString()+' could not be processed. '+errors[0]:'.'),failed===0);
      }catch(error){bulkButton.disabled=false;bulkButton.textContent='Move Selected to Cycle '+targetCycle;setStatus(error.message||'Selected customers could not be moved.',false);}
      return;
    }
    const button=event.target.closest('[data-save-statement-cycle]');
    if(!button)return;
    const row=button.closest('[data-schedule-customer]');
    const account=row?.dataset.scheduleCustomer||'';
    const select=row?.querySelector('select');
    const cycle=select?.value||'';
    if(!account||!cycle)return;
    button.disabled=true;button.textContent='Saving…';
    try{
      const data=await request('/api/admin/customer-statement-cycle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account_number:account,statement_cycle:cycle})});
      for(const openType of [...openPreviewTypes])await showPreview(openType,false);
      setStatus((data.account_name||account)+' moved to Cycle '+cycle+'.',true);
    }catch(error){button.disabled=false;button.textContent='Save Cycle';setStatus(error.message||'Customer cycle could not be saved.',false);}
  });
  const testProgressTimers=new Map();
  function testProgressParts(type){
    const prefix=type==='all'?'scheduleTestAll':type==='weekly'?'scheduleTestWeekly':type==='midmonth'?'scheduleTestMidmonth':'scheduleTestMonthly';
    return {host:get(prefix+'Progress'),label:get(prefix+'ProgressLabel'),count:get(prefix+'ProgressCount'),track:get(prefix+'ProgressTrack'),bar:get(prefix+'ProgressBar')};
  }
  function setTestProgress(type,percent,label,count){
    const parts=testProgressParts(type);if(!parts.host)return;
    const value=Math.max(0,Math.min(100,Math.round(Number(percent)||0)));
    parts.host.hidden=false;
    if(label)parts.label.textContent=label;
    parts.count.textContent=count||value+'%';
    parts.bar.style.width=value+'%';
    parts.track.setAttribute('aria-valuenow',String(value));
  }
  function startTestProgress(type,label){
    const previous=testProgressTimers.get(type);if(previous)window.clearInterval(previous);
    testProgressTimers.delete(type);
    /* Ver123: never simulate statement progress. The bar must reflect only
       the server's real processed/customer counts so it always matches the
       status text shown above the cycle cards. */
    setTestProgress(type,0,label,'Preparing');
  }
  async function finishTestProgress(type,label){
    const timer=testProgressTimers.get(type);if(timer)window.clearInterval(timer);testProgressTimers.delete(type);
    setTestProgress(type,100,label||'Test complete','100%');
    await new Promise(resolve=>window.setTimeout(resolve,650));
    const parts=testProgressParts(type);if(parts.host)parts.host.hidden=true;
  }
  function hideTestProgress(type){
    const timer=testProgressTimers.get(type);if(timer)window.clearInterval(timer);testProgressTimers.delete(type);
    const parts=testProgressParts(type);if(parts.host)parts.host.hidden=true;
  }
  function showStatementProcessingOverlay(title,message){
    const overlay=get('statementProcessingOverlay');if(!overlay)return;
    const titleEl=get('statementProcessingTitle'),messageEl=get('statementProcessingMessage'),liveEl=get('statementProcessingLive');
    if(titleEl)titleEl.textContent=title||'Processing statements…';
    if(messageEl)messageEl.textContent=message||'Please keep this page open. This may take a few minutes to complete.';
    if(liveEl)liveEl.textContent='Preparing…';
    overlay.hidden=false;overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('statement-processing-active');
  }
  function updateStatementProcessingOverlay(percent,text,title){
    const overlay=get('statementProcessingOverlay');if(!overlay||overlay.hidden)return;
    const titleEl=get('statementProcessingTitle'),liveEl=get('statementProcessingLive');
    if(title&&titleEl)titleEl.textContent=title;
    if(liveEl){
      const value=Math.max(0,Math.min(100,Math.round(Number(percent)||0)));
      liveEl.textContent=text||value+'% complete';
    }
  }
  function hideStatementProcessingOverlay(){
    const overlay=get('statementProcessingOverlay');if(!overlay)return;
    overlay.hidden=true;overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('statement-processing-active');
  }
  function showStatementResultPopup(message){
    /* Ver130: native alert() blocks browser painting. Close the processing
       dialog first, then wait for a paint before opening the completion popup
       so the finished dialog cannot remain visibly frozen behind the alert. */
    hideStatementProcessingOverlay();
    const show=()=>{
      window.setTimeout(()=>{
        window.alert(message);
        (report.previousElementSibling||report).scrollIntoView({behavior:'smooth',block:'start'});
      },80);
    };
    if(typeof window.requestAnimationFrame==='function'){
      window.requestAnimationFrame(()=>window.requestAnimationFrame(show));
    }else show();
  }
  function showRunCompletion(isTest,label,succeeded,failed){
    const action=isTest?'Test run':'Run',successCount=Number(succeeded||0),failureCount=Number(failed||0);
    const result=failureCount
      ?action+' completed with errors.\n\n'+successCount.toLocaleString()+' succeeded\n'+failureCount.toLocaleString()+' failed'
      :action+' completed successfully without errors.\n\n'+successCount.toLocaleString()+' succeeded\n0 failed';
    showStatementResultPopup(label+'\n\n'+result);
  }
  function showRunFailure(isTest,label,error){
    const action=isTest?'Test run':'Run';
    const message=String(error?.message||error||'The statement job could not be completed.');
    showStatementResultPopup(label+'\n\n'+action+' stopped with an error.\n\n'+message);
  }
  async function runNow(type,isTest=false){
    const cycleEnabled=type==='weekly'?weeklyEnabled.checked:type==='midmonth'?false:monthlyEnabled.checked;
    if(!cycleEnabled){setStatus((type==='weekly'?'Cycle B':'Cycle A')+' is disabled. Check its Enable box and Save Schedule first.',false);return;}
    const accounts=selectedAccounts(type);
    if(!accounts.length){setStatus('Select at least one customer in Preview '+(type==='weekly'?'B':'A')+' Customers first. Test and Run never process unselected customers.',false);return;}
    const label=type==='weekly'?'B '+(weeklyFrequency.value==='biweekly'?'biweekly':'weekly')+'-cycle':type==='midmonth'?'legacy mid-month':'A monthly-cycle';
    const prompt=isTest
      ?'TEST RUN: Generate and validate '+label+' statements for the '+accounts.length.toLocaleString()+' selected customer'+(accounts.length===1?'':'s')+' only?\n\nNo SMS, email, portal delivery, saved document, or Communication History entry will be created.'
      :'Generate and send '+label+' statements now to the '+accounts.length.toLocaleString()+' selected customer'+(accounts.length===1?'':'s')+' only?';
    if(!window.confirm(prompt))return;
    showStatementProcessingOverlay(
      (isTest?'Testing ':'Processing ')+label+' statements…',
      'Please keep this page open while '+accounts.length.toLocaleString()+' selected customer statement'+(accounts.length===1?' is':'s are')+' processed. '+(isTest?'This is a dry test; nothing will be delivered. ':'')+'This may take a few minutes to complete.'
    );
    startTestProgress(type,(isTest?'Testing ':'Running ')+label+' statements…');
    try{
      setStatus('Verifying selected-customer safety before starting…');
      await requireSelectedRecipientServer();
      await saveSettings(false);setStatus((isTest?'Generating and validating test statements for ':'Generating and sending statements to ')+accounts.length.toLocaleString()+' selected customer'+(accounts.length===1?'':'s')+'. Keep this page open…');
      const data=await request('/api/admin/statement-scheduling/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,dry_run:isTest,test_send:false,account_numbers:accounts,selected_only:true})});
      verifySelectedRunTargets(data,accounts);
      const final=await waitForScheduledRun(data.run_id,type,isTest,data.total||accounts.length);
      setStatus((isTest?'Test run':'Run')+' complete for selected customers: '+Number(final.success_count||0)+' succeeded and '+Number(final.failure_count||0)+' failed.',Number(final.failure_count||0)===0);
      updateStatementProcessingOverlay(100,'100% complete • Finalizing report…',(isTest?'Testing':'Processing')+' complete');
      await finishTestProgress(type,'100% complete • '+Number(final.success_count||0)+' succeeded • '+Number(final.failure_count||0)+' failed');
      await load();
      hideStatementProcessingOverlay();
      showRunCompletion(isTest,(isTest?'TEST RUN ':'RUN ')+label.toUpperCase(),final.success_count,final.failure_count);
    }catch(error){
      hideStatementProcessingOverlay();hideTestProgress(type);
      setStatus(error.message||(isTest?'Statement dry test failed.':'Scheduled statement run failed.'),false);
      await load();
      showRunFailure(isTest,(isTest?'TEST RUN ':'RUN ')+label.toUpperCase(),error);
    }
  }
  async function waitForScheduledRun(runId,type,dryRun,total,progressMap){
    if(!runId)return {success_count:0,failure_count:0};
    for(let attempt=0;attempt<1200;attempt++){
      let continueError=null;
      try{
        await request('/api/admin/statement-scheduling/continue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:runId})},true);
      }catch(error){
        continueError=error;
      }
      await new Promise(resolve=>window.setTimeout(resolve,continueError?900:250));
      let snapshot;
      try{snapshot=await request('/api/admin/statement-scheduling?compact=1');}
      catch(snapshotError){if(continueError)throw continueError;throw snapshotError;}
      const run=(snapshot.runs||[]).find(item=>Number(item.id)===Number(runId));
      if(continueError&&run&&String(run.status||'')==='running'){
        setStatus('Connection was briefly interrupted. The statement run is still active; checking progress again…');
      } else if(continueError&&!run){
        throw continueError;
      }
      if(!run)continue;
      const processed=Number(run.processed_count||0),count=Number(run.customer_count||total||0);
      const runPct=count?Math.min(99,Math.round(processed/count*100)):100;
      const pct=typeof progressMap==='function'?Math.max(0,Math.min(99,Math.round(progressMap(processed,count,runPct)))):runPct;
      const actionLabel=dryRun?'Testing':'Running';
      const progressText=actionLabel+' statements: '+pct+'% complete. '+Number(run.success_count||0).toLocaleString()+' succeeded, '+Number(run.failure_count||0).toLocaleString()+' failed.';
      setStatus(progressText);
      setTestProgress(type,pct,actionLabel+' statements…',pct+'% complete');
      updateStatementProcessingOverlay(
        pct,
        pct+'% complete • '+processed.toLocaleString()+' of '+count.toLocaleString()+' processed • '+Number(run.failure_count||0).toLocaleString()+' failed',
        actionLabel+' statements…'
      );
      if(String(run.status||'')!=='running')return run;
    }
    throw new Error('The statement run is still continuing in the background. Refresh the report to see its latest progress.');
  }
  async function testAllCycles(){
    const selections={
      monthly:monthlyEnabled.checked?selectedAccounts('monthly'):[],
      weekly:weeklyEnabled.checked?selectedAccounts('weekly'):[]
    };
    const types=['monthly','weekly'].filter(type=>selections[type].length);
    if(!types.length){setStatus('Select at least one customer in Preview A or Preview B first. Test All never processes unselected customers.',false);return;}
    const totalSelected=types.reduce((sum,type)=>sum+selections[type].length,0);
    const breakdown=[];
    if(selections.monthly.length)breakdown.push('Cycle A: '+selections.monthly.length.toLocaleString()+' selected');
    if(selections.weekly.length)breakdown.push('Cycle B: '+selections.weekly.length.toLocaleString()+' selected');
    if(!window.confirm('TEST ALL CYCLES — SELECTED CUSTOMERS ONLY\n\n'+breakdown.join('\n')+'\n\nTotal: '+totalSelected.toLocaleString()+' selected customer'+(totalSelected===1?'':'s')+'.\n\nOnly these exact selected customers will be tested. No SMS, email, portal delivery, saved document, or Communication History entry will be created.'))return;
    showStatementProcessingOverlay(
      'Testing selected statements…',
      'Please keep this page open while '+totalSelected.toLocaleString()+' selected customer statement'+(totalSelected===1?' is':'s are')+' processed across all selected cycles. This may take a few minutes to complete.'
    );
    let succeeded=0,failed=0;
    const testAllButton=get('scheduleTestAll');
    if(testAllButton){
      testAllButton.disabled=true;
      testAllButton.classList.add('is-loading');
      testAllButton.setAttribute('aria-busy','true');
      testAllButton.textContent='Testing All Cycles…';
    }
    setTestProgress('all',3,'Validating selected customers from all cycles…','Preparing');
    updateStatementProcessingOverlay(0,'Validating selected customer lists…','Testing selected statements…');
    try{
      setStatus('Validating the selected Cycle A and Cycle B customer lists before the dry test begins…');
      await requireSelectedRecipientServer(true);
      await saveSettings(false);
      const batch=await request('/api/admin/statement-scheduling/test-all',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selected_only:true,test_send:false,dry_run:true,selections})});
      const runs=Array.isArray(batch.runs)?batch.runs:[];
      if(runs.length!==types.length)throw new Error('SAFETY STOP: the server did not create one exact selected-customer run for every selected cycle. No test processing was continued.');
      const runByType=new Map(runs.map(run=>[String(run.type||''),run]));
      for(const type of types){
        const run=runByType.get(type);
        if(!run)throw new Error('SAFETY STOP: the server did not confirm the selected '+(type==='weekly'?'Cycle B':'Cycle A')+' list. No test processing was continued.');
        verifySelectedRunTargets(run,selections[type]);
      }
      setStatus('Selection safety check passed. Dry-testing only the '+totalSelected.toLocaleString()+' selected customer'+(totalSelected===1?'':'s')+' across all selected cycles…',true);
      for(let index=0;index<types.length;index++){
        const type=types[index],accounts=selections[type],run=runByType.get(type);
        const label=type==='weekly'?'B '+(weeklyFrequency.value==='biweekly'?'biweekly':'weekly')+'-cycle':'A monthly-cycle';
        const startPct=8+Math.floor(index*(86/types.length));
        setTestProgress('all',startPct,'Testing '+label+' statements…',(index+1)+' of '+types.length+' selected cycle'+(types.length===1?'':'s'));
        updateStatementProcessingOverlay(startPct,'Starting '+label+' • '+(index+1)+' of '+types.length+' selected cycle'+(types.length===1?'':'s'),'Testing selected statements…');
        setStatus('Generating and validating '+label+' statements for '+accounts.length.toLocaleString()+' selected customer'+(accounts.length===1?'':'s')+' only. Nothing will be delivered. Keep this page open…');
        const completedBefore=types.slice(0,index).reduce((sum,doneType)=>sum+selections[doneType].length,0);
        const final=await waitForScheduledRun(run.run_id,'all',true,run.total||accounts.length,(processed)=>((completedBefore+processed)/totalSelected)*100);
        succeeded+=Number(final.success_count||0);failed+=Number(final.failure_count||0);
        setTestProgress('all',Math.floor(((index+1)/types.length)*100),'Completed '+label,(index+1)+' of '+types.length+' selected cycle'+(types.length===1?'':'s'));
      }
      setStatus('Selected-customer Test All complete: '+succeeded+' succeeded and '+failed+' failed.',failed===0);
      updateStatementProcessingOverlay(100,'100% complete • Finalizing report…','Testing complete');
      await finishTestProgress('all','100% complete • '+succeeded+' generated • '+failed+' failed');
      await load();
      hideStatementProcessingOverlay();
      showRunCompletion(true,'TEST ALL CYCLES — SELECTED CUSTOMERS ONLY',succeeded,failed);
    }catch(error){
      hideStatementProcessingOverlay();hideTestProgress('all');
      setStatus(error.message||'Selected-customer Test All failed.',false);
      await load();
      showRunFailure(true,'TEST ALL CYCLES — SELECTED CUSTOMERS ONLY',error);
    }
    finally{
      if(testAllButton){
        testAllButton.classList.remove('is-loading');
        testAllButton.removeAttribute('aria-busy');
        testAllButton.textContent='Test All Cycles';
      }
      syncCycleEnabledState();
    }
  }
  saveBtn.addEventListener('click',()=>saveSettings(true).catch(error=>setStatus(error.message,false)));
  monthlyEnabled.addEventListener('change',syncCycleEnabledState);
  weeklyEnabled.addEventListener('change',syncCycleEnabledState);
  weeklyFrequency.addEventListener('change',syncWeeklyFrequency);
  weeklyAnchor.addEventListener('change',syncWeeklyFrequency);
  refreshBtn.addEventListener('click',async()=>{
    refreshBtn.disabled=true;
    try{await load();await new Promise(resolve=>window.requestAnimationFrame(resolve));(report.previousElementSibling||report).scrollIntoView({behavior:'smooth',block:'start'});}
    finally{refreshBtn.disabled=false;}
  });
  get('schedulePreviewWeekly').addEventListener('click',()=>showPreview('weekly'));
  get('schedulePreviewMidmonth').addEventListener('click',()=>showPreview('midmonth'));
  get('schedulePreviewMonthly').addEventListener('click',()=>showPreview('monthly'));
  get('scheduleTestWeekly').addEventListener('click',()=>runNow('weekly',true));
  get('scheduleTestMidmonth').addEventListener('click',()=>runNow('midmonth',true));
  get('scheduleTestMonthly').addEventListener('click',()=>runNow('monthly',true));
  get('scheduleTestAll').addEventListener('click',testAllCycles);
  get('scheduleTestHelp').addEventListener('click',()=>window.alert([
    'Test Send:',
    '',
    '• First open Preview A or Preview B and select the customer(s) you want.',
    '• Test A and Test B process selected customers only.',
    '• Test All Cycles combines only the selected customers from Cycle A and Cycle B; it never expands to the full cycles.',
    '• Test uses the same eligibility rules and saved delivery options as a real run.',
    '• Portal, Email, and SMS are sent only when those delivery options are enabled and selected for that customer.',
    '• Statement PDFs are stored in the selected customer accounts.',
    '• Communication History is updated because this is a real delivery.',
    '• The report is clearly labeled TEST RUN.',
    '• Unselected customers are never processed by Test A, Test B, Test All Cycles, Run A, or Run B.'
  ].join('\n')));
  get('scheduleRunWeekly').addEventListener('click',()=>runNow('weekly'));
  get('scheduleRunMidmonth').addEventListener('click',()=>runNow('midmonth'));
  get('scheduleRunMonthly').addEventListener('click',()=>runNow('monthly'));
  syncCycleEnabledState();
  window.loadStatementScheduling=function(){if(!loaded)load();};
})();
