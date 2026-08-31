
(function(){
  const body=document.body;
  const keyField=document.getElementById('adminKey');
  const overlay=document.getElementById('adminLoginOverlay');
  const form=document.getElementById('adminLoginForm');
  const loginName=document.getElementById('adminLoginName');
  const keyPrompt=document.getElementById('adminKeyPrompt');
  const status=document.getElementById('adminLoginStatus');
  const openBtn=document.getElementById('adminAccessOpenBtn');
  const accessMeta=document.getElementById('adminAccessMeta');
  const submitBtn=form ? form.querySelector('button[type="submit"]') : null;
  const storageKey='wootenAdminLoginSession';
  let currentUser=null;

  function applyPermissions(user){
    currentUser=user||null;window.wootenAdminUser=currentUser;
    const permissions=new Set(Array.isArray(user?.permissions)?user.permissions:[]);
    const mapping={customers:'database',activity:'customer_activity',notifications:'notifications',documents:'statements',communication:'communication',settings:'communications_settings',applications:'applications',activation:'activation'};
    let firstVisible=null;
    document.querySelectorAll('[data-admin-tab]').forEach(tab=>{const section=tab.dataset.adminTab;const allowed=!!user&&(section==='dashboard'||section==='users'||user.owner||permissions.has(mapping[section]));tab.hidden=!allowed;if(allowed&&!firstVisible)firstVisible=tab;});
    document.querySelectorAll('[data-owner-nav]').forEach(group=>group.hidden=!user?.owner);
    document.querySelectorAll('[data-admin-open]').forEach(button=>{const section=button.dataset.adminOpen;button.closest('.admin-dashboard-card').hidden=!(user&&(user.owner||permissions.has(mapping[section])));});
    const ownerOnlyControls=document.querySelectorAll('#admin-tab-users input,#admin-tab-users button:not(#adminAuditRefresh)');
    ownerOnlyControls.forEach(control=>{control.disabled=!user?.owner;control.setAttribute('aria-disabled',user?.owner?'false':'true');});
    document.querySelectorAll('.admin-user-editor,.admin-user-list-section').forEach(section=>{section.hidden=!user?.owner;});
    document.getElementById('admin-tab-users')?.classList.toggle('admin-user-management-locked',!user?.owner);
    const selected=document.querySelector('[data-admin-tab][aria-selected="true"]');if(selected?.hidden&&firstVisible)setTimeout(()=>firstVisible.click(),0);
    if(user?.owner)setTimeout(()=>window.loadWootenAdminUsers?.(),0);
  }

  function setStatus(message,bad){
    if(!status) return;
    status.className='status show '+(bad===false?'ok':'bad');
    status.textContent=message||'';
  }

  function clearStatus(){
    if(!status) return;
    status.className='status';
    status.textContent='';
  }

  function setBusy(busy){
    if(!submitBtn) return;
    submitBtn.disabled=!!busy;
    submitBtn.textContent=busy ? 'Checking…' : 'Sign In';
  }

  function updateAccessMeta(){
    const hasKey=!!(keyField.value||'').trim();
    if(openBtn) openBtn.textContent='Logout / Change Key';
    if(!accessMeta) return;
    accessMeta.textContent=hasKey ? 'Signed in as '+String(currentUser?.display_name||currentUser?.username||'Administrator') : 'Locked • Login required';
  }

  function openLogin(options){
    const opts=options||{};
    body.classList.add('admin-login-locked');
    overlay.setAttribute('aria-hidden','false');
    if(opts.message) setStatus(opts.message,true); else clearStatus();
    window.setTimeout(()=>{ keyPrompt.focus(); },40);
  }

  function closeLogin(){
    if(!(keyField.value||'').trim()) return;
    body.classList.remove('admin-login-locked');
    overlay.setAttribute('aria-hidden','true');
    clearStatus();
  }

  function saveSession(){
    try{
      sessionStorage.setItem(storageKey, JSON.stringify({login:loginName.value.trim(), key:(keyField.value||'').trim(),user:currentUser}));
    }catch(_e){}
  }

  function clearSession(){
    try{ sessionStorage.removeItem(storageKey); }catch(_e){}
  }

  function openAdminDashboard(){
    try{ sessionStorage.setItem('wootenAdminTab','dashboard'); }catch(_e){}
    if(typeof window.showWootenAdminPage==='function'){
      window.showWootenAdminPage('dashboard',{updateHash:true});
      return;
    }
    const dashboardTab=document.querySelector('[data-admin-tab="dashboard"]');
    if(dashboardTab&&!dashboardTab.hidden) dashboardTab.click();
  }

  async function loginAdmin(username,password){
    const response = await fetch('/api/admin/auth/login', {
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({username,password}),
      cache:'no-store'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.success)return {ok:false,reason:response.status===401?'invalid':'server',error:data.error};
    return {ok:true,token:data.token,user:data.user};
  }

  async function validateSession(key){
    const response=await fetch('/api/admin/auth/me',{headers:{'X-Admin-Key':key,'Accept':'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));
    return response.ok&&data.success?{ok:true,user:data.user}:{ok:false};
  }

  async function tryRestoreSession(){
    try{
      const raw=sessionStorage.getItem(storageKey);
      if(!raw) return false;
      const data=JSON.parse(raw)||{};
      const savedKey=String(data.key||'').trim();
      if(!savedKey) return false;
      const check=await validateSession(savedKey);
      if(!check.ok){
        clearSession();
        return false;
      }
      loginName.value=String(data.login||check.user?.username||'Admin');
      keyField.value=savedKey;
      keyPrompt.value=savedKey;
      applyPermissions(check.user||data.user);
      openAdminDashboard();
      updateAccessMeta();
      closeLogin();
      loadImportLastUpdates();
      return true;
    }catch(_e){
      clearSession();
      return false;
    }
  }

  window.ensureAdminLoginKey=function(message){
    if((keyField.value||'').trim()) return true;
    openLogin({message:message||'Enter the Admin Import Key to continue.'});
    return false;
  };

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    const username=(loginName.value||'').trim();
    const key=(keyPrompt.value||'').trim();
    if(!username||!key){
      setStatus('Enter your username and password.',true);
      keyPrompt.focus();
      return;
    }
    setBusy(true);
    clearStatus();
    try{
      const check=await loginAdmin(username,key);
      if(!check.ok){
        keyField.value='';
        if(check.reason==='invalid') setStatus('Invalid username or password.',true);
        else setStatus(check.error||'Could not verify administrator access right now. Please try again.',true);
        keyPrompt.focus();
        keyPrompt.select();
        updateAccessMeta();
        return;
      }
      keyField.value=check.token;
      applyPermissions(check.user);
      openAdminDashboard();
      saveSession();
      updateAccessMeta();
      setStatus('Access granted.',false);
      closeLogin();
      loadImportLastUpdates();
    }catch(_error){
      keyField.value='';
      setStatus('Could not verify administrator access right now. Please try again.',true);
      keyPrompt.focus();
      keyPrompt.select();
      updateAccessMeta();
    }finally{
      setBusy(false);
    }
  });

  if(openBtn){
    openBtn.addEventListener('click',function(){
      const oldKey=(keyField.value||'').trim();if(oldKey)fetch('/api/admin/auth/logout',{method:'POST',headers:{'X-Admin-Key':oldKey}}).catch(()=>{});
      clearSession();
      keyField.value='';
      keyPrompt.value='';
      applyPermissions(null);
      updateAccessMeta();
      openLogin();
      setStatus('Signed out. Enter a username and password, or use Admin with the owner key.',false);
    });
  }

  overlay.addEventListener('click',function(e){
    if(e.target===overlay || e.target.classList.contains('admin-login-backdrop')){
      if((keyField.value||'').trim()) closeLogin();
    }
  });

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && body.classList.contains('admin-login-locked') && (keyField.value||'').trim()){
      closeLogin();
    }
  });

  loginName.value='Admin';
  updateAccessMeta();
  tryRestoreSession().then(function(restored){
    if(!restored) openLogin();
  });
})();
