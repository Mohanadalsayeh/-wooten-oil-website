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
 `CREATE TABLE IF NOT EXISTS fuel_monitor_alerts(id INTEGER PRIMARY KEY AUTOINCREMENT,location_id TEXT NOT NULL,tank_number INTEGER NOT NULL,level TEXT NOT NULL,message TEXT NOT NULL,portal INTEGER NOT NULL DEFAULT 1,acknowledged INTEGER NOT NULL DEFAULT 0,email_to TEXT,sms_to TEXT,email_status TEXT NOT NULL,sms_status TEXT NOT NULL,email_detail TEXT,sms_detail TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE INDEX IF NOT EXISTS fuel_monitor_alerts_recent ON fuel_monitor_alerts(created_at DESC,id DESC)`];
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
function locationView(row){return {id:row.id,...JSON.parse(row.config),paired:!!row.token_hash,reading:row.reading?JSON.parse(row.reading):null,last_observed:row.last_observed,last_contact:row.last_contact,error:row.error};}
async function bodyOf(request){const raw=await request.text();if(raw.length>100000)fail('Request too large.',413);try{return JSON.parse(raw)}catch{fail('Invalid JSON.')}}
export async function admin(request,env,{auditStatement,verifyPassword,verifyMasterPassword,actor}={}){
 try{
  if(!env.ADMIN_IMPORT_KEY||request.headers.get('X-Admin-Key')!==env.ADMIN_IMPORT_KEY)return reply({success:false,error:'Unauthorized'},401);
  await ensure(env);
  if(request.method==='GET'){
   const locations=(await env.DB.prepare('SELECT * FROM fuel_monitor_locations ORDER BY created_at,id').all()).results.map(locationView);
   const alerts=(await env.DB.prepare('SELECT * FROM fuel_monitor_alerts ORDER BY id DESC LIMIT 100').all()).results;
   const history=(await env.DB.prepare('SELECT * FROM fuel_monitor_history ORDER BY id DESC LIMIT 200').all()).results;
   return reply({success:true,locations,alerts,history});
  }
  if(request.method!=='POST')return reply({success:false,error:'Use GET or POST.'},405);
  const b=await bodyOf(request),action=b.action,id=b.id||crypto.randomUUID();
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))fail('Invalid location.');
  if(action==='verify_tank_removal'){
   if(typeof verifyPassword!=='function'||!await verifyPassword(b.password))fail('The signed-in admin password is incorrect.',403);
   return reply({success:true});
  }
  if(!['save','pair','delete','acknowledge'].includes(action))fail('Unknown action.');
  const row=await env.DB.prepare('SELECT * FROM fuel_monitor_locations WHERE id=?').bind(id).first();
  if(action!=='save'&&!row)fail('Location no longer exists.',404);
  if(row?.lock_until>Date.now())fail('A reading is being saved. Try again in a few seconds.',409);
  const jobs=[];let token='',detail='',changes=[];
  if(action==='save'){
   if(b.id&&!row)fail('Location no longer exists.',404);
   const c=validateConfig({...b.config,icon:b.config?.icon||(row?JSON.parse(row.config).icon:'fuel')||'fuel'});detail=`Saved location ${c.name}; ${c.tanks.length} tanks.`;
   if(row){
    const previous=JSON.parse(row.config).tanks||[],numbers=new Set(c.tanks.map(t=>Number(t.number)));
    if(previous.some(t=>!numbers.has(Number(t.number)))&&(typeof verifyPassword!=='function'||!await verifyPassword(b.password)))fail('Enter the signed-in admin password before removing saved tanks.',403);
   }
   const before=row?JSON.parse(row.config):{};
   for(const field of Object.keys(c))if(JSON.stringify(before[field])!==JSON.stringify(c[field]))changes.push({field,before:before[field]??null,after:c[field]});
   jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_locations(id,config) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config').bind(id,JSON.stringify(c)));
  }
  if(action==='pair'){
   if(row.token_hash&&(typeof verifyMasterPassword!=='function'||!await verifyMasterPassword(b.password)))fail('The main admin password is incorrect.',403);
   token=crypto.randomUUID()+crypto.randomUUID();detail=`Rotated collector credential for ${JSON.parse(row.config).name}.`;
   jobs.push(env.DB.prepare('UPDATE fuel_monitor_locations SET token_hash=? WHERE id=?').bind(await digest(token),id));
  }
  if(action==='delete'){
   if(typeof verifyPassword!=='function'||!await verifyPassword(b.password))fail('The signed-in admin password is incorrect.',403);
   detail=`Deleted location ${JSON.parse(row.config).name} and its tank readings. Alert history retained.`;
   jobs.push(env.DB.prepare('DELETE FROM fuel_monitor_states WHERE location_id=?').bind(id),env.DB.prepare('DELETE FROM fuel_monitor_locations WHERE id=?').bind(id));
   jobs.push(env.DB.prepare("UPDATE fuel_monitor_alerts SET acknowledged=1,email_status=CASE WHEN email_status='pending' THEN 'cancelled' ELSE email_status END,sms_status=CASE WHEN sms_status='pending' THEN 'cancelled' ELSE sms_status END WHERE location_id=?").bind(id));
  }
  if(action==='acknowledge'){
   if(!Number.isSafeInteger(b.alert_id))fail('Choose an alert.');
   jobs.push(env.DB.prepare('UPDATE fuel_monitor_alerts SET acknowledged=1 WHERE id=? AND location_id=?').bind(b.alert_id,id));detail='Acknowledged fuel alert '+b.alert_id;
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
  const config=JSON.parse(row.config);
  if(request.method==='GET')return reply({success:true,config:{host:config.host,port:config.port,interval:config.interval,enabled:config.enabled}});
  if(request.method!=='POST')fail('Use GET or POST.',405);
  const b=await bodyOf(request);if(!config.enabled)fail('Monitoring is paused.',409);
  const now=Date.now(),at=Date.parse(b.observed_at);
  if(!Number.isFinite(at)||at>now+60000||at<now-600000)fail('Reading is stale or collector clock is incorrect.');
  const claimed=await env.DB.prepare('UPDATE fuel_monitor_locations SET lock_until=? WHERE id=? AND lock_until<? RETURNING id').bind(now+30000,id,now).first();
  if(!claimed)fail('A reading is already being saved.',409);locked=true;
  const current=await env.DB.prepare('SELECT last_observed FROM fuel_monitor_locations WHERE id=?').bind(id).first();
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
  const reading={observed_at:new Date(at).toISOString(),units:'US gallons',site_header:str(b.site_header,1000),report_time:str(b.report_time,80),tanks};
  if(b.monitor_status!=null){
   const status=b.monitor_status;
   if(!['normal','reported','unavailable'].includes(status.state))fail('Invalid monitor status.');
   reading.monitor_status={state:status.state,report:str(status.report,12000),error:str(status.error,400),observed_at:reading.observed_at};
   if(status.state==='normal'&&reading.monitor_status.report.trim()!=='ALL FUNCTIONS NORMAL')fail('Unverified normal status.');
   if(status.state==='reported'&&!reading.monitor_status.report)fail('Missing monitor report.');
  }
  const states=new Map((await env.DB.prepare('SELECT tank_number,level FROM fuel_monitor_states WHERE location_id=?').bind(id).all()).results.map(s=>[s.tank_number,s.level]));
  const jobs=[];
  for(const tank of config.tanks){
   const r=tanks.find(t=>t.number===tank.number);if(!r)continue;
   // Never treat a missing tank as zero gallons. Ignore implausible readings for alerts.
   if(r.volume>tank.capacity*1.05)continue;
   const previous=states.get(tank.number)||'normal',level=tank.alerts?levelFor(tank,r.volume,previous):'normal';
   jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_states(location_id,tank_number,level) VALUES(?,?,?) ON CONFLICT(location_id,tank_number) DO UPDATE SET level=excluded.level').bind(id,tank.number,level));
   if(level!==previous){
    const message=`${config.name} — Tank ${tank.number} (${tank.fuel}): ${level==='normal'?'fuel recovered':level+' fuel'}. ${r.volume.toLocaleString('en-US')} US gallons (${(r.volume/tank.capacity*100).toFixed(1)}%). Reading ${reading.observed_at}.`;
    jobs.push(env.DB.prepare('INSERT INTO fuel_monitor_alerts(location_id,tank_number,level,message,portal,email_to,sms_to,email_status,sms_status) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,tank.number,level,message,config.portal?1:0,config.email_to,config.sms_to,config.email?'pending':'off',config.sms?'pending':'off'));
   }
  }
  jobs.push(env.DB.prepare('UPDATE fuel_monitor_locations SET reading=?,last_observed=?,last_contact=?,error=NULL WHERE id=?').bind(JSON.stringify(reading),reading.observed_at,new Date(now).toISOString(),id));
  await env.DB.batch(jobs);return reply({success:true});
 }catch(e){console.error('fuel monitor collector',e);return reply({success:false,error:e.status?e.message:'Reading could not be stored.'},e.status||500)}
 finally{if(locked)await env.DB.prepare('UPDATE fuel_monitor_locations SET lock_until=0 WHERE id=?').bind(id).run();}
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
   for(const to of recipients){try{const r=await (channel==='email'?email(to,row.message,row.id):sms(to,row.message));succeeded++;results.push(to+': submitted ('+String(r?.id||r?.sid||'accepted')+')');}catch(e){results.push(to+': failed — '+str(e.message,200));}}
   status=succeeded===recipients.length?'submitted':succeeded?'partial':'failed';detail=results.join('\n');
  }catch(e){status='failed';detail=str(e.message,400);}

  await env.DB.prepare(`UPDATE fuel_monitor_alerts SET ${channel}_status=?,${channel}_detail=? WHERE id=?`).bind(status,detail,row.id).run();
 }
}
