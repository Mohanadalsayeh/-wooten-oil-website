const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const fields=['ARDivisionNo','CustomerNo','InvoiceNo','InvoiceType','InvoiceDate','InvoiceDueDate','InvoiceDiscountDate','CustomerName','Balance','DiscountAmt','SalesTaxAmt','FreightAmt','CustomerPONo','SalespersonName','TermsCode','Comment'];
export function normalize(row){
 const r={};for(const k of fields)r[k]=row[k]??null;
 for(const k of ['CustomerNo','InvoiceNo','InvoiceType','ARDivisionNo']){r[k]=String(r[k]??'').trim();if(!r[k]||r[k].length>40)throw fail('Missing or invalid '+k);}
 if(!/^\d{1,7}$/.test(r.CustomerNo))throw fail('Invalid CustomerNo');r.CustomerNo=r.CustomerNo.padStart(7,'0');
 for(const k of ['InvoiceDate','InvoiceDueDate','InvoiceDiscountDate']){if(r[k]===null||r[k]===''){r[k]=null;continue}const d=String(r[k]).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)throw fail('Invalid '+k);r[k]=d;}if(!r.InvoiceDate)throw fail('InvoiceDate is required');
 for(const k of ['Balance','DiscountAmt','SalesTaxAmt','FreightAmt']){if(k==='Balance'&&(r[k]===null||r[k]===''))throw fail('Balance is required');const n=Number(r[k]??0);if(!Number.isFinite(n)||Math.abs(n)>1e12)throw fail('Invalid '+k);r[k]=n;}
 for(const k of ['CustomerName','CustomerPONo','SalespersonName','TermsCode','Comment']){r[k]=String(r[k]??'').trim();if(r[k].length>2000)throw fail(k+' is too long');}
 return r;
}
export async function schema(db){
 await db.batch([
 db.prepare(`CREATE TABLE IF NOT EXISTS invoice_import_runs (seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL UNIQUE, expected INTEGER NOT NULL, batches INTEGER NOT NULL, mode TEXT NOT NULL, actor TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'uploading', created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS invoice_import_batches (run_id TEXT NOT NULL, batch_no INTEGER NOT NULL, hash TEXT NOT NULL, row_count INTEGER NOT NULL, PRIMARY KEY(run_id,batch_no))`),
 db.prepare(`CREATE TABLE IF NOT EXISTS mas90_invoices (run_id TEXT NOT NULL, division TEXT NOT NULL, account_number TEXT NOT NULL, invoice_no TEXT NOT NULL, invoice_type TEXT NOT NULL, invoice_date TEXT NOT NULL, due_date TEXT, customer_name TEXT, balance_cents INTEGER NOT NULL, source_json TEXT NOT NULL, PRIMARY KEY(run_id,division,account_number,invoice_no,invoice_type))`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_invoices_account ON mas90_invoices(run_id,account_number,invoice_date)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS invoice_import_active (id INTEGER PRIMARY KEY CHECK(id=1), run_id TEXT NOT NULL, seq INTEGER NOT NULL)`)
 ]);
}
export async function handle({request,env,cancellation,audit,progress}){
 try{
 if(!env.DB)throw fail('Database is not configured',503);
 await schema(env.DB);const db=env.DB;
 if(request.method==='GET'){
 const active=await db.prepare(`SELECT r.* FROM invoice_import_active a JOIN invoice_import_runs r ON r.run_id=a.run_id WHERE a.id=1`).first();
 if(active?.mode==='automatic_30_days')active.mode='automatic (30-day overlap)';
 const latest=await db.prepare(`SELECT * FROM invoice_import_runs ORDER BY seq DESC LIMIT 1`).first();
 const url=new URL(request.url),params=url.searchParams,q=(params.get('search')||'').trim().slice(0,120);
 const positiveInt=(value,fallback,max)=>{const n=Number(value);return Number.isFinite(n)&&n>=1?Math.min(max,Math.trunc(n)):fallback;};
 const requestedPage=positiveInt(params.get('page'),1,1000000),pageSize=positiveInt(params.get('page_size'),20,500);
 const from=params.get('date_from')||'',to=params.get('date_to')||'';
 for(const value of [from,to])if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw fail('Choose a valid invoice date.');
 if(from&&to&&from>to)throw fail('Invoice Date From must be on or before Invoice Date To.');
 if(!active)return reply({success:true,capabilities:{invoice_incremental_v1:true},total:0,rows:[],active:null,latest,page:1,pages:1,page_size:pageSize,invoice_types:[]});
 const clauses=['run_id=?'],bind=[active.run_id];
 if(q){const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';clauses.push(`(account_number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR invoice_no LIKE ? ESCAPE '\\')`);bind.push(pattern,pattern,pattern);}
 const type=params.get('invoice_type')||'all';
 if(type!=='all'){clauses.push('invoice_type=?');bind.push(type.slice(0,40));}
 if(from){clauses.push('invoice_date>=?');bind.push(from);}
 if(to){clauses.push('invoice_date<=?');bind.push(to);}
 const balances={positive:'balance_cents>0',zero:'balance_cents=0',credit:'balance_cents<0'};
 if(Object.hasOwn(balances,params.get('balance')))clauses.push(balances[params.get('balance')]);
 const orders={invoice_desc:'invoice_date DESC',invoice_asc:'invoice_date ASC',due_asc:'due_date IS NULL,due_date ASC',due_desc:'due_date IS NULL,due_date DESC',customer_asc:'account_number ASC',customer_desc:'account_number DESC',name_asc:'customer_name COLLATE NOCASE ASC',name_desc:'customer_name COLLATE NOCASE DESC',number_asc:'invoice_no ASC',number_desc:'invoice_no DESC',type_asc:'invoice_type ASC',type_desc:'invoice_type DESC',balance_desc:'balance_cents DESC',balance_asc:'balance_cents ASC'};
 const order=Object.hasOwn(orders,params.get('sort'))?orders[params.get('sort')]:orders.invoice_desc,filter=clauses.join(' AND ');
 const count=await db.prepare(`SELECT COUNT(*) total FROM mas90_invoices WHERE ${filter}`).bind(...bind).first();
 const pages=Math.max(1,Math.ceil(count.total/pageSize)),page=Math.min(requestedPage,pages);
 const rows=await db.prepare(`SELECT division,account_number,invoice_no,invoice_type,invoice_date,due_date,customer_name,balance_cents FROM mas90_invoices WHERE ${filter} ORDER BY ${order},account_number,invoice_no,invoice_type,division LIMIT ? OFFSET ?`).bind(...bind,pageSize,(page-1)*pageSize).all();
 const types=await db.prepare(`SELECT DISTINCT invoice_type FROM mas90_invoices WHERE run_id=? ORDER BY invoice_type`).bind(active.run_id).all();
 return reply({success:true,capabilities:{invoice_incremental_v1:true},active,latest,total:count.total,page,pages,page_size:pageSize,invoice_types:(types.results||[]).map(r=>r.invoice_type),rows:rows.results||[]});
 }
 if(request.method!=='POST')return reply({success:false,error:'Method not allowed'},405);
 const raw=await request.text();if(raw.length>2500000)throw fail('Invoice batch is too large',413);let body;try{body=JSON.parse(raw)}catch{throw fail('Invalid JSON')};const runId=String(request.headers.get('X-Import-Run-Id')||'');if(!/^[A-Za-z0-9_-]{8,100}$/.test(runId))throw fail('A valid import run ID is required');
 if(cancellation){const c=await cancellation();if(c?.cancelled)return reply({success:false,cancelled:true,error:'Import cancelled'},409);}
 if(body.action==='cancel'){
 await db.prepare(`UPDATE invoice_import_runs SET status='cancelled' WHERE run_id=? AND status='uploading'`).bind(runId).run();return reply({success:true});
 }
 const run=await db.prepare(`SELECT * FROM invoice_import_runs WHERE run_id=?`).bind(runId).first();
 if(body.action==='complete'){
 if(!run)throw fail('Import not found');if(run.status==='completed'){if(progress)await progress(true);return reply({success:true,accepted:run.expected,completed:true});}if(run.status!=='uploading')throw fail('Import is '+run.status,409);
 const counts=await db.prepare(`SELECT COUNT(*) batches,COALESCE(SUM(row_count),0) rows FROM invoice_import_batches WHERE run_id=?`).bind(runId).first();
 const saved=await db.prepare(`SELECT COUNT(*) total FROM mas90_invoices WHERE run_id=?`).bind(runId).first();
 if(counts.batches!==run.batches||counts.rows!==run.expected||saved.total!==run.expected)throw fail('Import is incomplete or contains duplicate invoice keys. The previous invoice list remains active.',409);
 await db.batch([
 ...(run.mode==='automatic_30_days'?[db.prepare(`INSERT INTO mas90_invoices(run_id,division,account_number,invoice_no,invoice_type,invoice_date,due_date,customer_name,balance_cents,source_json)
 SELECT ?,i.division,i.account_number,i.invoice_no,i.invoice_type,i.invoice_date,i.due_date,i.customer_name,i.balance_cents,i.source_json
 FROM mas90_invoices i JOIN invoice_import_active a ON a.run_id=i.run_id
 WHERE a.id=1 AND a.run_id<>? AND EXISTS(SELECT 1 FROM invoice_import_runs WHERE run_id=? AND status='uploading')
 ON CONFLICT(run_id,division,account_number,invoice_no,invoice_type) DO NOTHING`).bind(runId,runId,runId)]:[]),
 db.prepare(`UPDATE invoice_import_runs SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE run_id=? AND status='uploading'`).bind(runId),
 db.prepare(`INSERT INTO invoice_import_active(id,run_id,seq) SELECT 1,run_id,seq FROM invoice_import_runs WHERE run_id=? AND status='completed' ON CONFLICT(id) DO UPDATE SET run_id=excluded.run_id,seq=excluded.seq WHERE excluded.seq>invoice_import_active.seq`).bind(runId)
 ]);
 const committed=await db.prepare(`SELECT status FROM invoice_import_runs WHERE run_id=?`).bind(runId).first();if(committed.status!=='completed')throw fail('Import was cancelled before completion.',409);
 if(progress)await progress(true);
 if(audit)await audit(run).catch(()=>{});
 // Retain active and previous snapshot; discard older staging data after 24 hours.
 await db.prepare(`DELETE FROM mas90_invoices WHERE run_id IN (SELECT run_id FROM invoice_import_runs WHERE seq < (SELECT seq-1 FROM invoice_import_active WHERE id=1) AND created_at < datetime('now','-1 day'))`).run();
 return reply({success:true,accepted:run.expected,completed:true});
 }
 const importMode=request.headers.get('X-Import-Mode')==='automatic'?(body.incremental===true?'automatic_30_days':'automatic'):'manual';
 const rows=body.invoices;const total=Number(request.headers.get('X-Import-Run-Total')),batch=Number(request.headers.get('X-Import-Batch-Number')),batches=Number(request.headers.get('X-Import-Batch-Count'));
 if(!Array.isArray(rows)||rows.length>200||!Number.isInteger(total)||(total<0||(total===0&&importMode!=='automatic_30_days'))||total>2000000||!Number.isInteger(batches)||batches!==Math.max(1,Math.ceil(total/200))||!Number.isInteger(batch)||batch<1||batch>batches||rows.length!==Math.min(200,total-(batch-1)*200))throw fail('Invalid batch size or counts. Send the complete file in batches of 200.');
 const normalized=rows.map((r,i)=>{try{return normalize(r)}catch(e){throw fail('Row '+((batch-1)*200+i+1)+': '+e.message)}});
 const data=JSON.stringify(normalized),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const prior=await db.prepare(`SELECT hash FROM invoice_import_batches WHERE run_id=? AND batch_no=?`).bind(runId,batch).first();
 if(prior){if(run.mode!==importMode||run.expected!==total||run.batches!==batches)throw fail('Import settings changed. Start a new import.',409);if(prior.hash!==hash)throw fail('This batch was already uploaded with different contents.',409);if(progress)await progress(false);return reply({success:true,accepted:rows.length,replayed:true});}
 if(run&&(run.status!=='uploading'||run.expected!==total||run.batches!==batches||run.mode!==importMode))throw fail('Import cannot be changed. Start a new import.',409);
 await db.batch([
 db.prepare(`INSERT INTO invoice_import_runs(run_id,expected,batches,mode,actor) VALUES (?,?,?,?,?) ON CONFLICT(run_id) DO NOTHING`).bind(runId,total,batches,importMode,request.headers.get('X-Admin-Actor-Name')||'Admin'),
 db.prepare(`INSERT INTO mas90_invoices(run_id,division,account_number,invoice_no,invoice_type,invoice_date,due_date,customer_name,balance_cents,source_json) SELECT ?,json_extract(value,'$.ARDivisionNo'),json_extract(value,'$.CustomerNo'),json_extract(value,'$.InvoiceNo'),json_extract(value,'$.InvoiceType'),json_extract(value,'$.InvoiceDate'),json_extract(value,'$.InvoiceDueDate'),json_extract(value,'$.CustomerName'),CAST(ROUND(json_extract(value,'$.Balance')*100) AS INTEGER),value FROM json_each(?) WHERE EXISTS(SELECT 1 FROM invoice_import_runs WHERE run_id=? AND status='uploading')`).bind(runId,data,runId),
 db.prepare(`INSERT INTO invoice_import_batches(run_id,batch_no,hash,row_count) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM invoice_import_runs WHERE run_id=? AND status='uploading')`).bind(runId,batch,hash,rows.length,runId)
 ]);
 if(progress)await progress(false);
 return reply({success:true,accepted:rows.length});
 }catch(e){return reply({success:false,error:e.status?e.message:'Invoice import failed. Your previous completed invoice list is preserved.'},e.status||500);}
}
