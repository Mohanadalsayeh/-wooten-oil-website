/* Ver631: matching customer/payment filtered PDF and full Excel exports. */
(()=>{
  const get=id=>document.getElementById(id),val=id=>get(id)?.value.trim()||'';
  const text=value=>String(value??'');
  const date=value=>{const s=text(value);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(5,7)+'-'+s.slice(8,10)+'-'+s.slice(0,4):s;};
  const configs=[{
    prefix:'customer',wrap:'dbTableWrap',load:'dbLoadBtn',total:'dbTotal',noun:'customers',title:'Live Customer Database',filename:'Live-Customers-Database',sheet:'Customers',endpoint:'/api/admin/customers-database',rowKey:'customers',sort:'account_asc',money:[5],
    fields:{search:'dbSearch',email:'dbEmailFilter',phone:'dbPhoneFilter',online:'dbOnlineFilter',status:'dbStatusFilter',sort:'dbSort'},
    headers:['Customer #','Contact','Customer / Company','Email','Phone','Total Balance','Status','Online Account'],
    values:row=>[text(row.account_number),[row.phone?'Phone':'',row.email?'Email':'',Number(row.online_activated)?'Portal':''].filter(Boolean).join(', ')||'-',text(row.account_name),text(row.email),text(row.phone),['current_balance','aging_category_1','aging_category_2','aging_category_3','aging_category_4'].reduce((sum,k)=>sum+(Number(row[k])||0),0),text(row.account_status)||'Active',Number(row.online_activated)?'Activated':'Not activated'],
    identity:row=>text(row.account_number)
  },{
    prefix:'payment',wrap:'livePaymentTableWrap',load:'livePaymentLoadBtn',total:'livePaymentTotal',noun:'payments',title:'Live Customer Payments Database',filename:'Live-Customer-Payments-Database',sheet:'Payments',endpoint:'/api/admin/customer-payments-database',rowKey:'payments',sort:'posting_desc',money:[8,9],
    fields:{search:'livePaymentSearch',deposit_type:'livePaymentDepositType',date_from:'livePaymentFromDate',date_to:'livePaymentToDate',amount:'livePaymentAmountFilter',sort:'livePaymentSort'},
    headers:['Deposit Date','Deposit No','Deposit Type','Customer No','Check No','Posting Date','Customer Name','Invoice No','Cash Amount Applied','Discount Amount Applied'],
    values:row=>[date(row.deposit_date),text(row.deposit_no),text(row.deposit_type),text(row.account_number),text(row.reference),date(row.posting_date||row.payment_date),text(row.customer_name),text(row.invoice_no),Number(row.amount)||0,Number(row.discount_amount)||0],
    identity:row=>text(row.id)
  }];
  function filename(base,now=new Date()){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now),part=t=>parts.find(p=>p.type===t).value;
    return base+'-'+part('month')+part('day')+part('year')+'-'+part('hour')+part('minute')+part('second')+'-CT.xlsx';
  }
  configs.forEach(config=>{
    const wrap=get(config.wrap),table=wrap?.querySelector('table');if(!table)return;
    const pdf=get(config.prefix+'ExportPdf'),excel=get(config.prefix+'ExportExcel'),cancel=get(config.prefix+'ExportCancel'),output=get(config.prefix+'ExportStatus');
    let operation=null;
    const key=()=>val('adminKey'),say=message=>output.textContent=message;
    function sync(){
      const busy=get(config.load)?.disabled||table.getAttribute('aria-busy')==='true';
      const empty=wrap.style.display==='none'||!Number(get(config.total)?.textContent.replace(/,/g,''));
      pdf.disabled=!!operation||!key()||busy||empty;excel.disabled=!!operation||!key()||busy;
      cancel.hidden=!operation;
    }
    function check(op){if(op.signal.aborted||key()!==op.key)throw new DOMException('Export cancelled.','AbortError');}
    function filters(){const result=Object.fromEntries(Object.entries(config.fields).map(([name,id])=>[name,val(id)]));result.sort=window.WootenTableDataSort?.get(table)?.key()||result.sort;return result;}
    async function request(op,params,page){
      check(op);const response=await fetch(config.endpoint+'?'+new URLSearchParams({...params,page,page_size:1000}),{headers:{'X-Admin-Key':op.key,'Accept':'application/json'},cache:'no-store',signal:op.signal});
      const data=await response.json();check(op);if(!response.ok||data.success===false)throw Error(data.error||'Records could not be exported.');return data;
    }
    async function collect(op,params,kind){
      const first=await request(op,params,1),total=Number(first.total||0);if(!total)throw Error('No '+config.noun+' match this export.');
      const warning=kind==='pdf'&&total>1000?'\nThis is a large PDF and may be slow, especially on a phone. Narrow the filters or use Excel.':'';
      if(!window.confirm('Export '+total.toLocaleString()+' '+config.noun+' to '+(kind==='pdf'?'PDF using the selected filters':'Excel from the full database')+'?'+warning))throw new DOMException('Export cancelled.','AbortError');
      const rows=[],seen=new Set();
      for(let page=1;page<=Number(first.pages);page++){
        const data=page===1?first:await request(op,params,page);
        if(Number(data.total)!==total||Number(data.page)!==page)throw Error('The database changed during export. Please try again.');
        for(const row of data[config.rowKey]||[]){
          const id=config.identity(row);if(id&&seen.has(id))throw Error('Records moved during export. Please try again.');if(id)seen.add(id);
          rows.push(config.values(row));
        }
        say('Loading '+rows.length.toLocaleString()+' of '+total.toLocaleString()+' '+config.noun+'…');check(op);
      }
      if(rows.length!==total)throw Error('The export is incomplete. Please try again; no partial file was saved.');
      return rows;
    }
    async function start(kind){
      if(operation)return;
      const params=kind==='pdf'?filters():{sort:config.sort};
      if(kind==='pdf'&&!Object.entries(params).some(([name,v])=>name!=='sort'&&v&&v!=='all')){say('Choose a search or filter before exporting PDF. Use Excel to export the full database.');get(config.fields.search).focus();return;}
      if(kind==='pdf'&&!window.WootenAdminTablePdf?.exportData||kind==='excel'&&!window.XLSX){say('The exporter is unavailable. Refresh the page and try again.');return;}
      const abort=new AbortController(),op={key:key(),signal:abort.signal,abort:()=>abort.abort()};operation=op;
      excel.classList.toggle('database-excel-exporting',kind==='excel');excel.setAttribute('aria-busy',String(kind==='excel'));sync();say('Checking record count…');
      try{
        const rows=await collect(op,params,kind);check(op);say('Preparing '+(kind==='pdf'?'PDF':'Excel')+'…');
        await new Promise(resolve=>setTimeout(resolve,0));check(op);
        if(kind==='pdf'){
          const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
          await window.WootenAdminTablePdf.exportData(config.title+' — Filtered',config.headers,rows.map(row=>row.map((v,i)=>config.money.includes(i)?money.format(v):v)),(done,total,stage)=>{check(op);say(stage+' '+Math.round(done/Math.max(total,1)*100)+'%');});
        }else{
          const sheet=XLSX.utils.aoa_to_sheet([config.headers,...rows]);sheet['!cols']=config.headers.map(h=>({wch:/Name|Company|Email/.test(h)?32:20}));sheet['!autofilter']={ref:sheet['!ref']};
          for(let r=1;r<=rows.length;r++)for(const c of config.money)sheet[XLSX.utils.encode_cell({r,c})].z='$#,##0.00;[Red]($#,##0.00)';
          const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,config.sheet);check(op);XLSX.writeFile(book,filename(config.filename),{compression:true});
        }
        say('Exported '+rows.length.toLocaleString()+' '+config.noun+' to '+(kind==='pdf'?'PDF':'Excel')+'.');
      }catch(error){say(error.name==='AbortError'?'Export cancelled.':error.message||'Export failed. Please try again.');}
      finally{operation=null;excel.classList.remove('database-excel-exporting');excel.setAttribute('aria-busy','false');sync();}
    }
    pdf.addEventListener('click',()=>start('pdf'));excel.addEventListener('click',()=>start('excel'));cancel.addEventListener('click',()=>operation?.abort());
    window.addEventListener('wooten-admin-auth-changed',()=>{operation?.abort();say('');sync();});window.addEventListener('pagehide',()=>operation?.abort());
    new MutationObserver(sync).observe(wrap,{attributes:true,childList:true,subtree:true,attributeFilter:['style','aria-busy']});
    if(get(config.load))new MutationObserver(sync).observe(get(config.load),{attributes:true,attributeFilter:['disabled']});
    sync();
  });
})();
