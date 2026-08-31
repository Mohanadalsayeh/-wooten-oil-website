
(()=>{
  const get=id=>document.getElementById(id),search=get('activityCustomerSearch'),searchBtn=get('activityCustomerSearchBtn'),results=get('activitySearchResults'),dashboard=get('activityDashboard'),status=get('activityStatus'),progress=get('activityLoadProgress'),progressBar=get('activityLoadProgressBar'),progressTrack=get('activityLoadProgressTrack'),progressCount=get('activityLoadProgressCount');let timer,currentAccount='',chartMonths=12,paymentChartMonths=12,balanceChartMonths=12;const activityPages={payments:1,documents:1,communications:1,fuel:1,logins:1};
  const key=()=>get('adminKey')?.value||'';const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));const money=v=>Number(v||0).toLocaleString('en-US',{style:'currency',currency:'USD'});const date=v=>{if(!v)return '—';const parsed=new Date(String(v).replace(' ','T')+(String(v).includes('Z')?'':'Z'));return Number.isNaN(parsed.getTime())?String(v):parsed.toLocaleString();};
  function message(text,ok=true){status.textContent=text||'';status.className='status'+(text?' show '+(ok?'ok':'bad'):'');}
  function startProgress(){let n=8;progress.hidden=false;progressBar.style.width=n+'%';progressTrack.setAttribute('aria-valuenow',String(n));progressCount.textContent='Preparing';return setInterval(()=>{n=Math.min(91,n+(n<60?10:n<80?5:2));progressBar.style.width=n+'%';progressTrack.setAttribute('aria-valuenow',String(n));progressCount.textContent=n+'%';},140);}
  async function finishProgress(handle){clearInterval(handle);progressBar.style.width='100%';progressTrack.setAttribute('aria-valuenow','100');progressCount.textContent='100%';await new Promise(r=>setTimeout(r,260));progress.hidden=true;progressBar.style.width='0%';progressTrack.setAttribute('aria-valuenow','0');}
  function empty(text){return '<div class="activity-empty">'+esc(text)+'</div>';}
  function section(title,rows,wide=false,keyName='',meta=null){const total=Number(meta?.total??rows.length),page=Math.max(1,Number(meta?.page||1)),pages=Math.max(1,Number(meta?.pages||1));return '<section class="activity-section'+(wide?' activity-wide':'')+'"'+(keyName?' data-activity-section="'+esc(keyName)+'"':'')+'><div class="activity-section-head"><h3>'+esc(title)+'</h3><span class="activity-count">'+total+'</span></div><div class="activity-list">'+(rows.join('')||empty('No activity recorded.'))+'</div>'+(keyName&&total>20?'<div class="db-pagination activity-pagination"><button class="secondary" type="button" data-activity-page="'+(page-1)+'" data-activity-page-section="'+esc(keyName)+'" '+(page<=1?'disabled':'')+'>Previous 20</button><div class="db-page-info">Page '+page+' of '+pages+' • '+total+' records</div><button class="secondary" type="button" data-activity-page="'+(page+1)+'" data-activity-page-section="'+esc(keyName)+'" '+(page>=pages?'disabled':'')+'>Next 20</button></div>':'')+'</section>';}
  function periodSelect(chartName,selectedMonths){return '<select class="activity-chart-period" data-activity-chart-period data-activity-chart-name="'+chartName+'" aria-label="Chart time period">'+[[3,'Last 3 months'],[6,'Last 6 months'],[12,'Last 12 months'],[24,'Last 24 months'],[0,'All time']].map(option=>'<option value="'+option[0]+'"'+(Number(selectedMonths)===option[0]?' selected':'')+'>'+option[1]+'</option>').join('')+'</select>';}
  function paymentChart(monthlyRows,paymentEntries=[],selectedMonths=paymentChartMonths,currentBalance=0,lastPayment=null){
    const validMonths=(monthlyRows||[]).filter(item=>/^\d{4}-\d{2}$/.test(String(item.month||''))),source=new Map(validMonths.map(item=>[String(item.month),{amount:Number(item.total_amount||0),count:Number(item.payment_count||0)}])),now=new Date();
    const points=(paymentEntries||[]).filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(String(item.chart_date||''))&&Number.isFinite(Number(item.amount))).map((item,index)=>{const parsed=new Date(String(item.chart_date)+'T12:00:00');return {key:String(item.chart_date)+'-'+index,date:String(item.chart_date),label:parsed.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}),amount:Number(item.amount||0),reference:item.reference||item.description||'Payment'};}).sort((a,b)=>a.date.localeCompare(b.date));
    const paymentCount=points.length,paymentTotal=points.reduce((sum,item)=>sum+item.amount,0),averagePayment=paymentCount?paymentTotal/paymentCount:0,maxAmount=Math.max(1,...points.map(item=>Math.max(0,item.amount))),width=Math.max(760,Math.min(16000,points.length*28+115)),height=326,left=68,right=width-28,top=58,bottom=258,plotHeight=bottom-top,step=(right-left)/Math.max(1,points.length-1),y=value=>bottom-(Math.max(0,value)/maxAmount)*plotHeight;
    const grids=[0,.25,.5,.75,1].map(factor=>{const py=bottom-factor*plotHeight;return '<line class="activity-trend-grid" x1="'+left+'" y1="'+py+'" x2="'+right+'" y2="'+py+'"></line><text class="activity-trend-axis" x="'+(left-8)+'" y="'+(py+4)+'" text-anchor="end">'+esc(money(maxAmount*factor).replace('.00',''))+'</text>';}).join('');
    const pointData=points.map((item,index)=>{const x=points.length===1?(left+right)/2:left+step*index;return {item,x,y:y(item.amount)};});
    const labelInterval=Math.max(1,Math.ceil(points.length/10));
    const labels=pointData.map((point,index)=>{const showLabel=index===0||index===points.length-1||index%labelInterval===0;return showLabel?'<text class="activity-trend-axis" x="'+point.x.toFixed(1)+'" y="'+(bottom+20)+'" text-anchor="middle">'+esc(point.item.label)+'</text>':'';}).join('');
    const coordinates=pointData.map(point=>point.x.toFixed(1)+','+point.y.toFixed(1)),trendLine=coordinates.length>1?'<polyline class="activity-trend-line" points="'+coordinates.join(' ')+'"></polyline>':'',trendArea=coordinates.length>1?'<path class="activity-trend-area" d="M '+pointData[0].x.toFixed(1)+' '+bottom+' L '+coordinates.join(' L ')+' L '+pointData[pointData.length-1].x.toFixed(1)+' '+bottom+' Z"></path>':'',dots=pointData.map(point=>'<g><title>'+esc(point.item.label+' — '+money(point.item.amount)+(point.item.reference?' — '+point.item.reference:''))+'</title><circle class="activity-trend-dot" cx="'+point.x.toFixed(1)+'" cy="'+point.y.toFixed(1)+'" r="4"></circle></g>').join('');
    const recent=[];for(let index=5;index>=0;index--){const d=new Date(now.getFullYear(),now.getMonth()-index,1),keyName=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');recent.push(Number(source.get(keyName)?.amount||0));}const hasTrendHistory=validMonths.some(item=>String(item.month)<=new Date(now.getFullYear(),now.getMonth()-5,1).toISOString().slice(0,7))&&recent.filter(value=>value>0).length>=2,priorAverage=(recent[0]+recent[1]+recent[2])/3,recentAverage=(recent[3]+recent[4]+recent[5])/3;let trend='Not enough history',trendClass='';if(hasTrendHistory){if(priorAverage===0&&recentAverage>0){trend='Increasing';trendClass='increasing';}else{const ratio=priorAverage?recentAverage/priorAverage:1;if(ratio>1.10){trend='Increasing';trendClass='increasing';}else if(ratio<.90){trend='Decreasing';trendClass='decreasing';}else{trend='Stable';trendClass='stable';}}}
    const lastDate=lastPayment?(lastPayment.posting_date||lastPayment.deposit_date||lastPayment.payment_date||'—'):'—',lastText=lastPayment?money(lastPayment.amount)+' • '+esc(lastDate):'No payment recorded',emptyChart=points.length?'':'<div class="activity-empty">No payment history is available for this period.</div>',svg=points.length?'<div class="activity-trend-scroll"><svg viewBox="0 0 '+width+' '+height+'" style="min-width:'+width+'px" role="img" aria-label="Payment trend by date and amount, with current total balance shown separately"><text class="activity-trend-axis-title" x="'+left+'" y="25">Payment amount</text><line class="activity-trend-balance-line" x1="'+left+'" y1="43" x2="'+right+'" y2="43"></line><text class="activity-trend-balance-label" x="'+right+'" y="35" text-anchor="end">Current Total Balance: '+esc(money(currentBalance))+'</text>'+grids+trendArea+trendLine+dots+labels+'<text class="activity-trend-axis-title" x="'+((left+right)/2)+'" y="310" text-anchor="middle">Payment date</text></svg></div>':'';
    return '<section class="activity-payment-chart activity-trend-chart" data-activity-chart="payments" aria-label="Payment trend and balance"><div class="activity-payment-chart-head"><h3>Payment Trend</h3>'+periodSelect('payments',selectedMonths)+'</div><div class="activity-trend-current"><span>Current Total Balance</span><strong>'+money(currentBalance)+'</strong></div>'+svg+emptyChart+(points.length?'<div class="activity-trend-legend"><span><i class="activity-trend-swatch"></i>Payments</span><span><i class="activity-trend-line-swatch"></i>Trend line</span><span><i class="activity-trend-balance-swatch"></i>Current balance reference</span></div>':'')+'<div class="activity-trend-summary"><div><span>Total paid</span><strong>'+money(paymentTotal)+'</strong></div><div><span>Average payment</span><strong>'+money(averagePayment)+'</strong></div><div><span>Last payment</span><strong>'+lastText+'</strong></div><div><span>Recent trend</span><strong class="activity-trend-status '+trendClass+'">'+trend+'</strong></div></div></section>';
  }
  function balanceChart(ages,paymentRows,selectedMonths=balanceChartMonths){const labels=['Current Balance','Aging 1','Aging 2','Aging 3','Aging 4'],colors=['#2f80bd','#44a6d8','#6f88c9','#a277c5','#e09a4f'],values=ages.map(value=>Math.max(0,Number(value)||0)),totalBalance=values.reduce((sum,value)=>sum+value,0),payments=(paymentRows||[]).reduce((sum,item)=>sum+Number(item.total_amount||0),0);let cursor=0;const stops=values.map((value,index)=>{const start=totalBalance?cursor/totalBalance*100:0;cursor+=value;const end=totalBalance?cursor/totalBalance*100:0;return colors[index]+' '+start.toFixed(2)+'% '+end.toFixed(2)+'%';}).join(','),background=totalBalance?'conic-gradient('+stops+')':'#dbe5ec';return '<section class="activity-payment-chart activity-balance-chart" data-activity-chart="balance" aria-label="Balance, aging, and payments"><div class="activity-payment-chart-head"><h3>Balance</h3>'+periodSelect('balance',selectedMonths)+'</div><div class="activity-donut-layout"><div class="activity-donut'+(totalBalance?'':' activity-donut-empty')+'" style="background:'+background+'"><div class="activity-donut-center"><strong class="activity-donut-money">'+money(totalBalance)+'</strong><span class="activity-donut-caption">Total Balance</span></div></div><div class="activity-donut-legend">'+labels.map((labelName,index)=>{const percent=totalBalance?Math.round(values[index]/totalBalance*100):0;return '<div class="activity-donut-row"><span class="activity-donut-dot" style="background:'+colors[index]+'"></span><span>'+labelName+'</span><strong>'+money(values[index])+'</strong><span class="activity-donut-share"><span style="width:'+percent+'%;--share-color:'+colors[index]+'"></span></span><em>'+percent+'% of total balance</em></div>';}).join('')+'<div class="activity-chart-payment-note"><span>Payments in selected period</span><strong>'+money(payments)+'</strong></div></div></div></section>';}
  function render(data){
    const docs=Array.isArray(data.documents)?data.documents:[];
    list.innerHTML='';
    if(data.customer){
      meta.style.display='block';
      meta.textContent=(data.customer.account_name||'Customer')+' • Customer # '+(data.customer.account_number||'');
    }
    if(!docs.length){
      const empty=document.createElement('div');
      empty.className='doc-admin-empty';
      empty.textContent='No statements or invoices have been uploaded for this customer.';
      list.appendChild(empty);
      return;
    }
    docs.forEach(d=>{
      const row=document.createElement('div'); row.className='doc-admin-row';
      const badge=document.createElement('div'); badge.className='doc-admin-badge'; badge.textContent=d.document_type||'document';
      const main=document.createElement('div'); main.className='doc-admin-main';
      const strong=document.createElement('strong'); strong.textContent=d.title||d.filename||'Document';
      const small=document.createElement('small');
      small.appendChild(document.createTextNode(formatDate(d.document_date||d.created_at)+' • '+formatSize(d.size_bytes)+' • '));
      const filenameLink=document.createElement('button');
      filenameLink.type='button';
      filenameLink.className='communication-pdf-link';
      filenameLink.textContent=d.filename||'PDF';
      filenameLink.addEventListener('click',function(){openAdminDocument(d.id);});
      small.appendChild(filenameLink);
      main.append(strong,small);
      const actions=document.createElement('div');
      actions.className='doc-admin-actions';

      const id=document.createElement('small');
      id.textContent='Document #'+d.id;
      actions.append(id);

      row.append(badge,main,actions); list.appendChild(row);
    });
  }

  async function openAdminDocument(id){
    const key=document.getElementById('adminKey').value.trim();
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');setStatus('Enter your Admin Import Key in the Admin Login window first.',false);return;}

    const popup=window.open('about:blank','_blank');
    try{
      const res=await fetch('/api/admin/customer-documents/'+encodeURIComponent(id)+'/file',{
        method:'GET',
        headers:{'X-Admin-Key':key},
        cache:'no-store'
      });
      if(!res.ok) throw new Error(await res.text()||'Document could not be opened.');
      const blob=await res.blob();
      const url=URL.createObjectURL(blob);
      if(popup) popup.location=url;
      else window.location.href=url;
      setTimeout(function(){URL.revokeObjectURL(url);},60000);
    }catch(e){
      if(popup) popup.close();
      setStatus(e.message||'Document could not be opened.',false);
    }
  }
  window.openAdminCustomerDocument=openAdminDocument;

  async function loadDocs(){
    const key=document.getElementById('adminKey').value.trim();
    const acct=normalize(account.value);
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');setStatus('Enter your Admin Import Key in the Admin Login window first.',false);return;}
    if(!acct){setStatus('Enter a valid Customer Number.',false);return;}
    account.value=acct;
    setStatus('Loading customer documents…');
    try{
      const res=await fetch('/api/admin/customer-documents?account_number='+encodeURIComponent(acct),{
        headers:{'X-Admin-Key':key,'Accept':'application/json'},cache:'no-store'
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.success===false) throw new Error(data.error||'Documents could not be loaded.');
      render(data); setStatus(data.documents.length+' document(s) found.',true);
    }catch(e){setStatus(e.message||'Documents could not be loaded.',false);}
  }
  load.addEventListener('click',loadDocs);

  upload.addEventListener('click',async()=>{
    const key=document.getElementById('adminKey').value.trim();
    const acct=normalize(account.value);
    const selected=file.files&&file.files[0];
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');setStatus('Enter your Admin Import Key in the Admin Login window first.',false);return;}
    if(!acct){setStatus('Enter a valid Customer Number.',false);return;}
    if(!selected){setStatus('Choose a PDF statement or invoice.',false);return;}
    if(!portalNotification.checked&&!emailPdf.checked&&!smsLink.checked){setStatus('Select at least one Sending Option.',false);return;}
    if(selected.size>10*1024*1024){setStatus('PDF files must be 10 MB or smaller.',false);return;}
    account.value=acct; upload.disabled=true; upload.textContent='Uploading…';
    try{
      const fd=new FormData();
      fd.append('account_number',acct);
      fd.append('document_type',type.value);
      fd.append('document_date',date.value||'');
      fd.append('title',title.value||'');
      fd.append('portal_notification',portalNotification.checked?'1':'0');
      fd.append('email_pdf',emailPdf.checked?'1':'0');
      fd.append('sms_link',smsLink.checked?'1':'0');
      fd.append('file',selected,selected.name);
      const res=await fetch('/api/admin/customer-documents/upload',{
        method:'POST',headers:{'X-Admin-Key':key},body:fd
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.success===false) throw new Error(data.error||'Upload failed.');
      setStatus(data.message||'Document uploaded successfully.',true);
      file.value=''; title.value='';
      await loadDocs();
    }catch(e){setStatus(e.message||'Upload failed.',false);}
    finally{upload.disabled=false;upload.textContent='Upload Document';}
  });
})();
