/* Ver575: live invoice lookup with customer and invoice drill-down. */
(()=>{
  const get=id=>document.getElementById(id), panel=get('admin-tab-invoice-database');
  if(!panel)return;
  const table=get('invoiceDbTable'), tbody=get('invoiceDbRows');
  const filterIds=['invoiceDbSearch','invoiceDbType','invoiceDbFrom','invoiceDbTo','invoiceDbBalance','invoiceDbSort'];
  const key=()=>get('adminKey')?.value.trim()||'';
  let page=1,pages=1,loaded=false,busy=false,total=0,timer,controller,serial=0;
  const filters=()=>({search:get('invoiceDbSearch').value.trim(),invoice_type:get('invoiceDbType').value,date_from:get('invoiceDbFrom').value,date_to:get('invoiceDbTo').value,balance:get('invoiceDbBalance').value,sort:get('invoiceDbSort').value});
  window.WootenInvoiceDatabase={filters};
  const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  function status(message,good=true){get('invoiceDbStatus').textContent=message;get('invoiceDbStatus').className=message?'status show '+(good?'ok':'bad'):'status';}
  function lock(value){
    busy=value;
    [...filterIds,'invoiceDbLoad','invoiceDbClear'].forEach(id=>get(id).disabled=value);
    get('invoiceDbRefresh').disabled=value||!loaded;
    get('invoiceDbLoad').textContent=value?'Loading Invoices…':'Load Invoices';
    get('invoiceDbRefresh').textContent=value&&loaded?'Refreshing…':'Refresh';
    get('invoiceDbPrev').disabled=value||page<=1;
    get('invoiceDbNext').disabled=value||page>=pages;
    table.setAttribute('aria-busy',String(value));
    table.querySelectorAll('thead button').forEach(button=>button.disabled=value);
  }
  function date(value){return value?String(value).slice(5,7)+'-'+String(value).slice(8,10)+'-'+String(value).slice(0,4):'—';}
  function render(rows){
    tbody.replaceChildren();
    if(!rows.length){const tr=tbody.insertRow(),td=tr.insertCell();td.colSpan=7;td.className='db-empty';td.textContent='No invoices match the current search and filters.';return;}
    for(const row of rows){
      const tr=tbody.insertRow();
      [row.account_number,row.customer_name||'—',row.invoice_no,row.invoice_type,date(row.invoice_date),date(row.due_date),money.format(row.balance_cents/100)].forEach((value,index)=>{
        const td=tr.insertCell();
        if(index<3){
          const link=document.createElement('button');link.type='button';link.className='iv-link';link.textContent=value??'';
          link.setAttribute('aria-label',index===2?'View invoice '+row.invoice_no:'View all invoices for '+(row.customer_name||row.account_number));
          link.addEventListener('click',()=>{if(index===2)window.WootenInvoiceViewer.openInvoice(row,link);else window.WootenInvoiceViewer.openCustomer(row,link);});
          td.append(link);
        }else td.textContent=value??'';
        if(index===6)td.className='money';
      });
    }
  }
  function skeleton(){
    tbody.replaceChildren();
    for(let i=0;i<8;i++){const tr=tbody.insertRow();tr.className='db-skeleton-row';tr.setAttribute('aria-hidden','true');for(let j=0;j<7;j++){const td=tr.insertCell(),span=document.createElement('span');span.className='db-skeleton-cell '+(j===6?'money':'medium');td.append(span);}}
    table.dataset.pdfEmpty='true';get('invoiceDbTableWrap').hidden=false;
  }
  function sortIndicators(){
    const selected=get('invoiceDbSort').value;
    table.querySelectorAll('th[data-invoice-sort]').forEach(th=>{
      const active=selected.startsWith(th.dataset.invoiceSort+'_'),desc=selected.endsWith('_desc');
      th.setAttribute('aria-sort',active?(desc?'descending':'ascending'):'none');
      const icon=th.querySelector('[data-invoice-arrow]');if(icon)icon.textContent=active?(desc?'↓':'↑'):'↕';
    });
  }
  async function load(){
    clearTimeout(timer);
    if(!key()){status('Sign in as an administrator to load invoices.',false);return;}
    const current=filters();
    if(current.date_from&&current.date_to&&current.date_from>current.date_to){status('Invoice Date From must be on or before Invoice Date To.',false);return;}
    controller?.abort();controller=new AbortController();const requestSerial=++serial;
    lock(true);skeleton();get('invoiceDbMeta').hidden=true;get('invoiceDbPagination').hidden=true;
    status('Loading saved invoices…');
    try{
      const response=await fetch('/api/admin/open-invoices?'+new URLSearchParams({...current,page,page_size:20}),{headers:{'X-Admin-Key':key(),'Accept':'application/json'},cache:'no-store',signal:controller.signal});
      const data=await response.json();
      if(requestSerial!==serial)return;
      if(!response.ok||!data.success)throw Error(data.error||'Invoices could not be loaded.');
      loaded=true;page=data.page||1;total=data.total||0;pages=data.pages||Math.max(1,Math.ceil(total/20));
      render(data.rows||[]);table.dataset.pdfEmpty=String(!total);
      const type=get('invoiceDbType'),selected=type.value;
      type.replaceChildren(new Option('All types','all'));
      for(const item of data.invoice_types||[])type.add(new Option(item,item));
      if(selected!=='all'&&![...type.options].some(option=>option.value===selected))type.add(new Option(selected,selected));
      type.value=selected;
      get('invoiceDbTotal').textContent=total.toLocaleString();
      get('invoiceDbRange').textContent='Showing '+(total?(page-1)*20+1:0).toLocaleString()+'–'+Math.min(page*20,total).toLocaleString();
      get('invoiceDbPage').textContent='Page '+page.toLocaleString()+' of '+pages.toLocaleString();
      get('invoiceDbMeta').hidden=false;get('invoiceDbPagination').hidden=pages<=1;
      if(data.active){
        const stamp=new Date(String(data.active.completed_at).replace(' ','T')+'Z');
        get('invoiceDbLastImport').textContent='Last completed import: '+stamp.toLocaleString('en-US',{timeZone:'America/Chicago'})+' CT · '+data.active.mode;
      }else get('invoiceDbLastImport').textContent='No completed invoice import yet. Import the Open Invoices file under MAS 90 Database.';
      status(data.latest?.status==='uploading'?'An invoice import is in progress. The previous completed list is shown.':'Live invoice database loaded • '+total.toLocaleString()+' matching invoice(s).');
      sortIndicators();
    }catch(error){
      if(requestSerial!==serial||error.name==='AbortError')return;
      tbody.replaceChildren();get('invoiceDbTableWrap').hidden=true;status(error.message||'Invoices could not be loaded.',false);
    }finally{if(requestSerial===serial)lock(false);}
  }
  function resetAndLoad(){page=1;sortIndicators();if(loaded)load();}
  get('invoiceDbLoad').addEventListener('click',()=>{page=1;load();});
  get('invoiceDbRefresh').addEventListener('click',load);
  get('invoiceDbSearch').addEventListener('input',()=>{clearTimeout(timer);if(loaded)timer=setTimeout(resetAndLoad,350);});
  get('invoiceDbSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();page=1;load();}});
  filterIds.slice(1).forEach(id=>get(id).addEventListener('change',resetAndLoad));
  get('invoiceDbClear').addEventListener('click',()=>{get('invoiceDbSearch').value='';get('invoiceDbType').value='all';get('invoiceDbFrom').value='';get('invoiceDbTo').value='';get('invoiceDbBalance').value='all';get('invoiceDbSort').value='invoice_desc';resetAndLoad();});
  get('invoiceDbPrev').addEventListener('click',()=>{if(!busy&&page>1){page--;load();}});
  get('invoiceDbNext').addEventListener('click',()=>{if(!busy&&page<pages){page++;load();}});
  get('invoiceDbPrev').wootenGoToPage=target=>{if(!busy){page=Math.max(1,Math.min(pages,target));return load();}};
  table.querySelectorAll('th[data-invoice-sort]').forEach(th=>{
    const button=document.createElement('button'),label=th.textContent,arrow=document.createElement('span');
    button.type='button';button.textContent=label;button.setAttribute('aria-label','Sort by '+label);arrow.dataset.invoiceArrow='';arrow.setAttribute('aria-hidden','true');button.append(arrow);th.replaceChildren(button);
  });
  // Keep header sorting on the server so it covers every matching invoice.
  table.addEventListener('click',event=>{
    const th=event.target.closest('th[data-invoice-sort]');if(!th)return;
    event.preventDefault();event.stopImmediatePropagation();if(busy)return;
    const name=th.dataset.invoiceSort,current=get('invoiceDbSort').value;
    get('invoiceDbSort').value=name+(current===name+'_asc'?'_desc':'_asc');resetAndLoad();
  },true);
  window.addEventListener('wooten-invoices-imported',()=>{page=1;if(loaded&&panel.getClientRects().length)load();});
  window.addEventListener('wooten-admin-auth-changed',()=>{
    controller?.abort();serial++;clearTimeout(timer);loaded=false;page=1;pages=1;total=0;tbody.replaceChildren();
    ['invoiceDbMeta','invoiceDbPagination','invoiceDbTableWrap'].forEach(id=>get(id).hidden=true);table.dataset.pdfEmpty='true';status('');lock(false);
  });
  setInterval(()=>{if(loaded&&!busy&&key()&&!document.hidden&&panel.getClientRects().length)load();},30000);
  sortIndicators();table.dataset.pdfEmpty='true';lock(false);
})();
