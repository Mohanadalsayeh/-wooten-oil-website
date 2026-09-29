// Ver692: resumable 92-day history, short rolling updates, and independent nightly refresh.
import {handle as retrieve,parametersFor} from './intevacon-api-test.mjs';
import {saveHistory,coverage,queryHistory} from './intevacon-history.mjs';
const DAY=86400000;
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private'}});
export const defaults={enabled:false,intervalSeconds:300,days:2,cardNumber:'',nightlyEnabled:true,nightlyTime:'02:00'};
const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function central(date){const p=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
const wall=s=>Date.parse(s+':00Z'),date=n=>new Date(n).toISOString().slice(0,16);
export function nextNight(now,time){
 const here=central(new Date(now));let target=here.slice(0,10);if(here.slice(11)>=time)target=date(wall(target+'T00:00')+DAY).slice(0,10);
 // Minute scan handles Central DST gaps and repeated hours without a fixed UTC offset.
 for(let t=Math.floor(now/60000)*60000+60000;t<=now+48*3600000;t+=60000){const d=central(new Date(t));if(d.slice(0,10)>=target&&d.slice(11)>=time)return t;}
 throw Error('Could not calculate the next nightly refresh.');
}
export function validateConfig(c){if(typeof c.enabled!=='boolean'||!Number.isInteger(c.intervalSeconds)||c.intervalSeconds<30||c.intervalSeconds>86400||![1,2].includes(c.days)||typeof c.nightlyEnabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.nightlyTime))throw Error('Choose 24 or 48 hours, an interval of 30–86,400 seconds, and a valid Central nightly time.');return {...defaults,...c,cardNumber:''};}
export function newJob(type,from,to){return {type,from,to,cursor:from,pending:[],count:0,failures:0,startedAt:new Date().toISOString()};}
export function rangeFor(job){return job.pending[0]||{from:job.cursor,to:date(Math.min(wall(job.to),wall(job.cursor)+7*DAY))};}
async function readSnapshot(storage){const n=await storage.get('chunks')||0;if(!n)return null;let value='';for(let i=0;i<n;i++)value+=await storage.get('result:'+i);return JSON.parse(value);}
async function writeSnapshot(storage,data){const text=JSON.stringify(data),old=await storage.get('chunks')||0,n=Math.ceil(text.length/24000);for(let i=0;i<n;i++)await storage.put('result:'+i,text.slice(i*24000,(i+1)*24000));for(let i=n;i<old;i++)await storage.delete('result:'+i);await storage.put('chunks',n);}
export async function handle({request,env,actor}){
 if(!actor||!(actor.owner===true||actor.permissions?.includes('fleet_cards')))return response({success:false,error:'Fleet administrator access is required.'},403);
 if(!env.INTEVACON_SCHEDULER)return response({success:false,error:'The Intevacon scheduler binding is missing.'},503);
 const url=new URL(request.url),route=url.pathname.split('/').pop();
 const methods={schedule:['GET','POST'],results:['GET'],sync:['POST'],initialize:['POST'],history:['GET']};
 if(!methods[route]?.includes(request.method))return response({success:false},405);
 if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin||!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||'')))return response({success:false,error:'Use the admin page.'},403);
 if(route==='history'){try{return response(await queryHistory(env.DB,url.searchParams,{admin:true}));}catch(e){return response({success:false,error:e.message},400);}}
 let body;if(request.method==='POST'){body=await request.text();if(body.length>2048)return response({success:false,error:'Request too large.'},413);}
 return env.INTEVACON_SCHEDULER.get(env.INTEVACON_SCHEDULER.idFromName('wooten-api-sync')).fetch(new Request('https://scheduler/'+route,{method:request.method,headers:{'Content-Type':'application/json'},body}));
}
export class IntevaconApiScheduler{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.running=false;this.queue=Promise.resolve();}
 exclusive(fn){const p=this.queue.then(fn);this.queue=p.catch(()=>{});return p;}
 async config(){return await this.ctx.storage.get('historyConfig')||{...defaults};}
 async state(){return await this.ctx.storage.get('historyState')||{initialized:false,job:null,nightlyJob:null,nextRecent:null,nextNight:null,lastSuccess:null,lastNight:null,error:null};}
 async fetch(request){
  const route=new URL(request.url).pathname;
  if(route==='/schedule'&&request.method==='GET'){
   const c=await this.config(),s=await this.state(),status=await this.ctx.storage.get('status')||{},j=s.job||s.nightlyJob;
   const percent=j?Math.min(99,Math.floor((wall(j.cursor)-wall(j.from))/(wall(j.to)-wall(j.from))*100)):s.initialized?100:0;
   return response({success:true,config:c,status:{...status,completedAt:s.lastSuccess||status.completedAt},nextRun:await this.ctx.storage.getAlarm(),running:this.running,retryAfterSeconds:Math.max(0,Math.ceil(((await this.ctx.storage.get('nextAllowed')||0)-Date.now())/1000)),history:{...s,job:j?{type:j.type,from:j.from,to:j.to,through:j.cursor,count:j.count}:null,nightlyJob:undefined,percent}});
  }
  if(route==='/sync'&&this.running)return response({success:false,code:'sync_in_progress',error:'An API pull is already running.'},409);
  return this.exclusive(async()=>{
   const storage=this.ctx.storage;
   if(route==='/results')return response({success:true,result:await readSnapshot(storage)});
   if(route==='/schedule'&&request.method==='POST'){
    let c;try{c=validateConfig(await request.json());}catch(e){return response({success:false,error:e.message},400);}
    const s=await this.state();s.nextNight=c.nightlyEnabled?nextNight(Date.now(),c.nightlyTime):null;if(c.enabled&&!s.nextRecent)s.nextRecent=Date.now();
    await storage.put('historyConfig',c);await storage.put('historyState',s);await this.schedule(c,s);return response({success:true,config:c});
   }
   if(route==='/initialize'&&request.method==='POST'){
    const c=await this.config(),s=await this.state();c.enabled=true;
    if(!s.job){const to=central(new Date());s.job=newJob('initial',date(wall(to)-92*DAY),to);}
    s.error=null;s.retryAt=null;if(!s.nextNight)s.nextNight=nextNight(Date.now(),c.nightlyTime);
    await storage.put('historyConfig',c);await storage.put('historyState',s);await this.schedule(c,s);return response({success:true,message:'History retrieval queued. You can close this page.'},202);
   }
   if(route==='/sync'&&request.method==='POST'){
    let input;try{input=await request.json();parametersFor(input);}catch(e){return response({success:false,error:e.message},400);}
    return this.manual(input);
   }
   return response({success:false},404);
  });
 }
 async schedule(c,s){
  if(!c.enabled){await this.ctx.storage.deleteAlarm();return;}
  const now=Date.now(),cool=Number(await this.ctx.storage.get('nextAllowed')||0),times=[];
  if(s.job||s.nightlyJob)times.push(now+1000);
  if(s.initialized){times.push(s.nextRecent||now+1000);if(c.nightlyEnabled)times.push(s.nextNight||nextNight(now,c.nightlyTime));}
  if(!times.length){await this.ctx.storage.deleteAlarm();return;}
  await this.ctx.storage.setAlarm(Math.max(now+1000,cool,s.retryAt||0,Math.min(...times)));
 }
 async get(input){
  this.running=true;
  const now=Date.now();await this.ctx.storage.put('nextAllowed',now+90000);await this.ctx.storage.setAlarm(now+120000);
  try{return await retrieve({request:new Request('https://scheduler/api',{method:'POST',headers:{Origin:'https://scheduler','Content-Type':'application/json'},body:JSON.stringify(input)}),env:this.env,actor:{owner:true}});}
  finally{this.running=false;await this.ctx.storage.put('nextAllowed',Date.now()+30000);}
 }
 async manual(input){
  const wait=Number(await this.ctx.storage.get('nextAllowed')||0)-Date.now();if(wait>0)return response({success:false,code:'sync_cooldown',error:'Please wait before the next API sync.',retryAfterSeconds:Math.ceil(wait/1000)},429);
  const c=await this.config(),s=await this.state();
  try{
   const r=await this.get(input),data=await r.json();
   if(!r.ok||!data.success){s.error=data.error||'API pull failed.';s.retryAt=Date.now()+Math.max(60000,Number(r.headers.get('Retry-After')||0)*1000);return response({...data,retryAfterSeconds:60},r.status);}
   await saveHistory(this.env.DB,data.rows,data.completedAt,data.cardNumber?null:{from:data.from,to:data.to});
   await writeSnapshot(this.ctx.storage,data);s.lastSuccess=data.completedAt;s.error=null;
   await this.ctx.storage.put('status',{state:'success',completedAt:data.completedAt,count:data.count});
   return response({...data,retryAfterSeconds:30});
  }catch(e){s.error='Sync did not finish. Saved history was kept.';return response({success:false,error:s.error},502);}
  finally{await this.ctx.storage.put('historyState',s);await this.schedule(c,s);}
 }
 async alarm(){return this.exclusive(async()=>{
  const storage=this.ctx.storage,c=await this.config(),s=await this.state();if(!c.enabled)return;
  const now=Date.now(),wait=Math.max(Number(await storage.get('nextAllowed')||0),s.retryAt||0);if(wait>now){await this.schedule(c,s);return;}
  const to=central(new Date(now));let slot='job';
  if(!s.job&&s.initialized&&now>=(s.nextRecent||0)&&!(s.nightlyJob&&s.lastWork==='recent')){
   const from=date(wall(to)-c.days*DAY),cov=await coverage(this.env.DB),last=cov.spans.at(-1)?.to;
   s.job=newJob('recent',last&&last<from?last:from,to);
  }
  if(!s.job&&s.initialized&&c.nightlyEnabled&&now>=(s.nextNight||Infinity)&&!s.nightlyJob)s.nightlyJob=newJob('nightly',date(wall(to)-92*DAY),to);
  if(!s.job)slot='nightlyJob';
  const job=s[slot];if(!job){await this.schedule(c,s);return;}
  const range=rangeFor(job);await storage.put('historyState',s); // Durable checkpoint before any request.
  try{
   const r=await this.get({...range,cardNumber:''}),data=await r.json();
   if(!r.ok||!data.success){
    if(r.status===413&&wall(range.to)-wall(range.from)>60000){const mid=date(wall(range.from)+Math.floor((wall(range.to)-wall(range.from))/120000)*60000);job.pending=[{from:range.from,to:mid},{from:mid,to:range.to},...job.pending.slice(job.pending.length?1:0)];s.error='Large result split into smaller batches.';s.retryAt=null;}
    else{job.failures++;s.error=data.error||'API pull failed. Saved history was kept.';s.retryAt=Date.now()+Math.max(Number(r.headers.get('Retry-After')||0)*1000,Math.min(1800000,60000*2**Math.min(job.failures-1,5)));}
   }else{
    await saveHistory(this.env.DB,data.rows,data.completedAt,range);
    s.lastWork=job.type;job.cursor=range.to;job.pending=job.pending.slice(job.pending.length?1:0);job.count+=data.count;job.failures=0;s.lastSuccess=data.completedAt;s.error=null;s.retryAt=null;
    await storage.put('status',{state:'success',completedAt:data.completedAt,count:data.count});
    if(job.cursor>=job.to&&!job.pending.length){
     if(job.type==='initial'){s.initialized=true;s.initializedAt=data.completedAt;s.nextRecent=Date.now();}
     if(job.type==='recent')s.nextRecent=Date.now()+c.intervalSeconds*1000;
     if(job.type==='nightly'){s.lastNight=data.completedAt;s.nextNight=nextNight(Date.now(),c.nightlyTime);}
     s[slot]=null;
    }
   }
  }catch{job.failures++;s.error='Retrieval was interrupted. Saved transactions and progress were kept.';s.retryAt=Date.now()+60000;}
  await storage.put('historyState',s);await this.schedule(c,s);
 });}
}
