/* Ver1098 — All-API-field Intevacon transaction export. Read-only; no sync or database changes. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const pdf=$('apiTestExportPdf'),excel=$('apiTestExportExcel'),cancel=$('apiTestExportCancel'),status=$('apiTestExportStatus');
  if(!pdf||!excel||!cancel||!status)return;
  const txnFirst=['ID','CustomerID','CardHolderOrgID','CardHolderName','CardNumber','Status','StatusID',
    'DeclineReason','DeclineReasonID','ReceivedDateTime','LocalDateTime','ProcessedDateTime','PostedDateTime',
    'MerchantName','MerchantCity','MerchantStateProvince','EntryMethod','TranType','AuthRef','InvoiceID',
    'TotalAmountOfSale','ResolvedTotalAmount'];
  const detailFirst=['RowNumber','ProductName','ProductCode','ProductCategory','IsFuel','IsTaxProduct',
    'Quantity','RawUnitPrice','ResolvedUnitPrice','RawAmount','ResolvedAmount'];
  const taxFirst=['TaxRowNumber','TaxAuthority','GovtLevel','TaxType','TaxRate','FederalTax','FederalTaxExempt',
    'StateTax','StateTaxExempt','OtherTax','OtherTaxExempt','BaseAmount','BasePrice'];
  let operation=null;
  const bridge=()=>window.WootenIntevaconExportContext;
  const key=()=>String($('adminKey')?.value||'').trim();
  const access=()=>!!key()&&!!bridge()?.allowed();
  const fieldKeys=(records,priority)=>{
    const found=new Set(records.flatMap(row=>Object.keys(row||{})).filter(k=>k!=='Details'&&k!=='Taxes'));
    return [...priority.filter(k=>found.delete(k)),...Array.from(found).sort((a,b)=>a.localeCompare(b))];
  };
  function show(value,error=false){status.textContent=value;status.hidden=!value;status.dataset.error=String(error);}
  function controls(){
    const busy=!!operation,context=bridge()?.current();
    pdf.disabled=busy||!access()||!context?.loaded||!context.total;
    excel.disabled=busy||!access();
    cancel.hidden=!busy;
    excel.classList.toggle('database-excel-exporting',busy&&operation?.kind==='excel');
    for(const button of [pdf,excel])button.setAttribute('aria-busy',String(busy&&operation?.button===button));
  }
  function check(op){
    if(operation!==op||op.controller.signal.aborted||op.key!==key()||!access())
      throw new DOMException('Export cancelled.','AbortError');
  }
  function filename(ext){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Chicago',month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date()).map(p=>[p.type,p.value]));
    return `Intevacon-API-Transactions-${parts.month}${parts.day}${parts.year}-${parts.hour}${parts.minute}${parts.second}.${ext}`;
  }
  function text(value){return value==null?'':String(value);}
  // Preserve source date strings as supplied by Intevacon. Never assume a timezone.
  function valuesFor(record,fields){return fields.map(field=>{
    const v=record?.[field];return v==null?'':typeof v==='object'?JSON.stringify(v):v;
  });}
  async function pageRequest(op,params,page){
    check(op);
    const url='/api/admin/fleet/export?'+new URLSearchParams({...params,page:String(page)});
    const response=await fetch(url,{headers:{'X-Admin-Key':op.key,Accept:'application/json'},
      credentials:'same-origin',cache:'no-store',signal:op.controller.signal});
    const body=await response.json().catch(()=>null);check(op);
    if(!response.ok||!body?.success||!Array.isArray(body.items))
      throw Error(body?.error||'The saved Intevacon API records could not be exported.');
    return body;
  }
  async function getAll(op,params){
    const first=await pageRequest(op,params,1),total=Number(first.total);
    if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(first.pages)||first.pages<1)
      throw Error('Invalid export count returned by the portal.');
    if(!total)throw Error('No saved Intevacon transactions match this export.');
    const warning=op.kind==='pdf'&&total>150?'\nThis will generate a detailed PDF with every API field and may be large. Use a shorter date range if desired.':'';
    if(!confirm(`Export ${total.toLocaleString('en-US')} transaction(s) to ${op.kind==='pdf'?'filtered PDF':'full-database Excel'}?${warning}`))
      throw new DOMException('Export cancelled.','AbortError');
    const rows=[],seen=new Set();
    for(let page=1;page<=first.pages;page++){
      const data=page===1?first:await pageRequest(op,params,page);
      if(data.total!==total||data.pages!==first.pages||data.page!==page)
        throw Error('The saved transaction database changed during export. Please try again.');
      for(const row of data.items){
        const id=text(row?.ID);
        if(!id||seen.has(id))throw Error('A transaction was missing or repeated during export. Please try again.');
        seen.add(id);rows.push(row);
      }
      show(`Loading ${rows.length.toLocaleString()} of ${total.toLocaleString()} saved transactions…`);
      check(op);
      if(page%3===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(rows.length!==total)throw Error('Export incomplete. No partial file was saved.');
    return rows;
  }
  function normalizeSheets(rows){
    const products=[],taxes=[];
    for(const row of rows){
      (Array.isArray(row.Details)?row.Details:[]).forEach((detail,index)=>{
        if(!detail||typeof detail!=='object')return;
        const product={TransactionID:text(row.ID),DetailIndex:index+1};
        for(const [field,value] of Object.entries(detail))if(field!=='Taxes')product[field]=value;
        products.push(product);
        (Array.isArray(detail.Taxes)?detail.Taxes:[]).forEach((tax,idx)=>{
          if(tax&&typeof tax==='object')taxes.push({TransactionID:text(row.ID),DetailIndex:index+1,TaxIndex:idx+1,...tax});
        });
      });
    }
    return {products,taxes};
  }
  function safeCell(sheet,r,c,key){
    const address=XLSX.utils.encode_cell({r,c}),cell=sheet[address];
    if(!cell)return;
    // All identifiers, card numbers and raw source timestamps are strings (no Excel auto-date or scientific notation).
    if(/(?:ID|Number|Code|Ref|Postal|Zip|DateTime|Date|Phone|Network)$/i.test(key)||
       /^(ID|CardNumber|CustomerID|AuthRef|InvoiceID)$/i.test(key)){
      cell.t='s';cell.v=text(cell.v);delete cell.w;cell.z='@';
    }
  }
  function makeSheet(book,name,items,first){
    const available=fieldKeys(items,first);const keys=available.length?available:[...first];
    const data=[keys,...items.map(item=>valuesFor(item,keys))];
    const sheet=XLSX.utils.aoa_to_sheet(data);
    sheet['!cols']=keys.map(key=>({wch:/Description|Name|Street|Reason|DateTime/.test(key)?29:Math.max(14,Math.min(27,key.length+3))}));
    sheet['!autofilter']={ref:sheet['!ref']};
    for(let r=1;r<data.length;r++)for(let c=0;c<keys.length;c++)safeCell(sheet,r,c,keys[c]);
    XLSX.utils.book_append_sheet(book,sheet,name);
  }
  async function createExcel(op,rows){
    if(!window.XLSX?.utils?.aoa_to_sheet)throw Error('Excel exporter is unavailable. Refresh the admin page.');
    const sheets=normalizeSheets(rows);check(op);
    show(`Preparing Excel: ${rows.length.toLocaleString()} transactions, ${sheets.products.length.toLocaleString()} products and ${sheets.taxes.length.toLocaleString()} taxes…`);
    const book=XLSX.utils.book_new();
    makeSheet(book,'Transactions',rows,txnFirst);check(op);
    makeSheet(book,'Products',sheets.products,['TransactionID','DetailIndex',...detailFirst]);check(op);
    makeSheet(book,'Taxes',sheets.taxes,['TransactionID','DetailIndex','TaxIndex',...taxFirst]);check(op);
    await new Promise(resolve=>setTimeout(resolve,0));check(op);
    XLSX.writeFile(book,filename('xlsx'),{compression:true});
  }
  function pdfRows(rows){
    const result=[],sheets=normalizeSheets(rows);
    const mainFields=fieldKeys(rows,txnFirst),productFields=fieldKeys(sheets.products,detailFirst),taxFields=fieldKeys(sheets.taxes,taxFirst);
    const groupedProducts=new Map(),groupedTaxes=new Map();
    for(const p of sheets.products){const id=text(p.TransactionID);if(!groupedProducts.has(id))groupedProducts.set(id,[]);groupedProducts.get(id).push(p);}
    for(const t of sheets.taxes){const id=text(t.TransactionID),k=id+'|'+t.DetailIndex;if(!groupedTaxes.has(k))groupedTaxes.set(k,[]);groupedTaxes.get(k).push(t);}
    const append=(id,section,object,keys)=>{
      for(const name of keys)result.push([id,section,name,text(object?.[name])]);
    };
    for(const row of rows){
      const id=text(row.ID);
      append(id,'Transaction',row,mainFields);
      for(const product of groupedProducts.get(id)||[]){
        const section=`Product ${product.DetailIndex}`;
        append(id,section,product,productFields.filter(f=>f!=='TransactionID'&&f!=='DetailIndex'));
        for(const tax of groupedTaxes.get(id+'|'+product.DetailIndex)||[]){
          append(id,section+` / Tax ${tax.TaxIndex}`,tax,taxFields.filter(f=>!['TransactionID','DetailIndex','TaxIndex'].includes(f)));
        }
      }
    }
    return result;
  }
  async function createPdf(op,rows){
    if(!window.WootenAdminTablePdf?.exportData)throw Error('PDF exporter is unavailable. Refresh the admin page.');
    check(op);
    show(`Preparing all API columns for ${rows.length.toLocaleString()} filtered transactions…`);
    await new Promise(resolve=>setTimeout(resolve,0));check(op);
    const data=pdfRows(rows);check(op);
    await window.WootenAdminTablePdf.exportData('Intevacon Transactions — Filtered (All API Fields)',
      ['Transaction #','Section','API Field','Value'],data,(done,total,stage)=>{
        check(op);show(`${stage} ${Math.round(done/Math.max(1,total)*100)}%`);
      },{fullCells:true,recordCount:rows.length,filename:filename('pdf')});
  }
  async function start(kind){
    if(operation||!access())return;
    const context=bridge()?.current();
    if(kind==='pdf'&&(!context?.loaded||!context.total)){show('Load or sync transactions before exporting a filtered PDF.',true);return;}
    const op={kind,key:key(),button:kind==='pdf'?pdf:excel,controller:new AbortController()};operation=op;controls();show('Preparing export…');
    try{
      let records;
      if(kind==='excel')records=await getAll(op,{scope:'full'});
      else if(!context.historyMode){
        records=context.rows||[];
        if(!confirm(`Export all ${records.length.toLocaleString()} matching transactions in the current API result to PDF, including product and tax fields?`))throw new DOMException('Export cancelled.','AbortError');
      }else{
        if(!context.historyRange)throw Error('Load the saved transaction history first.');
        records=await getAll(op,{scope:'filtered',...context.historyRange,search:context.search});
      }
      if(!records.length)throw Error('No matching transactions to export.');
      check(op);
      if(kind==='pdf')await createPdf(op,records);else await createExcel(op,records);
      check(op);show(`Exported ${records.length.toLocaleString()} transactions to ${kind==='pdf'?'PDF':'Excel'} with all saved API fields.`);
    }catch(error){show(error?.name==='AbortError'?'Export cancelled.':error?.message||'Export failed. Please try again.',error?.name!=='AbortError');}
    finally{operation=null;controls();}
  }
  pdf.addEventListener('click',()=>start('pdf'));
  excel.addEventListener('click',()=>start('excel'));
  cancel.addEventListener('click',()=>operation?.controller.abort());
  window.addEventListener('pagehide',()=>operation?.controller.abort());
  window.addEventListener('wooten-admin-auth-changed',()=>{operation?.controller.abort();show('');controls();});
  const results=$('apiTestResults');
  if(results)new MutationObserver(controls).observe(results,{attributes:true,attributeFilter:['hidden']});
  controls();
})();
