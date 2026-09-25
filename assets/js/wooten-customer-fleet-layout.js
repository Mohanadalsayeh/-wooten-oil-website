/* Keep the customer Fleet dialog steady across tab changes. */
(function(){
 'use strict';
 document.addEventListener('click',function(event){
  var tab=event.target.closest && event.target.closest('button[data-kind]');
  if(!tab)return;
  var dialog=tab.closest('dialog.fleet-modal.wooten-fleet');
  if(!dialog || !dialog.open || dialog.hasAttribute('data-size-locked'))return;
  var height=dialog.getBoundingClientRect().height;
  if(!height)return;
  dialog.style.setProperty('--fleet-locked-height',height+'px');
  dialog.setAttribute('data-size-locked','');
  dialog.addEventListener('close',function(){
   dialog.removeAttribute('data-size-locked');
   dialog.style.removeProperty('--fleet-locked-height');
  },{once:true});
 },true);
})();
