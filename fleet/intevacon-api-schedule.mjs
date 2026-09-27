// Ver650: one durable scheduler for the issuer; cached admin results only.
import {handle as retrieve} from './intevacon-api-test.mjs';
const response = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store, private'}});
const defaults = {enabled:false, intervalSeconds:300, days:1, cardNumber:''};
function central(date) {
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export async function handle({request,env,actor}) {
 if(!actor || !(actor.owner===true || actor.permissions?.includes('fleet_cards')))return response({success:false,error:'Fleet administrator access is required.'},403);
 if(!env.INTEVACON_SCHEDULER)return response({success:false,error:'Automatic sync setup is incomplete. Add the INTEVACON_SCHEDULER Durable Object binding from Version 650.'},503);
 const route=new URL(request.url).pathname.split('/').pop();
 if(!['schedule','results','sync'].includes(route))return response({success:false},404);
 if(!['GET','POST'].includes(request.method) || (route==='results' && request.method!=='GET') || (route==='sync' && request.method!=='POST'))return response({success:false},405);
 if(request.method==='POST' && (request.headers.get('Origin')!==new URL(request.url).origin || !/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||'')))return response({success:false,error:'Use the admin page.'},403);
 let body;
 if(request.method==='POST'){
  body=await request.text();if(body.length>2048)return response({success:false,error:'Request too large.'},413);
 }
 const stub=env.INTEVACON_SCHEDULER.get(env.INTEVACON_SCHEDULER.idFromName('wooten-api-sync'));
 return stub.fetch(new Request(`https://scheduler/${route}`,{method:request.method,headers:{'Content-Type':'application/json'},body}));
}
export class IntevaconApiScheduler {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.running=null;this.queue=Promise.resolve();}
 // Serialize control operations and snapshot reads with a pull; never overlap pulls.
 exclusive(fn){const p=this.queue.then(fn);this.queue=p.catch(()=>{});return p;}
 async fetch(request){
  const route=new URL(request.url).pathname;
  if(route==='/schedule' && request.method==='GET'){
   const c=await this.ctx.storage.get('config')||defaults;
   return response({success:true,config:c,status:await this.ctx.storage.get('status')||{},nextRun:await this.ctx.storage.getAlarm(),running:!!this.running});
  }
  if(route==='/sync' && this.running)return response({success:false,error:'An API sync is already running.'},409);
  return this.exclusive(async()=>{
   if(route==='/results'){
    const count=await this.ctx.storage.get('chunks')||0;
    if(!count)return response({success:true,result:null});
    let text='';for(let i=0;i<count;i++)text+=await this.ctx.storage.get('result:'+i);
    return response({success:true,result:JSON.parse(text)});
   }
   if(route==='/schedule' && request.method==='POST'){
    let c;try{c=await request.json();}catch{return response({success:false,error:'Invalid settings.'},400);}
    if(typeof c.enabled!=='boolean'|| !Number.isInteger(c.intervalSeconds)||c.intervalSeconds<30||c.intervalSeconds>86400||!Number.isInteger(c.days)||c.days<1||c.days>92||typeof c.cardNumber!=='string'||(c.cardNumber && !/^\d{1,32}$/.test(c.cardNumber)))return response({success:false,error:'Choose an interval from 30 to 86,400 seconds and a history window from 1 to 92 days.'},400);
    await this.ctx.storage.put('config',c);
    if(c.enabled)await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,Number(await this.ctx.storage.get('nextAllowed')||0)));
    else await this.ctx.storage.deleteAlarm();
    return response({success:true,config:c});
   }
   if(route==='/sync' && request.method==='POST'){
    let input;try{input=await request.json();}catch{return response({success:false,error:'Invalid request.'},400);}
    return this.pull(input);
   }
   return response({success:false},404);
  });
 }
 async alarm(){return this.exclusive(async()=>{
  const c=await this.ctx.storage.get('config')||defaults;
  if(!c.enabled)return;
  const now=Date.now(), next=Number(await this.ctx.storage.get('nextAllowed')||0);
  if(next>now){await this.ctx.storage.setAlarm(next);return;}
  const to=central(new Date(now));
  const from=new Date(Date.parse(to+':00Z')-c.days*86400000).toISOString().slice(0,16);
  await this.pull({from,to,cardNumber:c.cardNumber});
 });}
 async pull(input){
  const now=Date.now(), next=Number(await this.ctx.storage.get('nextAllowed')||0);
  if(next>now)return response({success:false,error:'Please wait before the next API sync.'},429);
  this.running=true;
  let delay=30000;
  try{
   // Recovery alarm also prevents a crashed run from leaving the schedule stuck.
   await this.ctx.storage.put('nextAllowed',now+90000);
   const config=await this.ctx.storage.get('config')||defaults;
   if(config.enabled)await this.ctx.storage.setAlarm(now+120000);
   const old=await this.ctx.storage.get('status')||{};
   await this.ctx.storage.put('status',{...old,lastAttempt:new Date(now).toISOString(),state:'running'});
   const r=await retrieve({request:new Request('https://scheduler/api',{method:'POST',headers:{Origin:'https://scheduler','Content-Type':'application/json'},body:JSON.stringify(input)}),env:this.env,actor:{owner:true}});
   const data=await r.json();
   if(r.ok && data.success){
    const text=JSON.stringify(data), chunks=[];
    // At most 96KB UTF-8 per value, below the KV value limit even for non-ASCII.
    for(let i=0;i<text.length;i+=24000)chunks.push(text.slice(i,i+24000));
    await this.ctx.storage.transaction(async storage=>{
     const n=await storage.get('chunks')||0;
     for(let i=0;i<chunks.length;i++)await storage.put('result:'+i,chunks[i]);
     for(let i=chunks.length;i<n;i++)await storage.delete('result:'+i);
     await storage.put('chunks',chunks.length);
     await storage.put('status',{state:'success',lastAttempt:new Date(now).toISOString(),completedAt:data.completedAt,count:data.count,error:null});
    });
   }else{
    const failures=(old.failures||0)+1;
    delay=Math.max(60000,Math.min(1800000,30000*2**Math.min(failures,6)),Number(r.headers.get('Retry-After')||0)*1000);
    await this.ctx.storage.put('status',{...old,state:'error',lastAttempt:new Date(now).toISOString(),error:data.error||'API sync failed.',failures});
   }
   return response(data,r.status);
  }catch{
   delay=60000;
   const old=await this.ctx.storage.get('status')||{};
   await this.ctx.storage.put('status',{...old,state:'error',error:'Sync was interrupted. The last successful results were kept.'});
   return response({success:false,error:'Sync was interrupted. The last successful results were kept.'},502);
  }finally{
   const c=await this.ctx.storage.get('config')||defaults;
   const due=Date.now()+Math.max(c.intervalSeconds*1000,delay);
   await this.ctx.storage.put('nextAllowed',Date.now()+delay);
   if(c.enabled)await this.ctx.storage.setAlarm(due);else await this.ctx.storage.deleteAlarm();
   this.running=null;
  }
 }
}
