/* Wooten Oil fleet sync v1. Isolated from MAS 90 and payment processing. */
const DAY = 86400000;
const schemas = [
 `CREATE TABLE IF NOT EXISTS fleet_pull_settings(id INTEGER PRIMARY KEY CHECK(id=1),days INTEGER NOT NULL DEFAULT 30 CHECK(days IN (7,14,21,30)))`,
 `INSERT OR IGNORE INTO fleet_pull_settings(id) VALUES(1)`,
 `CREATE TABLE IF NOT EXISTS fleet_control(id INTEGER PRIMARY KEY CHECK(id=1),hours INTEGER NOT NULL DEFAULT 2,requested_at TEXT,next_due TEXT,lease TEXT,lease_device TEXT,lease_until TEXT,poll_at TEXT)`,
 `INSERT OR IGNORE INTO fleet_control(id) VALUES(1)`,
 `CREATE TABLE IF NOT EXISTS fleet_health(device_id TEXT PRIMARY KEY,state TEXT NOT NULL,started_at TEXT NOT NULL,updated_at TEXT NOT NULL,error TEXT)`,
 `CREATE TABLE IF NOT EXISTS fleet_devices(id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,last_seen TEXT,last_error TEXT)`,
 `CREATE TABLE IF NOT EXISTS fleet_runs(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,state TEXT NOT NULL,started_at TEXT NOT NULL,completed_at TEXT,window_from TEXT NOT NULL,window_to TEXT NOT NULL,cards_expected INTEGER NOT NULL,transactions_expected INTEGER NOT NULL,pages_expected INTEGER NOT NULL,card_scope TEXT NOT NULL,error TEXT)`,
 `CREATE UNIQUE INDEX IF NOT EXISTS fleet_one_upload ON fleet_runs(state) WHERE state='uploading'`,
 `CREATE TABLE IF NOT EXISTS fleet_stage(run_id TEXT NOT NULL,kind TEXT NOT NULL,record_id TEXT NOT NULL,account_number TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(run_id,kind,record_id))`,
 `CREATE TABLE IF NOT EXISTS fleet_cards(record_id TEXT PRIMARY KEY,account_number TEXT NOT NULL,payload TEXT NOT NULL,run_id TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS fleet_cards_account ON fleet_cards(account_number)`,
 `CREATE TABLE IF NOT EXISTS fleet_transactions(record_id TEXT PRIMARY KEY,account_number TEXT NOT NULL,payload TEXT NOT NULL,received_at TEXT NOT NULL,run_id TEXT NOT NULL,hold INTEGER NOT NULL DEFAULT 0)`,
 `CREATE INDEX IF NOT EXISTS fleet_transactions_account_date ON fleet_transactions(account_number,received_at)`,
 `CREATE TABLE IF NOT EXISTS fleet_meta(id INTEGER PRIMARY KEY CHECK(id=1),run_id TEXT NOT NULL)`
];
const ready = new WeakMap();
export async function ensureSchema(db) {
 if (!ready.has(db)) ready.set(db, db.batch(schemas.map(sql=>db.prepare(sql))).catch(e=>{ready.delete(db);throw e;}));
 await ready.get(db);
}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
class Problem extends Error {constructor(message,status=400){super(message);this.status=status;}}
const need=(ok,message,status)=>{if(!ok)throw new Problem(message,status);};
const text=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const id=v=>{need(typeof v==='string'&&/^\d{1,30}$/.test(v),'Identifiers must be digit strings.');return v;};
const stamp=v=>{need(typeof v==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v)),'An explicit time zone is required.');return new Date(v).toISOString();};
const integer=(v,max=200000)=>{need(Number.isInteger(v)&&v>=0&&v<=max,'Invalid record count.');return v;};
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const now=()=>new Date().toISOString();
async function body(request){need(Number(request.headers.get('Content-Length')||0)<=250000,'Upload chunk is too large.',413);const raw=await request.text();need(raw.length<=250000,'Upload chunk is too large.',413);try{return JSON.parse(raw);}catch{throw new Problem('Invalid JSON.');}}
const rows=async stmt=>(await stmt.all()).results||[];
const sameOrigin=request=>{const origin=request.headers.get('Origin');need(!origin||origin===new URL(request.url).origin,'Origin not allowed.',403);};
export function portalAccount(source){return typeof source==='string'&&/^\d{1,20}$/.test(source)?'000'+source:'';}
export function cleanCard(r){
 const source=text(r.customer_id,20);need(!source||/^\d+$/.test(source),'Invalid source Customer ID.');
 return {card_number:id(r.card_number),customer_id:source,cardholder:text(r.cardholder),status:text(r.status,40),card_type:text(r.card_type,50),driver_id:text(r.driver_id,50),driver_no:text(r.driver_no,60),vehicle_id:text(r.vehicle_id,50),vehicle_no:text(r.vehicle_no,60),assigned_to:text(r.assigned_to),last_used_on:text(r.last_used_on,60)};
}
export function cleanTransaction(r,run){
 const received=stamp(r.received_at);
 need(received>=run.window_from&&received<=run.window_to,'Transaction falls outside this run’s collection window.');
 const table=r.source==='transaction_table';
 need(table||r.source===undefined,'Unknown transaction format.');
 if(table){
   need(r.row_complete===true,'Transaction table row was not collected completely.');
   need(r.column_set===undefined||r.column_set==='selected_v1','Unknown transaction column set.');
   const required=r.column_set==='selected_v1'?['local_date_time','entry_method','decline_reason','merchant','auth_ref','cardholder','driver_number','driver_name','vehicle_number','vehicle_description','raw_vehicle_id','odometer','processed_on']:['invoice_number','local_date_time','merchant','merchant_city','status','cardholder'];
   for(const k of required)need(typeof r[k]==='string','A required transaction column is missing: '+k);
   for(const k of ['total_sale','billable_amount'])need(Object.hasOwn(r,k),'A transaction total column is missing.');
 }else{
   // An older installed agent can continue running while the PC update is applied.
   need(r.detail_complete===true,'Transaction details were not collected.');
   need(Array.isArray(r.items)&&r.items.length<=100,'Invalid product lines.');
 }
 return {entry_method:text(r.entry_method),auth_ref:text(r.auth_ref),driver_number:text(r.driver_number),driver_name:text(r.driver_name),vehicle_number:text(r.vehicle_number),vehicle_description:text(r.vehicle_description),raw_vehicle_id:text(r.raw_vehicle_id),transaction_id:id(r.transaction_id),card_number:id(r.card_number),cardholder:text(r.cardholder),received_at:received,local_date_time:text(r.local_date_time,60),merchant:text(r.merchant),merchant_city:text(r.merchant_city),status:text(r.status,40),transaction_type:text(r.transaction_type,40),decline_reason:text(r.decline_reason),driver:text(r.driver),vehicle:text(r.vehicle),odometer:text(r.odometer,30),invoice_number:table?text(r.invoice_number,80):'',processed_on:table?text(r.processed_on,60):'',posted_on:table?text(r.posted_on,60):'',source:table?'transaction_table':'transaction_detail',total_sale:table?money(r.total_sale):null,billable_amount:table?money(r.billable_amount):null,items:table?[]:r.items.map(item=>{
   const quantity=text(item.quantity,30);need(/^-?\d+(?:\.\d+)?$/.test(quantity),'Invalid product quantity.');
   return {product:text(item.product,100),quantity,unit:text(item.unit,20)};
 })};
}
function money(value){
 if(value===null)return null;
 need(typeof value==='string'&&/^-?\d{1,12}\.\d{2}$/.test(value),'Transaction totals must be decimal strings or null.');
 return value;
}
// Customer responses explicitly include Total Sale; Billable Amount is admin-only.
function project(kind,p,admin){
 const fields=kind==='cards'?['card_number','status','card_type','cardholder','assigned_to','driver_no','vehicle_no','last_used_on']:['transaction_id','invoice_number','card_number','cardholder','received_at','local_date_time','processed_on','posted_on','merchant','merchant_city','status','transaction_type','decline_reason','driver','vehicle','odometer','entry_method','auth_ref','driver_number','driver_name','vehicle_number','vehicle_description','raw_vehicle_id'];
 const result=Object.fromEntries(fields.map(k=>[k,typeof p[k]==='string'?p[k]:'']));
 if(kind==='transactions'){
   result.total_sale=p.total_sale==null?null:money(p.total_sale);
   if(admin)result.billable_amount=p.billable_amount==null?null:money(p.billable_amount);
   result.items=(Array.isArray(p.items)?p.items:[]).map(i=>({product:text(i.product,100),quantity:text(i.quantity,30),unit:text(i.unit,20)}));
 }
 return result;
}
async function deviceAuth(request,db){
 const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
 need(/^wf_[a-f0-9]{64}$/.test(token),'Invalid sync credential.',401);
 const d=await db.prepare('SELECT id FROM fleet_devices WHERE token_hash=? AND active=1').bind(await hash(token)).first();
 need(d,'Sync credential is inactive or invalid.',401);return d;
}
async function getRun(db,device,runId){
 need(/^[a-f0-9-]{36}$/.test(runId),'Invalid run ID.');
 const run=await db.prepare('SELECT * FROM fleet_runs WHERE id=? AND device_id=?').bind(runId,device.id).first();
 need(run,'Run not found.',404);return run;
}
const failureReasons = {
 login_required:'Intevacon sign-in expired or could not be completed. Run Login.cmd or check the saved automatic login.',
 browser_navigation:'The browser could not load an Intevacon page. Check the PC internet connection and Intevacon access.',
 browser_failed:'The browser could not start or stopped unexpectedly. Check the sync PC and Status.cmd.',
 export_failed:'The card export could not be read. Intevacon may have changed its page or export format.',
 incomplete_collection:'The collection was incomplete or failed validation. The previous successful data was kept.',
 upload_failed:'The collected data could not be uploaded or confirmed by the portal. Check the sync PC connection and Status.cmd.',
 setup_required:'The sync PC requires configuration or validation. Run Configure.cmd or Validate.cmd.',
 cancelled:'The sync was cancelled before completion was confirmed.',
 collection_failed:'The data pull failed. Check Status.cmd on the sync PC for the diagnostic details.'
};
function healthWrite(db,device,state,error=null){
 const time=now();
 return db.prepare(`INSERT INTO fleet_health(device_id,state,started_at,updated_at,error) VALUES(?,?,?,?,?)
 ON CONFLICT(device_id) DO UPDATE SET state=excluded.state,started_at=CASE WHEN excluded.state='collecting' THEN excluded.started_at ELSE fleet_health.started_at END,updated_at=excluded.updated_at,error=excluded.error`).bind(device.id,state,time,time,error);
}
async function agent(request,db,path){
 const device=await deviceAuth(request,db);
 if(path==='/ping'&&request.method==='GET'){
   const settings=await db.prepare('SELECT days FROM fleet_pull_settings WHERE id=1').first();
   // Keep the legacy window field so an installed v2.0 agent can still connect.
   return json({success:true,version:1,window_days:30,selected_window_days:settings.days,capabilities:['transaction_table_v2','sync_health_v1','window_selection_v1','selected_columns_v1']});
 }
 need(request.method==='POST','Method not allowed.',405);
 const b=await body(request);
 if(path==='/poll'){
   const supportsWindow=b.window_selection_v1===true;
   const settings=await db.prepare('SELECT days FROM fleet_pull_settings WHERE id=1').first();
   if(!supportsWindow&&settings.days!==30){
    await healthWrite(db,device,'failed','The sync PC needs the v2.1 pull-period update before it can collect the selected history. Existing portal data was kept.').run();
    return json({success:true,run:false,update_required:true});
   }
   const time=now(),lease=crypto.randomUUID();
   // Recover work interrupted by a PC shutdown or the task's 110-minute limit.
   await db.prepare("UPDATE fleet_runs SET state='failed',error='Sync PC stopped reporting before completion.' WHERE state='uploading' AND device_id IN (SELECT lease_device FROM fleet_control WHERE lease_until<?)").bind(time).run();
   await db.prepare("UPDATE fleet_health SET state='failed',error='Sync PC stopped before completion. Check Status.cmd on the PC.',updated_at=? WHERE state IN ('collecting','uploading') AND device_id IN (SELECT lease_device FROM fleet_control WHERE lease_until<?)").bind(time,time).run();
   await db.prepare('UPDATE fleet_control SET poll_at=? WHERE id=1').bind(time).run();
   const claimed=await db.prepare(`UPDATE fleet_control SET lease=?,lease_device=?,lease_until=?,requested_at=NULL,next_due=strftime('%Y-%m-%dT%H:%M:%fZ',?, '+' || hours || ' hours')
    WHERE id=1 AND (lease_until IS NULL OR lease_until<?) AND (requested_at IS NOT NULL OR next_due IS NULL OR next_due<=?)
    AND NOT EXISTS(SELECT 1 FROM fleet_runs WHERE state='uploading')
    AND (?=1 OR (SELECT days FROM fleet_pull_settings WHERE id=1)=30)
    RETURNING hours,(SELECT days FROM fleet_pull_settings WHERE id=1) AS window_days`).bind(lease,device.id,new Date(Date.now()+2*3600000).toISOString(),time,time,time,supportsWindow?1:0).first();
   return json({success:true,run:!!claimed,lease:claimed?lease:null,window_days:claimed?claimed.window_days:null});
 }
 if(path==='/finish'){
   await db.prepare('UPDATE fleet_control SET lease=NULL,lease_device=NULL,lease_until=NULL WHERE id=1 AND lease=? AND lease_device=?').bind(text(b.lease,36),device.id).run();
   return json({success:true});
 }
 if(path==='/progress'){
   need(b.state==='collecting','Invalid sync state.');
   await healthWrite(db,device,'collecting').run();return json({success:true});
 }
 if(path==='/failure'){
   const code=Object.hasOwn(failureReasons,b.code)?b.code:'collection_failed';
   const diagnostic=typeof b.diagnostic==='string'&&/^ERR_[A-Z0-9_]{1,70}$/.test(b.diagnostic)?' ('+b.diagnostic+')':'';
   const error=failureReasons[code]+diagnostic;
   await db.batch([
    healthWrite(db,device,'failed',error),
    db.prepare('UPDATE fleet_devices SET last_seen=?,last_error=? WHERE id=?').bind(now(),error,device.id),
    db.prepare("UPDATE fleet_runs SET state='failed',error=? WHERE device_id=? AND state='uploading'").bind(error,device.id)
   ]);return json({success:true});
 }
 if(path==='/begin'){
   const from=stamp(b.window_from),to=stamp(b.window_to),span=Date.parse(to)-Date.parse(from);
   need([7,14,21,30].some(days=>Math.abs(span-days*DAY)<1000),'Choose a collection window of 7, 14, 21 or 30 days.');
   need(Date.parse(to)<=Date.now()+5*60000&&Date.parse(to)>=Date.now()-24*60*60000,'Collection window is stale or in the future.');
   const cards=integer(b.cards_expected),tx=integer(b.transactions_expected),pages=integer(b.pages_expected,10000);
   need(cards>0,'The card export is empty; existing data was kept.');
   need(tx===0||pages>0,'Transaction pages are missing.');
   need(['all','active'].includes(b.card_scope),'Specify the exported card status scope.');
   await db.prepare("UPDATE fleet_runs SET state='failed',error='expired' WHERE state='uploading' AND started_at<?").bind(new Date(Date.now()-12*60*60000).toISOString()).run();
   const runId=crypto.randomUUID();
   try{await db.prepare("INSERT INTO fleet_runs(id,device_id,state,started_at,window_from,window_to,cards_expected,transactions_expected,pages_expected,card_scope) VALUES(?,?,'uploading',?,?,?,?,?,?,?)").bind(runId,device.id,now(),from,to,cards,tx,pages,b.card_scope).run();}
   catch(e){if(/UNIQUE|constraint/i.test(e.message))throw new Problem('Another upload is in progress. Retry later.',409);throw e;}
   await healthWrite(db,device,'uploading').run();
   return json({success:true,run_id:runId});
 }
 const run=await getRun(db,device,text(b.run_id,36));
 if(path==='/commit'&&run.state==='complete')return json({success:true,run_id:run.id,already_complete:true});
 need(run.state==='uploading','This run is not accepting data.',409);
 if(path==='/chunk'){
   need(['cards','transactions'].includes(b.kind),'Unknown collection.');
   need(Array.isArray(b.records)&&b.records.length>0&&b.records.length<=25,'Send between 1 and 25 records.');
   let cards=new Map();
   if(b.kind==='transactions'){
     const count=await db.prepare("SELECT COUNT(*) AS n FROM fleet_stage WHERE run_id=? AND kind='cards'").bind(run.id).first();
     need(count.n===run.cards_expected,'Upload the complete card list before transactions.');
     const numbers=[...new Set(b.records.map(r=>id(r.card_number)))];
     cards=new Map((await rows(db.prepare(`SELECT record_id,payload,account_number FROM fleet_stage WHERE run_id=? AND kind='cards' AND record_id IN (${numbers.map(()=>'?').join(',')})`).bind(run.id,...numbers))).map(r=>[r.record_id,r]));
   }
   const statements=[];
   for(const raw of b.records){
     const record=b.kind==='cards'?cleanCard(raw):cleanTransaction(raw,run);
     const key=b.kind==='cards'?record.card_number:record.transaction_id;
     let account=b.kind==='cards'?portalAccount(record.customer_id):'';
     if(b.kind==='transactions'){
       const c=cards.get(record.card_number),p=c&&JSON.parse(c.payload);
       // Current assignments alone must not send historical transactions to a new holder.
       if(p&&record.cardholder&&p.cardholder&&record.cardholder.toLocaleLowerCase()===p.cardholder.toLocaleLowerCase())account=c.account_number;
     }
     statements.push(db.prepare("INSERT INTO fleet_stage(run_id,kind,record_id,account_number,payload) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM fleet_runs WHERE id=? AND state='uploading') ON CONFLICT(run_id,kind,record_id) DO UPDATE SET account_number=excluded.account_number,payload=excluded.payload").bind(run.id,b.kind,key,account,JSON.stringify(record),run.id));
   }
   await db.batch(statements);return json({success:true,accepted:b.records.length});
 }
 if(path==='/commit'){
   need(b.pages_collected===run.pages_expected&&b.complete===true,'Not all transaction pages were collected.');
   const counts=await rows(db.prepare('SELECT kind,COUNT(*) AS n FROM fleet_stage WHERE run_id=? GROUP BY kind').bind(run.id));
   const totals=Object.fromEntries(counts.map(r=>[r.kind,r.n]));
   need((totals.cards||0)===run.cards_expected&&(totals.transactions||0)===run.transactions_expected,'Record totals do not match. Nothing was published.');
   // D1 batch is transactional: the public tables and success marker change together.
   await db.batch([
    db.prepare("UPDATE fleet_runs SET state='publishing' WHERE id=? AND state='uploading' AND cards_expected=(SELECT COUNT(*) FROM fleet_stage WHERE run_id=? AND kind='cards') AND transactions_expected=(SELECT COUNT(*) FROM fleet_stage WHERE run_id=? AND kind='transactions')").bind(run.id,run.id,run.id),
    db.prepare("DELETE FROM fleet_cards WHERE EXISTS(SELECT 1 FROM fleet_runs WHERE id=? AND state='publishing')").bind(run.id),
    db.prepare("INSERT INTO fleet_cards(record_id,account_number,payload,run_id) SELECT record_id,account_number,payload,run_id FROM fleet_stage WHERE run_id=? AND kind='cards' AND EXISTS(SELECT 1 FROM fleet_runs WHERE id=? AND state='publishing')").bind(run.id,run.id),
    db.prepare("INSERT INTO fleet_transactions(record_id,account_number,payload,received_at,run_id) SELECT record_id,account_number,payload,json_extract(payload,'$.received_at'),run_id FROM fleet_stage WHERE run_id=? AND kind='transactions' AND EXISTS(SELECT 1 FROM fleet_runs WHERE id=? AND state='publishing') ON CONFLICT(record_id) DO UPDATE SET account_number=CASE WHEN fleet_transactions.hold=1 OR (fleet_transactions.account_number<>'' AND fleet_transactions.account_number<>excluded.account_number) THEN '' ELSE excluded.account_number END,hold=CASE WHEN fleet_transactions.hold=1 OR (fleet_transactions.account_number<>'' AND fleet_transactions.account_number<>excluded.account_number) THEN 1 ELSE 0 END,payload=excluded.payload,received_at=excluded.received_at,run_id=excluded.run_id").bind(run.id,run.id),
    db.prepare("INSERT INTO fleet_meta(id,run_id) SELECT 1,? WHERE EXISTS(SELECT 1 FROM fleet_runs WHERE id=? AND state='publishing') ON CONFLICT(id) DO UPDATE SET run_id=excluded.run_id").bind(run.id,run.id),
    db.prepare("UPDATE fleet_runs SET state='complete',completed_at=? WHERE id=? AND state='publishing'").bind(now(),run.id),
    db.prepare('UPDATE fleet_devices SET last_seen=?,last_error=NULL WHERE id=?').bind(now(),device.id),
    db.prepare("DELETE FROM fleet_stage WHERE run_id=? AND EXISTS(SELECT 1 FROM fleet_runs WHERE id=? AND state='complete')").bind(run.id,run.id),
    db.prepare("DELETE FROM fleet_stage WHERE run_id IN(SELECT id FROM fleet_runs WHERE state='failed')"),
    healthWrite(db,device,'complete')
   ]);
   const committed=await getRun(db,device,run.id);
   need(committed.state==='complete','Collection changed before publication; nothing was published.',409);
   return json({success:true,run_id:run.id,cards:run.cards_expected,transactions:run.transactions_expected});
 }
 throw new Problem('Route not found.',404);
}
async function readData(request,db,customer,admin){
 need(request.method==='GET','Method not allowed.',405);
 const q=new URL(request.url).searchParams;
 const kind=q.get('kind')==='transactions'?'transactions':'cards';
 const table=kind==='cards'?'fleet_cards':'fleet_transactions';
 const account=admin?text(q.get('account'),24):customer.account_number;
 const page=Math.max(1,Math.min(100000,parseInt(q.get('page')||'1',10)||1)),size=20;
 const search=text(q.get('search'),100),review=admin&&q.get('review')==='1';
 const run=await db.prepare('SELECT r.* FROM fleet_meta m JOIN fleet_runs r ON r.id=m.run_id WHERE m.id=1').first();
 const where=[],args=[];
 if(!admin||account){where.push('f.account_number=?');args.push(account);}
 if(review)where.push("(f.account_number='' OR c.id IS NULL)");
 if(!admin)where.push("c.id IS NOT NULL AND f.account_number<>''");
 if(kind==='transactions'){
   where.push('f.received_at>=? AND f.received_at<=?');
   args.push(run?.window_from||new Date(Date.now()-30*DAY).toISOString(),run?.window_to||now());
 }
 if(search){
   const fields=['f.record_id',"json_extract(f.payload,'$.cardholder')",'f.account_number'];
   if(kind==='transactions')fields.push(...['invoice_number','card_number','received_at','entry_method','merchant','auth_ref','total_sale','driver_number','driver_name','driver','vehicle_number','vehicle_description','vehicle','processed_on'].map(field=>"json_extract(f.payload,'$."+field+"')"));
   where.push('('+fields.map(f=>f+" LIKE ? ESCAPE '\\'").join(' OR ')+')');
   const s='%'+search.replace(/[\\%_]/g,'\\$&')+'%';args.push(...fields.map(()=>s));
 }
 const join=`FROM ${table} f LEFT JOIN customers c ON c.account_number=f.account_number`;
 const filter=where.length?' WHERE '+where.join(' AND '):'';
 const total=(await db.prepare(`SELECT COUNT(*) AS n ${join}${filter}`).bind(...args).first()).n;
 const list=await rows(db.prepare(`SELECT f.payload,f.account_number,c.id AS customer_id ${join}${filter} ORDER BY ${kind==='cards'?'f.record_id':'f.received_at DESC,f.record_id DESC'} LIMIT ? OFFSET ?`).bind(...args,size,(page-1)*size));
 const items=list.map(r=>{const result=project(kind,JSON.parse(r.payload),admin);if(admin){result.account_number=r.account_number;result.needs_review=!r.account_number||!r.customer_id;}return result;});
 // Customer summaries are scoped in SQL, never filtered in browser JavaScript.
 const summary=await db.prepare(`SELECT COUNT(*) AS cards,SUM(CASE WHEN lower(json_extract(payload,'$.status'))='active' THEN 1 ELSE 0 END) AS active FROM fleet_cards ${!admin?'WHERE account_number=?':account?'WHERE account_number=?':''}`).bind(...(!admin||account?[account]:[])).first();
 return json({success:true,kind,items,total,page,pages:Math.max(1,Math.ceil(total/size)),summary:{cards:summary.cards,active:summary.active||0},last_sync:run?.completed_at||null,window_from:run?.window_from||null,window_to:run?.window_to||null,card_scope:run?.card_scope||null,account_number:!admin?customer.account_number:account});
}
async function administration(request,db,path,actor,audit){
 need(actor&&(actor.owner||actor.permissions?.includes('fleet_cards')),'Fleet access is required.',403);
 if(path==='/data')return readData(request,db,null,true);
 if(path==='/status'&&request.method==='GET'){
   const devices=await rows(db.prepare('SELECT id,name,active,created_at,last_seen,last_error FROM fleet_devices ORDER BY created_at DESC'));
   const runs=await rows(db.prepare('SELECT id,state,started_at,completed_at,cards_expected,transactions_expected,error FROM fleet_runs ORDER BY started_at DESC LIMIT 10'));
   const latest=await db.prepare('SELECT h.* FROM fleet_health h JOIN fleet_devices d ON d.id=h.device_id WHERE d.active=1 ORDER BY h.updated_at DESC LIMIT 1').first();
   const last_success=await db.prepare('SELECT r.completed_at,r.cards_expected,r.transactions_expected FROM fleet_meta m JOIN fleet_runs r ON r.id=m.run_id WHERE m.id=1').first();
   const control=await db.prepare('SELECT hours,requested_at,next_due,lease_until,poll_at,(SELECT days FROM fleet_pull_settings WHERE id=1) AS window_days FROM fleet_control WHERE id=1').first();
   return json({success:true,devices,runs,latest,last_success,control});
 }
 if(path==='/request-sync'||path==='/schedule'){
   need(request.method==='POST','Method not allowed.',405);sameOrigin(request);
   const b=await body(request),time=now();
   if(path==='/schedule'){
    need(Number.isInteger(b.hours)&&b.hours>=2&&b.hours<=24&&b.hours%2===0,'Choose 2 through 24 hours in increments of 2.');
    if(Object.hasOwn(b,'window_days'))need([7,14,21,30].includes(b.window_days),'Choose 30 days, 3 weeks, 2 weeks or 1 week.');
    const updates=[db.prepare('UPDATE fleet_control SET hours=?,next_due=? WHERE id=1').bind(b.hours,new Date(Date.now()+b.hours*3600000).toISOString())];
    if(Object.hasOwn(b,'window_days'))updates.push(db.prepare('UPDATE fleet_pull_settings SET days=? WHERE id=1').bind(b.window_days));
    await db.batch(updates);
    if(audit)await audit('fleet_schedule_changed',String(b.hours)+(Object.hasOwn(b,'window_days')?'h / '+b.window_days+'d':''));
   }else{
    const c=await db.prepare('SELECT * FROM fleet_control WHERE id=1').first();
    need(!c.lease_until||c.lease_until<time,'A sync is already running.',409);
    const h=await db.prepare("SELECT updated_at FROM fleet_health WHERE state IN ('collecting','uploading') ORDER BY updated_at DESC LIMIT 1").first();
    need(!h||Date.parse(h.updated_at)<Date.now()-2*3600000,'A sync is already running.',409);
    const queued=await db.prepare('UPDATE fleet_control SET requested_at=COALESCE(requested_at,?) WHERE id=1 AND (lease_until IS NULL OR lease_until<?) RETURNING id').bind(time,time).first();
    need(queued,'A sync is already running.',409);
    if(audit)await audit('fleet_sync_requested','manual');
   }
   return json({success:true});
 }
 need(actor.owner===true,'Only the main administrator can manage sync credentials.',403);
 need(request.method==='POST','Method not allowed.',405);sameOrigin(request);
 const b=await body(request);
 if(path==='/devices'){
   const token='wf_'+Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
   const deviceId=crypto.randomUUID();
   await db.prepare('INSERT INTO fleet_devices(id,name,token_hash,created_at) VALUES(?,?,?,?)').bind(deviceId,text(b.name,80)||'Intevacon Windows PC',await hash(token),now()).run();
   if(audit)await audit('fleet_device_created',deviceId);
   return json({success:true,id:deviceId,token});
 }
 if(path==='/devices/revoke'){
   const deviceId=text(b.id,36);
   await db.batch([db.prepare('UPDATE fleet_devices SET active=0 WHERE id=?').bind(deviceId),db.prepare("UPDATE fleet_runs SET state='failed',error='credential_revoked' WHERE device_id=? AND state='uploading'").bind(deviceId)]);
   if(audit)await audit('fleet_device_revoked',deviceId);
   return json({success:true});
 }
 throw new Problem('Route not found.',404);
}
export async function handle({request,env,customer=null,actor=null,audit=null}){
 try{
   need(env.DB,'Database is not configured.',503);
   const path=new URL(request.url).pathname;
   // Customer authentication is evaluated by the existing portal session helper.
   if(path.startsWith('/api/customer/fleet'))need(customer,'Please sign in to your Wooten Oil account.',401);
   await ensureSchema(env.DB);
   if(path.startsWith('/api/intevacon-agent/'))return await agent(request,env.DB,path.slice('/api/intevacon-agent'.length));
   if(path.startsWith('/api/admin/fleet/'))return await administration(request,env.DB,path.slice('/api/admin/fleet'.length),actor,audit);
   if(path==='/api/customer/fleet')return await readData(request,env.DB,customer,false);
   throw new Problem('Route not found.',404);
 }catch(e){if(e instanceof Problem)return json({success:false,error:e.message},e.status);console.error('Fleet request failed',e?.name||'Error');return json({success:false,error:'Fleet service could not complete this request. Please retry.'},500);}
}
