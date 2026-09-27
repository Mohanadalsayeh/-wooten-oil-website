// Ver657: persistent, issuer-wide history; every customer read is scoped by session CustomerID.
import {customerIDForAccount,projectTransaction} from './intevacon-customer-api.mjs';
export const HISTORY_START='2010-01-01T00:00';
const DAY=86400000,table='intevacon_api_history_v1';
const schemas=new WeakMap();
const timestamp=s=>Date.parse(s+':00Z');
const date=n=>new Date(n).toISOString().slice(0,16);
const flatten=v=>v&&typeof v==='object'?Object.values(v).flatMap(flatten):v==null?[]:[String(v)];
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
export async function ensureHistory(db){
 if(!db)throw Error('History database is unavailable.');
 if(!schemas.has(db)){
  const ready=db.batch([
   db.prepare(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY,customer_id TEXT NOT NULL,card_number TEXT NOT NULL,received_at TEXT,fuel_quantity REAL,total_sale REAL,row_json TEXT NOT NULL,search_text TEXT NOT NULL,fetched_at TEXT NOT NULL)`),
   db.prepare(`CREATE INDEX IF NOT EXISTS intevacon_history_customer_date ON ${table}(customer_id,received_at,id)`),
   db.prepare(`CREATE INDEX IF NOT EXISTS intevacon_history_customer_card ON ${table}(customer_id,card_number,received_at)`)
  ]).catch(e=>{schemas.delete(db);throw e;});
  schemas.set(db,ready);
 }
 await schemas.get(db);
}
export async function saveHistory(db,rows,fetchedAt){
 await ensureHistory(db);
 if(!Array.isArray(rows)||!Number.isFinite(Date.parse(fetchedAt)))throw Error('Invalid history result.');
 const groups=[];let current=[],bytes=0;
 for(const row of rows){
  const p=projectTransaction(row);
  if(!p.transaction_id.trim())throw Error('Missing transaction identity.');
  const record={id:p.transaction_id,customer_id:p.customer_id.trim(),card_number:p.card_number,
   received_at:typeof p.received_at==='string'?p.received_at:null,fuel_quantity:p.fuel_quantity,
   total_sale:typeof p.source.TotalAmountOfSale==='number'?p.source.TotalAmountOfSale:null,
   row:p.source,search_text:flatten(p.source).join(' ').toLowerCase(),fetched_at:fetchedAt};
  const size=new TextEncoder().encode(JSON.stringify(record)).length;
  if(size>950000)throw Error('Transaction detail exceeds archive limits.');
  if(current.length&&(bytes+size>500000||current.length>=1000)){groups.push(current);current=[];bytes=0;}
  current.push(record);bytes+=size;
 }
 if(current.length)groups.push(current);
 // A whole response commits before its checkpoint. Replaying a response is idempotent.
 if(groups.length)await db.batch(groups.map(group=>db.prepare(`INSERT INTO ${table}
  (id,customer_id,card_number,received_at,fuel_quantity,total_sale,row_json,search_text,fetched_at)
  SELECT json_extract(value,'$.id'),json_extract(value,'$.customer_id'),json_extract(value,'$.card_number'),
   json_extract(value,'$.received_at'),json_extract(value,'$.fuel_quantity'),json_extract(value,'$.total_sale'),
   json_extract(value,'$.row'),json_extract(value,'$.search_text'),json_extract(value,'$.fetched_at')
  FROM json_each(?) WHERE 1
  ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id,card_number=excluded.card_number,
   received_at=excluded.received_at,fuel_quantity=excluded.fuel_quantity,total_sale=excluded.total_sale,
   row_json=excluded.row_json,search_text=excluded.search_text,fetched_at=excluded.fetched_at
  WHERE excluded.fetched_at>=${table}.fetched_at`).bind(JSON.stringify(group))));
}
export function newHistory(through){
 return {through,cursor:through,coverageFrom:null,latestTo:null,latestAt:null,pending:[],complete:false,revision:0,error:null};
}
export function historyRange(state,through){
 if(state.pending.length)return state.pending[0];
 if(!state.complete){
  return {from:date(Math.max(timestamp(HISTORY_START),timestamp(state.cursor)-92*DAY)),to:state.cursor,phase:'history'};
 }
 // Catch up after a long absence, using bounded windows and an overlap for delayed postings.
 const from=date(Math.max(timestamp(HISTORY_START),timestamp(state.latestTo||state.through)-DAY));
 return {from,to:date(Math.min(timestamp(through),timestamp(from)+92*DAY)),phase:'latest'};
}
export function splitHistory(state,range){
 const minutes=(timestamp(range.to)-timestamp(range.from))/60000;
 if(minutes<=1)return null;
 const middle=date(timestamp(range.from)+Math.floor(minutes/2)*60000);
 const newer={...range,from:middle},older={...range,to:middle};
 // Backfill walks backwards. Catch-up walks forwards to preserve continuous coverage.
 const parts=range.phase==='history'?[newer,older]:[older,newer];
 return {...state,pending:[...parts,...state.pending.slice(state.pending.length?1:0)],revision:state.revision+1,error:null};
}
export function commitHistory(state,range,completedAt){
 const next={...state,pending:state.pending.slice(state.pending.length?1:0),latestAt:completedAt,revision:state.revision+1,error:null};
 if(range.phase==='history'){
  next.cursor=range.from;next.coverageFrom=range.from;
  next.latestTo=state.latestTo||range.to;
  next.complete=range.from===HISTORY_START&&next.pending.length===0;
 }else next.latestTo=state.latestTo&&state.latestTo>range.to?state.latestTo:range.to;
 return next;
}
export function historyProgress(state){
 const total=timestamp(state.through)-timestamp(HISTORY_START);
 const checked=state.coverageFrom?timestamp(state.through)-timestamp(state.coverageFrom):0;
 return {complete:state.complete,from:state.coverageFrom,to:state.latestTo||state.through,
  earliest:HISTORY_START,percent:state.complete?100:Math.min(99,Math.max(0,Math.floor(100*checked/total))),
  revision:state.revision,error:!!state.error};
}
const transactionFields={transaction_id:'ID',local_date_time:'LocalDateTime',entry_method:'EntryMethod',decline_reason:'DeclineReason',merchant:'MerchantName',auth_ref:'AuthRef',billable_amount:'ResolvedTotalAmount',cardholder:'CardHolderName',driver_number:'DriverNumber',driver_name:'DriverName',vehicle_number:'VehicleNumber',vehicle_description:'VehicleDescription',raw_vehicle_id:'RawVehicleID',odometer:'Odometer',processed_on:'ProcessedDateTime',posted_on:'PostedDateTime',status:'Status',invoice_number:'InvoiceID',card_type:'CardType'};
const transactionSort={received_at:'received_at',card_number:'card_number',fuel_quantity:'fuel_quantity',total_sale:'total_sale',...Object.fromEntries(Object.entries(transactionFields).map(([key,field])=>[key,`json_extract(row_json,'$.${field}')`]))};
const cardSort=new Set(['card_number','card_type','cardholder','transaction_count','fuel_quantity','total_sale','last_used_on']);
function ordering(expression,direction,identity){
 const order=direction==='desc'?'DESC':'ASC';
 // Keep blank values last in either direction, with stable paging for equal values.
 return `(${expression} IS NULL OR ${expression}='') ASC,${expression} COLLATE NOCASE ${order},${identity} ASC`;
}
const money=v=>typeof v==='number'?v.toFixed(2):null;
export async function historyData(db,state,account,query=new URLSearchParams()){
 const customerID=customerIDForAccount(account);
 if(customerID===null)return json({success:false,error:'Fleet account matching is unavailable for this account.'},403);
 await ensureHistory(db);
 const kind=query.get('kind')==='transactions'?'transactions':'cards';
 const search=(query.get('search')||'').trim().toLowerCase().slice(0,200);
 const direction=query.has('direction')?(query.get('direction')==='desc'?'desc':'asc'):kind==='transactions'?'desc':'asc';
 const summarySQL=`SELECT COUNT(*) AS transactions,COUNT(DISTINCT NULLIF(card_number,'')) AS cards,
  SUM(fuel_quantity) AS fuel_quantity,COUNT(fuel_quantity) AS quantity_reported_count,SUM(total_sale) AS total_sale FROM ${table} WHERE customer_id=?`;
 const txWhere='customer_id=? AND (?=\'\' OR instr(search_text,?)>0)';
 // Search selects whole cards; their totals still include all of each card's activity.
 const cardsSQL=`WITH cards AS (SELECT card_number,
  group_concat(DISTINCT NULLIF(json_extract(row_json,'$.CardType'),'')) AS card_type,
  group_concat(DISTINCT NULLIF(json_extract(row_json,'$.CardHolderName'),'')) AS cardholder,
  COUNT(*) AS transaction_count,SUM(fuel_quantity) AS fuel_quantity,COUNT(fuel_quantity) AS quantity_reported_count,
  SUM(total_sale) AS total_sale,MAX(received_at) AS last_used_on,
  group_concat(DISTINCT NULLIF(json_extract(row_json,'$.DriverName'),'')) AS driver_names,
  group_concat(DISTINCT NULLIF(json_extract(row_json,'$.DriverNumber'),'')) AS driver_numbers,
  group_concat(DISTINCT NULLIF(json_extract(row_json,'$.VehicleNumber'),'')) AS vehicle_numbers,
  group_concat(DISTINCT NULLIF(json_extract(row_json,'$.VehicleDescription'),'')) AS vehicle_descriptions,
  group_concat(DISTINCT NULLIF(json_extract(row_json,'$.Network'),'')) AS networks,
  MAX(CASE WHEN ?='' OR instr(search_text,?)>0 THEN 1 ELSE 0 END) AS matches
  FROM ${table} WHERE customer_id=? AND card_number<>'' GROUP BY card_number)
 `;
 const count=kind==='transactions'?db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${txWhere}`).bind(customerID,search,search):
  db.prepare(cardsSQL+'SELECT COUNT(*) AS total FROM cards WHERE matches=1').bind(search,search,customerID);
 const [summaryResult,countResult]=await db.batch([db.prepare(summarySQL).bind(customerID),count]);
 const summary=summaryResult.results[0],total=countResult.results[0].total;
 const pages=Math.max(1,Math.ceil(total/20)),page=Math.min(pages,Math.max(1,parseInt(query.get('page'),10)||1));
 let items;
 if(kind==='transactions'){
  const sort=Object.hasOwn(transactionSort,query.get('sort'))?transactionSort[query.get('sort')]:'received_at';
  const r=await db.prepare(`SELECT row_json FROM ${table} WHERE ${txWhere} ORDER BY ${ordering(sort,direction,'id')} LIMIT 20 OFFSET ?`).bind(customerID,search,search,(page-1)*20).all();
  items=r.results.map(r=>projectTransaction(JSON.parse(r.row_json)));
 }else{
  const sort=cardSort.has(query.get('sort'))?query.get('sort'):'card_number';
  const r=await db.prepare(cardsSQL+`SELECT *,
   (SELECT json_extract(t.row_json,'$.Status') FROM ${table} t WHERE t.customer_id=? AND t.card_number=cards.card_number ORDER BY t.received_at DESC,t.id DESC LIMIT 1) AS last_transaction_status
   FROM cards WHERE matches=1 ORDER BY ${ordering(sort,direction,'card_number')} LIMIT 20 OFFSET ?`).bind(search,search,customerID,customerID,(page-1)*20).all();
  items=r.results.map(({matches,...row})=>({...row,total_sale:money(row.total_sale),card_status:null}));
 }
 const history=historyProgress(state);
 return json({success:true,source:'intevacon_api',kind,account_number:account,items,total,page,pages,
  summary:{...summary,total_sale:money(summary.total_sale)},last_sync:state.latestAt,window_from:history.from,window_to:history.to,history,card_scope:'transactions',
  notice:'Cards shown have activity in the retrieved history. Cards with no transactions and card activation status are not supplied by this API.'});
}
