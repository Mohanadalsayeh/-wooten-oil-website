import {statementRows} from './intevacon-history.mjs';
// Ver691: account-scoped statement fleet data. No provider calls or monetary fields.
const DAY=86400000;
const text=v=>v==null?'':String(v).trim();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function validDay(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
export function shiftDay(day,days){if(!validDay(day))throw Error('Choose a valid fleet date.');return new Date(Date.parse(day+'T00:00:00Z')+days*DAY).toISOString().slice(0,10);}
export function settings(input={},frequency='weekly'){
 if(typeof input==='string'){try{input=JSON.parse(input);}catch{throw Error('Fleet statement settings could not be read.');}}
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid fleet statement settings.');
 const value={enabled:input.enabled!==false,frequency:input.frequency||frequency,ranges:{}};
 if(!['weekly','biweekly'].includes(value.frequency))throw Error('Choose weekly or biweekly for Cycle B.');
 for(const cycle of ['A','B','C','E']){
  const r=input.ranges?.[cycle]||{},from=r.from||'',to=r.to||'';
  if((from&&!validDay(from))||(to&&!validDay(to)))throw Error('Choose complete fleet From and To dates.');
  const fromTime=r.fromTime||'00:00:00',toTime=r.toTime||'23:59:59';
  if(!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(fromTime)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(toTime))throw Error('Choose valid statement times.');
  value.ranges[cycle]={from,to,fromTime,toTime};
 }
 return value;
}
export function resolve(input,date,frequency='weekly'){
 if(!validDay(date))throw Error('Choose a valid statement date.');
 const s=settings(input,frequency);
 for(const cycle of ['A','B','C','E']){
  const days=['A','E'].includes(cycle)?30:cycle==='C'||s.frequency==='biweekly'?14:7;
  const r=s.ranges[cycle];r.to=r.to||date;r.from=r.from||shiftDay(r.to,-days);
  if(r.from+'T'+r.fromTime>r.to+'T'+r.toTime)throw Error('Fleet From date must be on or before To date.');
  if(r.from<'2010-01-01'||Date.parse(r.to)-Date.parse(r.from)>91*DAY)throw Error('Choose a fleet range of no more than 92 calendar days, starting in 2010 or later.');
 }
 return s;
}
const cardFields=['card_number','status','card_type','cardholder','driver_id','driver_no','vehicle_id','vehicle_no','assigned_to','last_used_on'];
export function project(row){
 // A positive completion status is required before reported fuel can count as used.
 const complete=[2,6,7].includes(Number(row.StatusID))||['processed','complete','invoiced'].includes(text(row.Status).toLowerCase());
 const fuel=(Array.isArray(row.Details)?row.Details:[]).filter(d=>d.IsFuel===true&&(d.IsTaxProduct!==true||text(d.ProductCategory).toLowerCase()==='fuel products'));
 const products=fuel.map(d=>({name:text(d.ProductName)||text(d.ProductCode)||'Fuel',quantity:finite(d.Quantity)?d.Quantity:null}));
 const quantity=fuel.length&&fuel.every(d=>finite(d.Quantity))?fuel.reduce((n,d)=>n+d.Quantity,0):null;
 return {id:text(row.ID),card:text(row.CardNumber),received:text(row.ReceivedDateTime),merchant:[row.MerchantName,row.MerchantCity].map(text).filter(Boolean).join(' - '),status:text(row.Status)||'Unknown',driver:[row.DriverNumber,row.DriverName].map(text).filter(Boolean).join(' - '),vehicle:[row.VehicleNumber,row.VehicleDescription].map(text).filter(Boolean).join(' - '),odometer:text(row.Odometer),auth:text(row.AuthRef),invoice:text(row.InvoiceID),entry:text(row.EntryMethod),type:text(row.TranType),card_type:text(row.CardType),cardholder:text(row.CardHolderName),products,hasFuel:fuel.length>0,quantity,counted:complete&&quantity!==null,complete};
}
export async function load(env,customer,options){
 if(!options.enabled)return null;
 const cycle=['A','B','C','E'].includes(text(customer.statement_cycle).toUpperCase())?text(customer.statement_cycle).toUpperCase():'A',range=options.ranges[cycle],account=text(customer.account_number);
 if(!/^000\d{1,20}$/.test(account))return null;
 const id=account.slice(3),db=env.DB;
 const names=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('intevacon_card_control','intevacon_website_cards')").all()).results||[];
 if(names.length!==2)throw Error('Fleet cards are not ready. Complete the card sync before including fleet activity.');
 const state=await db.prepare('SELECT active_run,last_success FROM intevacon_card_control WHERE id=1').first();
 const cardRows=(await db.prepare('SELECT payload FROM intevacon_website_cards WHERE run_id=? AND account_number=? ORDER BY card_number').bind(state?.active_run||'',account).all()).results||[];
 const saved=await statementRows(env.DB,account,range);
 const data={retrieved:saved.retrieved,through:saved.through};
 const records=saved.rows.map(project);
 const cards=new Map();
 for(const record of cardRows){
  const c=JSON.parse(record.payload);
  if(text(c.customer_id)!==id||!text(c.card_number))throw Error('Fleet card account matching changed. Refresh cards before generating statements.');
  cards.set(text(c.card_number),{info:Object.fromEntries(cardFields.map(k=>[k,text(c[k])])),transactions:[],total:0,missing:0,excluded:0});
 }
 for(const t of records){
  const key=t.card||'';
  if(!cards.has(key))cards.set(key,{info:{card_number:key,cardholder:t.cardholder,card_type:t.card_type},transactions:[],total:0,missing:0,excluded:0});
  const c=cards.get(key);c.transactions.push(t);
  if(t.counted)c.total+=t.quantity;else if(t.complete&&t.hasFuel)c.missing++;else if(!t.complete)c.excluded++;
 }
 if(!cards.size)return null;
 return {range,cycle,cards:[...cards.values()].sort((a,b)=>a.info.card_number.localeCompare(b.info.card_number,'en',{numeric:true})),retrieved:data.retrieved,through:data.through,cardsRetrieved:state?.last_success?new Date(state.last_success).toISOString():null,transactionCount:records.length};
}

export function snapshotData(snapshot,account,range,now=new Date()){
 if(!/^000\d{1,20}$/.test(account)||!validDay(range.from)||!validDay(range.to)||range.from>range.to)throw Error('Invalid fleet statement account or dates.');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 const today=parts.year+'-'+parts.month+'-'+parts.day;
 const requiredTo=range.to>=today?today+'T00:00':shiftDay(range.to,1)+'T00:00';
 if(!snapshot||snapshot.readOnly!==true||snapshot.cardNumber||!Array.isArray(snapshot.rows)||snapshot.count!==snapshot.rows.length||snapshot.customerAccount&&snapshot.customerAccount!==account||!snapshot.from||!snapshot.to||!snapshot.completedAt||snapshot.from>range.from+'T00:00'||snapshot.to<requiredTo)
  throw Error('Fleet transactions do not cover '+range.from+' through '+range.to+'. In Fleet Cards & Transactions, sync API transactions for all cards from '+range.from+' at 12:00 AM through '+(range.to>=today?'the current time':shiftDay(range.to,1)+' at 12:00 AM')+', then generate the statement again.');
 const until=shiftDay(range.to,1),id=account.slice(3);
 const selected=snapshot.rows.filter(r=>text(r.CustomerID)===id&&text(r.ReceivedDateTime).slice(0,10)>=range.from&&text(r.ReceivedDateTime).slice(0,10)<until);
 if(selected.length>20000)throw Error('This fleet statement has more than 20,000 transactions. Choose a shorter date range.');
 return {success:true,account,transactions:selected.map(project).sort((a,b)=>a.received.localeCompare(b.received)||a.id.localeCompare(b.id,'en',{numeric:true})),retrieved:snapshot.completedAt,through:snapshot.to};
}
