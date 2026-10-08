// Read-only station telemetry. The Worker never connects to a tank gauge directly.
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const str=(v,max=160)=>String(v??'').trim().slice(0,max);
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');
export async function ensure(env){
 const sql=[
 `CREATE TABLE IF NOT EXISTS fuel_monitor_history(id INTEGER PRIMARY KEY AUTOINCREMENT,location_id TEXT NOT NULL,location_name TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,changes TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_locations(id TEXT PRIMARY KEY,config TEXT NOT NULL,token_hash TEXT,reading TEXT,last_observed TEXT,last_contact TEXT,error TEXT,lock_until INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_states(location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,level TEXT NOT NULL,PRIMARY KEY(location_id,tank_number))`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_mutes(location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,acknowledged_alert_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(location_id,tank_number))`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_alerts(id INTEGER PRIMARY KEY AUTOINCREMENT,location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,level TEXT NOT NULL,message TEXT NOT NULL,portal INTEGER NOT NULL DEFAULT 1,acknowledged INTEGER NOT NULL DEFAULT 0,email_to TEXT,sms_to TEXT,email_status TEXT NOT NULL,sms_status TEXT NOT NULL,email_detail TEXT,sms_detail TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE INDEX IF NOT EXISTS fuel_monitor_alerts_recent ON fuel_monitor_alerts(created_at DESC,id DESC)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_schedules(location_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',send_time TEXT NOT NULL DEFAULT '08:00',last_sent_at TEXT,last_sent_date TEXT,last_status TEXT)`,
 `CREATE TABLE IF NOT EXISTS fuel_monitor_scheduled_runs(location_id TEXT NOT NULL,local_date TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(location_id,local_date))`];
 for(const s of sql)await env.DB.prepare(s).run();
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
 const value=tank.mode==='percent'?volume/tank.capacity*100:volume;
 if(value<=tank.critical)return 'critical';
 if(value<=tank.low)return 'low';
 if(previous!=='normal'&&value<tank.recovery)return previous;
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
   const scheduleRows=(await env.DB.prepare('SELECT * FROM fuel_monitor_schedules').all()).results||[];
   const byId=new Map(scheduleRows.map(s=>[s.location_id,s]));
   const locations=(await env.DB.prepare('SELECT * FROM fuel_monitor_locations ORDER BY created_at,id').all()).results.map(row=>{
    const s=byId.get(row.id);
    return {...locationView(row),auto_reading:s?{enabled:!!s.enabled,days:String(s.days||'').split(',').map(Number).filter(Number.isInteger),time:s.send_time,last_sent_at:s.last_sent_at,last_sent_date:s.last_sent_date,last_status:s.last_status}:{enabled:false,days:[0,1,2,3,4,5,6],time:'08:00',last_sent_at:null,last_status:null}};
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
   return reply({success:true,locations,alerts,history,target_alert});
  }
  if(request.method!=='POST')return reply({success:false,error:'Use GET or POST.'},405);
  const b=await bodyOf(request),action=b.action,id=b.id||crypto.randomUUID();
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))fail('Invalid location.');
  if(action==='verify_tank_removal'){
   if(typeof verifyPassword!=='function'||!await verifyPassword(b.password))fail('The signed-in admin password is incorrect.',403);
   return reply({success:true});
  }
  if(!['save','pair','delete','acknowledge','send_reading','schedule_save','verify_connection_edit','reset_tanks'].includes(action))fail('Unknown action.');
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
  const jobs=[];let token='',detail='',changes=[];
  if(action==='schedule_save'){
   const schedule=validateAutomaticReadingSchedule(b.schedule);
   const old=await env.DB.prepare('SELECT enabled,days,send_time FROM fuel_monitor_schedules WHERE location_id=?').bind(id).first();
   const config=JSON.parse(row.config);
   if(schedule.enabled&&!(config.portal||config.email&&config.email_to||config.sms&&config.sms_to))fail('Enable a portal, email, or SMS sending option for this location first.',409);
   const before=old?{enabled:!!old.enabled,days:String(old.days).split(',').map(Number),time:old.send_time}:{enabled:false,days:[0,1,2,3,4,5,6],time:'08:00'};
   detail=`Automatic fuel reading schedule ${schedule.enabled?'enabled':'disabled'} for ${config.name}: ${schedule.days.join(',')} at ${schedule.time} Central Time.`;
   changes=[{field:'automatic_fuel_reading_schedule',before,after:schedule}];
   jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_schedules(location_id,enabled,days,send_time,last_status) VALUES(?,?,?,?,?) ON CONFLICT(location_id) DO UPDATE SET enabled=excluded.enabled,days=excluded.days,send_time=excluded.send_time,last_status=excluded.last_status').bind(id,schedule.enabled?1:0,schedule.days.join(','),schedule.time,schedule.enabled?'Scheduled':'Disabled'));
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
   detail=`Deleted location ${JSON.parse(row.config).name} and its tank readings. Alert history retained.`;
   jobs.push(
    env.DB.prepare('DELETE FROM fuel_monitor_states WHERE location_id=?').bind(id),
    env.DB.prepare('DELETE FROM fuel_monitor_mutes WHERE location_id=?').bind(id),
    env.DB.prepare('DELETE FROM fuel_monitor_schedules WHERE location_id=?').bind(id),
    env.DB.prepare('DELETE FROM fuel_monitor_scheduled_runs WHERE location_id=?').bind(id),
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
  return reply({success:true,id,...(token?{token}: {})});
 }catch(e){console.error('fuel monitor admin',e);return reply({success:false,error:e.status?e.message:'Fuel monitoring could not be saved. Please retry.'},e.status||500)}
}
export async function agent(request,env){
 let locked=false,id='';
 try{
  await ensure(env);const u=new URL(request.url);id=u.searchParams.get('location')||'';
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  const row=await env.DB.prepare('SELECT * FROM fuel_monitor_locations WHERE id=?').bind(id).first();
  if(!row?.token_hash||!token||await digest(token)!==row.token_hash)fail('Collector authentication failed.',401);
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
   const previous=states.get(tank.number)||'normal',level=tank.alerts?levelFor(tank,r.volume,previous):'normal';
   const muted=mutedTanks.has(Number(tank.number));
   jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_states(location_id,tank_number,level) VALUES(?,?,?) ON CONFLICT(location_id,tank_number) DO UPDATE SET level=excluded.level').bind(id,tank.number,level));

   // Acknowledging a Low/Critical alert mutes further Low/Critical notifications for
   // this tank until the reading reaches the configured Recovery level. Recovery
   // itself is still allowed to create the normal "fuel recovered" notification,
   // and it automatically re-arms the tank for the next Low/Critical cycle.
   if(muted&&level==='normal'){
    jobs.push(env.DB.prepare('DELETE FROM fuel_monitor_mutes WHERE location_id=? AND tank_number=?').bind(id,tank.number));
   }

   if(level!==previous){
    const suppressLowCritical=muted&&(level==='low'||level==='critical');
    if(!suppressLowCritical){
     const triggerText=`${config.name} — Tank ${tank.number} (${tank.fuel}): ${level==='normal'?'fuel recovered':level+' fuel'}. ${r.volume.toLocaleString('en-US')} US gallons (${(r.volume/tank.capacity*100).toFixed(1)}%).`;
     const message=allTankMessage(config,reading,{headline:triggerText,triggerTank:tank.number,triggerLevel:level});
     jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_alerts(location_id,tank_number,level,message,portal,email_to,sms_to,email_status,sms_status) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,tank.number,level,message,config.portal?1:0,config.email_to,config.sms_to,config.email?'pending':'off',config.sms?'pending':'off'));
    }
   }
  }
  jobs.push(env.DB.prepare('UPDATE fuel_monitor_locations SET reading=?,last_observed=?,last_contact=?,error=NULL WHERE id=?').bind(JSON.stringify(reading),reading.observed_at,new Date(now).toISOString(),id));
  await env.DB.batch(jobs);return reply({success:true});
 }catch(e){console.error('fuel monitor collector',e);return reply({success:false,error:e.status?e.message:'Reading could not be stored.'},e.status||500)}
 finally{if(locked)await env.DB.prepare('UPDATE fuel_monitor_locations SET lock_until=0 WHERE id=?').bind(id).run();}
}
// Central-time scheduled fuel-reading delivery uses the most recent station reading;
// the Worker never connects directly to a TLS-350 device.
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
 const days=String(schedule.days||'').split(',').map(Number);
 if(!days.includes(at.weekday))return false;
 const match=/^(\d{2}):(\d{2})$/.exec(schedule.send_time||'');
 if(!match)return false;
 const due=Number(match[1])*60+Number(match[2]);
 return at.minute>=due&&at.minute-due<=15;
}
export async function sendScheduledReadings(env,now=new Date()){
 await ensure(env);
 const at=centralScheduleParts(now);
 const schedules=(await env.DB.prepare('SELECT s.location_id,s.enabled,s.days,s.send_time,l.config,l.reading,l.last_observed,l.error,l.token_hash FROM fuel_monitor_schedules s JOIN fuel_monitor_locations l ON l.id=s.location_id WHERE s.enabled=1').all()).results||[];
 let queued=0;
 for(const schedule of schedules){
  if(!automaticReadingDue(schedule,at))continue;
  try{
   const config=JSON.parse(schedule.config);
   if(!config.tanks?.length){
    await env.DB.prepare('UPDATE fuel_monitor_schedules SET last_status=? WHERE location_id=?').bind('Waiting for tank re-detection',schedule.location_id).run();
    continue;
   }
   const reading=schedule.reading?JSON.parse(schedule.reading):null;
   const latest=Date.parse(schedule.last_observed||reading?.observed_at||'');
   // Do not send outdated readings as though they were current.
   const maxAgeMs=Math.max(600,Math.min(Number(config.interval)||300,86400)*2)*1000;
   if(!config.enabled||!schedule.token_hash||schedule.error||!reading?.tanks?.length||!Number.isFinite(latest)||now.getTime()-latest>maxAgeMs||latest>now.getTime()+60000){
    await env.DB.prepare('UPDATE fuel_monitor_schedules SET last_status=? WHERE location_id=?').bind('Waiting for a fresh collector reading',schedule.location_id).run();
    continue;
   }
   const portalEnabled=!!config.portal;
   const emailEnabled=!!config.email&&!!String(config.email_to||'').trim();
   const smsEnabled=!!config.sms&&!!String(config.sms_to||'').trim();
   if(!portalEnabled&&!emailEnabled&&!smsEnabled){
    await env.DB.prepare('UPDATE fuel_monitor_schedules SET last_status=? WHERE location_id=?').bind('No sending options enabled',schedule.location_id).run();
    continue;
   }
   // One authoritative atomic claim for each location and Central calendar day.
   const claimed=await env.DB.prepare('INSERT INTO fuel_monitor_scheduled_runs(location_id,local_date) VALUES(?,?) ON CONFLICT(location_id,local_date) DO NOTHING RETURNING location_id').bind(schedule.location_id,at.date).first();
   if(!claimed)continue;
   const message=allTankMessage(config,reading,{headline:`${config.name} — Automatic fuel reading`});
   try{
    await env.DB.batch([
     env.DB.prepare('INSERT INTO fuel_monitor_alerts(location_id,tank_number,level,message,portal,email_to,sms_to,email_status,sms_status) VALUES(?,?,?,?,?,?,?,?,?)').bind(schedule.location_id,0,'scheduled_reading',message,portalEnabled?1:0,emailEnabled?config.email_to:'',smsEnabled?config.sms_to:'',emailEnabled?'pending':'off',smsEnabled?'pending':'off'),
     env.DB.prepare('UPDATE fuel_monitor_schedules SET last_sent_at=?,last_sent_date=?,last_status=? WHERE location_id=?').bind(now.toISOString(),at.date,'Queued for configured delivery methods',schedule.location_id)
    ]);
    queued++;
   }catch(error){
    await env.DB.prepare('DELETE FROM fuel_monitor_scheduled_runs WHERE location_id=? AND local_date=?').bind(schedule.location_id,at.date).run();
    throw error;
   }
  }catch(error){console.error('Scheduled fuel reading failed',schedule.location_id,error);}
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
