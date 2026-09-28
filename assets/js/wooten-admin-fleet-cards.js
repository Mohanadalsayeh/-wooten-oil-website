/* Ver686: consistent Central-time fleet card PDF and Excel filenames. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),root=$('adminFleetCardInventory'),panel=$('admin-tab-intevacon-api-test'),cardPanel=$('websiteCardSync');
 if(!root||!panel||!cardPanel)return;
 const table=$('adminFleetCardTable'),body=$('adminFleetCardRows'),search=$('adminFleetCardSearch'),assignment=$('adminFleetCardAssignment');
 const columns=[['card_number','Card Number'],['assignment','Assignment'],['customer_id','Customer ID'],['status','Card Status'],['cardholder','Cardholder'],['card_type','Card Type'],['driver_no','Driver Number'],['driver_id','Driver ID'],['vehicle_no','Vehicle Number'],['vehicle_id','Vehicle ID'],['assigned_to','Assigned To'],['last_used_on','Last Used']];
 const key=()=>$('adminKey')?.value.trim()||'';
 const allowed=()=>!!key()&&!!window.wootenAdminUser&&(window.WootenAdminAccess?.has?window.WootenAdminAccess.has(window.wootenAdminUser,'fleet_cards'):window.wootenAdminUser.owner===true||window.wootenAdminUser.permissions?.includes('fleet_cards'));
 const visible=()=>!panel.hidden&&!cardPanel.hidden&&allowed();
 const n=value=>Number(value||0).toLocaleString();
 const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
 let generation=0,controller=null,loading=false,loaded=false,page=1,pages=1,appliedSearch='',appliedAssignment='all',sort='card_number',direction='asc',lastSync=null,latestSync=null;
 let totalCards=0,matchingCards=0,exportOperation=null;
 const pdf=$('adminFleetCardExportPdf'),excel=$('adminFleetCardExportExcel'),cancel=$('adminFleetCardExportCancel'),exportStatus=$('adminFleetCardExportStatus');
 function message(text,error=false){const node=$('adminFleetCardMessage');node.textContent=text;node.hidden=!text;node.dataset.error=String(error);}
 function controls(){
  table.setAttribute('aria-busy',String(loading));
  $('adminFleetCardPrev').disabled=loading||!loaded||page<=1;
  $('adminFleetCardNext').disabled=loading||!loaded||page>=pages;
  $('adminFleetCardRefresh').disabled=loading||!allowed();
  pdf.disabled=!!exportOperation||loading||!loaded||!allowed()||!matchingCards;
  excel.disabled=!!exportOperation||loading||!loaded||!allowed()||!totalCards;
  cancel.hidden=!exportOperation;
 }
 function empty(text){const row=element('tr'),cell=element('td',text);row.dataset.noSort='';cell.colSpan=columns.length;row.append(cell);body.replaceChildren(row);}
 function render(data){
  page=data.page;pages=data.pages;lastSync=data.last_sync||null;latestSync=lastSync;loaded=true;
  totalCards=Number(data.summary.cards);matchingCards=Number(data.total);
  const fragment=document.createDocumentFragment();
  for(const item of data.items){
   const row=element('tr');row.dataset.assignment=item.assignment;
   for(const [field] of columns){
    const cell=element('td');
    if(field==='assignment')cell.append(element('span',item.assignment==='unassigned'?'Unassigned — available':'Assigned','cards-assignment-badge'));
    else if(field==='last_used_on')cell.textContent=window.WootenIntevaconDates?.source(item[field])??(item[field]||'—');
    else cell.textContent=item[field]||'—';
    row.append(cell);
   }
   fragment.append(row);
  }
  if(data.items.length)body.replaceChildren(fragment);else empty(data.summary.cards?'No cards match your search and assignment filter.':'No saved cards yet. Use Sync Cards Now to retrieve the card list.');
  $('adminFleetCardSummary').textContent=n(data.summary.cards)+' total cards · '+n(data.summary.assigned)+' assigned · '+n(data.summary.unassigned)+' available to assign';
  $('adminFleetCardRange').textContent=n(data.total)+' matching card'+(data.total===1?'':'s')+(data.total?' · Showing '+n((page-1)*20+1)+'–'+n(Math.min(page*20,data.total)):'');
  $('adminFleetCardPage').textContent='Page '+n(page)+' of '+n(pages);
  $('adminFleetCardLastSync').textContent='Cards last updated: '+(window.WootenIntevaconDates?.central(lastSync)??(lastSync||'Not synced yet'));
  $('adminFleetCardUpdated').hidden=true;
  table.dataset.fullSortColumn=String(columns.findIndex(([field])=>field===sort));table.dataset.fullSortDirection=direction==='asc'?'ascending':'descending';
 }
 async function load(){
  if(!visible())return;
  const ticket=++generation,credential=key();controller?.abort();controller=new AbortController();loading=true;message('Loading cards…');controls();
  const params=new URLSearchParams({search:appliedSearch,assignment:appliedAssignment,sort,direction,page:String(page)});
  try{
   const response=await fetch('/api/admin/fleet/cards/list?'+params,{credentials:'same-origin',cache:'no-store',headers:{'X-Admin-Key':credential,'Accept':'application/json'},signal:controller.signal});
   const data=await response.json();
   if(ticket!==generation||credential!==key()||!allowed())return;
   if(!response.ok||!data.success)throw Error(data.error||'The saved card list could not be loaded.');
   render(data);message('');
  }catch(error){if(ticket===generation&&error.name!=='AbortError'){loaded=false;empty('The saved card list could not be loaded. Click Refresh to try again.');$('adminFleetCardRange').textContent='';message(error.message,true);}}
  finally{if(ticket===generation){loading=false;controls();}}
 }
 columns.forEach(([,label])=>table.tHead.rows[0].append(element('th',label)));
 table.wootenSortAll=async(index,order)=>{
  if(!columns[index]||loading)return;sort=columns[index][0];direction=order==='descending'?'desc':'asc';page=1;await load();
 };
 function applyFilters(){appliedSearch=search.value.trim();appliedAssignment=assignment.value;page=1;return load();}
 $('adminFleetCardSearchForm').addEventListener('submit',event=>{event.preventDefault();applyFilters();});
 assignment.addEventListener('change',applyFilters);
 $('adminFleetCardRefresh').addEventListener('click',applyFilters);
 $('adminFleetCardClear').addEventListener('click',()=>{search.value='';assignment.value='all';sort='card_number';direction='asc';applyFilters();});
 $('adminFleetCardPrev').addEventListener('click',()=>{if(!loading&&page>1){page--;load();}});
 $('adminFleetCardNext').addEventListener('click',()=>{if(!loading&&page<pages){page++;load();}});
 // The same shared pager used by the Live Customer Database calls this loader.
 const goToPage=target=>{
  const next=Number(target);
  if(loading||!loaded||!visible()||!Number.isInteger(next)||next<1||next>pages||next===page)return;
  page=next;return load();
 };
 $('adminFleetCardPrev').wootenGoToPage=goToPage;
 $('adminFleetCardNext').wootenGoToPage=goToPage;
 function exportMessage(text,error=false){exportStatus.textContent=text;exportStatus.hidden=!text;exportStatus.dataset.error=String(error);}
 function checkExport(op){if(exportOperation!==op||op.controller.signal.aborted||key()!==op.key||!allowed())throw new DOMException('Export cancelled.','AbortError');}
 const exportValues=item=>columns.map(([field])=>field==='assignment'?(item.customer_id?'Assigned':'Unassigned — available'):field==='last_used_on'?(window.WootenIntevaconDates?.source(item[field])??String(item[field]||'')):String(item[field]??''));
 function exportFilename(extension,now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const part=type=>parts.find(item=>item.type===type).value;
  return 'Fleet-Cards-'+part('month')+part('day')+part('year')+'-'+part('hour')+part('minute')+part('second')+'.'+extension;
 }
 async function exportPage(op,params,number){
  checkExport(op);
  const response=await fetch('/api/admin/fleet/cards/list?'+new URLSearchParams({...params,page:String(number),page_size:'500'}),{credentials:'same-origin',cache:'no-store',headers:{'X-Admin-Key':op.key,'Accept':'application/json'},signal:op.controller.signal});
  const data=await response.json();checkExport(op);
  if(!response.ok||!data.success)throw Error(data.error||'Fleet cards could not be exported.');
  return data;
 }
 async function collectExport(op,params,kind){
  const first=await exportPage(op,params,1),total=Number(first.total),countPages=Number(first.pages),snapshot=first.snapshot_id;
  if(!total)throw Error('No cards match this export.');
  if(!snapshot||!Number.isSafeInteger(total)||total>20000||!Number.isSafeInteger(countPages)||countPages<1||countPages>total)throw Error('The card export could not be verified. Refresh and try again.');
  const warning=kind==='pdf'&&total>1000?'\nFor a smaller PDF, narrow the search or assignment filter. Excel is better for a large list.':'';
  if(!window.confirm('Export '+n(total)+' cards to '+(kind==='pdf'?'PDF using the applied filters':'Excel from the full saved card database')+'?'+warning))throw new DOMException('Export cancelled.','AbortError');
  const rows=[],seen=new Set();
  for(let number=1;number<=countPages;number++){
   const data=number===1?first:await exportPage(op,params,number);
   if(data.snapshot_id!==snapshot||Number(data.total)!==total||Number(data.pages)!==countPages||Number(data.page)!==number)throw Error('The saved card list changed during export. Please try again; no partial file was saved.');
   for(const item of data.items||[]){
    if(!item.card_number||seen.has(item.card_number))throw Error('The card export is incomplete or duplicated. Please try again.');
    seen.add(item.card_number);rows.push(exportValues(item));
   }
   exportMessage('Loading '+n(rows.length)+' of '+n(total)+' cards…');checkExport(op);
  }
  if(rows.length!==total)throw Error('The card export is incomplete. Please try again; no partial file was saved.');
  return rows;
 }
 async function startExport(kind){
  if(exportOperation||loading||!loaded||!allowed())return;
  const params=kind==='pdf'?{search:appliedSearch,assignment:appliedAssignment,sort,direction}:{assignment:'all',sort:'card_number',direction:'asc'};
  if(kind==='pdf'&&!params.search&&params.assignment==='all'){
   exportMessage('Apply a search or assignment filter before exporting PDF. Use Excel to export the full card database.');search.focus();return;
  }
  if(kind==='pdf'&&!window.WootenAdminTablePdf?.exportData||kind==='excel'&&!window.XLSX){exportMessage('The exporter is unavailable. Reload the page and try again.',true);return;}
  const op={key:key(),controller:new AbortController()};exportOperation=op;
  excel.classList.toggle('database-excel-exporting',kind==='excel');excel.setAttribute('aria-busy',String(kind==='excel'));pdf.setAttribute('aria-busy',String(kind==='pdf'));controls();exportMessage('Checking card count…');
  try{
   const rows=await collectExport(op,params,kind);checkExport(op);exportMessage('Preparing '+(kind==='pdf'?'PDF':'Excel')+'…');
   await new Promise(resolve=>setTimeout(resolve,0));checkExport(op);
   const headers=columns.map(([,label])=>label);
   if(kind==='pdf'){
    await window.WootenAdminTablePdf.exportData('Fleet Cards — Filtered',headers,rows,(done,total,stage)=>{checkExport(op);exportMessage(stage+' '+Math.round(done/Math.max(total,1)*100)+'%');},{fullCells:true,recordCount:rows.length,filename:exportFilename('pdf')});
   }else{
    // Identifiers remain text cells, preserving leading zeroes and long card numbers.
    const sheet=window.XLSX.utils.aoa_to_sheet([headers,...rows]);
    sheet['!cols']=headers.map(label=>({wch:['Cardholder','Assignment','Assigned To','Last Used'].includes(label)?28:20}));sheet['!autofilter']={ref:sheet['!ref']};
    const book=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(book,sheet,'Fleet Cards');checkExport(op);
    window.XLSX.writeFile(book,exportFilename('xlsx'),{compression:true});
   }
   checkExport(op);exportMessage('Exported '+n(rows.length)+' cards to '+(kind==='pdf'?'PDF':'Excel')+'.');
  }catch(error){if(exportOperation===op)exportMessage(error.name==='AbortError'?'Export cancelled.':error.message||'Export failed. Please try again.',error.name!=='AbortError');}
  finally{if(exportOperation===op){exportOperation=null;excel.classList.remove('database-excel-exporting');excel.setAttribute('aria-busy','false');pdf.setAttribute('aria-busy','false');controls();}}
 }
 pdf.addEventListener('click',()=>startExport('pdf'));
 excel.addEventListener('click',()=>startExport('excel'));
 cancel.addEventListener('click',()=>exportOperation?.controller.abort());
 window.addEventListener('pagehide',()=>exportOperation?.controller.abort());
 const editing=()=>document.activeElement===search||search.value.trim()!==appliedSearch;
 function open(){if(visible()&&!loading&&(!loaded||(latestSync!==lastSync&&!editing())))load();}
 window.addEventListener('wooten-card-list-status',event=>{
  latestSync=event.detail.last_sync;
  if(loaded&&latestSync!==lastSync){$('adminFleetCardUpdated').hidden=false;open();}
 });
 window.addEventListener('wooten-admin-auth-changed',()=>{
  exportOperation?.controller.abort();exportOperation=null;totalCards=matchingCards=0;exportMessage('');excel.classList.remove('database-excel-exporting');excel.setAttribute('aria-busy','false');pdf.setAttribute('aria-busy','false');
  generation++;controller?.abort();controller=null;loading=false;loaded=false;page=pages=1;lastSync=latestSync=null;appliedSearch='';appliedAssignment='all';sort='card_number';direction='asc';search.value='';assignment.value='all';
  for(const id of ['adminFleetCardSummary','adminFleetCardRange','adminFleetCardLastSync'])$(id).textContent='';
  $('adminFleetCardPage').textContent='Page 1 of 1';$('adminFleetCardUpdated').hidden=true;empty('Sign in to view fleet cards.');message('');controls();open();
 });
 window.addEventListener('wooten-admin-auth-ready',open);
 new MutationObserver(open).observe(panel,{attributes:true,attributeFilter:['hidden','class']});
 new MutationObserver(open).observe(cardPanel,{attributes:true,attributeFilter:['hidden']});
 empty('Open this tab to view saved fleet cards.');controls();open();
})();
