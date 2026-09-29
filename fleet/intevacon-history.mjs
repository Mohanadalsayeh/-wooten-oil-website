// Ver657: persistent, issuer-wide history; every customer read is scoped by session CustomerID.
import {customerIDForAccount,projectTransaction} from './intevacon-customer-api.mjs';

const DAY=86400000,table='intevacon_transactions_v692';
const schemas=new WeakMap();
const timestamp=s=>Date.parse(s+':00Z');
const date=n=>new Date(n).toISOString().slice(0,16);
const flatten=v=>v&&typeof v==='object'?Object.values(v).flatMap(flatten):v==null?[]:[String(v)];
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
export async function ensureHistory(db){
 if(!db)throw Error('History database is unavailable.');
 if(!schemas.has(db)){
  const ready=db.batch([
   db.prepare(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY,customer_id TEXT NOT NULL,card_number TEXT NOT NULL,received_at TEXT,fuel_quantity REAL,total_sale REAL,row_json TEXT NOT NULL,search_text TEXT NOT NULL,public_search TEXT NOT NULL,fetched_at TEXT NOT NULL)`),
   db.prepare(`CREATE INDEX IF NOT EXISTS intevacon_transactions_customer_date_v692 ON ${table}(customer_id,received_at,id)`),
   db.prepare(`CREATE INDEX IF NOT EXISTS intevacon_transactions_customer_card_v692 ON ${table}(customer_id,card_number,received_at)`),
   db.prepare(`CREATE INDEX IF NOT EXISTS intevacon_transactions_date_v692 ON ${table}(received_at,id)`),
   db.prepare(`CREATE TABLE IF NOT EXISTS intevacon_coverage_v692 (window_from TEXT NOT NULL,window_to TEXT NOT NULL,fetched_at TEXT NOT NULL,PRIMARY KEY(window_from,window_to))`)
  ]).catch(e=>{schemas.delete(db);throw e;});
  schemas.set(db,ready);
 }
 await schemas.get(db);
}
export async function saveHistory(db,rows,fetchedAt,range){
 await ensureHistory(db);
 if(!Array.isArray(rows)||!Number.isFinite(Date.parse(fetchedAt)))throw Error('Invalid history result.');
 const groups=[];let current=[],bytes=0;
 for(const row of rows){
  const p=projectTransaction(row);
  if(!p.transaction_id.trim())throw Error('Missing transaction identity.');
  const record={id:p.transaction_id,customer_id:p.customer_id.trim(),card_number:p.card_number,
   received_at:typeof p.received_at==='string'?p.received_at:null,fuel_quantity:p.fuel_quantity,
   total_sale:typeof p.source.TotalAmountOfSale==='number'?p.source.TotalAmountOfSale:null,
   row:p.source,search_text:flatten(p.source).join(' ').toLowerCase(),public_search:flatten(publicTransaction(row)).join(' ').toLowerCase(),fetched_at:fetchedAt};
  const size=new TextEncoder().encode(JSON.stringify(record)).length;
  if(size>950000)throw Error('Transaction detail exceeds archive limits.');
  if(current.length&&(bytes+size>500000||current.length>=1000)){groups.push(current);current=[];bytes=0;}
  current.push(record);bytes+=size;
 }
 if(current.length)groups.push(current);
 // A whole response commits before its checkpoint. Replaying a response is idempotent.
 const statements=groups.map(group=>db.prepare(`INSERT INTO ${table}
  (id,customer_id,card_number,received_at,fuel_quantity,total_sale,row_json,search_text,public_search,fetched_at)
  SELECT json_extract(value,'$.id'),json_extract(value,'$.customer_id'),json_extract(value,'$.card_number'),
   json_extract(value,'$.received_at'),json_extract(value,'$.fuel_quantity'),json_extract(value,'$.total_sale'),
   json_extract(value,'$.row'),json_extract(value,'$.search_text'),json_extract(value,'$.public_search'),json_extract(value,'$.fetched_at')
  FROM json_each(?) WHERE 1
  ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id,card_number=excluded.card_number,
   received_at=excluded.received_at,fuel_quantity=excluded.fuel_quantity,total_sale=excluded.total_sale,
   row_json=excluded.row_json,search_text=excluded.search_text,public_search=excluded.public_search,fetched_at=excluded.fetched_at
  WHERE excluded.fetched_at>=${table}.fetched_at`).bind(JSON.stringify(group)));
 if(range)statements.push(db.prepare('INSERT INTO intevacon_coverage_v692 VALUES(?,?,?) ON CONFLICT(window_from,window_to) DO UPDATE SET fetched_at=excluded.fetched_at').bind(range.from,range.to,fetchedAt));
 if(statements.length)await db.batch(statements);
 if(range){const c=await coverage(db);await db.batch([db.prepare('DELETE FROM intevacon_coverage_v692'),...c.spans.map(span=>db.prepare('INSERT INTO intevacon_coverage_v692 VALUES(?,?,?)').bind(span.from,span.to,c.last_sync))]);}
}
export async function coverage(db){
 await ensureHistory(db);
 const result=await db.prepare('SELECT * FROM intevacon_coverage_v692 ORDER BY window_from,window_to').all();
 const spans=[];let latest=null;
 for(const r of result.results){if(!latest||r.fetched_at>latest)latest=r.fetched_at;const last=spans.at(-1);if(last&&r.window_from<=last.to){if(r.window_to>last.to)last.to=r.window_to;}else spans.push({from:r.window_from,to:r.window_to});}
 return {spans,last_sync:latest};
}
const fieldMap={transaction_id:'ID',local_date_time:'LocalDateTime',entry_method:'EntryMethod',decline_reason:'DeclineReason',merchant:'MerchantName',auth_ref:'AuthRef',cardholder:'CardHolderName',driver_number:'DriverNumber',driver_name:'DriverName',vehicle_number:'VehicleNumber',vehicle_description:'VehicleDescription',raw_vehicle_id:'RawVehicleID',odometer:'Odometer',processed_on:'ProcessedDateTime',posted_on:'PostedDateTime',status:'Status',invoice_number:'InvoiceID',card_type:'CardType'};
const sorts={received_at:'received_at',card_number:'card_number',customer_id:'customer_id',fuel_quantity:'fuel_quantity',total_sale:'total_sale',...Object.fromEntries(Object.entries(fieldMap).map(([k,v])=>[k,`json_extract(row_json,'$.${v}')`]))};
export function publicTransaction(row){
 const p=projectTransaction(row);delete p.total_sale;delete p.billable_amount;
 delete p.source.TotalAmountOfSale;delete p.source.ResolvedTotalAmount;
 for(const d of p.source.Details){for(const k of ['RawUnitPrice','RawAmount','ResolvedUnitPrice','ResolvedAmount'])delete d[k];delete d.Taxes;}
 return p;
}
export async function queryHistory(db,q,{account=null,admin=false}={}){
 await ensureHistory(db);
 const id=customerIDForAccount(account);if(!admin&&id===null)throw Error('Fleet account matching is unavailable.');
 const from=q.get('from'),to=q.get('to');
 if(!from||!to||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(to)||!Number.isFinite(Date.parse(from+':00Z'))||!Number.isFinite(Date.parse(to+':00Z'))||new Date(from+':00Z').toISOString().slice(0,16)!==from||new Date(to+':00Z').toISOString().slice(0,16)!==to||from>=to)throw Error('Choose valid From and To dates.');
 const where=['received_at>=?','received_at<=?'],args=[from,to+':59.999'];
 if(!admin){where.push('customer_id=?');args.push(id);}
 const search=(q.get('search')||'').trim().toLowerCase().slice(0,200);
 if(search){where.push('instr('+(admin?'search_text':'public_search')+',?)>0');args.push(search);}
 if(admin&&q.get('card')){where.push('card_number=?');args.push(q.get('card'));}
 const sql=where.join(' AND '),sort=(!admin&&q.get('sort')==='total_sale'?null:sorts[q.get('sort')])||'received_at',direction=q.get('direction')==='asc'?'ASC':'DESC';
 const [summaryResult,cov]=await Promise.all([db.prepare(`SELECT COUNT(*) AS transactions,COUNT(DISTINCT NULLIF(card_number,'')) AS cards,SUM(fuel_quantity) AS fuel_quantity,COUNT(fuel_quantity) AS quantity_reported_count${admin?',SUM(total_sale) AS total_sale':''} FROM ${table} WHERE ${sql}`).bind(...args).first(),coverage(db)]);
 const summary=summaryResult,total=summary.transactions,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(pages,Math.max(1,parseInt(q.get('page'),10)||1));
 const ordering=sort==='received_at'?`received_at ${direction},id ${direction}`:`(${sort} IS NULL OR ${sort}='') ASC,${sort} COLLATE NOCASE ${direction},id ASC`;
 const records=await db.prepare(`SELECT row_json FROM ${table} WHERE ${sql} ORDER BY ${ordering} LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20).all();
 const spans=cov.spans,covered=spans.some(s=>s.from<=from&&s.to>=to);
 const availableTo=spans.at(-1)?.to||null;
 return {success:true,source:'saved_intevacon_history',kind:'transactions',account_number:account,items:records.results.map(r=>admin?JSON.parse(r.row_json):publicTransaction(JSON.parse(r.row_json))),total,page,pages,summary,last_sync:cov.last_sync,window_from:from,window_to:to,coverage:{complete:covered,available_from:spans[0]?.from||null,available_to:availableTo},live:{state:'success',fetchedAt:cov.last_sync},refresh:{state:'success'},notice:covered?'':`Saved results ${availableTo?'are available through '+availableTo:'have not been initialized yet'}.`};
}
export async function statementRows(db,account,range){
 const id=customerIDForAccount(account);if(id===null)throw Error('Fleet account matching is unavailable.');
 const cov=await coverage(db),from=range.from+'T00:00';
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const end=date(Date.parse(range.to+'T00:00:00Z')+DAY);
 const requiredTo=range.to>=day?day+'T00:00':end;
 if(!cov.spans.some(s=>s.from<=from&&s.to>=requiredTo))throw Error('Saved fleet history does not yet cover '+range.from+' through '+range.to+'. Initialize or resume transaction history in Fleet Cards & Transactions.');
 const count=await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE customer_id=? AND received_at>=? AND received_at<?`).bind(id,from,end).first();
 if(count.n>20000)throw Error('This customer has more than 20,000 transactions. Choose a shorter statement period.');
 const result=await db.prepare(`SELECT row_json FROM ${table} WHERE customer_id=? AND received_at>=? AND received_at<? ORDER BY received_at,id`).bind(id,from,end).all();
 return {rows:result.results.map(r=>JSON.parse(r.row_json)),retrieved:cov.last_sync,through:cov.spans.find(s=>s.from<=from&&s.to>=requiredTo).to};
}
