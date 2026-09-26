/* Ver627: filtered PDF and complete Excel invoice exports. */
(()=>{
  const get=id=>document.getElementById(id),table=get('invoiceDbTable');
  if(!table)return;
  const pdf=get('invoiceExportPdf'),excel=get('invoiceExportExcel'),cancel=get('invoiceExportCancel'),message=get('invoiceExportStatus');
  const headers=['Customer No','Customer Name','Invoice No','Type','Division','Invoice Date','Due Date','Balance'];
  let operation=null;
  const key=()=>get('adminKey')?.value.trim()||'';
  function sync(){
    pdf.disabled=!!operation||!key()||table.dataset.pdfEmpty==='true'||table.getAttribute('aria-busy')==='true';
    excel.disabled=!!operation||!key()||table.getAttribute('aria-busy')==='true';
    cancel.hidden=!operation;
  }
  function say(text){message.textContent=text;}
  function check(op){if(op.signal.aborted||key()!==op.key)throw new DOMException('Export cancelled.','AbortError');}
  const date=value=>value?String(value).slice(5,7)+'-'+String(value).slice(8,10)+'-'+String(value).slice(0,4):'';
  function values(row){return [String(row.account_number??''),String(row.customer_name??''),String(row.invoice_no??''),String(row.invoice_type??''),String(row.division??''),date(row.invoice_date),date(row.due_date),Number(row.balance_cents||0)/100];}
  async function request(op,filters,page){
    check(op);
    const response=await fetch('/api/admin/open-invoices-import?'+new URLSearchParams({...filters,page,page_size:500}),{headers:{'X-Admin-Key':op.key,'Accept':'application/json'},cache:'no-store',signal:op.signal});
    const data=await response.json();check(op);
    if(!response.ok||!data.success)throw Error(data.error||'Invoices could not be exported.');
    return data;
  }
  async function collect(op,filters,kind){
    let first=await request(op,filters,1),total=Number(first.total||0),run=first.active?.run_id;
    if(!total)throw Error('No invoices match this export.');
    const warning=kind==='pdf'&&total>1000?'\nThis is a large PDF and may be slow, especially on a phone. Narrow the filters or use Excel for a large report.':'';
    if(!window.confirm('Export '+total.toLocaleString()+' invoices to '+(kind==='pdf'?'PDF using the selected filters':'Excel from the full database')+'?'+warning))throw new DOMException('Export cancelled.','AbortError');
    const rows=[];
    for(let page=1;page<=first.pages;page++){
      const data=page===1?first:await request(op,filters,page);
      if(data.active?.run_id!==run||Number(data.total)!==total||Number(data.page)!==page)throw Error('The invoice database changed during export. Please try again for a complete report.');
      rows.push(...data.rows.map(values));
      say('Loading '+rows.length.toLocaleString()+' of '+total.toLocaleString()+' invoices…');
      check(op);
    }
    if(rows.length!==total)throw Error('The export is incomplete. Please try again; no partial file was saved.');
    return rows;
  }
  async function start(kind){
    if(operation)return;
    const filters=kind==='pdf'?{...window.WootenInvoiceDatabase.filters()}:{sort:'customer_asc'};
    if(kind==='pdf'&&!filters.search&&!filters.date_from&&!filters.date_to&&(!filters.invoice_type||filters.invoice_type==='all')&&(!filters.balance||filters.balance==='all')){
      say('Choose a customer/search, date range, invoice type, or balance filter before exporting PDF. Use Excel to export the full database.');get('invoiceDbSearch').focus();return;
    }
    if(kind==='pdf'&&!window.WootenAdminTablePdf?.exportData){say('PDF export is unavailable. Refresh the page and try again.');return;}
    if(kind==='excel'&&!window.XLSX){say('Excel export is unavailable. Refresh the page and try again.');return;}
    const abort=new AbortController(),op={key:key(),signal:abort.signal,abort:()=>abort.abort()};
    operation=op;sync();say('Checking invoice count…');
    try{
      const rows=await collect(op,filters,kind);check(op);
      say('Preparing '+(kind==='pdf'?'PDF':'Excel')+'…');
      await new Promise(resolve=>setTimeout(resolve,0));check(op);
      if(kind==='pdf'){
        const formatted=rows.map(row=>[...row.slice(0,7),new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(row[7])]);
        await window.WootenAdminTablePdf.exportData('Live Open Invoices — Filtered',headers,formatted,(done,total,stage)=>{check(op);say(stage+' '+Math.round(done/Math.max(total,1)*100)+'%');});
      }else{
        const sheet=XLSX.utils.aoa_to_sheet([headers,...rows]);
        // String identifiers remain text cells, including leading zeros and formula-like input.
        sheet['!cols']=[{wch:14},{wch:36},{wch:18},{wch:10},{wch:10},{wch:15},{wch:15},{wch:18}];
        sheet['!autofilter']={ref:sheet['!ref']};
        for(let r=2;r<=rows.length+1;r++)sheet['H'+r].z='$#,##0.00;[Red]($#,##0.00)';
        const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Open Invoices');
        check(op);XLSX.writeFile(book,'Wooten-Oil-Full-Invoice-Database.xlsx',{compression:true});
      }
      say('Exported '+rows.length.toLocaleString()+' invoices to '+(kind==='pdf'?'PDF':'Excel')+'.');
    }catch(error){say(error.name==='AbortError'?'Export cancelled.':error.message||'Export failed. Please try again.');}
    finally{operation=null;sync();}
  }
  pdf.addEventListener('click',()=>start('pdf'));excel.addEventListener('click',()=>start('excel'));
  cancel.addEventListener('click',()=>operation?.abort());
  window.addEventListener('wooten-admin-auth-changed',()=>{operation?.abort();say('');sync();});
  window.addEventListener('pagehide',()=>operation?.abort());
  new MutationObserver(sync).observe(table,{attributes:true,attributeFilter:['data-pdf-empty','aria-busy']});
  sync();
})();
