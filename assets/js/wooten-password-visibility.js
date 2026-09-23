(function(){
  'use strict';
  function init(){
    const ids=['activation-password','activation-confirm','reset-password','reset-confirm','changeNewPassword','changeConfirmPassword','sharedEmailNewPassword','sharedEmailConfirmPassword'];
    const fields=[];
    ids.forEach(id=>{
      const input=document.getElementById(id);
      if(!input||input.closest('.wooten-password-field'))return;
      const wrapper=document.createElement('span');wrapper.className='wooten-password-field';
      input.before(wrapper);wrapper.append(input);
      const button=document.createElement('button');button.type='button';button.className='wooten-password-toggle';button.setAttribute('aria-controls',id);
      const label=(input.labels?.[0]?.textContent||'password').trim();
      function setVisible(visible){input.type=visible?'text':'password';button.textContent=visible?'Hide':'Show';button.setAttribute('aria-label',(visible?'Hide ':'Show ')+label);button.setAttribute('aria-pressed',String(visible));}
      setVisible(false);wrapper.append(button);
      button.addEventListener('click',()=>{const start=input.selectionStart,end=input.selectionEnd;setVisible(input.type==='password');input.focus({preventScroll:true});if(start!==null&&end!==null)input.setSelectionRange(start,end);});
      fields.push({input,hide:()=>setVisible(false)});
    });
    // Reopening a password form starts with its contents masked again.
    new MutationObserver(records=>{
      fields.forEach(field=>{
        if(field.input.type==='text'&&records.some(record=>record.target.contains(field.input))&&!field.input.getClientRects().length)field.hide();
      });
    }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','style','class']});
    document.addEventListener('reset',event=>fields.forEach(field=>{if(event.target.contains(field.input))field.hide();}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
