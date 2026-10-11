// Read-only station telemetry. The Worker never connects to a tank gauge directly.
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const str=(v,max=160)=>String(v??'').trim().slice(0,max);
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');
export async function ensure(env){
 const sql=[
 `CREATE TABLE IF NOT EXISTS fuel_monitor_history(id INTEGER PRIMARY KEY AUTOINCREMENT,location_id TEXT NOT NULL,location_name TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,changes TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_locations(id TEXT PRIMARY KEY,config TEXT NOT NULL,token_hash TEXT,reading TEXT,last_observed TEXT,last_contact TEXT,error TEXT,lock_until INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_tank_readings(location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,observed_at TEXT NOT NULL,volume REAL NOT NULL,PRIMARY KEY(location_id,tank_number,observed_at))`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_tank_reading_details(location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,observed_at TEXT NOT NULL,water REAL,temperature REAL,PRIMARY KEY(location_id,tank_number,observed_at))`,
 `CREATE INDEX IF NOT EXISTS fuel_monitor_tank_readings_recent ON fuel_monitor_tank_readings(location_id,observed_at)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_states(location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,level TEXT NOT NULL,PRIMARY KEY(location_id,tank_number))`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_mutes(location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,acknowledged_alert_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(location_id,tank_number))`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_alerts(id INTEGER PRIMARY KEY AUTOINCREMENT,location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,level TEXT NOT NULL,message TEXT NOT NULL,portal INTEGER NOT NULL DEFAULT 1,acknowledged INTEGER NOT NULL DEFAULT 0,email_to TEXT,sms_to TEXT,email_status TEXT NOT NULL,sms_status TEXT NOT NULL,email_detail TEXT,sms_detail TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE INDEX IF NOT EXISTS fuel_monitor_alerts_recent ON fuel_monitor_alerts(created_at DESC,id DESC)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_schedules(location_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',send_time TEXT NOT NULL DEFAULT '08:00',last_sent_at TEXT,last_sent_date TEXT,last_status TEXT)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_scheduled_runs(location_id TEXT NOT NULL,local_date TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(location_id,local_date))`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_connection_states(location_id TEXT PRIMARY KEY,state TEXT NOT NULL DEFAULT 'healthy',changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_deleted_locations(id TEXT PRIMARY KEY,config TEXT NOT NULL,token_hash TEXT,reading TEXT,last_observed TEXT,last_contact TEXT,error TEXT,created_at TEXT,deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reassigned_to TEXT)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_collector_aliases(original_id TEXT PRIMARY KEY,target_id TEXT NOT NULL,token_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_schedule_items(id TEXT PRIMARY KEY,location_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,repeat_type TEXT NOT NULL DEFAULT 'weekly',days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',dates TEXT NOT NULL DEFAULT '',send_time TEXT NOT NULL DEFAULT '08:00',schedule_action TEXT NOT NULL DEFAULT 'send',last_run_at TEXT,last_status TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE INDEX IF NOT EXISTS idx_fuel_monitor_schedule_items_location ON fuel_monitor_schedule_items(location_id)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_schedule_runs(schedule_id TEXT NOT NULL,local_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(schedule_id,local_date))`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_archived_schedules(id TEXT PRIMARY KEY,location_id TEXT NOT NULL,enabled INTEGER NOT NULL,repeat_type TEXT NOT NULL,days TEXT NOT NULL,dates TEXT NOT NULL,send_time TEXT NOT NULL,schedule_action TEXT NOT NULL,last_run_at TEXT,last_status TEXT,created_at TEXT)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_schema_marks(mark TEXT PRIMARY KEY)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_saved_snapshots(location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,observed_at TEXT NOT NULL,volume REAL NOT NULL,water REAL,temperature REAL,schedule_id TEXT NOT NULL,PRIMARY KEY(location_id,tank_number,observed_at))`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_hourly_usage(location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,hour_key TEXT NOT NULL,gallons REAL NOT NULL DEFAULT 0,valid_intervals INTEGER NOT NULL DEFAULT 0,delivery_indicators INTEGER NOT NULL DEFAULT 0,excluded_drops INTEGER NOT NULL DEFAULT 0,sample_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(location_id,tank_number,hour_key))`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_daily_usage(location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,day TEXT NOT NULL,gallons REAL NOT NULL DEFAULT 0,valid_intervals INTEGER NOT NULL DEFAULT 0,delivery_indicators INTEGER NOT NULL DEFAULT 0,excluded_drops INTEGER NOT NULL DEFAULT 0,sample_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(location_id,tank_number,day))`];
 for(const s of sql)await env.DB.prepare(s).run();
 // Link new scheduled-report alerts to their schedule; legacy alerts remain unlinked.
 const alertColumns=(await env.DB.prepare('PRAGMA table_info(fuel_monitor_alerts)').all()).results||[];
 if(!alertColumns.some(column=>column.name==='schedule_id')){
  try{await env.DB.prepare('ALTER TABLE fuel_monitor_alerts ADD COLUMN schedule_id TEXT').run();}
  catch(error){const again=(await env.DB.prepare('PRAGMA table_info(fuel_monitor_alerts)').all()).results||[];if(!again.some(column=>column.name==='schedule_id'))throw error;}
 }
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_fuel_alert_schedule ON fuel_monitor_alerts(schedule_id,created_at DESC)').run();
 // Legacy single-time schedules are imported exactly once; subsequent edits cannot revive them.
 const migrated=await env.DB.prepare("INSERT INTO fuel_monitor_schema_marks(mark) VALUES('multi_schedule_v940') ON CONFLICT(mark) DO NOTHING RETURNING mark").first();
 if(migrated){
  await env.DB.prepare("INSERT OR IGNORE INTO fuel_monitor_schedule_items(id,location_id,enabled,repeat_type,days,dates,send_time,schedule_action,last_run_at,last_status) SELECT 'legacy-'||location_id,location_id,enabled,'weekly',days,'',send_time,'send',last_sent_at,COALESCE(last_status,'') FROM fuel_monitor_schedules WHERE location_id IN (SELECT id FROM fuel_monitor_locations)").run();
 }

}
export function alertRecipients(value,type){
 const list=[...new Set(String(value||'').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).map(s=>type==='email'?s.toLowerCase():s))];
 if(list.length>20)fail('Use up to 20 '+(type==='email'?'email addresses':'phone numbers')+'.');
 const valid=type==='email'?/^[^\s@]+@[^\s@]+\.[^\s@]+$/:/^\+[1-9]\d{7,14}$/;
 if(list.some(s=>s.length>254||!valid.test(s)))fail(type==='email'?'Enter valid alert email addresses.':'Enter each alert phone number with country code, such as +19015551234.');
 return list;
}
export function validateConfig(input){
 const c={icon:input.icon||'fuel',name:str(input.name,100),phone:str(input.phone,32),address:str(input.address,300),model:str(input.model,80)||'TLS-350',host:str(input.host,253),port:Number(input.port),interval:Number(input.interval),enabled:input.enabled===true,portal:input.portal===true,email:input.email===true,sms:input.sms===true,email_to:alertRecipients(input.email_to,'email').join(', '),sms_to:alertRecipients(input.sms_to,'sms').join(', '),tanks:[]};
 if(!['fuel','store','truck','building-2','wrench','tractor'].includes(c.icon))fail('Choose an available location icon.');
 if(!c.name)fail('Enter a station name.');
 if(!/^([a-zA-Z0-9][a-zA-Z0-9.-]*)$/.test(c.host)||!Number.isInteger(c.port)||c.port<1||c.port>65535)fail('Enter the local monitor IP/hostname and a valid TCP data port.');
 if(!Number.isInteger(c.interval)||c.interval<60||c.interval>86400)fail('Reading interval must be 60–86400 seconds.');
 if(c.email&&!c.email_to)fail('Add at least one alert email address.');
 if(c.sms&&!c.sms_to)fail('Add at least one alert phone number.');
 if(!Array.isArray(input.tanks)||input.tanks.length>64)fail('Enter up to 64 tanks.');
 const seen=new Set();
 for(const t of input.tanks){
  const tank={number:Number(t.number),fuel:str(t.fuel,80),capacity:Number(t.capacity),mode:t.mode,low:Number(t.low),critical:Number(t.critical),recovery:Number(t.recovery),alerts:t.alerts===true};
  if(!Number.isInteger(tank.number)||tank.number<1||tank.number>99||seen.has(tank.number))fail('Tank numbers must be unique and between 1 and 99.');seen.add(tank.number);
  if(!tank.fuel||!Number.isFinite(tank.capacity)||tank.capacity<=0||tank.capacity>1000000)fail('Enter each tank’s fuel and capacity in US gallons.');
  const max=tank.mode==='percent'?100:tank.capacity;
  if(!['gallons','percent'].includes(tank.mode)||![tank.low,tank.critical,tank.recovery].every(Number.isFinite)||tank.critical<0||tank.critical>=tank.low||tank.low>=tank.recovery||tank.recovery>max)fail('Thresholds must be: critical < low < recovery, within tank capacity (or 100%).');
  c.tanks.push(tank);
 }
 return c;
}
export function levelFor(tank,volume,previous='normal'){
 // Latch critical until the actual recovery threshold. Do not downgrade to low
 // during partial deliveries or noisy readings. Low may escalate to critical.
 const value=tank.mode==='percent'?volume/tank.capacity*100:volume;
 if(!Number.isFinite(value))return previous;
 if(previous==='critical'&&value<tank.recovery)return 'critical';
 if(value<=tank.critical)return 'critical';
 if(previous==='low'&&value<tank.recovery)return 'low';
 if(value<=tank.low)return 'low';
 return 'normal';
}

function configuredTankLevel(configTank,readingTank,previous='normal'){
 if(!configTank||!readingTank||!Number.isFinite(Number(readingTank.volume)))return 'unknown';
 return levelFor(configTank,Number(readingTank.volume),previous);
}
function monitorDeliveryNeededTanks(reading){
 const found=new Set(),report=String(reading?.monitor_status?.report||'');
 for(const line of report.split(/\r?\n/)){
  const match=line.match(/\bT\s*(\d{1,2})\b.*\bDELIVERY\s+NEEDED\b/i);
  if(match)found.add(Number(match[1]));
 }
 return found;
}
function tankStatusLabel(configTank,readingTank,previous='normal',deliverySet=new Set()){
 if(!readingTank)return 'No reading';
 if(deliverySet.has(Number(configTank?.number)))return 'DELIVERY NEEDED';
 const level=configuredTankLevel(configTank,readingTank,previous);
 if(level==='critical')return 'Critical';
 if(level==='low')return 'Low';
 if(level==='normal')return 'Normal';
 return 'No reading';
}
function allTankMessage(config,reading,{headline='',triggerTank=null,triggerLevel='reading'}={}){
 const delivery=monitorDeliveryNeededTanks(reading),lines=[];
 const prefix=headline||`${config.name} — Fuel reading`;
 lines.push(prefix);
 for(const tank of config.tanks||[]){
  const r=reading?.tanks?.find(x=>Number(x.number)===Number(tank.number));
  if(!r)continue;
  const status=tankStatusLabel(tank,r,'normal',delivery);
  const pct=Number(tank.capacity)>0?(Number(r.volume)/Number(tank.capacity)*100).toFixed(1):'—';
  lines.push(`Tank ${tank.number} (${tank.fuel}): ${Number(r.volume).toLocaleString('en-US')} US gallons (${pct}%) — ${status}.`);
 }
 if(triggerTank!=null&&triggerLevel!=='reading')lines.push(`Alert source: Tank ${triggerTank} — ${String(triggerLevel).toUpperCase()}.`);
 lines.push(`Reading ${reading?.observed_at||''}.`);
 return lines.join('\n');
}

function inferredTankCapacity(readingTank){
 const volume=Number(readingTank?.volume),ullage=Number(readingTank?.ullage);
 let raw=Number.isFinite(volume)&&Number.isFinite(ullage)&&ullage>=0?volume+ullage:NaN;
 if(!Number.isFinite(raw)||raw<=0)return null;
 // TLS-350 volume + ullage commonly reflects calibrated usable volume with a small
 // variance around the nominal tank size. Snap to the nearest 1,000 gallons when
 // the difference is within 7.5%; otherwise preserve the measured total.
 const rounded=Math.round(raw/1000)*1000;
 if(rounded>=1000&&Math.abs(raw-rounded)/rounded<=0.075)return rounded;
 return Math.round(raw);
}
function addDetectedTanks(config,readingTanks){
 const existing=new Set((config.tanks||[]).map(t=>Number(t.number))),added=[];
 for(const r of readingTanks||[]){
  const number=Number(r.number);
  if(existing.has(number))continue;
  const capacity=inferredTankCapacity(r);
  if(!Number.isFinite(capacity)||capacity<=0)continue;
  const tank={
   number,
   fuel:str(r.fuel,80)||`Tank ${number}`,
   capacity,
   mode:'percent',
   low:20,
   critical:10,
   recovery:25,
   // Newly detected tanks begin with alerts off so detection itself cannot create
   // an unexpected notification before the admin reviews thresholds.
   alerts:false
  };
  config.tanks.push(tank);existing.add(number);added.push(tank);
 }
 config.tanks.sort((a,b)=>Number(a.number)-Number(b.number));
 return added;
}
function locationView(row){return {id:row.id,...JSON.parse(row.config),paired:!!row.token_hash,reading:row.reading?JSON.parse(row.reading):null,last_observed:row.last_observed,last_contact:row.last_contact,error:row.error};}
async function bodyOf(request){const raw=await request.text();if(raw.length>100000)fail('Request too large.',413);try{return JSON.parse(raw)}catch{fail('Invalid JSON.')}}
export async function admin(request,env,{auditStatement,verifyPassword,verifyMasterPassword,actor}={}){
 try{
  if(!env.ADMIN_IMPORT_KEY||request.headers.get('X-Admin-Key')!==env.ADMIN_IMPORT_KEY)return reply({success:false,error:'Unauthorized'},401);
  await ensure(env);
  if(request.method==='GET'){
   // Ver977: paginated delivery activity. Never query raw tank samples for this feed.
   const deliveryMode=new URL(request.url).searchParams.get('delivery_activity');
   if(deliveryMode==='list'||deliveryMode==='detail'){
    const q=new URL(request.url).searchParams;
    const period=['1','7','30'].includes(q.get('days'))?Number(q.get('days')):1;
    const cutoff=new Date(Date.now()-period*86400000).toISOString().slice(0,19).replace('T',' ');
    if(deliveryMode==='detail'){
     const sid=q.get('schedule_id')||'',localDate=q.get('date')||'';
     if(!/^[a-zA-Z0-9-]{1,90}$/.test(sid)||!/^\d{4}-\d{2}-\d{2}$/.test(localDate))fail('Invalid delivery activity record.');
     const run=await env.DB.prepare('SELECT schedule_id,local_date,created_at,status FROM fuel_monitor_schedule_runs WHERE schedule_id=? AND local_date=?').bind(sid,localDate).first();
     if(!run)fail('Scheduled run not found.',404);
     const a=await env.DB.prepare(`SELECT id,created_at,portal,email_status,sms_status,email_detail,sms_detail,email_to,sms_to FROM fuel_monitor_alerts
       WHERE schedule_id=? AND created_at>=datetime(?,'-1 minute') AND created_at<=datetime(?,'+15 minutes') ORDER BY id ASC LIMIT 1`).bind(sid,run.created_at,run.created_at).first();
     return reply({success:true,run,delivery:a?{id:a.id,created_at:a.created_at,portal:!!a.portal,email:a.email_status,sms:a.sms_status,email_detail:a.email_detail||'',sms_detail:a.sms_detail||'',email_receivers:!!a.email_to,sms_receivers:!!a.sms_to}:null,note:'Submitted means accepted by provider, not confirmed delivered.'});
    }
    const offset=Math.min(100000,Math.max(0,Number(q.get('offset'))||0));
    const filter=['all','success','issues'].includes(q.get('filter'))?q.get('filter'):'all';
    const base=`FROM fuel_monitor_schedule_runs r LEFT JOIN fuel_monitor_schedule_items s ON s.id=r.schedule_id LEFT JOIN fuel_monitor_locations l ON l.id=s.location_id
      LEFT JOIN fuel_monitor_alerts a ON a.id=(SELECT z.id FROM fuel_monitor_alerts z WHERE z.schedule_id=r.schedule_id AND z.created_at>=datetime(r.created_at,'-1 minute') AND z.created_at<=datetime(r.created_at,'+15 minutes') ORDER BY z.id ASC LIMIT 1)
      WHERE r.created_at>=?`;
    const state=`CASE WHEN a.id IS NULL THEN 'unknown' WHEN lower(coalesce(a.email_status,'')) IN ('failed','partial','unknown') OR lower(coalesce(a.sms_status,'')) IN ('failed','partial','unknown') THEN 'issues' WHEN lower(coalesce(a.email_status,'')) IN ('pending','sending') OR lower(coalesce(a.sms_status,'')) IN ('pending','sending') THEN 'pending' ELSE 'success' END`;
    const where=filter==='success'?` AND ${state}='success'`:filter==='issues'?` AND ${state} IN ('issues','pending','unknown')`:'';
    const count=await env.DB.prepare(`SELECT COUNT(*) AS n ${base}${where}`).bind(cutoff).first();
    const rows=(await env.DB.prepare(`SELECT r.schedule_id,r.local_date,r.created_at,r.status,s.send_time,s.schedule_action,l.config,
        a.id AS alert_id,a.email_status,a.sms_status,a.portal,${state} AS outcome ${base}${where} ORDER BY r.created_at DESC,r.schedule_id DESC LIMIT 20 OFFSET ?`).bind(cutoff,offset).all()).results||[];
    const items=rows.map(r=>{let config={};try{config=JSON.parse(r.config||'{}')}catch{}return {schedule_id:r.schedule_id,date:r.local_date,at:r.created_at,location:config.name||'Archived / unavailable location',time:r.send_time||'',action:r.schedule_action||'',status:r.outcome,email:r.email_status||'unknown',sms:r.sms_status||'unknown',reading:r.status||'queued',portal:r.alert_id?(r.portal?'saved':'off'):'unknown',has_delivery:!!r.alert_id};});
    return reply({success:true,items,total:Number(count?.n||0),next_offset:offset+items.length<Number(count?.n||0)?offset+items.length:null,server_time:new Date().toISOString(),note:'Delivery activity includes scheduled runs only; inventory readings are not duplicated.'});
   }
   if(new URL(request.url).searchParams.get('delivery_health')==='1'){
    const schedules=(await env.DB.prepare(`SELECT s.id,s.location_id,s.enabled,s.days,s.dates,s.repeat_type,s.send_time,s.schedule_action,s.last_run_at,s.last_status,l.config,l.last_observed
       FROM fuel_monitor_schedule_items s JOIN fuel_monitor_locations l ON l.id=s.location_id ORDER BY s.send_time,s.id`).all()).results||[];
    const results=[];
    for(const item of schedules){
     const config=JSON.parse(item.config||'{}');
     const run=await env.DB.prepare('SELECT local_date,created_at,status FROM fuel_monitor_schedule_runs WHERE schedule_id=? ORDER BY local_date DESC LIMIT 1').bind(item.id).first();
     const delivery=await env.DB.prepare(`SELECT id,created_at,portal,email_status,sms_status,email_detail,sms_detail,email_to,sms_to
       FROM fuel_monitor_alerts WHERE schedule_id=? ORDER BY id DESC LIMIT 1`).bind(item.id).first();
     const lastAt=item.last_run_at||run?.created_at||'';
     const result={schedule_id:item.id,location_id:item.location_id,location:config.name||'Fuel location',enabled:!!item.enabled,
       time:item.send_time,repeat:item.repeat_type,days:item.days,dates:item.dates,action:item.schedule_action,
       last_run_at:lastAt,last_status:item.last_status||'',last_reading_at:item.last_observed||'',run_date:run?.local_date||'',
       reading:run?'saved':(item.enabled?'not_recorded':'disabled'),
       portal:delivery?(delivery.portal?'saved':'off'):'unknown',
       email:delivery?delivery.email_status:'unknown',sms:delivery?delivery.sms_status:'unknown',
       email_detail:delivery?.email_detail||'',sms_detail:delivery?.sms_detail||'',
       delivery_at:delivery?.created_at||'',delivery_linked:!!delivery,
       configured_email:!!config.email,configured_sms:!!config.sms};
     results.push(result);
    }
    return reply({success:true,schedules:results,server_time:new Date().toISOString(),time_zone:'America/Chicago',
     note:'Statuses show provider submission, not guaranteed receipt. Historic notifications created before schedule linking cannot be attributed to a specific schedule.'});
   }
   const exportId=new URL(request.url).searchParams.get('reading_export_id');
   if(exportId!==null){
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(exportId))fail('Invalid location.',400);
    const location=await env.DB.prepare('SELECT config FROM fuel_monitor_locations WHERE id=?').bind(exportId).first();
    if(!location)fail('Location not found.',404);
    const config=JSON.parse(location.config);
    const offset=Math.min(2000000,Math.max(0,Number(new URL(request.url).searchParams.get('offset')||0)||0));
    const limit=3000;
    const rows=(await env.DB.prepare(`SELECT r.observed_at,r.tank_number,r.volume,r.water,r.temperature
       FROM (SELECT a.location_id,a.tank_number,a.observed_at,a.volume,b.water,b.temperature FROM fuel_monitor_tank_readings a LEFT JOIN fuel_monitor_tank_reading_details b ON b.location_id=a.location_id AND b.tank_number=a.tank_number AND b.observed_at=a.observed_at UNION ALL SELECT h.location_id,h.tank_number,h.observed_at,h.volume,h.water,h.temperature FROM fuel_monitor_saved_snapshots h WHERE NOT EXISTS (SELECT 1 FROM fuel_monitor_tank_readings d WHERE d.location_id=h.location_id AND d.tank_number=h.tank_number AND d.observed_at=h.observed_at)) r
       WHERE r.location_id=? ORDER BY r.observed_at ASC,r.tank_number ASC LIMIT ? OFFSET ?`)
       .bind(exportId,limit,offset).all()).results||[];
    return reply({success:true,location_name:config.name,location_id:exportId,interval:config.interval,tanks:config.tanks.map(t=>({number:t.number,fuel:t.fuel})),rows,next_offset:rows.length===limit?offset+limit:null});
   }
   const analyticsId=new URL(request.url).searchParams.get('analytics_id');
   if(analyticsId!==null){
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(analyticsId))fail('Invalid location.',400);
    const location=await env.DB.prepare('SELECT config FROM fuel_monitor_locations WHERE id=?').bind(analyticsId).first();
    if(!location)fail('Location not found.',404);
    const config=JSON.parse(location.config);
    const cutoff=new Date(Date.now()-90*86400000).toISOString();
    const tanks=[];
    for(const tank of config.tanks||[]){
     const capacity=Number(tank.capacity);
     if(!(capacity>0))continue;
     // Calculate each interval in the database; never transmit raw historical inventory to the browser.
     // Positive changes are deliveries/adjustments, not negative consumption. Long gaps and
     // sudden implausible drops are excluded from the usage estimate.
     const rows=(await env.DB.prepare(`WITH seq AS (
      SELECT observed_at,volume,
       LAG(volume) OVER (ORDER BY observed_at) AS previous_volume,
       LAG(observed_at) OVER (ORDER BY observed_at) AS previous_at
      FROM fuel_monitor_tank_readings
      WHERE location_id=? AND tank_number=? AND observed_at>=?
     ) SELECT substr(observed_at,1,10) AS day,
      ROUND(SUM(CASE WHEN previous_volume IS NOT NULL
         AND (julianday(observed_at)-julianday(previous_at))*1440 BETWEEN 0.01 AND 45
         AND previous_volume-volume >= 2 AND previous_volume-volume <= ?
         THEN previous_volume-volume ELSE 0 END),1) AS gallons,
      SUM(CASE WHEN previous_volume IS NOT NULL AND (julianday(observed_at)-julianday(previous_at))*1440 BETWEEN 0.01 AND 45 THEN 1 ELSE 0 END) AS valid_intervals,
      SUM(CASE WHEN previous_volume IS NOT NULL AND volume-previous_volume> ? THEN 1 ELSE 0 END) AS delivery_indicators,
      SUM(CASE WHEN previous_volume IS NOT NULL AND previous_volume-volume > ? THEN 1 ELSE 0 END) AS excluded_drops,
      COUNT(*) AS sample_count
      FROM seq GROUP BY day ORDER BY day`).bind(analyticsId,Number(tank.number),cutoff,capacity*.25,Math.max(20,capacity*.01),capacity*.25).all()).results||[];
     // Pre-aggregated UTC days are immutable once their source detail is retired.
     const summary=(await env.DB.prepare('SELECT day,gallons,valid_intervals,delivery_indicators,excluded_drops,sample_count FROM fuel_monitor_daily_usage WHERE location_id=? AND tank_number=? AND day>=? ORDER BY day').bind(analyticsId,Number(tank.number),cutoff.slice(0,10)).all()).results||[];
     const combined=new Map(summary.map(r=>[r.day,r]));
     for(const r of rows){const existing=combined.get(r.day);if(existing){ // A cleanup boundary day is owned by its finalized rollup.
       continue;
      }combined.set(r.day,r);}
     tanks.push({number:Number(tank.number),fuel:tank.fuel,capacity,days:[...combined.values()].sort((a,b)=>String(a.day).localeCompare(String(b.day)))});
    }
    return reply({success:true,location_id:analyticsId,location_name:config.name,tanks,history_since:cutoff,method:'Inventory decreases over consecutive valid observations; apparent deliveries, gaps over 45 minutes, minor gauge noise and implausible drops are excluded. This is an estimate, not metered sales.'});
   }
   const scheduleRows=(await env.DB.prepare('SELECT * FROM fuel_monitor_schedule_items ORDER BY send_time,id').all()).results||[];
   const byId=new Map();for(const s of scheduleRows){if(!byId.has(s.location_id))byId.set(s.location_id,[]);byId.get(s.location_id).push(publicSchedule(s));}
   const locations=(await env.DB.prepare('SELECT * FROM fuel_monitor_locations ORDER BY created_at,id').all()).results.map(row=>{
    const schedules=byId.get(row.id)||[];
    return {...locationView(row),auto_reading:{enabled:schedules.some(x=>x.enabled),schedules}};
   });
   const alerts=(await env.DB.prepare('SELECT * FROM fuel_monitor_alerts ORDER BY id DESC LIMIT 100').all()).results;
   const history=(await env.DB.prepare('SELECT * FROM fuel_monitor_history ORDER BY id DESC LIMIT 200').all()).results;
   // The bell can link to an exact alert even when it is older than the most
   // recent 100 alerts shown in the main history list.
   const requestedAlert=new URL(request.url).searchParams.get('alert_id');
   let target_alert=null;
   if(requestedAlert!==null){
    if(!/^[1-9]\d{0,14}$/.test(requestedAlert)||!Number.isSafeInteger(Number(requestedAlert)))fail('Invalid fuel alert ID.',400);
    target_alert=await env.DB.prepare('SELECT * FROM fuel_monitor_alerts WHERE id=?').bind(Number(requestedAlert)).first()||null;
   }
   const deleted_locations=(await env.DB.prepare('SELECT id,config,deleted_at,reassigned_to,token_hash FROM fuel_monitor_deleted_locations ORDER BY deleted_at DESC LIMIT 100').all()).results.map(r=>({id:r.id,name:JSON.parse(r.config).name,deleted_at:r.deleted_at,reassigned_to:r.reassigned_to,paired:!!r.token_hash}));
   return reply({success:true,locations,alerts,history,target_alert,deleted_locations});
  }
  if(request.method!=='POST')return reply({success:false,error:'Use GET or POST.'},405);
  const b=await bodyOf(request),action=b.action,id=b.id||crypto.randomUUID();
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))fail('Invalid location.');
  if(action==='verify_tank_removal'){
   if(typeof verifyPassword!=='function'||!await verifyPassword(b.password))fail('The signed-in admin password is incorrect.',403);
   return reply({success:true});
  }
  if(!['save','pair','delete','acknowledge','send_reading','schedule_save','schedule_remove','clone_settings','verify_connection_edit','reset_tanks','restore_location','reconnect_collector'].includes(action))fail('Unknown action.');
  if(action==='restore_location'||action==='reconnect_collector'){
   if(typeof verifyMasterPassword!=='function'||!await verifyMasterPassword(b.password))fail('The Master Admin password is incorrect.',403);
   if(typeof auditStatement!=='function')fail('Admin tracking is unavailable.',503);
   const archived=await env.DB.prepare('SELECT * FROM fuel_monitor_deleted_locations WHERE id=?').bind(id).first();
   if(!archived)fail('Deleted location not found.',404);
   if(archived.reassigned_to)fail('This collector was already reconnected to another location.',409);
   if(action==='restore_location'){
    if(await env.DB.prepare('SELECT id FROM fuel_monitor_locations WHERE id=?').bind(id).first())fail('A location with this ID already exists.',409);
    await env.DB.batch([
     env.DB.prepare('INSERT INTO fuel_monitor_locations(id,config,token_hash,reading,last_observed,last_contact,error,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,archived.config,archived.token_hash,archived.reading,archived.last_observed,archived.last_contact,archived.error,archived.created_at),
     env.DB.prepare("INSERT OR IGNORE INTO fuel_monitor_schedule_items(id,location_id,enabled,repeat_type,days,dates,send_time,schedule_action,last_run_at,last_status,created_at) SELECT id,location_id,0,repeat_type,days,dates,send_time,schedule_action,last_run_at,'Restored — review and enable',COALESCE(created_at,CURRENT_TIMESTAMP) FROM fuel_monitor_archived_schedules WHERE location_id=?").bind(id),
      env.DB.prepare('DELETE FROM fuel_monitor_archived_schedules WHERE location_id=?').bind(id),
      env.DB.prepare('DELETE FROM fuel_monitor_deleted_locations WHERE id=?').bind(id),
     env.DB.prepare('INSERT INTO fuel_monitor_history(location_id,location_name,actor,action,changes) VALUES(?,?,?,?,?)').bind(id,JSON.parse(archived.config).name,str(actor?.name||'Master Admin',160),'restore_location','[]'),
     await auditStatement({action:'fuel_monitor_restore_location',id,detail:'Restored deleted fuel monitoring location with original collector identity'})
    ]);
    return reply({success:true,id,restored:true});
   }
   const target=str(b.target_id,80);
   if(!target||target===id)fail('Choose a different existing location.',400);
   const replacement=await env.DB.prepare('SELECT * FROM fuel_monitor_locations WHERE id=?').bind(target).first();
   if(!replacement)fail('Replacement location not found.',404);
   if(replacement.token_hash||replacement.last_observed)fail('The replacement location must be unused and not paired with another collector.',409);
   if(!archived.token_hash)fail('The deleted location has no collector credential to reconnect.',409);
   const archiveConfig=JSON.parse(archived.config),newConfig=JSON.parse(replacement.config);
   // Keep the new location's identity/contact settings, but copy the gauge
   // connection and existing tank configuration from the archived source.
   for(const key of ['model','host','port','interval','enabled'])newConfig[key]=archiveConfig[key];
   if(!newConfig.tanks?.length)newConfig.tanks=archiveConfig.tanks||[];
   await env.DB.batch([
    env.DB.prepare('UPDATE fuel_monitor_locations SET config=?,token_hash=? WHERE id=? AND token_hash IS NULL').bind(JSON.stringify(newConfig),archived.token_hash,target),
    env.DB.prepare('INSERT INTO fuel_monitor_collector_aliases(original_id,target_id,token_hash) VALUES(?,?,?)').bind(id,target,archived.token_hash),
    env.DB.prepare('UPDATE fuel_monitor_deleted_locations SET reassigned_to=? WHERE id=?').bind(target,id),
    env.DB.prepare('INSERT INTO fuel_monitor_history(location_id,location_name,actor,action,changes) VALUES(?,?,?,?,?)').bind(target,newConfig.name,str(actor?.name||'Master Admin',160),'reconnect_collector',JSON.stringify([{field:'original_location_id',before:id,after:target}])),
    await auditStatement({action:'fuel_monitor_reconnect_collector',id:target,detail:`Reconnected archived collector ${id} to replacement location ${target}`})
   ]);
   return reply({success:true,id:target,reconnected:true});
  }
  const row=await env.DB.prepare('SELECT * FROM fuel_monitor_locations WHERE id=?').bind(id).first();
  if(action!=='save'&&!row)fail('Location no longer exists.',404);
  if(row?.lock_until>Date.now())fail('A reading is being saved. Try again in a few seconds.',409);
  if(action==='verify_connection_edit'){
   if(typeof verifyMasterPassword!=='function'||!await verifyMasterPassword(b.password))fail('The Master Admin password is incorrect.',403);
   return reply({success:true});
  }
  if(action==='reset_tanks'){
   // Reset tank definitions ONLY. Never rotate the collector key or delete the
   // location, cached inventory, existing alert history, or sending schedule.
   if(typeof verifyMasterPassword!=='function'||!await verifyMasterPassword(b.password))fail('The Master Admin password is incorrect.',403);
   if(b.confirmation!=='RESET')fail('Type RESET to confirm tank re-detection.',400);
   if(!row.token_hash)fail('Connect the station collector before re-detecting tanks.',409);
   if(typeof auditStatement!=='function')fail('Admin tracking is unavailable.',503);
   const now=Date.now();
   // Coordinate with the station collector: an upload already in progress must
   // finish first, and uploads starting during this reset can retry normally.
   const lock=await env.DB.prepare('UPDATE fuel_monitor_locations SET lock_until=? WHERE id=? AND lock_until<? RETURNING id').bind(now+30000,id,now).first();
   if(!lock)fail('The station collector is updating this location. Try again in a few seconds.',409);
   try{
    const latest=await env.DB.prepare('SELECT config,token_hash FROM fuel_monitor_locations WHERE id=?').bind(id).first();
    if(!latest?.token_hash)fail('This location no longer has a paired collector.',409);
    const config=JSON.parse(latest.config);
    const previous=Array.isArray(config.tanks)?config.tanks:[];
    if(!previous.length)fail('No configured tanks to reset. Wait for the next collector reading.',409);
    const next={...config,tanks:[]};
    const detail=`Reset ${previous.length} tank configurations for ${config.name}; awaiting collector re-detection. Collector key and location retained.`;
    const changeDetails=[{field:'tank_configuration',before:previous,after:[]}];
    const audit=await auditStatement({action:'fuel_monitor_reset_tanks',id,detail});
    await env.DB.batch([
     env.DB.prepare('UPDATE fuel_monitor_locations SET config=? WHERE id=?').bind(JSON.stringify(next),id),
     env.DB.prepare('DELETE FROM fuel_monitor_states WHERE location_id=?').bind(id),
     env.DB.prepare('DELETE FROM fuel_monitor_mutes WHERE location_id=?').bind(id),
     env.DB.prepare('INSERT INTO fuel_monitor_history(location_id,location_name,actor,action,changes) VALUES(?,?,?,?,?)').bind(id,config.name,str(actor?.name||'Admin',160),'reset_tanks',JSON.stringify(changeDetails)),
     audit
    ]);
    return reply({success:true,id,reset_count:previous.length,redetect_pending:true});
   }finally{
    await env.DB.prepare('UPDATE fuel_monitor_locations SET lock_until=0 WHERE id=?').bind(id).run();
   }
  }
  const jobs=[];let token='',detail='',changes=[],cloneSummary=null;
   if(action==='schedule_save'){
    const schedule=validateMultiSchedule(b.schedule);
    const config=JSON.parse(row.config);
    if(schedule.enabled&&schedule.action==='send'&&!(config.portal||config.email&&config.email_to||config.sms&&config.sms_to))fail('Enable a report delivery option for this location first.',409);
    const sid=str(b.schedule_id,90)||crypto.randomUUID();
    if(!/^[a-zA-Z0-9-]{1,90}$/.test(sid))fail('Invalid schedule.');
    const existing=await env.DB.prepare('SELECT location_id FROM fuel_monitor_schedule_items WHERE id=?').bind(sid).first();
    if(existing&&existing.location_id!==id)fail('Schedule belongs to a different location.',409);
    // A location may have only one schedule at any Central clock time, even
    // when repeat days/actions differ. Guard at the server before writing.
    const duplicate=await env.DB.prepare('SELECT id FROM fuel_monitor_schedule_items WHERE location_id=? AND send_time=? AND id<>? LIMIT 1').bind(id,schedule.time,sid).first();
    if(duplicate)fail('A schedule at '+schedule.time+' Central already exists for this location. Choose a different time.',409);
    detail='Saved automatic fuel schedule at '+schedule.time+' Central for '+config.name+'.';
    jobs.push(env.DB.prepare(`INSERT INTO fuel_monitor_schedule_items(id,location_id,enabled,repeat_type,days,dates,send_time,schedule_action,last_status) VALUES(?,?,?,?,?,?,?,?,'Scheduled') ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,repeat_type=excluded.repeat_type,days=excluded.days,dates=excluded.dates,send_time=excluded.send_time,schedule_action=excluded.schedule_action,last_status='Updated'`).bind(sid,id,schedule.enabled?1:0,schedule.repeat,schedule.days.join(','),schedule.dates.join(','),schedule.time,schedule.action));
   }
   if(action==='schedule_remove'){
    const sid=str(b.schedule_id,90),existing=await env.DB.prepare('SELECT id FROM fuel_monitor_schedule_items WHERE id=? AND location_id=?').bind(sid,id).first();
    if(!existing)fail('Schedule not found.',404);
    detail='Removed fuel reading schedule '+sid;
    jobs.push(env.DB.prepare('DELETE FROM fuel_monitor_schedule_items WHERE id=? AND location_id=?').bind(sid,id));
   }
   if(action==='clone_settings'){
    const target=str(b.target_id,80),receiver= b.clone_receivers===true,schedules=b.clone_schedules===true;
    if(!receiver&&!schedules)fail('Choose schedules or receivers to clone.');
    if(!target||target===id)fail('Choose another destination location.');
    const destination=await env.DB.prepare('SELECT config FROM fuel_monitor_locations WHERE id=?').bind(target).first();
    if(!destination)fail('Destination location not found.',404);
    const mode=b.mode==='replace'?'replace':'append';
    const source=JSON.parse(row.config),dest=JSON.parse(destination.config);
    cloneSummary={added_schedules:0,skipped_schedules:0,added_emails:0,added_phones:0,receiver_settings_updated:false};
    if(receiver){
     const emails=alertRecipients(source.email_to,'email'),phones=alertRecipients(source.sms_to,'sms');
     const existingEmails=alertRecipients(dest.email_to,'email');
     const mergedEmails=mode==='replace'?emails:alertRecipients([dest.email_to,...emails].filter(Boolean).join(','),'email');
     const existingPhones=alertRecipients(dest.sms_to,'sms');
     const mergedPhones=mode==='replace'?phones:alertRecipients([dest.sms_to,...phones].filter(Boolean).join(','),'sms');
     cloneSummary.added_emails=mergedEmails.filter(e=>!existingEmails.includes(e)).length;
     cloneSummary.added_phones=mergedPhones.filter(p=>!existingPhones.includes(p)).length;
     cloneSummary.receiver_settings_updated=true;
     // Only delivery toggles and receiver lists; NEVER copy machine, tanks, station identity or phone.
     dest.email_to=mergedEmails.join(', ');dest.sms_to=mergedPhones.join(', ');
     if(mode==='replace'){dest.portal=source.portal;dest.email=source.email;dest.sms=source.sms;}
     jobs.push(env.DB.prepare('UPDATE fuel_monitor_locations SET config=? WHERE id=?').bind(JSON.stringify(dest),target));
    }
    if(schedules){
     const sourceSchedules=(await env.DB.prepare('SELECT * FROM fuel_monitor_schedule_items WHERE location_id=?').bind(id).all()).results||[];
     if(mode==='replace')jobs.push(env.DB.prepare('DELETE FROM fuel_monitor_schedule_items WHERE location_id=?').bind(target));
     const present=mode==='append'?(await env.DB.prepare('SELECT send_time FROM fuel_monitor_schedule_items WHERE location_id=?').bind(target).all()).results||[]:[];
     const occupiedTimes=new Set(present.map(s=>String(s.send_time)));
     for(const s of sourceSchedules){
      const clock=String(s.send_time);
      if(occupiedTimes.has(clock)){cloneSummary.skipped_schedules++;continue;}
      occupiedTimes.add(clock);
      cloneSummary.added_schedules++;
      // New cloned schedules start DISABLED until the receiving location is reviewed.
      jobs.push(env.DB.prepare("INSERT INTO fuel_monitor_schedule_items(id,location_id,enabled,repeat_type,days,dates,send_time,schedule_action,last_status) VALUES(?,?,0,?,?,?,?,?,'Cloned — review and enable')").bind(crypto.randomUUID(),target,s.repeat_type,s.days,s.dates,s.send_time,s.schedule_action));
     }
    }
    detail='Cloned '+[receiver?'receiver settings':null,schedules?'schedules':null].filter(Boolean).join(' and ')+' to '+dest.name+' ('+mode+'). No location, tank, Veeder-Root, or collector configuration copied.';
   }
  if(action==='save'){
   if(b.id&&!row)fail('Location no longer exists.',404);
   const c=validateConfig({...b.config,icon:b.config?.icon||(row?JSON.parse(row.config).icon:'fuel')||'fuel'});detail=`Saved location ${c.name}; ${c.tanks.length} tanks.`;
   if(row){
    const oldConfig=JSON.parse(row.config),previous=oldConfig.tanks||[],numbers=new Set(c.tanks.map(t=>Number(t.number)));
    const connectionFields=['model','host','port','interval','enabled'];
    const connectionChanged=connectionFields.some(field=>JSON.stringify(oldConfig[field])!==JSON.stringify(c[field]));
    if(connectionChanged&&(typeof verifyMasterPassword!=='function'||!await verifyMasterPassword(b.password)))fail('Enter the Master Admin password to change Veeder-Root connection settings.',403);
    if(previous.some(t=>!numbers.has(Number(t.number)))&&(typeof verifyPassword!=='function'||!await verifyPassword(b.password)))fail('Enter the signed-in admin password before removing saved tanks.',403);
   }
   const before=row?JSON.parse(row.config):{};
   for(const field of Object.keys(c))if(JSON.stringify(before[field])!==JSON.stringify(c[field]))changes.push({field,before:before[field]??null,after:c[field]});
   jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_locations(id,config) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config').bind(id,JSON.stringify(c)));
  }
  if(action==='pair'){
   if(row.token_hash&&(typeof verifyMasterPassword!=='function'||!await verifyMasterPassword(b.password)))fail('The Master Admin password is incorrect.',403);
   token=crypto.randomUUID()+crypto.randomUUID();detail=`Rotated collector credential for ${JSON.parse(row.config).name}.`;
   jobs.push(env.DB.prepare('UPDATE fuel_monitor_locations SET token_hash=? WHERE id=?').bind(await digest(token),id));
  }
  if(action==='delete'){
   if(typeof verifyPassword!=='function'||!await verifyPassword(b.password))fail('The signed-in admin password is incorrect.',403);
   if(await env.DB.prepare('SELECT id FROM fuel_monitor_deleted_locations WHERE id=?').bind(id).first())fail('This location is already archived.',409);
   detail=`Archived location ${JSON.parse(row.config).name}. The collector identity is preserved for recovery.`;
   jobs.push(
    env.DB.prepare('INSERT OR REPLACE INTO fuel_monitor_archived_schedules(id,location_id,enabled,repeat_type,days,dates,send_time,schedule_action,last_run_at,last_status,created_at) SELECT id,location_id,enabled,repeat_type,days,dates,send_time,schedule_action,last_run_at,last_status,created_at FROM fuel_monitor_schedule_items WHERE location_id=?').bind(id),
     env.DB.prepare('DELETE FROM fuel_monitor_schedule_items WHERE location_id=?').bind(id),
     env.DB.prepare('INSERT INTO fuel_monitor_deleted_locations(id,config,token_hash,reading,last_observed,last_contact,error,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,row.config,row.token_hash,row.reading,row.last_observed,row.last_contact,row.error,row.created_at),
    env.DB.prepare('DELETE FROM fuel_monitor_locations WHERE id=?').bind(id)
   );
   jobs.push(env.DB.prepare("UPDATE fuel_monitor_alerts SET acknowledged=1,email_status=CASE WHEN email_status='pending' THEN 'cancelled' ELSE email_status END,sms_status=CASE WHEN sms_status='pending' THEN 'cancelled' ELSE sms_status END WHERE location_id=?").bind(id));
  }
  if(action==='acknowledge'){
   if(!Number.isSafeInteger(b.alert_id))fail('Choose an alert.');
   const alert=await env.DB.prepare('SELECT id,tank_number,level FROM fuel_monitor_alerts WHERE id=? AND location_id=?').bind(b.alert_id,id).first();
   if(!alert)fail('Fuel alert no longer exists.',404);
   jobs.push(env.DB.prepare('UPDATE fuel_monitor_alerts SET acknowledged=1 WHERE id=? AND location_id=?').bind(b.alert_id,id));
   if(Number(alert.tank_number)>0&&['low','critical'].includes(String(alert.level))){
    jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_mutes(location_id,tank_number,acknowledged_alert_id) VALUES(?,?,?) ON CONFLICT(location_id,tank_number) DO UPDATE SET acknowledged_alert_id=excluded.acknowledged_alert_id,created_at=CURRENT_TIMESTAMP').bind(id,Number(alert.tank_number),b.alert_id));
    detail=`Acknowledged fuel alert ${b.alert_id}; Tank ${alert.tank_number} Low/Critical alerts muted until recovery.`;
   }else{
    detail='Acknowledged fuel alert '+b.alert_id;
   }
  }
  if(action==='send_reading'){
   const config=JSON.parse(row.config),reading=row.reading?JSON.parse(row.reading):null;
   if(!config.tanks?.length)fail('Tank re-detection is pending. Wait for the next collector reading.',409);
   if(!reading?.tanks?.length)fail('No saved fuel reading is available for this location yet.',409);
   const portalEnabled=config.portal!==false;
   const emailEnabled=!!config.email&&!!String(config.email_to||'').trim();
   const smsEnabled=!!config.sms&&!!String(config.sms_to||'').trim();
   if(!portalEnabled&&!emailEnabled&&!smsEnabled)fail('No fuel-reading delivery option is enabled for this location.',409);
   const message=allTankMessage(config,reading,{headline:`${config.name} — Manual fuel reading`});
   jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_alerts(location_id,tank_number,level,message,portal,email_to,sms_to,email_status,sms_status) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(
      id,0,'reading',message,
      portalEnabled?1:0,
      emailEnabled?config.email_to:'',
      smsEnabled?config.sms_to:'',
      emailEnabled?'pending':'off',
      smsEnabled?'pending':'off'
    ));
   const channels=[portalEnabled?'portal':null,emailEnabled?'email':null,smsEnabled?'sms':null].filter(Boolean).join(', ');
   detail=`Sent current fuel reading for ${config.name} via ${channels}.`;
  }
  if(typeof auditStatement!=='function')fail('Admin tracking is unavailable.',503);
  if(action!=='acknowledge')jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_history(location_id,location_name,actor,action,changes) VALUES(?,?,?,?,?)').bind(id,action==='save'?str(b.config.name,100):JSON.parse(row.config).name,str(actor?.name||'Admin',160),action,JSON.stringify(changes.length?changes:[{field:action,before:null,after:detail}])));
  jobs.push(await auditStatement({action:'fuel_monitor_'+action,id,detail}));await env.DB.batch(jobs);
  return reply({success:true,id,...(token?{token}: {}),...(cloneSummary?{clone_summary:cloneSummary}:{})});
 }catch(e){console.error('fuel monitor admin',e);return reply({success:false,error:e.status?e.message:'Fuel monitoring could not be saved. Please retry.'},e.status||500)}
}
export async function agent(request,env){
 let locked=false,id='';
 try{
  await ensure(env);const u=new URL(request.url);id=u.searchParams.get('location')||'';
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  let row=await env.DB.prepare('SELECT * FROM fuel_monitor_locations WHERE id=?').bind(id).first();
  const hashed=token?await digest(token):'';
  if(!row){
   const alias=await env.DB.prepare('SELECT * FROM fuel_monitor_collector_aliases WHERE original_id=?').bind(id).first();
   if(alias&&hashed===alias.token_hash){
    const target=await env.DB.prepare('SELECT * FROM fuel_monitor_locations WHERE id=?').bind(alias.target_id).first();
    if(target&&target.token_hash===alias.token_hash){id=alias.target_id;row=target;}
   }
  }
  if(!row?.token_hash||!token||hashed!==row.token_hash)fail('Collector authentication failed.',401);
  let config=JSON.parse(row.config);
  if(request.method==='GET')return reply({success:true,config:{host:config.host,port:config.port,interval:config.interval,enabled:config.enabled}});
  if(request.method!=='POST')fail('Use GET or POST.',405);
  const b=await bodyOf(request);if(!config.enabled)fail('Monitoring is paused.',409);
  const now=Date.now(),at=Date.parse(b.observed_at);
  if(!Number.isFinite(at)||at>now+60000||at<now-600000)fail('Reading is stale or collector clock is incorrect.');
  const claimed=await env.DB.prepare('UPDATE fuel_monitor_locations SET lock_until=? WHERE id=? AND lock_until<? RETURNING id').bind(now+30000,id,now).first();
  if(!claimed)fail('A reading is already being saved.',409);locked=true;
  const current=await env.DB.prepare('SELECT last_observed,config FROM fuel_monitor_locations WHERE id=?').bind(id).first();
  if(!current?.config)fail('Location no longer exists.',404);
  config=JSON.parse(current.config);
  if(!config.enabled)fail('Monitoring is paused.',409);
  if(current?.last_observed&&at<=Date.parse(current.last_observed))return reply({success:true,ignored:true});
  if(b.error){await env.DB.prepare('UPDATE fuel_monitor_locations SET error=?,last_contact=? WHERE id=?').bind(str(b.error,500),new Date(now).toISOString(),id).run();return reply({success:true});}
  if(b.units!=='US gallons'||!Array.isArray(b.tanks)||!b.tanks.length||b.tanks.length>64)fail('Expected a complete inventory report in US gallons.');
  const seen=new Set(),tanks=b.tanks.map(t=>{
   const n=Number(t.number),v=Number(t.volume);
   if(!Number.isInteger(n)||n<1||n>99||seen.has(n)||t.volume==null||!Number.isFinite(v)||v<0||v>1000000)fail('Invalid tank reading.');seen.add(n);
   const clean={number:n,fuel:str(t.fuel,80),volume:v};
   for(const k of ['tc_volume','ullage','height','water','temperature'])if(t[k]!=null){const v=Number(t[k]);if(!Number.isFinite(v))fail('Invalid '+k);clean[k]=v;}
   return clean;
  });
  const autoAdded=addDetectedTanks(config,tanks);
  const reading={observed_at:new Date(at).toISOString(),units:'US gallons',site_header:str(b.site_header,1000),report_time:str(b.report_time,80),tanks};
  if(b.monitor_status!=null){
   const status=b.monitor_status;
   if(!['normal','reported','unavailable'].includes(status.state))fail('Invalid monitor status.');
   reading.monitor_status={state:status.state,report:str(status.report,12000),error:str(status.error,400),observed_at:reading.observed_at};
   if(status.state==='normal'&&reading.monitor_status.report.trim()!=='ALL FUNCTIONS NORMAL')fail('Unverified normal status.');
   if(status.state==='reported'&&!reading.monitor_status.report)fail('Missing monitor report.');
  }
  const states=new Map((await env.DB.prepare('SELECT tank_number,level FROM fuel_monitor_states WHERE location_id=?').bind(id).all()).results.map(s=>[s.tank_number,s.level]));
  const mutedTanks=new Set((await env.DB.prepare('SELECT tank_number FROM fuel_monitor_mutes WHERE location_id=?').bind(id).all()).results.map(s=>Number(s.tank_number)));
  const jobs=[];
  if(autoAdded.length){
   jobs.push(env.DB.prepare('UPDATE fuel_monitor_locations SET config=? WHERE id=?').bind(JSON.stringify(config),id));
   jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_history(location_id,location_name,actor,action,changes) VALUES(?,?,?,?,?)')
    .bind(id,config.name,'Station collector','auto_detect_tanks',JSON.stringify(autoAdded.map(t=>({field:'tank '+t.number,before:null,after:{number:t.number,fuel:t.fuel,capacity:t.capacity,mode:t.mode,alerts:t.alerts}})))));
  }
  for(const tank of config.tanks){
   const r=tanks.find(t=>t.number===tank.number);if(!r)continue;
   // Never treat a missing tank as zero gallons. Ignore implausible readings for alerts.
   if(r.volume>tank.capacity*1.05)continue;
   const previous=states.get(tank.number)||'normal';
   // Disabling alerts must not create a fabricated recovery event.
   const level=tank.alerts?levelFor(tank,r.volume,previous):'normal';
   const muted=mutedTanks.has(Number(tank.number));
   jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_states(location_id,tank_number,level) VALUES(?,?,?) ON CONFLICT(location_id,tank_number) DO UPDATE SET level=excluded.level').bind(id,tank.number,level));

   // Acknowledging a Low/Critical alert mutes further Low/Critical notifications for
   // this tank until the reading reaches the configured Recovery level. Recovery
   // itself is still allowed to create the normal "fuel recovered" notification,
   // and it automatically re-arms the tank for the next Low/Critical cycle.
   if(muted&&level==='normal'&&tank.alerts){
    jobs.push(env.DB.prepare('DELETE FROM fuel_monitor_mutes WHERE location_id=? AND tank_number=?').bind(id,tank.number));
   }

   if(tank.alerts&&level!==previous){
    const suppressLowCritical=muted&&level==='low'; // Critical escalation must reach administrators even after Low acknowledgment.
    if(!suppressLowCritical){
     const eventTitle=level==='normal'?'FUEL RECOVERED':level==='critical'?'CRITICAL FUEL ALERT':'LOW FUEL ALERT';
     const triggerText=`${eventTitle} — ${config.name} — Tank ${tank.number}: ${tank.fuel} — ${r.volume.toLocaleString('en-US')} gal (${(r.volume/tank.capacity*100).toFixed(1)}%).`;
     const message=allTankMessage(config,reading,{headline:triggerText,triggerTank:tank.number,triggerLevel:level});
     jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_alerts(location_id,tank_number,level,message,portal,email_to,sms_to,email_status,sms_status) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,tank.number,level,message,config.portal?1:0,config.email_to,config.sms_to,config.email?'pending':'off',config.sms?'pending':'off'));
    }
   }
  }
  for(const t of tanks)jobs.push(env.DB.prepare('INSERT OR IGNORE INTO fuel_monitor_tank_readings(location_id,tank_number,observed_at,volume) VALUES(?,?,?,?)').bind(id,t.number,reading.observed_at,t.volume));
  for(const t of tanks)jobs.push(env.DB.prepare('INSERT OR IGNORE INTO fuel_monitor_tank_reading_details(location_id,tank_number,observed_at,water,temperature) VALUES(?,?,?,?,?)').bind(id,t.number,reading.observed_at,t.water??null,t.temperature??null));
  jobs.push(env.DB.prepare('UPDATE fuel_monitor_locations SET reading=?,last_observed=?,last_contact=?,error=NULL WHERE id=?').bind(JSON.stringify(reading),reading.observed_at,new Date(now).toISOString(),id));
  await env.DB.batch(jobs);return reply({success:true});
 }catch(e){console.error('fuel monitor collector',e);return reply({success:false,error:e.status?e.message:'Reading could not be stored.'},e.status||500)}
 finally{if(locked)await env.DB.prepare('UPDATE fuel_monitor_locations SET lock_until=0 WHERE id=?').bind(id).run();}
}
// Central-time scheduled fuel-reading delivery uses the most recent station reading;
// the Worker never connects directly to a TLS-350 device.
function publicSchedule(s){return {id:s.id,enabled:!!s.enabled,repeat:s.repeat_type,days:String(s.days||'').split(',').filter(Boolean).map(Number),dates:String(s.dates||'').split(',').filter(Boolean),time:s.send_time,action:s.schedule_action,last_run_at:s.last_run_at,last_status:s.last_status};}
export function validateMultiSchedule(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Enter a valid schedule.');
 const repeat=['daily','weekly','dates'].includes(input.repeat)?input.repeat:'weekly';
 const days=Array.isArray(input.days)?[...new Set(input.days.map(Number))].sort((a,b)=>a-b):[];
 if(days.some(x=>!Number.isInteger(x)||x<0||x>6)||(repeat==='weekly'&&!days.length))fail('Choose valid weekdays.');
 const dates=Array.isArray(input.dates)?[...new Set(input.dates.map(x=>String(x)))].sort():[];
 if(dates.length>100||dates.some(s=>!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)||(repeat==='dates'&&!dates.length))fail('Choose valid calendar dates.');
 const time=String(input.time||'');if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))fail('Choose a valid Central time.');
 const action=['upload','send'].includes(input.action)?input.action:null;if(!action)fail('Choose a schedule action.');
 return {enabled:input.enabled===true,repeat,days:repeat==='daily'?[0,1,2,3,4,5,6]:repeat==='weekly'?days:[],dates:repeat==='dates'?dates:[],time,action};
}
export function validateAutomaticReadingSchedule(input){
 if(!input||typeof input!=='object')fail('Enter the automatic reading schedule.');
 if(typeof input.enabled!=='boolean')fail('Choose whether automatic sending is enabled.');
 if(!Array.isArray(input.days)||!input.days.length||input.days.length>7)fail('Choose at least one day.');
 const days=[...new Set(input.days.map(Number))].sort((a,b)=>a-b);
 if(days.some(day=>!Number.isInteger(day)||day<0||day>6))fail('Choose valid weekdays.');
 const time=String(input.time||'');
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))fail('Select a valid sending time.');
 return {enabled:input.enabled,days,time};
}
export function centralScheduleParts(date){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 const weekdays={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
 return {date:`${parts.year}-${parts.month}-${parts.day}`,weekday:weekdays[parts.weekday],minute:Number(parts.hour)*60+Number(parts.minute)};
}
export function automaticReadingDue(schedule,at){
 if(!schedule||!Number(schedule.enabled))return false;
 if(schedule.repeat_type==='dates'&&!String(schedule.dates||'').split(',').includes(at.date))return false;
 if(schedule.repeat_type==='weekly'&&!String(schedule.days||'').split(',').map(Number).includes(at.weekday))return false;
 const match=/^(\d{2}):(\d{2})$/.exec(schedule.send_time||'');if(!match)return false;
 const due=Number(match[1])*60+Number(match[2]);return at.minute>=due&&at.minute-due<=15;
}
// Scan all active paired locations, independent of the automatic-report schedule.
// Each transition is claimed in D1 so a frequent cron never repeats a loss alert.
export async function checkCollectorConnections(env,now=new Date()){
 await ensure(env);
 const records=(await env.DB.prepare('SELECT id,config,token_hash,last_observed,created_at FROM fuel_monitor_locations').all()).results||[];
 let events=0;
 for(const record of records){
  try{
   const config=JSON.parse(record.config||'{}');
   if(!config.enabled||!record.token_hash)continue;
   const last=Date.parse(record.last_observed||record.created_at||'');
   if(!Number.isFinite(last))continue;
   const lost=now.getTime()-last>=15*60*1000;
   const next=lost?'lost':'healthy';
   // A missing state defaults to healthy; a currently stale station creates one loss alert.
   await env.DB.prepare("INSERT INTO fuel_monitor_connection_states(location_id,state) VALUES(?,'healthy') ON CONFLICT(location_id) DO NOTHING").bind(record.id).run();
   const claimed=await env.DB.prepare("UPDATE fuel_monitor_connection_states SET state=?,changed_at=CURRENT_TIMESTAMP WHERE location_id=? AND state<>? RETURNING location_id").bind(next,record.id,next).first();
   if(!claimed)continue;
   const level=lost?'connection_lost':'connection_restored';
   const ageMinutes=Math.max(0,Math.floor((now.getTime()-last)/60000));
   const message=lost
    ?`${config.name} — CONNECTION LOST. No fresh tank readings for ${ageMinutes} minutes. Last successful reading: ${record.last_observed||'Never received'}. The displayed tank levels are last known values, not live.`
    :`${config.name} — CONNECTION RESTORED. Fresh fuel readings have resumed at ${record.last_observed}.`;
   const mail=!!config.email&&!!String(config.email_to||'').trim();
   const sms=!!config.sms&&!!String(config.sms_to||'').trim();
   try{
    await env.DB.prepare('INSERT INTO fuel_monitor_alerts(location_id,tank_number,level,message,portal,email_to,sms_to,email_status,sms_status) VALUES(?,?,?,?,?,?,?,?,?)')
     .bind(record.id,0,level,message,1,mail?config.email_to:'',sms?config.sms_to:'',mail?'pending':'off',sms?'pending':'off').run();
    events++;
   }catch(error){
    // Allow next cron to retry if an alert could not be recorded.
    await env.DB.prepare('UPDATE fuel_monitor_connection_states SET state=? WHERE location_id=?').bind(lost?'healthy':'lost',record.id).run();
    throw error;
   }
  }catch(error){console.error('Collector health check failed',record.id,error);}
 }
 return events;
}

// Retire at most one completed UTC calendar day per invocation, only AFTER durable
// hourly/daily rollups are saved. Historical snapshots live in a separate table.
// Never purge the current seven days or a day that cannot be summarized.
export async function compactFuelHistory(env,now=new Date()){
 await ensure(env);
 const cutoff=new Date(now.getTime()-7*86400000).toISOString().slice(0,10);
 const candidate=await env.DB.prepare("SELECT substr(observed_at,1,10) AS day FROM fuel_monitor_tank_readings WHERE observed_at<? ORDER BY observed_at LIMIT 1").bind(cutoff).first();
 if(!candidate?.day||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(candidate.day))return {compacted:false};
 const day=candidate.day;
 const groups=(await env.DB.prepare("SELECT location_id,tank_number,COUNT(*) AS n FROM fuel_monitor_tank_readings WHERE observed_at>=? AND observed_at<? GROUP BY location_id,tank_number").bind(day,day+'T24:00:00').all()).results||[];
 let finished=0;
 for(const group of groups){
  const loc=await env.DB.prepare('SELECT config FROM fuel_monitor_locations WHERE id=?').bind(group.location_id).first();
  // Deleted locations have no current gauge configuration: retain their raw history.
  if(!loc)continue;
  const config=JSON.parse(loc.config),tank=(config.tanks||[]).find(t=>Number(t.number)===Number(group.tank_number));
  if(!tank||!Number.isFinite(Number(tank.capacity))||Number(tank.capacity)<=0)continue;
  const cap=Number(tank.capacity);
  // An hour’s deltas only include consecutive readings at most 45 minutes apart.
  const hourly=(await env.DB.prepare(`WITH seq AS (
   SELECT observed_at,volume,LAG(volume) OVER (ORDER BY observed_at) previous_volume,
    LAG(observed_at) OVER (ORDER BY observed_at) previous_at
   FROM fuel_monitor_tank_readings WHERE location_id=? AND tank_number=? AND substr(observed_at,1,10)=?
  ) SELECT substr(observed_at,1,13) AS hour_key,
   ROUND(SUM(CASE WHEN previous_volume IS NOT NULL AND (julianday(observed_at)-julianday(previous_at))*1440 BETWEEN 0.01 AND 45
    AND previous_volume-volume>=2 AND previous_volume-volume<=? THEN previous_volume-volume ELSE 0 END),1) gallons,
   SUM(CASE WHEN previous_volume IS NOT NULL AND (julianday(observed_at)-julianday(previous_at))*1440 BETWEEN 0.01 AND 45 THEN 1 ELSE 0 END) valid_intervals,
   SUM(CASE WHEN previous_volume IS NOT NULL AND volume-previous_volume>? THEN 1 ELSE 0 END) delivery_indicators,
   SUM(CASE WHEN previous_volume IS NOT NULL AND previous_volume-volume>? THEN 1 ELSE 0 END) excluded_drops,
   COUNT(*) sample_count FROM seq GROUP BY substr(observed_at,1,13) ORDER BY hour_key`)
    .bind(group.location_id,Number(group.tank_number),day,cap*.25,Math.max(20,cap*.01),cap*.25).all()).results||[];
  if(!hourly.length||hourly.reduce((n,h)=>n+Number(h.sample_count||0),0)!==Number(group.n))continue;
  const jobs=hourly.map(h=>env.DB.prepare(`INSERT OR IGNORE INTO fuel_monitor_hourly_usage(location_id,tank_number,hour_key,gallons,valid_intervals,delivery_indicators,excluded_drops,sample_count) VALUES(?,?,?,?,?,?,?,?)`)
   .bind(group.location_id,Number(group.tank_number),h.hour_key,Number(h.gallons||0),Number(h.valid_intervals||0),Number(h.delivery_indicators||0),Number(h.excluded_drops||0),Number(h.sample_count||0)));
  const sum=k=>hourly.reduce((n,h)=>n+Number(h[k]||0),0);
  jobs.push(env.DB.prepare('INSERT OR IGNORE INTO fuel_monitor_daily_usage(location_id,tank_number,day,gallons,valid_intervals,delivery_indicators,excluded_drops,sample_count) VALUES(?,?,?,?,?,?,?,?)')
   .bind(group.location_id,Number(group.tank_number),day,Number(sum('gallons').toFixed(1)),sum('valid_intervals'),sum('delivery_indicators'),sum('excluded_drops'),sum('sample_count')));
  await env.DB.batch(jobs);
  const recorded=await env.DB.prepare('SELECT sample_count FROM fuel_monitor_daily_usage WHERE location_id=? AND tank_number=? AND day=?').bind(group.location_id,Number(group.tank_number),day).first();
  if(Number(recorded?.sample_count)!==Number(group.n))continue;
  // A successful rollup is mandatory before deleting associated detail.
  await env.DB.batch([
   env.DB.prepare('DELETE FROM fuel_monitor_tank_reading_details WHERE location_id=? AND tank_number=? AND substr(observed_at,1,10)=?').bind(group.location_id,Number(group.tank_number),day),
   env.DB.prepare('DELETE FROM fuel_monitor_tank_readings WHERE location_id=? AND tank_number=? AND substr(observed_at,1,10)=?').bind(group.location_id,Number(group.tank_number),day)
  ]);finished++;
 }
 return {compacted:finished>0,day,groups:finished};
}

export async function sendScheduledReadings(env,now=new Date()){
 await ensure(env);await checkCollectorConnections(env,now);
 const at=centralScheduleParts(now);
 const schedules=(await env.DB.prepare('SELECT s.*,l.config,l.reading,l.last_observed,l.error,l.token_hash FROM fuel_monitor_schedule_items s JOIN fuel_monitor_locations l ON l.id=s.location_id WHERE s.enabled=1').all()).results||[];
 let queued=0;
 for(const schedule of schedules){if(!automaticReadingDue(schedule,at))continue;
  try{
   const config=JSON.parse(schedule.config),reading=schedule.reading?JSON.parse(schedule.reading):null;
   const latest=Date.parse(schedule.last_observed||reading?.observed_at||'');
   const [hour,minute]=schedule.send_time.split(':').map(Number),minutesPassed=at.minute-hour*60-minute;
   // The collector reads independently; a schedule is fulfilled only by a reading observed
   // AFTER the scheduled time. Never relabel old cached inventory as a fresh reading.
   const dueAt=now.getTime()-minutesPassed*60000;
   const fresh=Number.isFinite(latest)&&latest>=dueAt-60000&&latest<=now.getTime()+60000&&!!reading?.tanks?.length;
   if(!config.enabled||!schedule.token_hash||schedule.error||!config.tanks?.length||!fresh){
    await env.DB.prepare('UPDATE fuel_monitor_schedule_items SET last_status=? WHERE id=?').bind('Waiting for a post-schedule collector reading',schedule.id).run();continue;
   }
   if(schedule.schedule_action==='send'&&!(config.portal||config.email&&config.email_to||config.sms&&config.sms_to)){
    await env.DB.prepare('UPDATE fuel_monitor_schedule_items SET last_status=? WHERE id=?').bind('No delivery methods enabled',schedule.id).run();continue;
   }
   const claimed=await env.DB.prepare('INSERT INTO fuel_monitor_schedule_runs(schedule_id,local_date) VALUES(?,?) ON CONFLICT(schedule_id,local_date) DO NOTHING RETURNING schedule_id').bind(schedule.id,at.date).first();
   if(!claimed)continue;
   try{
    const jobs=[];
    // Preserve each scheduled tank snapshot independently from seven-day raw retention.
    for(const t of reading.tanks){if(!Number.isFinite(Number(t.volume)))continue;
     jobs.push(env.DB.prepare('INSERT OR IGNORE INTO fuel_monitor_saved_snapshots(location_id,tank_number,observed_at,volume,water,temperature,schedule_id) VALUES(?,?,?,?,?,?,?)').bind(schedule.location_id,Number(t.number),reading.observed_at,Number(t.volume),t.water??null,t.temperature??null,schedule.id));
    }
    if(schedule.schedule_action==='send'){
     const email=!!config.email&&!!String(config.email_to||'').trim(),sms=!!config.sms&&!!String(config.sms_to||'').trim();
     const message=allTankMessage(config,reading,{headline:`${config.name} — Automatic fuel reading`});
     jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_alerts(location_id,tank_number,level,message,portal,email_to,sms_to,email_status,sms_status,schedule_id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(schedule.location_id,0,'scheduled_reading',message,config.portal?1:0,email?config.email_to:'',sms?config.sms_to:'',email?'pending':'off',sms?'pending':'off',schedule.id));
    }
    jobs.push(env.DB.prepare("UPDATE fuel_monitor_schedule_items SET last_run_at=?,last_status=? WHERE id=?").bind(now.toISOString(),schedule.schedule_action==='send'?'Queued for delivery':'Fresh reading saved to portal; no report sent',schedule.id));
    await env.DB.batch(jobs);queued++;
   }catch(err){await env.DB.prepare('DELETE FROM fuel_monitor_schedule_runs WHERE schedule_id=? AND local_date=?').bind(schedule.id,at.date).run();throw err;}
  }catch(e){console.error('Scheduled fuel reading failed',schedule.id,e);}
 }
 return queued;
}

export async function dispatch(env,{email,sms}){
 await ensure(env);
 // Claim before external I/O: repeated polls cannot send the same event twice.
 // Ambiguous/interrupted submissions remain visible; never silently resend SMS.
 await env.DB.prepare("UPDATE fuel_monitor_alerts SET email_status=CASE WHEN email_status='sending' THEN 'unknown' ELSE email_status END,sms_status=CASE WHEN sms_status='sending' THEN 'unknown' ELSE sms_status END WHERE created_at<datetime('now','-10 minutes') AND (email_status='sending' OR sms_status='sending')").run();
 const rows=(await env.DB.prepare("SELECT * FROM fuel_monitor_alerts WHERE email_status='pending' OR sms_status='pending' ORDER BY id LIMIT 10").all()).results;
 for(const row of rows)for(const channel of ['email','sms']){
  if(row[channel+'_status']!=='pending')continue;
  const claim=await env.DB.prepare(`UPDATE fuel_monitor_alerts SET ${channel}_status='sending' WHERE id=? AND ${channel}_status='pending' RETURNING id`).bind(row.id).first();if(!claim)continue;
  let status='submitted',detail='';
  try{
   const recipients=alertRecipients(row[channel+'_to'],channel),results=[];let succeeded=0;
   if(!recipients.length)throw Error('No alert recipients configured.');
   const locationRow=await env.DB.prepare('SELECT config,reading,last_observed,last_contact FROM fuel_monitor_locations WHERE id=?').bind(row.location_id).first();
   const context={alert:row,location:null,reading:null,last_observed:locationRow?.last_observed||'',last_contact:locationRow?.last_contact||''};
   if(locationRow){
    try{context.location=JSON.parse(locationRow.config||'null')}catch{}
    try{context.reading=JSON.parse(locationRow.reading||'null')}catch{}
   }
   for(const to of recipients){try{const r=await (channel==='email'?email(to,row.message,row.id,context):sms(to,row.message,context));succeeded++;results.push(to+': submitted ('+String(r?.id||r?.sid||'accepted')+')');}catch(e){results.push(to+': failed — '+str(e.message,200));}}
   status=succeeded===recipients.length?'submitted':succeeded?'partial':'failed';detail=results.join('\n');
  }catch(e){status='failed';detail=str(e.message,400);}

  await env.DB.prepare(`UPDATE fuel_monitor_alerts SET ${channel}_status=?,${channel}_detail=? WHERE id=?`).bind(status,detail,row.id).run();
 }
}
