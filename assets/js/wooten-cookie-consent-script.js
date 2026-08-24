(function(){
  var key='wooten_cookie_preference';
  var box=document.getElementById('wootenCookieConsent');
  var necessary=document.getElementById('wootenNecessaryOnly');
  var accept=document.getElementById('wootenAcceptOptional');
  if(!box || !necessary || !accept) return;

  function savePreference(value){
    try{ localStorage.setItem(key,value); }catch(e){}
    box.classList.remove('show');
  }

  var saved='';
  try{ saved=localStorage.getItem(key)||''; }catch(e){}
  if(!saved) box.classList.add('show');

  necessary.addEventListener('click',function(){savePreference('necessary');});
  accept.addEventListener('click',function(){savePreference('optional');});
})();
