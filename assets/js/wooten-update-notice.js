/* Checks the deployed page without changing the installed app's push worker. */
(()=>{
  const installed=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true||navigator.standalone===true;
  if(!installed())return;
  const marker=document.querySelector('meta[name="wooten-build-fingerprint"]')?.content;
  const currentVersion=document.querySelector('meta[name="wooten-portal-version"]')?.content;
  if(!/^[a-f0-9]{64}$/.test(marker||''))return;

  const page=location.pathname.split('/').pop()||'index.html';
  const storageKey='wooten-update-dismissed:'+page;
  const readDismissed=()=>{try{return sessionStorage.getItem(storageKey)||'';}catch(_){return '';}};
  const dismiss=value=>{dismissed=value;try{sessionStorage.setItem(storageKey,value);}catch(_){/* Storage may be disabled. */}};
  let checking=false,lastCheck=0,lastEtag='',dismissed=readDismissed(),latest='';
  let banner;

  function show(){
    if(banner||latest===dismissed)return;
    banner=document.createElement('aside');
    banner.id='wooten-update-notice';banner.setAttribute('role','status');
    banner.innerHTML='<strong>Portal update available</strong><p>A newer version is ready. Update when you finish your current work.</p><div><button type="button" data-update-later>Later</button><button type="button" data-update-now>Update now</button></div>';
    const style=document.createElement('style');style.id='wooten-update-notice-style';
    style.textContent='#wooten-update-notice{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom, 0px));z-index:2147483000;box-sizing:border-box;width:min(440px,calc(100vw - 32px));padding:18px 20px;background:#fff;border:1px solid #bbd0df;border-left:5px solid #d51f29;border-radius:16px;box-shadow:0 18px 48px rgba(10,36,59,.22);color:#19384f;font:inherit}#wooten-update-notice strong{display:block;font-size:18px}#wooten-update-notice p{margin:8px 0 16px;color:#587187;line-height:1.45}#wooten-update-notice div{display:flex;justify-content:flex-end;gap:10px}#wooten-update-notice button{font:inherit;min-height:44px;padding:9px 18px;border-radius:10px;cursor:pointer}#wooten-update-notice [data-update-later]{color:#17384f;background:#edf3f7;border:1px solid #c7d9e5}#wooten-update-notice [data-update-now]{color:#fff;background:#d51f29;border:1px solid #d51f29;font-weight:700}@media(max-width:520px){#wooten-update-notice{left:16px;right:16px}}';
    document.head.append(style);document.body.append(banner);
    banner.querySelector('[data-update-later]').addEventListener('click',()=>{dismiss(latest);banner.remove();banner=null;style.remove();});
    banner.querySelector('[data-update-now]').addEventListener('click',()=>{dismiss(latest);const url=new URL(location.href);url.searchParams.set('portal_updated',String(Date.now()));location.replace(url.href);});
  }

  async function check(force=false){
    if(checking||document.hidden||(!force&&Date.now()-lastCheck<60000))return;
    checking=true;lastCheck=Date.now();
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{
      let targetVersion='';
      const release=await fetch('/portal-version.json?portal_version_check='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:abort.signal}).catch(()=>null);
      if(release?.ok&&release.headers.get('content-type')?.includes('application/json')){
        const data=await release.json();
        if(typeof data.pages?.[page]==='string')targetVersion=data.pages[page];
      }
      const url=new URL(location.pathname,location.origin);url.searchParams.set('portal_version_check',String(Date.now()));
      const headers={'Accept':'text/html'};if(lastEtag)headers['If-None-Match']=lastEtag;
      const response=await fetch(url.href,{cache:'no-store',credentials:'same-origin',redirect:'follow',headers,signal:abort.signal});
      if(response.status===304){if(targetVersion&&currentVersion&&targetVersion!==currentVersion){latest='release:'+page+':'+targetVersion;show();}return;}
      if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))return;
      const html=await response.text();
      const servedMarker=html.match(/<meta\s+name="wooten-build-fingerprint"\s+content="([a-f0-9]{64})"/i)?.[1];
      if(!servedMarker)return;
      lastEtag=response.headers.get('etag')||'';
      if(servedMarker!==marker)latest='page:'+page+':'+servedMarker;
      else if(targetVersion&&currentVersion&&targetVersion!==currentVersion)latest='release:'+page+':'+targetVersion;
      else latest='';
      if(latest)show();
    }catch(_){/* Connection interruptions are retried on the next check. */}
    finally{clearTimeout(timer);checking=false;}
  }
  setTimeout(()=>check(true),2500);
  setInterval(()=>check(true),10*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  window.addEventListener('focus',()=>check());
  window.addEventListener('online',()=>check(true));
})();
