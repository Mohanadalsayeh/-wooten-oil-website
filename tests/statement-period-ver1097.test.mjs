import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {loadStatementPeriodPayments,validatePaymentPeriod} from '../assets/js/wooten-statement-period-payments.mjs';
import {statementRows} from '../fleet/intevacon-history.mjs';
import {resolve} from '../fleet/statement-fleet.mjs';

function d1(db){
 return {
   prepare(sql){return {
     bind(...values){return bound(sql,values);},
     ...bound(sql,[])
   };},
   async batch(queries){return Promise.all(queries.map(x=>x.run()));}
 };
 function bound(sql,values){return {
   async all(){return {results:db.prepare(sql).all(...values)};},
   async first(){return db.prepare(sql).get(...values)||null;},
   async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};}
 };}
}

const period={from:'2026-09-01',to:'2026-09-30',fromTime:'00:00:00',toTime:'23:59:59'};

test('MAS 90 payments are strictly customer-scoped, posting-date prioritized, both bounds inclusive',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE customer_payments(id INTEGER PRIMARY KEY,account_number TEXT,payment_date TEXT,reference TEXT,source_invoice_no TEXT,amount REAL,posting_date TEXT,deposit_date TEXT);`);
 const rows=[
  ['0001234','2026-09-01','2026-09-01','FROM'],
  ['0001234','2026-09-30','2026-09-30','TO'],
  ['0001234','2026-09-29','2026-10-01','EXCLUDE_POSTED_OCT'],
  ['0001234','2026-08-31','2026-09-15','INCLUDE_POSTED_SEP'],
  ['0001234','2026-09-22','','FALLBACK_TO_PAYMENT'],
  ['0001234','2026-08-31','','EXCLUDE_AUG'],
  ['0001234','2026-10-01','','EXCLUDE_OCT'],
  ['0001234','2026-09-30T19:52:00','2026-09-30T19:52:00','ISO_TIME'],
  ['0009999','2026-09-15','2026-09-15','OTHER_CUSTOMER']
 ];
 for(const [acct,date,posted,reference] of rows){sql.prepare('INSERT INTO customer_payments(account_number,payment_date,posting_date,reference,source_invoice_no,amount,deposit_date) VALUES (?,?,?,?,?,?,?)').run(acct,date,posted,reference,'',1,'');}
 const r=await loadStatementPeriodPayments(d1(sql),'0001234',20,period);
 assert.deepEqual(r.map(x=>x.check_number).sort(),['FALLBACK_TO_PAYMENT','FROM','INCLUDE_POSTED_SEP','ISO_TIME','TO']);
 const short=await loadStatementPeriodPayments(d1(sql),'0001234',2,period);
 assert.equal(short.length,2);
 assert.equal((await loadStatementPeriodPayments(d1(sql),'0001234',0,period)).length,0);
 sql.close();
});

test('rejects invalid and backwards dates',()=>{
 for(const r of [{from:'2026-09-31',to:'2026-10-03'},{from:'2026-09-30',to:'2026-09-01'},{from:'',to:'2026-09-30'}])
  assert.throws(()=>validatePaymentPeriod(r),/valid From and To/);
 assert.deepEqual(validatePaymentPeriod(period),{from:'2026-09-01',to:'2026-09-30'});
});

test('Intevacon saved transactions use the same inclusive end date, exclusive next midnight, correct CustomerID',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE intevacon_transactions_v692 (id TEXT PRIMARY KEY,customer_id TEXT,card_number TEXT,received_at TEXT,fuel_quantity REAL,total_sale REAL,row_json TEXT,search_text TEXT,public_search TEXT,fetched_at TEXT); CREATE TABLE intevacon_coverage_v692(window_from TEXT NOT NULL,window_to TEXT NOT NULL,fetched_at TEXT NOT NULL,PRIMARY KEY(window_from,window_to));`);
 // Coverage from Aug 31 until Oct 1 midnight; all of September is present.
 sql.prepare('INSERT INTO intevacon_coverage_v692 VALUES(?,?,?)').run('2026-08-31T00:00','2026-10-01T00:00','2026-10-01T01:00:00Z');
 const samples=[
  ['a','1234','2026-08-31T23:59:59'],
  ['b','1234','2026-09-01T00:00:00'],
  ['c','1234','2026-09-30T23:59:59.999'],
  ['d','1234','2026-10-01T00:00:00'],
  ['e','9999','2026-09-15T12:30:00']
 ];
 for(const [id,customer_id,received_at] of samples){
  const row={ID:id,CustomerID:customer_id,CardNumber:'31069740',ReceivedDateTime:received_at,Details:[]};
  sql.prepare('INSERT INTO intevacon_transactions_v692 VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,customer_id,'31069740',received_at,null,0,JSON.stringify(row),'','','2026-10-01T01:00:00Z');
 }
 const result=await statementRows(d1(sql),'0001234',period);
 assert.deepEqual(result.rows.map(x=>x.ID),['b','c']);
 sql.exec('DELETE FROM intevacon_coverage_v692');
 await assert.rejects(()=>statementRows(d1(sql),'0001234',period),/does not yet cover/);
 sql.close();
});

test('cycle period defaults are anchored to selected statement date',()=>{
 const r=resolve({enabled:false},'2026-09-30','weekly');
 assert.equal(r.ranges.A.to,'2026-09-30');
 assert.equal(r.ranges.A.from,'2026-08-31');
 assert.equal(r.ranges.B.to,'2026-09-30');
});

test('preview and final statement use identical MAS 90 selector and customer period',()=>{
 const code=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
 assert.equal((code.match(/await statementLoadPayments\(env,account,paymentCount,customer\.statement_period\)/g)||[]).length,2);
 assert.equal((code.match(/const fleetOptions=await statementFleetOptions\(env,body\.fleet,statementDate\)/g)||[]).length,2);
});
