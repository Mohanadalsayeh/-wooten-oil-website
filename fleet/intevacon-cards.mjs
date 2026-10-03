// Ver685: bounded export batches for the admin card inventory.
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
const ready=new WeakSet();
const fields=['status','card_type','cardholder','driver_id','driver_no','vehicle_id','vehicle_no','assigned_to','last_used_on'];
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>{let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;};
const iso=n=>n?new Date(n).toISOString():null;
function need(ok,message,status=400){if(!ok)throw Object.assign(new Error(message),{status});}
async function body(request,limit=256000){
 const reader=request.body?.getReader();let size=0,text='';const decoder=new TextDecoder();
 if(reader)while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();throw Object.assign(new Error('Request too large.'),{status:413});}text+=decoder.decode(r.value,{stream:true});}
 let value;try{value=JSON.parse(text||'{}');}catch{need(false,'Invalid request.');}
 need(value&&typeof value==='object'&&!Array.isArray(value),'Invalid request.');return value;
}
async function ensure(db){
 need(db,'Card storage is unavailable.',503);if(ready.has(db))return;
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS intevacon_card_control(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1,interval_seconds INTEGER NOT NULL DEFAULT 7200,credential_hash TEXT,requested INTEGER NOT NULL DEFAULT 0,next_due INTEGER,last_poll INTEGER,lease TEXT,lease_until INTEGER,expected INTEGER,active_run TEXT,last_success INTEGER,last_attempt INTEGER,failures INTEGER NOT NULL DEFAULT 0,needs_attention INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'not_configured',message TEXT NOT NULL DEFAULT '')`),
  db.prepare(`CREATE TABLE IF NOT EXISTS intevacon_website_cards(run_id TEXT NOT NULL,card_number TEXT NOT NULL,account_number TEXT NOT NULL,payload TEXT NOT NULL,created_ms INTEGER NOT NULL,PRIMARY KEY(run_id,card_number))`),
  db.prepare(`CREATE INDEX IF NOT EXISTS intevacon_website_cards_account ON intevacon_website_cards(run_id,account_number,card_number)`),
  db.prepare(`INSERT OR IGNORE INTO intevacon_card_control(id) VALUES(1)`)
 ]);
 const columns=await db.prepare('PRAGMA table_info(intevacon_card_control)').all();
 if(!columns.results.some(c=>c.name==='manual_request_id')){try{await db.prepare('ALTER TABLE intevacon_card_control ADD COLUMN manual_request_id TEXT').run();}catch(e){const check=await db.prepare('PRAGMA table_info(intevacon_card_control)').all();if(!check.results.some(c=>c.name==='manual_request_id'))throw e;}}
 ready.add(db);
}
const control=db=>db.prepare('SELECT * FROM intevacon_card_control WHERE id=1').first();
const run=db=>db.prepare('SELECT active_run,last_success FROM intevacon_card_control WHERE id=1').first();
function normalize(row){
 need(row&&typeof row==='object'&&!Array.isArray(row),'Invalid card record.');
 need(typeof row.card_number==='string'&&/^\d{1,30}$/.test(row.card_number),'Card number must be a text identifier.');
 need(typeof row.customer_id==='string'&&(!row.customer_id||/^\d{1,20}$/.test(row.customer_id)),'Customer ID must be a text identifier.');
 const clean={card_number:row.card_number,customer_id:row.customer_id};
 for(const f of fields){need(row[f]==null||typeof row[f]==='string','Invalid '+f+'.');need((row[f]||'').length<=300,'Card field is too long.');clean[f]=row[f]||'';}
 return clean;
}
async function status(db,actor){
 const c=await control(db);
 const totals=await db.prepare(`SELECT COUNT(*) AS cards,COALESCE(SUM(CASE WHEN account_number='' THEN 1 ELSE 0 END),0) AS unmatched FROM intevacon_website_cards WHERE run_id=?`).bind(c.active_run||'').first();
 return json({success:true,configured:!!c.credential_hash,can_manage_credentials:actor.owner===true,enabled:!!c.enabled,interval_seconds:c.interval_seconds,state:c.state,message:c.message,requested:!!c.requested,running:!!c.lease&&c.lease_until>Date.now(),needs_attention:!!c.needs_attention,next_due:iso(c.next_due),last_poll:iso(c.last_poll),last_success:iso(c.last_success),last_attempt:iso(c.last_attempt),cards:totals.cards,unmatched:totals.unmatched});
}
export async function admin({request,env,actor}){
 try{
  need(actor&&(actor.owner===true||actor.permissions?.includes('fleet_cards')),'Fleet administrator access is required.',403);
  await ensure(env.DB);const db=env.DB,path=new URL(request.url).pathname.split('/').pop();
  if(path==='status'&&request.method==='GET')return status(db,actor);
  if(path==='list'&&request.method==='GET')return await adminCards(db,request);
  need(request.method==='POST','Method not allowed.',405);
  need(request.headers.get('Origin')===new URL(request.url).origin&&/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''),'Use the admin portal.',403);
  const b=await body(request,2048),now=Date.now();
  if(path==='credential'){
   need(actor.owner===true,'Only the portal owner can create the card sync credential.',403);
   const c=await control(db);need(!c.lease||c.lease_until<=now,'Wait for the current card sync to finish.',409);
   const token='wc_'+Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
   await db.prepare(`UPDATE intevacon_card_control SET credential_hash=?,requested=1,next_due=?,needs_attention=0,state='queued',message='Waiting for the card service to check in.' WHERE id=1`).bind(await digest(token),now).run();
   return json({success:true,credential:token});
  }
  if(path==='settings'){
   need(typeof b.enabled==='boolean'&&[7200,14400,21600,43200,86400].includes(b.interval_seconds),'Choose a supported card interval.');
   await db.prepare(`UPDATE intevacon_card_control SET enabled=?,interval_seconds=?,next_due=?,needs_attention=0 WHERE id=1`).bind(b.enabled?1:0,b.interval_seconds,b.enabled?now+b.interval_seconds*1000:null).run();
   return status(db,actor);
  }
  if(path==='cancel'){
   need(typeof b.request_id==='string'&&uuid(b.request_id),'A valid request ID is required.');
   const current=await control(db);
   if(current.manual_request_id!==b.request_id)return json({success:false,error:'This card sync is no longer current.'},409);
   await db.prepare(`UPDATE intevacon_card_control SET requested=0,lease=NULL,lease_until=NULL,expected=NULL,state='cancelled',message='Card sync cancelled. Previous complete cards kept.',next_due=CASE WHEN enabled=1 THEN ?+interval_seconds*1000 ELSE NULL END WHERE id=1 AND manual_request_id=? AND (requested=1 OR lease IS NOT NULL)`).bind(now,b.request_id).run();
   return json({success:true,cancelled:true});
  }
  if(path==='sync'&&b.request_id){
   need(uuid(b.request_id),'A valid request ID is required.');
   const c=await control(db);need(c.credential_hash,'Configure card sync first.',409);
   const queued=await db.prepare(`UPDATE intevacon_card_control SET requested=1,manual_request_id=?,needs_attention=0,state='queued',message='Card sync queued.' WHERE id=1 AND requested=0 AND (lease IS NULL OR lease_until<=?) RETURNING id`).bind(b.request_id,now).first();
   need(queued,'Another card sync is already pending or running.',409);
   return json({success:true,request_id:b.request_id});
  }
  if(path==='sync'){
   const c=await control(db);need(c.credential_hash,'Create and configure the card service credential first.',409);
   if(!c.lease||c.lease_until<=now)await db.prepare(`UPDATE intevacon_card_control SET requested=1,manual_request_id=NULL,needs_attention=0,state='queued',message='Card sync queued. Waiting for the cloud service.' WHERE id=1`).run();
   return status(db,actor);
  }
  return json({success:false,error:'Not found.'},404);
 }catch(e){return json({success:false,error:e.status?e.message:'Card sync settings could not be loaded.'},e.status||503);}
}
async function adminCards(db,request){
 const current=await run(db),snapshot=current.active_run||'',q=new URL(request.url).searchParams;
 const search=(q.get('search')||'').trim().slice(0,200);
 const assignment=['assigned','unassigned'].includes(q.get('assignment'))?q.get('assignment'):'all';
 const expressions={card_number:'card_number',customer_id:"json_extract(payload,'$.customer_id')",assignment:"CASE WHEN account_number='' THEN 'Unassigned' ELSE 'Assigned' END"};
 for(const field of fields)expressions[field]=`COALESCE(json_extract(payload,'$.${field}'),'')`;
 const sort=Object.hasOwn(expressions,q.get('sort'))?q.get('sort'):'card_number',direction=q.get('direction')==='desc'?'DESC':'ASC';
 let where='run_id=?';const args=[snapshot];
 if(assignment!=='all')where+=assignment==='unassigned'?" AND account_number=''":" AND account_number<>''";
 if(search){
  const term='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
  const searchable=['card_number','account_number',expressions.customer_id,...fields.map(f=>expressions[f])];
  where+=' AND ('+searchable.map(column=>`${column} LIKE ? ESCAPE '\\'`).join(' OR ')+')';args.push(...searchable.map(()=>term));
 }
 const summary=await db.prepare(`SELECT COUNT(*) AS cards,COALESCE(SUM(CASE WHEN account_number='' THEN 1 ELSE 0 END),0) AS unassigned FROM intevacon_website_cards WHERE run_id=?`).bind(snapshot).first();
 const {total}=await db.prepare(`SELECT COUNT(*) AS total FROM intevacon_website_cards WHERE ${where}`).bind(...args).first();
 const pageSize=Math.max(1,Math.min(500,Number.parseInt(q.get('page_size'),10)||20));
 const pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.max(1,Math.min(pages,Number.parseInt(q.get('page'),10)||1));
 const column=expressions[sort];
 const order=['card_number','customer_id'].includes(sort)?`LENGTH(LTRIM(${column},'0')) ${direction},LTRIM(${column},'0') ${direction}`:`${column} COLLATE NOCASE ${direction}`;
 const rows=await db.prepare(`SELECT payload FROM intevacon_website_cards WHERE ${where} ORDER BY ${order},card_number ASC LIMIT ? OFFSET ?`).bind(...args,pageSize,(page-1)*pageSize).all();
 return json({success:true,items:rows.results.map(r=>{const card=normalize(JSON.parse(r.payload));return {...card,assignment:card.customer_id?'assigned':'unassigned'};}),total,page,pages,page_size:pageSize,summary:{...summary,assigned:summary.cards-summary.unassigned},snapshot_id:snapshot,last_sync:iso(current.last_success)});
}
export async function agent({request,env}){
 try{
  need(request.method==='POST','Method not allowed.',405);await ensure(env.DB);
  const db=env.DB,c=await control(db),token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  need(/^wc_[a-f0-9]{64}$/.test(token)&&!!c.credential_hash&&same(await digest(token),c.credential_hash),'Invalid card sync credential.',401);
  const b=await body(request),path=new URL(request.url).pathname.split('/').pop(),now=Date.now();
  if(path==='claim'){
   await db.prepare(`UPDATE intevacon_card_control SET last_poll=? WHERE id=1`).bind(now).run();
   // An abandoned run never replaces the last complete card snapshot.
   await db.prepare(`UPDATE intevacon_card_control SET lease=NULL,lease_until=NULL,expected=NULL,state='failed',message='Card collection was interrupted. Previous cards were kept.',failures=failures+1,next_due=CASE WHEN enabled=1 THEN ? ELSE NULL END WHERE id=1 AND lease IS NOT NULL AND lease_until<=?`).bind(now+300000,now).run();
   const lease=crypto.randomUUID();
   const claimed=await db.prepare(`UPDATE intevacon_card_control SET lease=?,lease_until=?,expected=NULL,manual_request_id=CASE WHEN requested=1 THEN manual_request_id ELSE NULL END,requested=0,state='collecting',message='Opening Intevacon and collecting cards only.',last_attempt=? WHERE id=1 AND lease IS NULL AND credential_hash=? AND (requested=1 OR (enabled=1 AND needs_attention=0 AND next_due<=?)) RETURNING lease`).bind(lease,now+15*60000,now,c.credential_hash,now).first();
   if(!claimed)return json({success:true,run:false});
   await db.prepare(`DELETE FROM intevacon_website_cards WHERE created_ms<? AND run_id NOT IN (SELECT COALESCE(active_run,'') FROM intevacon_card_control) AND run_id<>?`).bind(now-86400000,lease).run();
   return json({success:true,run:true,lease});
  }
  need(uuid(b.lease)&&c.lease===b.lease&&c.lease_until>now,'This card collection is no longer current.',409);
  if(path==='progress'){
   need(typeof b.message==='string'&&b.message.length<=300,'Invalid progress message.');
   await db.prepare(`UPDATE intevacon_card_control SET message=? WHERE id=1 AND lease=?`).bind(b.message,b.lease).run();return json({success:true});
  }
  if(path==='upload'){
   need(Number.isInteger(b.expected)&&b.expected>0&&b.expected<=20000,'Invalid complete card count.');
   need(Array.isArray(b.records)&&b.records.length>0&&b.records.length<=50,'Upload up to 50 cards at a time.');
   const cards=b.records.map(normalize);need(new Set(cards.map(r=>r.card_number)).size===cards.length,'Duplicate card numbers.');
   const updated=await db.prepare(`UPDATE intevacon_card_control SET expected=?,state='uploading' WHERE id=1 AND lease=? AND lease_until>? AND (expected IS NULL OR expected=?) RETURNING id`).bind(b.expected,b.lease,now,b.expected).first();
   need(updated,'Card collection count changed.',409);
   await db.batch(cards.map(r=>db.prepare(`INSERT INTO intevacon_website_cards(run_id,card_number,account_number,payload,created_ms) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM intevacon_card_control WHERE id=1 AND lease=? AND lease_until>?) ON CONFLICT(run_id,card_number) DO UPDATE SET account_number=excluded.account_number,payload=excluded.payload`).bind(b.lease,r.card_number,r.customer_id?'000'+r.customer_id:'',JSON.stringify(r),now,b.lease,now)));
   return json({success:true,accepted:cards.length});
  }
  if(path==='commit'){
   need(b.complete===true&&Number.isInteger(b.expected)&&b.expected===c.expected,'Incomplete card collection.');
   const published=await db.prepare(`UPDATE intevacon_card_control SET active_run=lease,last_success=?,state='complete',message='Complete card list updated.',failures=0,needs_attention=0,lease=NULL,lease_until=NULL,next_due=CASE WHEN enabled=1 THEN ?+interval_seconds*1000 ELSE NULL END WHERE id=1 AND lease=? AND lease_until>? AND expected=? AND expected=(SELECT COUNT(*) FROM intevacon_website_cards WHERE run_id=?) RETURNING expected`).bind(now,now,b.lease,now,b.expected,b.lease).first();
   need(published,'Card totals do not match; previous cards were kept.',409);
   return json({success:true,cards:published.expected,completed_at:iso(now)});
  }
  if(path==='fail'){
   const attention=['cloud_login_required','cloud_setup_required','cloud_validation_failed'].includes(b.code);
   const retry=Math.min(1800000,300000*2**Math.min(c.failures,4));
   const message=attention?(b.code==='cloud_login_required'?'Intevacon login needs attention. Check the saved login or required verification.':b.code==='cloud_setup_required'?'Card service setup needs attention. Check its bindings and secrets.':'Card export validation failed. Review the card service log before retrying.'):'Card pull interrupted. The previous complete card list was kept.';
   await db.prepare(`UPDATE intevacon_card_control SET lease=NULL,lease_until=NULL,state='failed',message=?,failures=failures+1,needs_attention=?,next_due=CASE WHEN enabled=1 AND ?=0 THEN ? ELSE NULL END WHERE id=1 AND lease=?`).bind(message,attention?1:0,attention?1:0,now+retry,b.lease).run();
   return json({success:true});
  }
  return json({success:false,error:'Not found.'},404);
 }catch(e){return json({success:false,error:e.status?e.message:'Card collection could not be processed. Previous cards were kept.'},e.status||503);}
}
export async function customerCards({request,env,customer}){
 try{
  need(customer,'Please sign in to your Wooten Oil account.',401);
  need(request.method==='GET','Method not allowed.',405);
  const account=customer.account_number;need(typeof account==='string'&&/^000\d{1,20}$/.test(account),'Fleet account matching is unavailable.',403);
  await ensure(env.DB);const db=env.DB,c=await run(db),q=new URL(request.url).searchParams;
  // Browser account/customer/card ownership filters are never trusted.
  const records=await db.prepare(`SELECT payload FROM intevacon_website_cards WHERE run_id=? AND account_number=?`).bind(c.active_run||'',account).all();
  const all=records.results.map(r=>JSON.parse(r.payload));
  const search=(q.get('search')||'').trim().toLowerCase().slice(0,200);
  const allowed=['card_number',...fields],sort=allowed.includes(q.get('sort'))?q.get('sort'):'card_number',direction=q.get('direction')==='desc'?-1:1;
  const collator=new Intl.Collator('en-US',{numeric:true,sensitivity:'base'});
  const items=all.filter(r=>!search||allowed.some(k=>r[k].toLowerCase().includes(search))).sort((a,b)=>direction*collator.compare(a[sort],b[sort])||collator.compare(a.card_number,b.card_number));
  const pages=Math.max(1,Math.ceil(items.length/20)),page=Math.max(1,Math.min(pages,Number.parseInt(q.get('page'),10)||1));
  return json({success:true,account_number:account,items:items.slice((page-1)*20,page*20),page,pages,total:items.length,summary:{cards:all.length,active:all.filter(r=>/^active$/i.test(r.status)).length},last_sync:iso(c.last_success),card_scope:'all',card_source:'website',notice:c.last_success?'Cards from the latest complete Intevacon website export.':'The card list has not been synced yet. Your administrator can run Sync Cards Now.'});
 }catch(e){return json({success:false,error:e.status?e.message:'Your card list could not be loaded.'},e.status||503);}
}
