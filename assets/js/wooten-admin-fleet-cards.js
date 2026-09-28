/* Ver683: admin-only saved card inventory. Reading this table never starts a pull. */
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
 function message(text,error=false){const node=$('adminFleetCardMessage');node.textContent=text;node.hidden=!text;node.dataset.error=String(error);}
 function controls(){
  table.setAttribute('aria-busy',String(loading));
  $('adminFleetCardPrev').disabled=loading||!loaded||page<=1;
  $('adminFleetCardNext').disabled=loading||!loaded||page>=pages;
  $('adminFleetCardRefresh').disabled=loading||!allowed();
 }
 function empty(text){const row=element('tr'),cell=element('td',text);row.dataset.noSort='';cell.colSpan=columns.length;row.append(cell);body.replaceChildren(row);}
 function render(data){
  page=data.page;pages=data.pages;lastSync=data.last_sync||null;latestSync=lastSync;loaded=true;
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
 const editing=()=>document.activeElement===search||search.value.trim()!==appliedSearch;
 function open(){if(visible()&&!loading&&(!loaded||(latestSync!==lastSync&&!editing())))load();}
 window.addEventListener('wooten-card-list-status',event=>{
  latestSync=event.detail.last_sync;
  if(loaded&&latestSync!==lastSync){$('adminFleetCardUpdated').hidden=false;open();}
 });
 window.addEventListener('wooten-admin-auth-changed',()=>{
  generation++;controller?.abort();controller=null;loading=false;loaded=false;page=pages=1;lastSync=latestSync=null;appliedSearch='';appliedAssignment='all';sort='card_number';direction='asc';search.value='';assignment.value='all';
  for(const id of ['adminFleetCardSummary','adminFleetCardRange','adminFleetCardLastSync'])$(id).textContent='';
  $('adminFleetCardPage').textContent='Page 1 of 1';$('adminFleetCardUpdated').hidden=true;empty('Sign in to view fleet cards.');message('');controls();open();
 });
 window.addEventListener('wooten-admin-auth-ready',open);
 new MutationObserver(open).observe(panel,{attributes:true,attributeFilter:['hidden','class']});
 new MutationObserver(open).observe(cardPanel,{attributes:true,attributeFilter:['hidden']});
 empty('Open this tab to view saved fleet cards.');controls();open();
})();
