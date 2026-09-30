/* Ver721: shared customer/admin installation UI; existing manifests and push service worker retained. */
(()=>{
'use strict';
if(window.wootenInstallAppLoaded)return;
window.wootenInstallAppLoaded=true;
let deferred=null,installedHere=false,busy=false,opener=null;
const modes=['standalone','minimal-ui','window-controls-overlay'].map(mode=>window.matchMedia('(display-mode: '+mode+')'));
const standalone=()=>navigator.standalone===true||modes.some(m=>m.matches);
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const admin=!!document.getElementById('adminNotificationBell');
const stateKey='wooten-app-installed-'+(admin?'admin':'customer');
function readInstalled(){try{return localStorage.getItem(stateKey)==='yes';}catch{return installedHere;}}
function remember(value){installedHere=value;try{if(value)localStorage.setItem(stateKey,'yes');else localStorage.removeItem(stateKey);}catch{}}
installedHere=readInstalled();
const bell=document.getElementById(admin?'adminNotificationBell':'dashboardNotifications');
if(!bell)return;
const icon='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>';
const button=document.createElement('button');button.type='button';button.className='wo-install-button';button.innerHTML=icon+'<span>Install App</span>';button.hidden=true;
const anchor=admin?bell.closest('.admin-bell-shell'):bell;
anchor.after(button);anchor.parentElement.classList.add('wo-install-actions');
const dialog=document.createElement('dialog');dialog.id='woInstallDialog';dialog.setAttribute('aria-labelledby','woInstallTitle');
dialog.innerHTML='<header><h2 id="woInstallTitle">Install Wooten Oil App</h2><button type="button" class="wo-install-close" aria-label="Close install instructions">×</button></header><div class="wo-install-body"><div class="wo-install-app"><span class="wo-install-logo">WO</span><div><strong>Wooten Oil'+(admin?' Admin':'')+'</strong><small>Your '+(admin?'admin':'customer')+' portal, one tap away.</small></div></div><p class="wo-install-description">Add Wooten Oil to your Home Screen or desktop for easy access.</p><div class="wo-install-instructions"></div><button type="button" class="wo-install-existing" style="margin-top:16px;border:0;background:transparent;color:#193953;text-decoration:underline;padding:10px 0;min-height:44px;font:inherit;cursor:pointer">Already installed?</button><p class="wo-install-result" role="status" hidden></p></div><footer><button type="button" class="wo-install-primary">Got it</button></footer>';
document.body.append(dialog);
const q=s=>dialog.querySelector(s);
function render(){
 if(standalone())remember(true);
 button.hidden=standalone();
 button.querySelector('span').textContent=installedHere?'Open App':'Install App';
 q('#woInstallTitle').textContent=installedHere?'Open Wooten Oil App':'Install Wooten Oil App';
 q('.wo-install-description').textContent=installedHere?'Launch Wooten Oil from its installed app icon.':'Add Wooten Oil to your Home Screen or desktop for easy access.';
 q('.wo-install-existing').textContent=installedHere?'App removed? Show installation options':'Already installed?';
 if(button.hidden&&dialog.open)dialog.close();
 const content=q('.wo-install-instructions');content.replaceChildren();
 if(installedHere){content.textContent=ios()?'Go to your Home Screen and tap the Wooten Oil icon. Safari cannot open the installed web app directly.':/Windows/.test(navigator.userAgent)?'Open the Windows Start menu and search for Wooten Oil, or use its desktop or taskbar shortcut. If your browser offers Open in app in the address bar, you can use that too.':'Open Wooten Oil from your device’s app launcher or Home Screen.';}
 else if(deferred){content.textContent='Continue to your browser’s installation window to add Wooten Oil to this device.';}
 else if(ios()){
  const list=document.createElement('ol');['Open this portal in Safari, then tap Share.','Choose Add to Home Screen.','Keep Open as Web App enabled if shown, then tap Add.','Open the new Wooten Oil icon and sign in.'].forEach(t=>{const li=document.createElement('li');li.textContent=t;list.append(li);});content.append(list);
 }else{content.textContent='Open your browser menu and look for Install app, Install this site as an app, or Add to Home Screen. If no install option is available, try a supported browser such as Chrome or Edge. You can continue using the portal in your browser.';}
 q('.wo-install-primary').textContent=!installedHere&&deferred?'Install App':'Got it';q('.wo-install-primary').disabled=busy;
}
button.addEventListener('click',()=>{opener=button;render();q('.wo-install-result').hidden=true;if(!button.hidden&&!dialog.open)dialog.showModal();});
q('.wo-install-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{if(opener&&!opener.hidden)opener.focus();});
q('.wo-install-primary').addEventListener('click',async()=>{
 if(busy)return;if(installedHere||!deferred){dialog.close();return;}
 const event=deferred;deferred=null;busy=true;q('.wo-install-primary').disabled=true;
 try{await event.prompt();const choice=await event.userChoice;if(choice.outcome==='accepted'){remember(true);dialog.close();}else{q('.wo-install-result').textContent='Installation canceled. You can install later from your browser menu.';q('.wo-install-result').hidden=false;}}
 catch{q('.wo-install-result').textContent='The installation window could not open. Use your browser menu to install the app.';q('.wo-install-result').hidden=false;}
 finally{busy=false;render();}
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;remember(false);render();});
window.addEventListener('appinstalled',()=>{remember(true);deferred=null;render();});
for(const m of modes){if(m.addEventListener)m.addEventListener('change',render);else if(m.addListener)m.addListener(render);}
q('.wo-install-existing').addEventListener('click',()=>{remember(!installedHere);q('.wo-install-result').hidden=true;render();});
window.addEventListener('storage',e=>{if(e.key===stateKey){installedHere=readInstalled();render();}});
window.addEventListener('pageshow',()=>{installedHere=readInstalled();render();});render();
})();
