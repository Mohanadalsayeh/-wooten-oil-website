/* Ver680. Reuse the signed-in admin window, including Cloudflare's extensionless URL.
   Notification-only worker: no fetch handler and no portal-page caching. */
const ROLE='admin';
const STORE='wooten-push-'+ROLE;
function adminWindow(client){
 try{
  const url=new URL(client.url);
  return url.origin===self.location.origin&&/^\/admin-customers(?:\.html)?\/?$/.test(url.pathname);
 }catch{return false;}
}
function clientReady(client,device){
 // Ask only whether this window can handle the alert; never copy login credentials.
 return new Promise(resolve=>{
  const channel=new MessageChannel();let done=false;
  const finish=ready=>{if(done)return;done=true;clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(ready);};
  const timer=setTimeout(()=>finish(false),500);
  channel.port1.onmessage=event=>finish(event.data?.ready===true);
  try{client.postMessage({type:'wooten-push-client-status',role:ROLE,device},[channel.port2]);}catch{finish(false);}
 });
}
async function state(value){
 const cache=await caches.open(STORE),key=new Request(new URL('/push/'+ROLE+'/device-state',self.location.origin));
 if(value!==undefined){await cache.put(key,new Response(JSON.stringify(value)));return value;}
 const result=await cache.match(key);return result?result.json():null;
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('message',event=>{
 if(event.data?.type!=='wooten-push-state')return;
 event.waitUntil((async()=>{if(!event.source||new URL(event.source.url).origin!==self.location.origin)return;await state({enabled:event.data.enabled===true,device:String(event.data.device||'')});if(!event.data.enabled){for(const notice of await self.registration.getNotifications())notice.close();}event.ports?.[0]?.postMessage({ok:true});})());
});
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{return;}
 const saved=await state();if(!saved?.enabled||saved.device!==data.device||data.role!==ROLE)return;
 const target=['fleet','mas90'].includes(data.target)?data.target:'notifications';
 await self.registration.showNotification(String(data.title||'Wooten Oil').slice(0,120),{body:String(data.body||'A new portal update is available.').slice(0,250),icon:'/assets/push/icon-192.png',badge:'/assets/push/badge-96.png',tag:String(data.tag||'wooten-update').slice(0,160),data:{target,device:saved.device},renotify:false});
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of clients)client.postMessage({type:'wooten-push-refresh',role:ROLE,device:saved.device});
})()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const saved=await state();if(!saved?.enabled||saved.device!==event.notification.data?.device)return;
  const target=['fleet','mas90'].includes(event.notification.data.target)?event.notification.data.target:'notifications';
  const url=new URL('/admin-customers.html',self.location.origin);url.searchParams.set('portal-notifications',target);
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const candidates=clients.filter(adminWindow);
  const readiness=await Promise.all(candidates.map(client=>clientReady(client,saved.device)));
  const preferred=candidates.filter((client,index)=>readiness[index]);
  const fallback=candidates.filter((client,index)=>!readiness[index]);
  for(const client of [...preferred,...fallback]){
   try{
    await client.focus();
    client.postMessage({type:'wooten-push-open',role:ROLE,device:saved.device,target});
    return;
   }catch{/* A window may close while the user clicks the notification; try the next. */}
  }
  await self.clients.openWindow(url.href);
 })());
});
