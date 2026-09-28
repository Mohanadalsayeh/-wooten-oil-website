/* Ver662. Notification-only worker: no fetch handler and no portal-page caching. */
const ROLE='customer';
const STORE='wooten-push-'+ROLE;
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
  const path=ROLE==='admin'?'/admin-customers.html':'/';
  const url=new URL(path,self.location.origin);url.searchParams.set('portal-notifications',event.notification.data.target||'notifications');
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=clients.find(c=>{const u=new URL(c.url);return u.origin===url.origin&&(ROLE==='admin'?u.pathname===path:u.pathname==='/'||u.pathname==='/index.html');});
  if(existing){await existing.focus();existing.postMessage({type:'wooten-push-open',role:ROLE,device:saved.device,target:event.notification.data.target});}
  else await self.clients.openWindow(url.href);
 })());
});
