/* Keep submitted searches in sync with the native clear control on search inputs. */
(function(){
  'use strict';
  var previous=new WeakMap();
  var adminButtons={
    statementCustomerSearch:'statementCustomerSearchButton',
    notifyRecipientSearch:'notifyRecipientSearchBtn',
    collectionsSearch:'collectionsApply',
    communicationLogSearch:'communicationLogLoad'
  };
  function cleared(input){
    if(input.value.trim())return;
    if(input.id==='activityCustomerSearch'){
      var results=document.getElementById('activitySearchResults');
      if(results)results.replaceChildren();
      return;
    }
    var buttonId=adminButtons[input.id];
    if(buttonId){document.getElementById(buttonId)?.click();return;}
    if(input.closest('#adminFleetCardSearchForm')){
      input.closest('form').querySelector('button[type="submit"]')?.click();
      return;
    }
    if(input.closest('#customerFleetRoot .fleet-toolbar')){
      input.closest('form').querySelector('button[type="submit"]')?.click();
    }
    // Other searches already listen for input; their existing clear handling runs normally.
  }
  document.addEventListener('focusin',function(event){
    if(event.target.matches?.('input[type="search"]'))previous.set(event.target,event.target.value);
  });
  function onChange(event){
    var input=event.target;
    if(!input.matches?.('input[type="search"]'))return;
    var old=previous.get(input);
    previous.set(input,input.value);
    if(old && !input.value.trim())queueMicrotask(function(){cleared(input);});
  }
  document.addEventListener('input',onChange,true);
  document.addEventListener('search',onChange,true);
})();
