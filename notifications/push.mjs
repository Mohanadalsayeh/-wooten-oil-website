/* Ver662 — device opt-in, durable event feed, current permission checks and delivery. */
import {configuration,subscription,digest,send} from './web-push.mjs';
const json=(v,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store, private'}});
const choices={customer:{payments:'Payments',documents:'Statements and documents',requests:'Fuel and profile request updates',messages:'Other portal messages'},admin:{requests:'Fuel and profile requests',applications:'Account applications',payments:'Online payments',fleet:'Fleet sync failures',mas90:'MAS 90 sync failures'}};
const permissions={requests:'customer_requests',applications:'applications',payments:'payment_transactions',fleet:'fleet_cards',mas90:'mas90_health'};
export function categories(role,actor){return Object.entries(choices[role]||{}).filter(([k])=>role==='customer'||actor?.owner===true||actor?.permissions?.includes(permissions[k])).map(([id,label])=>({id,label}));}
const sameOrigin=r=>r.headers.get('Origin')===new URL(r.url).origin&&/^application\/json(?:;|$)/i.test(r.headers.get('Content-Type')||'');
const random=()=>crypto.randomUUID()+crypto.randomUUID();
const ready=new WeakMap();
export async function ensure(env,force=false){
 const db=env.DB;if(!db)throw Error('Database unavailable.');
 if(!force&&ready.has(db))return ready.get(db);
 const task=(async()=>{
  await db.batch([
   db.prepare(`CREATE TABLE IF NOT EXISTS web_push_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT UNIQUE NOT NULL,role TEXT NOT NULL,account TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,source TEXT NOT NULL,source_id TEXT NOT NULL,created_ms INTEGER NOT NULL DEFAULT (unixepoch()*1000))`),
   db.prepare(`CREATE INDEX IF NOT EXISTS web_push_events_recipient ON web_push_events(role,account,id)`),
   db.prepare(`CREATE TABLE IF NOT EXISTS web_push_devices(id TEXT PRIMARY KEY,role TEXT NOT NULL,principal TEXT NOT NULL,account TEXT NOT NULL,endpoint_hash TEXT NOT NULL UNIQUE,subscription TEXT NOT NULL,public_key TEXT NOT NULL,revoke_hash TEXT NOT NULL,categories TEXT NOT NULL,cursor INTEGER NOT NULL,created_ms INTEGER NOT NULL,last_scan INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER,last_sent INTEGER,last_error TEXT NOT NULL DEFAULT '',test_at INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1)`),
   db.prepare(`CREATE INDEX IF NOT EXISTS web_push_devices_due ON web_push_devices(enabled,retry_at,last_scan)`),
   db.prepare(`CREATE TABLE IF NOT EXISTS web_push_health(id INTEGER PRIMARY KEY CHECK(id=1),last_run INTEGER NOT NULL DEFAULT 0)`),
   db.prepare(`INSERT OR IGNORE INTO web_push_health(id) VALUES(1)`)
  ]);
  const tables=new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(x=>x.name));
  const triggers=[];
  const add=(name,table,operation,condition,values)=>{if(tables.has(table))triggers.push(db.prepare(`CREATE TRIGGER IF NOT EXISTS ${name} AFTER ${operation} ON ${table} ${condition?'WHEN '+condition:''} BEGIN INSERT OR IGNORE INTO web_push_events(event_key,role,account,category,source,source_id) VALUES(${values}); END`));};
  add('web_push_customer_v662','portal_notifications','INSERT','',`'notice:'||NEW.id,'customer',NEW.account_number,CASE WHEN NEW.action_type IN ('payment','sandbox_payment','payment_status','online_payment') OR lower(NEW.title) LIKE '%payment%' THEN 'payments' WHEN NEW.action_type='customer_documents' OR lower(NEW.title) LIKE '%statement%' OR lower(NEW.title) LIKE '%invoice%' THEN 'documents' WHEN NEW.action_type IN ('request_status','fuel_request','profile_change') THEN 'requests' ELSE 'messages' END,'notice',NEW.id`);
  for(const [table,source,id,category] of [['fuel_requests','fuel','rowid','requests'],['profile_change_requests','profile','id','requests'],['account_applications','application','id','applications']])add('web_push_'+source+'_v662',table,'INSERT','',`'${source}:'||NEW.${id},'admin','','${category}','${source}',NEW.${id}`);
  for(const [table,source] of [['payment_notification_events','payment'],['sandbox_payment_notifications','sandbox_payment']]){
   const values=`'${source}:'||NEW.id,'admin','','payments','${source}',NEW.id`;
   add('web_push_'+source+'_insert_v662',table,'INSERT','NEW.activated=1',values);
   add('web_push_'+source+'_activate_v662',table,'UPDATE OF activated','NEW.activated=1 AND OLD.activated<>1',values);
  }
  add('web_push_cards_failed_v662','intevacon_card_control','UPDATE OF state',"NEW.state='failed' AND OLD.state<>'failed' AND NEW.failures=1",`'cards-failure:'||NEW.last_attempt,'admin','','fleet','cards_sync',NEW.last_attempt`);
  add('web_push_mas90_failed_v662','mas90_automation_runs','UPDATE OF status',"NEW.status IN ('failed','interrupted','missed') AND OLD.status NOT IN ('failed','interrupted','missed')",`'mas90:'||NEW.run_id,'admin','','mas90','mas90_sync',NEW.run_id`);
  add('web_push_mas90_insert_v662','mas90_automation_runs','INSERT',"NEW.status IN ('failed','interrupted','missed')",`'mas90:'||NEW.run_id,'admin','','mas90','mas90_sync',NEW.run_id`);
  if(triggers.length)await db.batch(triggers);
 })();ready.set(db,task);try{await task;}catch(e){ready.delete(db);throw e;}
}
export async function recordFleetFailure(env,eventKey){
 if(!configuration(env)||!env.DB)return;
 try{await ensure(env);await env.DB.prepare(`INSERT OR IGNORE INTO web_push_events(event_key,role,category,source,source_id) VALUES(?,'admin','fleet','api_sync',?)`).bind('api:'+eventKey,eventKey).run();}catch{console.error('Push fleet event could not be recorded.');}
}
async function body(request){const text=await request.text();if(text.length>10000)throw Error('Request too large.');return JSON.parse(text);}
export async function revoke({request,env}){
 if(request.method!=='POST'||!sameOrigin(request))return json({success:false,error:'Invalid request.'},403);
 try{const b=await body(request);if(typeof b.token!=='string'||b.token.length!==72)return json({success:false},400);await ensure(env);await env.DB.prepare('DELETE FROM web_push_devices WHERE id=? AND revoke_hash=?').bind(String(b.id||''),await digest(b.token)).run();return json({success:true});}catch{return json({success:false,error:'Notification settings could not be updated.'},400);}
}
export async function handle({request,env,role,actor,transport=send}){
 if(!actor)return json({success:false,error:'Please sign in to manage notifications.'},401);
 const available=categories(role,actor),principal=String(actor.pushId),account=role==='customer'?String(actor.account_number):'';
 const route=new URL(request.url).pathname.split('/').pop();
 if(!['status','subscribe','test'].includes(route))return json({success:false},404);
 try{
  await ensure(env);const db=env.DB,cfg=configuration(env);
  if(route==='status'&&request.method==='GET'){
   const id=new URL(request.url).searchParams.get('device')||'';
   const saved=await db.prepare('SELECT id,categories,enabled,public_key,last_error,last_sent FROM web_push_devices WHERE id=? AND role=? AND principal=? AND account=?').bind(id,role,principal,account).first();
   const health=await db.prepare('SELECT last_run FROM web_push_health WHERE id=1').first();
   return json({success:true,configured:!!cfg,publicKey:cfg?.publicKey||null,principal:await digest(role+':'+principal+':'+account),categories:available,device:saved?{id:saved.id,categories:JSON.parse(saved.categories),enabled:!!saved.enabled&&saved.public_key===cfg?.publicKey,last_error:saved.last_error,last_sent:saved.last_sent}:null,last_dispatch:health?.last_run||null});
  }
  if(request.method!=='POST')return json({success:false},405);
  if(!sameOrigin(request))return json({success:false,error:'Use the portal to change notification settings.'},403);
  if(!cfg)return json({success:false,error:'Device notifications are awaiting portal setup.'},503);
  const b=await body(request);
  if(route==='test'){
   const row=await db.prepare('UPDATE web_push_devices SET test_at=? WHERE id=? AND role=? AND principal=? AND account=? AND enabled=1 AND test_at<? RETURNING *').bind(Date.now(),String(b.id||''),role,principal,account,Date.now()-60000).first();
   if(!row)return json({success:false,error:'Enable notifications first, or wait one minute before another test.'},429);
   const result=await transport(env,JSON.parse(row.subscription),{title:'Wooten Oil',body:'Test notification. Your notification bell is still available in the portal.',tag:'wooten-test-'+row.id,role,device:row.id,target:'notifications'});
   if(result.status<200||result.status>=300){if([404,410].includes(result.status))await db.prepare('DELETE FROM web_push_devices WHERE id=?').bind(row.id).run();return json({success:false,error:'The notification provider could not accept the test. Disable and enable notifications, then try again.'},502);}
   return json({success:true,message:'Test accepted by your notification provider. Check your device notifications.'});
  }
  const sub=subscription(b.subscription),allowed=new Set(available.map(x=>x.id));
  const selected=[...new Set(Array.isArray(b.categories)?b.categories:[])];
  if(!selected.length||selected.some(v=>!allowed.has(v)))return json({success:false,error:'Choose at least one available alert type.'},400);
  const hash=await digest(sub.endpoint),existing=await db.prepare('SELECT * FROM web_push_devices WHERE endpoint_hash=?').bind(hash).first();
  if(existing&&(existing.role!==role||existing.principal!==principal||existing.account!==account))return json({success:false,error:'Disable notifications for the previous account on this device before enabling this account.'},409);
  const count=await db.prepare('SELECT COUNT(*) n FROM web_push_devices WHERE role=? AND principal=? AND enabled=1').bind(role,principal).first();
  if(!existing&&count.n>=10)return json({success:false,error:'This account already has notifications on 10 devices. Disable an unused device first.'},409);
  const token=random(),id=existing?.id||crypto.randomUUID(),now=Date.now();
  const high=Number((await db.prepare('SELECT COALESCE(MAX(id),0) n FROM web_push_events').first()).n);
  await db.prepare(`INSERT INTO web_push_devices(id,role,principal,account,endpoint_hash,subscription,public_key,revoke_hash,categories,cursor,created_ms,last_scan) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET subscription=excluded.subscription,public_key=excluded.public_key,revoke_hash=excluded.revoke_hash,categories=excluded.categories,cursor=excluded.cursor,enabled=1,retry_at=0,failures=0,last_error='',lease=NULL,lease_until=NULL`).bind(id,role,principal,account,hash,JSON.stringify(sub),cfg.publicKey,await digest(token),JSON.stringify(selected),high,now,now).run();
  return json({success:true,id,revoke_token:token,principal:await digest(role+':'+principal+':'+account),message:'Notifications enabled on this device.'});
 }catch{return json({success:false,error:'Notification settings could not be saved. Please try again.'},400);}
}
const titles={requests:'Request update',applications:'New account application',payments:'Payment update',documents:'New statement or document',messages:'New portal message',fleet:'Fleet sync needs attention',mas90:'MAS 90 sync needs attention'};
export async function pump(env,resolveRecipient,transport=send){
 if(!configuration(env)||!env.DB)return;
 await ensure(env,true);const db=env.DB,start=Date.now(),cfg=configuration(env);
 await db.prepare('UPDATE web_push_health SET last_run=? WHERE id=1').bind(start).run();
 const rows=(await db.prepare('SELECT d.id FROM web_push_devices d WHERE d.enabled=1 AND d.retry_at<=? AND (d.lease_until IS NULL OR d.lease_until<?) AND EXISTS (SELECT 1 FROM web_push_events e WHERE e.role=d.role AND e.account=d.account AND e.id>d.cursor) ORDER BY d.last_scan LIMIT 100').bind(start,start).all()).results;
 // Five at a time keeps each scheduled invocation bounded and respects provider latency.
 for(let i=0;i<rows.length&&Date.now()-start<45000;i+=5)await Promise.all(rows.slice(i,i+5).map(async item=>{
  const lease=crypto.randomUUID(),now=Date.now();
  const sub=await db.prepare('UPDATE web_push_devices SET lease=?,lease_until=?,last_scan=? WHERE id=? AND enabled=1 AND (lease_until IS NULL OR lease_until<?) RETURNING *').bind(lease,now+60000,now,item.id,now).first();if(!sub)return;
  try{
   const actor=await resolveRecipient(sub);
   if(!actor||sub.public_key!==cfg.publicKey){await db.prepare("UPDATE web_push_devices SET enabled=0,last_error='Sign in and enable notifications again.' WHERE id=? AND lease=?").bind(sub.id,lease).run();return;}
   const selected=new Set(JSON.parse(sub.categories)),allowed=new Set(categories(sub.role,actor).map(x=>x.id));
   const events=(await db.prepare(`SELECT * FROM web_push_events WHERE id>? AND role=? AND account=? ORDER BY id LIMIT 100`).bind(sub.cursor,sub.role,sub.account).all()).results;
   if(!events.length)return;
   const matches=events.filter(e=>selected.has(e.category)&&allowed.has(e.category)&&e.created_ms>=now-86400000);
   const cursor=events[events.length-1].id;
   if(matches.length){
    const latest=matches[matches.length-1],target=['fleet','mas90'].includes(latest.category)?latest.category:'notifications';
    const payload={title:'Wooten Oil — '+(matches.length>1?'New updates':titles[latest.category]),body:matches.length>1?matches.length+' new updates are available. Open the portal to review.':'Open the portal to review this update.',tag:'wooten-'+sub.id+'-'+cursor,role:sub.role,device:sub.id,target};
    const check=await db.prepare('SELECT id FROM web_push_devices WHERE id=? AND lease=? AND enabled=1').bind(sub.id,lease).first();if(!check)return;
    const result=await transport(env,JSON.parse(sub.subscription),payload);
    if([404,410].includes(result.status)){await db.prepare('DELETE FROM web_push_devices WHERE id=? AND lease=?').bind(sub.id,lease).run();return;}
    if(result.status<200||result.status>=300){const error=Error('Provider rejected delivery.');error.status=result.status;error.retryAfter=result.retryAfter;throw error;}
   }
   await db.prepare("UPDATE web_push_devices SET cursor=?,failures=0,retry_at=0,last_error='',last_sent=CASE WHEN ? THEN ? ELSE last_sent END WHERE id=? AND lease=?").bind(cursor,matches.length?1:0,now,sub.id,lease).run();
  }catch(error){
   const permanent=[400,401,403,413].includes(error.status),delay=Math.max(Number(error.retryAfter||0)*1000,Math.min(3600000,60000*2**Math.min(sub.failures,6)));
   await db.prepare('UPDATE web_push_devices SET failures=failures+1,retry_at=?,last_error=?,enabled=? WHERE id=? AND lease=?').bind(now+delay,permanent?'Push setup or subscription needs attention.':'Delivery delayed; it will retry automatically.',permanent?0:1,sub.id,lease).run();
  }finally{await db.prepare('UPDATE web_push_devices SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(sub.id,lease).run();}
 }));
 await db.prepare('DELETE FROM web_push_events WHERE created_ms<?').bind(start-7*86400000).run();
 await db.prepare('DELETE FROM web_push_devices WHERE enabled=0 AND last_scan<?').bind(start-30*86400000).run();
}
