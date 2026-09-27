// Ver658: fresh customer-scoped requests; admin scheduling remains independent.
// Ver651: automatic runs always retrieve all cards.
// Ver650: one durable scheduler for the issuer; cached admin results only.
import {handle as retrieve} from './intevacon-api-test.mjs';
import {customerData,customerIDForAccount} from './intevacon-customer-api.mjs';
import {FreshCustomerFleet} from './intevacon-customer-live.mjs';
const response = (data, status = 200, headers = {}) => Response.json(data, {status, headers:{'Cache-Control':'no-store, private',...headers}});
const defaults = {enabled:false, intervalSeconds:300, days:1, cardNumber:''};
async function readSnapshot(storage,prefix=''){
 const count=await storage.get(prefix+'chunks')||0;if(!count)return null;
 let text='';for(let i=0;i<count;i++)text+=await storage.get(prefix+'result:'+i);
 return JSON.parse(text);
}
async function writeSnapshot(storage,data,prefix=''){
 const text=JSON.stringify(data),chunks=[];
 // At most 96KB UTF-8 per value, even for non-ASCII text.
 for(let i=0;i<text.length;i+=24000)chunks.push(text.slice(i,i+24000));
 const oldCount=await storage.get(prefix+'chunks')||0;
 for(let i=0;i<chunks.length;i++)await storage.put(prefix+'result:'+i,chunks[i]);
 for(let i=chunks.length;i<oldCount;i++)await storage.delete(prefix+'result:'+i);
 await storage.put(prefix+'chunks',chunks.length);
}
function central(date) {
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const fullSnapshot=s=>s?.readOnly===true&&!s.cardNumber&&Array.isArray(s.rows);
const completed=s=>Date.parse(s?.completedAt)||0;
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
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.running=null;this.queue=Promise.resolve();this.customerLive=new FreshCustomerFleet(this);}
 // Serialize control operations and snapshot reads with a pull; never overlap pulls.
 exclusive(fn){const p=this.queue.then(fn);this.queue=p.catch(()=>{});return p;}
 async fetch(request){
  const route=new URL(request.url).pathname;
  if(route==='/customer-data'&&request.method==='GET'){
   const query=new URL(request.url).searchParams;
   return this.customerReply(query);
  }
  if(route==='/customer-refresh'&&request.method==='POST'){
   const query=new URL(request.url).searchParams;
   if(customerIDForAccount(query.get('account'))===null)return customerData(null,query.get('account'),query);
   if(this.running){
    await this.ctx.storage.put('live:priorityUntil',Date.now()+120000);
    return this.customerReply(query,{state:'waiting',retryAfterSeconds:5,message:'Waiting for the current API request to finish…'});
   }
   return this.exclusive(()=>this.pullCustomer(query));
  }
  if(route==='/schedule' && request.method==='GET'){
   const c=await this.ctx.storage.get('config')||defaults;
   const status=await this.ctx.storage.get('status')||{}, nextRun=await this.ctx.storage.getAlarm();
   const nextAllowed=Number(await this.ctx.storage.get('nextAllowed')||0);
   return response({success:true,config:{...c,cardNumber:''},status,nextRun,running:!!this.running,
    retryAfterSeconds:Math.max(0,Math.ceil((nextAllowed-Date.now())/1000))});
  }
  if(route==='/sync' && this.running)return response({success:false,code:'sync_in_progress',error:'An API sync is already running.'},409);
  return this.exclusive(async()=>{
   if(route==='/results'){
    return response({success:true,result:await readSnapshot(this.ctx.storage)});
   }
   if(route==='/schedule' && request.method==='POST'){
    let c;try{c=await request.json();}catch{return response({success:false,error:'Invalid settings.'},400);}
    if(typeof c.enabled!=='boolean'|| !Number.isInteger(c.intervalSeconds)||c.intervalSeconds<30||c.intervalSeconds>86400||!Number.isInteger(c.days)||c.days<1||c.days>92||typeof c.cardNumber!=='string'||(c.cardNumber && !/^\d{1,32}$/.test(c.cardNumber)))return response({success:false,error:'Choose an interval from 30 to 86,400 seconds and a history window from 1 to 92 days.'},400);
    c={enabled:c.enabled,intervalSeconds:c.intervalSeconds,days:c.days,cardNumber:''};
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
 async customerSnapshot(account){
  if(customerIDForAccount(account)===null)return null;
  return this.ctx.storage.transaction(async storage=>{
   const shared=await readSnapshot(storage,'customer:')||await readSnapshot(storage);
   const own=await readSnapshot(storage,'account:'+account+':');
   return [shared,own].filter(s=>fullSnapshot(s)&&(!s.customerAccount||s.customerAccount===account))
    .sort((a,b)=>completed(b)-completed(a))[0]||null;
  });
 }
 async customerReply(query,refresh=null){return this.customerLive.reply(query,refresh);}
 async pullCustomer(query){return this.customerLive.pull(query);}
 async alarm(){return this.exclusive(async()=>{
  const c=await this.ctx.storage.get('config')||defaults;
  if(!c.enabled)return;
  const now=Date.now(), next=Number(await this.ctx.storage.get('nextAllowed')||0);
  if(next>now){await this.ctx.storage.setAlarm(next);return;}
  // Give an already-waiting customer one opportunity before a frequent admin
  // schedule starts another pull. The short reservation expires if they leave.
  const priority=Number(await this.ctx.storage.get('live:priorityUntil')||0);
  if(priority>now){await this.ctx.storage.setAlarm(Math.min(priority,now+15000));return;}
  const to=central(new Date(now));
  const from=new Date(Date.parse(to+':00Z')-c.days*86400000).toISOString().slice(0,16);
  await this.pull({from,to,cardNumber:''});
 });}
 async pull(input){
  const now=Date.now(), next=Number(await this.ctx.storage.get('nextAllowed')||0);
  if(next>now){
   const retryAfterSeconds=Math.ceil((next-now)/1000);
   return response({success:false,code:'sync_cooldown',error:'Please wait before the next API sync.',retryAfterSeconds},429,{'Retry-After':String(retryAfterSeconds)});
  }
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
    await this.ctx.storage.transaction(async storage=>{
     // A manual single-card lookup must not replace everybody's customer data.
     if(data.cardNumber && !(await storage.get('customer:chunks'))){
      const previous=await readSnapshot(storage);
      if(previous?.readOnly===true&&!previous.cardNumber)await writeSnapshot(storage,previous,'customer:');
     }
     await writeSnapshot(storage,data);
     if(!data.cardNumber)await writeSnapshot(storage,data,'customer:');
     await storage.put('status',{state:'success',lastAttempt:new Date(now).toISOString(),completedAt:data.completedAt,count:data.count,error:null});
    });
   }else{
    const failures=(old.failures||0)+1;
    delay=Math.max(60000,Math.min(1800000,30000*2**Math.min(failures,6)),Number(r.headers.get('Retry-After')||0)*1000);
    await this.ctx.storage.put('status',{...old,state:'error',lastAttempt:new Date(now).toISOString(),error:data.error||'API sync failed.',failures});
   }
   const retryAfterSeconds=Math.ceil(delay/1000);
   return response({...data,retryAfterSeconds},r.status,r.status===429?{'Retry-After':String(retryAfterSeconds)}:{});
  }catch{
   delay=60000;
   const old=await this.ctx.storage.get('status')||{};
   await this.ctx.storage.put('status',{...old,state:'error',error:'Sync was interrupted. The last successful results were kept.'});
   return response({success:false,error:'Sync was interrupted. The last successful results were kept.',retryAfterSeconds:60},502);
  }finally{
   const c=await this.ctx.storage.get('config')||defaults;
   const due=Date.now()+Math.max(c.intervalSeconds*1000,delay);
   await this.ctx.storage.put('nextAllowed',Date.now()+delay);
   if(c.enabled)await this.ctx.storage.setAlarm(due);else await this.ctx.storage.deleteAlarm();
   this.running=null;
  }
 }
}
