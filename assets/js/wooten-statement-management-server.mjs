// Ver737: portal-owned statement preferences, independent of imported records.
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export function centralDay(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
export function defaults(statementDate=centralDay(),weeklyCutoffDay=3){
 if(statementDate instanceof Date)statementDate=centralDay(statementDate);
 if(!validDay(statementDate)||!Number.isInteger(weeklyCutoffDay)||weeklyCutoffDay<0||weeklyCutoffDay>6)throw Error('Choose a valid statement date and weekly cutoff weekday.');
 const date=new Date(statementDate+'T00:00:00Z');
 const monthEnd=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),0));
 const previousMonth=monthEnd.toISOString().slice(0,7),last=monthEnd.toISOString().slice(0,10);
 // Require a completed cutoff day: a statement dated Wednesday cannot include that unfinished Wednesday.
 const daysBack=(date.getUTCDay()-weeklyCutoffDay+7)%7||7;
 const weeklyEnd=new Date(date.getTime()-daysBack*86400000),weeklyStart=new Date(weeklyEnd.getTime()-6*86400000);
 const range=(from,to)=>({from,to,fromTime:'00:00:00',toTime:'23:59:59'});
 return {A:range(previousMonth+'-01',last),B:range(weeklyStart.toISOString().slice(0,10),weeklyEnd.toISOString().slice(0,10)),C:range(previousMonth+'-15',last),E:range(previousMonth+'-01',last)};
}
export function validate(input){
 const out={};
 for(const c of ['A','B','C','E']){
  const r=input?.[c];if(!r)throw Error('Choose all statement periods.');
  if(!validDay(r.from)||!validDay(r.to))throw Error('Choose complete dates for '+c+'.');
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
   const stored=row?JSON.parse(row.periods_json):{};
   const ranges=stored.ranges||stored;
   const cutoff=Number.isInteger(stored.weekly_cutoff_day)&&stored.weekly_cutoff_day>=0&&stored.weekly_cutoff_day<=6?stored.weekly_cutoff_day:3;
   const statementDate=centralDay();
   const recommended=defaults(statementDate,cutoff);
   return json({success:true,periods:{...recommended,...ranges},defaults:recommended,saved:!!row,
    saved_reference_date:stored.reference_date||'',weekly_cutoff_day:cutoff,statement_date:statementDate});
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
   const cutoff=Number(body.weekly_cutoff_day);
   if(!validDay(body.reference_date)||!Number.isInteger(cutoff)||cutoff<0||cutoff>6)throw Error('Choose a valid statement date and weekly cutoff day.');
   await env.DB.prepare('INSERT INTO statement_period_preferences(id,periods_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET periods_json=excluded.periods_json,updated_at=CURRENT_TIMESTAMP').bind(JSON.stringify({ranges:periods,reference_date:body.reference_date,weekly_cutoff_day:cutoff})).run();
   return json({success:true,periods,reference_date:body.reference_date,weekly_cutoff_day:cutoff});
  }
  throw Error('Unknown statement preference action.');
 }catch(error){return json({success:false,error:error.message||'Statement preferences could not be saved.'},400);}
}
