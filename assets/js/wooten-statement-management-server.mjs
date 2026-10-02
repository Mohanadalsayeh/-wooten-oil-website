// Ver737: portal-owned statement preferences, independent of imported records.
export function defaults(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
 const first=p.year+'-'+p.month+'-01',last=new Date(Date.UTC(Number(p.year),Number(p.month),0)).getUTCDate();
 return Object.fromEntries([['A',last],['B',7],['C',14],['E',last]].map(([c,n])=>[c,{from:first,to:p.year+'-'+p.month+'-'+String(n).padStart(2,'0'),fromTime:'00:00:00',toTime:'23:59:59'}]));
}
export function validate(input){
 const out={};
 for(const c of ['A','B','C','E']){
  const r=input?.[c];if(!r)throw Error('Choose all statement periods.');
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  if(!valid(r.from)||!valid(r.to))throw Error('Choose complete dates for '+c+'.');
  const clock=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(t);
  if(!clock(r.fromTime)||!clock(r.toTime))throw Error('Choose complete times for '+c+'.');
  const fromTime=r.fromTime.length===5?r.fromTime+':00':r.fromTime,toTime=r.toTime.length===5?r.toTime+':00':r.toTime;
  if(r.from+'T'+fromTime>r.to+'T'+toTime||r.from<'2010-01-01'||Date.parse(r.to)-Date.parse(r.from)>91*86400000)throw Error('Choose an ordered period of up to 92 calendar days for '+c+'.');
  out[c]={from:r.from,to:r.to,fromTime,toTime};
 }
 return out;
}
export async function ensure(db){
 await db.prepare('CREATE TABLE IF NOT EXISTS statement_customer_preferences(account_number TEXT PRIMARY KEY,favorite INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS statement_period_preferences(id INTEGER PRIMARY KEY CHECK(id=1),periods_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
}
export async function handle(request,env){
 const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'private, no-store'}});
 if(!env.ADMIN_IMPORT_KEY||request.headers.get('X-Admin-Key')!==env.ADMIN_IMPORT_KEY)return json({success:false,error:'Unauthorized.'},401);
 try{
  await ensure(env.DB);
  if(request.method==='GET'){
   const row=await env.DB.prepare('SELECT periods_json FROM statement_period_preferences WHERE id=1').first();
   const saved=row?JSON.parse(row.periods_json):{};
   return json({success:true,periods:{...defaults(),...saved},defaults:defaults(),saved:!!row});
  }
  if(request.method!=='POST')return json({success:false,error:'Use GET or POST.'},405);
  const body=await request.json();
  if(body.action==='favorite'){
   const account=String(body.account_number||'');
   if(!/^\d{7,20}$/.test(account)||typeof body.favorite!=='boolean')throw Error('Choose a valid customer and favorite setting.');
   const customer=await env.DB.prepare('SELECT account_number FROM customers WHERE account_number=?').bind(account).first();
   if(!customer)return json({success:false,error:'Customer not found.'},404);
   await env.DB.prepare('INSERT INTO statement_customer_preferences(account_number,favorite) VALUES(?,?) ON CONFLICT(account_number) DO UPDATE SET favorite=excluded.favorite,updated_at=CURRENT_TIMESTAMP').bind(account,body.favorite?1:0).run();
   return json({success:true,account_number:account,favorite:body.favorite});
  }
  if(body.action==='periods'){
   const periods=validate(body.periods);
   await env.DB.prepare('INSERT INTO statement_period_preferences(id,periods_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET periods_json=excluded.periods_json,updated_at=CURRENT_TIMESTAMP').bind(JSON.stringify(periods)).run();
   return json({success:true,periods});
  }
  throw Error('Unknown statement preference action.');
 }catch(error){return json({success:false,error:error.message||'Statement preferences could not be saved.'},400);}
}
