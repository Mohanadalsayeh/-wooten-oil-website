// Ver658: one fresh, bounded request per customer view. No archive scans or history backfill.
import {handle as retrieve,parametersFor} from './intevacon-api-test.mjs';
import {customerData,customerIDForAccount,matchesAccount,validLiveView} from './intevacon-customer-api.mjs';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
const TTL=30*60*1000;
const listKey=account=>'live:views:'+account;
const prefix=(account,view)=>'live:result:'+account+':'+view+':';
async function readResult(storage,key){
 const count=await storage.get(key+'chunks')||0;let text='';
 if(!count)return null;
 for(let i=0;i<count;i++)text+=await storage.get(key+i);
 return JSON.parse(text);
}
async function deleteResult(storage,key){
 const count=await storage.get(key+'chunks')||0;
 for(let i=0;i<count;i++)await storage.delete(key+i);
 await storage.delete(key+'chunks');
}
async function writeResult(storage,key,data){
 await deleteResult(storage,key);
 const text=JSON.stringify(data);let count=0;
 for(let i=0;i<text.length;i+=24000)await storage.put(key+count++,text.slice(i,i+24000));
 await storage.put(key+'chunks',count);
}
const orgFromRows=(rows,account)=>{
 const matching=rows.filter(r=>matchesAccount(r.CustomerID,account));
 const ids=new Set(matching.map(r=>r.CardHolderOrgID));
 const id=[...ids][0];return ids.size===1&&Number.isSafeInteger(id)&&id>0?id:null;
};
export class FreshCustomerFleet{
 constructor(scheduler){this.scheduler=scheduler;this.storage=scheduler.ctx.storage;this.env=scheduler.env;}
 async view(account,view){
  if(!validLiveView(view))return null;
  const list=await this.storage.get(listKey(account))||[];
  return list.find(v=>v.view===view&&v.expiresAt>Date.now())||null;
 }
 async prepare(account,input){
  const previous=await this.view(account,input.view);
  if(previous){
   if(previous.from!==input.from||previous.to!==input.to)throw Error('The date range changed. Click Refresh again.');
   return previous;
  }
  const job={...input,state:'pending',expiresAt:Date.now()+TTL};
  await this.storage.transaction(async storage=>{
   const old=await storage.get(listKey(account))||[];
   const keep=old.filter(v=>v.expiresAt>Date.now()&&v.view!==input.view).slice(-2);
   for(const v of old)if(!keep.includes(v))await deleteResult(storage,prefix(account,v.view));
   await storage.put(listKey(account),[...keep,job]);
  });
  return job;
 }
 async update(account,job,result){
  await this.storage.transaction(async storage=>{
   if(result)await writeResult(storage,prefix(account,job.view),result);
   const list=await storage.get(listKey(account))||[];
   await storage.put(listKey(account),list.map(v=>v.view===job.view?job:v));
  });
 }
 async organization(account){
  const existing=await this.storage.get('live:org:'+account);
  if(existing)return existing.id; // Null explicitly requests fresh discovery after an ambiguous/stale mapping.
  let id=null;
  // An optional indexed lookup supplies only the numeric identity mapping, never display records.
  // Missing DB/history is harmless: the first fresh issuer response resolves CustomerID instead.
  try{
   if(this.env.DB){
    const result=await this.env.DB.prepare("SELECT DISTINCT json_extract(row_json,'$.CardHolderOrgID') AS id FROM intevacon_api_history_v1 WHERE customer_id=? LIMIT 2").bind(customerIDForAccount(account)).all();
    if(result.results.length===1&&Number.isSafeInteger(result.results[0].id)&&result.results[0].id>0)id=result.results[0].id;
   }
  }catch{}
  if(id===null){
   const snapshot=await this.scheduler.customerSnapshot(account);
   if(snapshot)id=orgFromRows(snapshot.rows,account);
  }
  await this.storage.put('live:org:'+account,{id});
  return id;
 }
 async reply(query,refresh=null){
  const account=query.get('account'),view=query.get('view');
  if(customerIDForAccount(account)===null)return customerData(null,account,query);
  const {job,snapshot}=await this.storage.transaction(async storage=>{
   const list=await storage.get(listKey(account))||[];
   const job=list.find(v=>v.view===view&&v.expiresAt>Date.now())||null;
   return {job,snapshot:job?.state==='success'?await readResult(storage,prefix(account,view)):null};
  });
  const r=customerData(snapshot,account,query),data=await r.json();
  if(!refresh&&job?.state==='pending')refresh={state:'waiting',retryAfterSeconds:Math.max(5,Math.ceil((Number(await this.storage.get('nextAllowed')||0)-Date.now())/1000)),message:'Waiting to request fresh transactions from Intevacon…'};
  if(!refresh&&job?.state==='error')refresh={state:'error',message:job.error};
  if(!refresh&&!job)refresh={state:'expired',message:'Click Refresh to get fresh transactions from Intevacon.'};
  return response({...data,history:undefined,live:{view,from:job?.from||null,to:job?.to||null,state:job?.state||'not_loaded',fetchedAt:snapshot?.completedAt||null},
   notice:'Cards shown had transactions in these dates. Cards without transactions and activation status are not supplied by this API.',...(refresh?{refresh}:{})});
 }
 async pull(query){
  const account=query.get('account');
  if(customerIDForAccount(account)===null)return customerData(null,account,query);
  const input={from:query.get('from'),to:query.get('to'),view:query.get('view')};
  if(!validLiveView(input.view))return response({success:false,error:'Reload the customer portal and try Refresh.'},400);
  try{parametersFor({from:input.from,to:input.to,cardNumber:''});}catch{return response({success:false,error:'Choose valid dates covering up to 92 days.'},400);}
  let job;try{job=await this.prepare(account,input);}catch{return response({success:false,error:'The date range changed. Click Refresh again.'},400);}
  // Retried HTTP requests resume this one view. An explicit Refresh always creates a new view ID.
  if(job.state==='success')return this.reply(query,{state:'success',message:'Fresh Intevacon results loaded for the selected dates.'});
  const now=Date.now(),next=Number(await this.storage.get('nextAllowed')||0);
  if(next>now){
   await this.storage.put('live:priorityUntil',next+15000);
   return this.reply(query,{state:'waiting',retryAfterSeconds:Math.ceil((next-now)/1000),message:'Waiting for the API before requesting fresh transactions…'});
  }
  this.scheduler.running='customer';let delay=30000;
  try{
   await this.storage.delete('live:priorityUntil');
   await this.storage.put('nextAllowed',now+90000);
   const cardHolderOrgID=await this.organization(account);
   const r=await retrieve({request:new Request('https://scheduler/api',{method:'POST',headers:{Origin:'https://scheduler','Content-Type':'application/json'},body:JSON.stringify({from:input.from,to:input.to,cardNumber:''})}),env:this.env,actor:{owner:true},cardHolderOrgID});
   const data=await r.json();
   if(!r.ok||!data.success){
    delay=Math.max(60000,Number(r.headers.get('Retry-After')||0)*1000);
    if(r.status===429)return this.reply(query,{state:'waiting',retryAfterSeconds:Math.ceil(delay/1000),message:'Intevacon is busy. Your fresh request will retry shortly.'});
    const error=r.status===413?'There are too many transactions in these dates. Choose a shorter period and click Load dates.':'Intevacon could not return fresh transactions. Click Refresh to try again.';
    await this.update(account,{...job,state:'error',error});
    return this.reply(query,{state:'error',message:error});
   }
   const rows=data.rows.filter(row=>matchesAccount(row.CustomerID,account));
   if(cardHolderOrgID!==null&&rows.length!==data.rows.length){
    await this.storage.put('live:org:'+account,{id:null});
    return this.reply(query,{state:'waiting',retryAfterSeconds:30,message:'Rechecking your customer match with Intevacon…'});
   }
   const id=orgFromRows(rows,account);
   if(id!==null)await this.storage.put('live:org:'+account,{id});
   const fresh={...data,rows,count:rows.length,customerAccount:account};
   await this.update(account,{...job,state:'success',expiresAt:Date.now()+TTL},fresh);
   return this.reply(query,{state:'success',message:'Fresh Intevacon results loaded for the selected dates.'});
  }catch{
   delay=60000;
   const error='Fresh transactions could not be loaded. Click Refresh to try again.';
   await this.update(account,{...job,state:'error',error});
   return this.reply(query,{state:'error',message:error});
  }finally{
   try{await this.storage.put('nextAllowed',Date.now()+delay);}finally{this.scheduler.running=null;}
  }
 }
}
