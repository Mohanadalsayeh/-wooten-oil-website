/* Ver703: company information in document/form headers is plain text. */
(function(){
 'use strict';
 const companySelector='.iv-company,.payment-receipt-brand,.payment-receipt-brand-place,.wo-company-header-text';
 const style=document.createElement('style');
 style.textContent=companySelector.split(',').map(s=>s+' a,'+s+' [x-apple-data-detectors]').join(',')+'{color:inherit!important;text-decoration:none!important;border:0!important;box-shadow:none!important;pointer-events:none!important;cursor:text!important}';
 document.head.appendChild(style);
 function plain(block){
  for(const anchor of block.querySelectorAll('a')){
   const span=document.createElement('span');
   span.textContent=anchor.textContent;
   anchor.replaceWith(span);
  }
 }
 function scan(node){
  if(node.nodeType!==1)return;
  const parent=node.closest(companySelector);
  if(parent)plain(parent);
  for(const block of node.querySelectorAll(companySelector))plain(block);
 }
 scan(document.documentElement);
 new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes')scan(record.target);
   else for(const node of record.addedNodes)scan(node);
  }
 }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['href','x-apple-data-detectors']});
})();
