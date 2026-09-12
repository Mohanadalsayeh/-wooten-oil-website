// Portal-only accounting links. Never writes to MAS 90 or changes processor outcomes.
export async function ensureSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS online_payment_posting (
    intent_id TEXT PRIMARY KEY, account_number TEXT NOT NULL, deposit_no TEXT NOT NULL,
    check_no TEXT NOT NULL, revision INTEGER NOT NULL, updated_by TEXT NOT NULL,
    change_note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_number,deposit_no,check_no))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS online_payment_posting_audit (
    id INTEGER PRIMARY KEY, intent_id TEXT NOT NULL, revision INTEGER NOT NULL,
    old_deposit_no TEXT, old_check_no TEXT, deposit_no TEXT NOT NULL, check_no TEXT NOT NULL,
    actor TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  for(const event of ['INSERT','UPDATE'])await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS posting_audit_${event.toLowerCase()}
    AFTER ${event} ON online_payment_posting BEGIN
    INSERT INTO online_payment_posting_audit(intent_id,revision,old_deposit_no,old_check_no,deposit_no,check_no,actor,note)
    VALUES(NEW.intent_id,NEW.revision,${event==='UPDATE'?'OLD.deposit_no,OLD.check_no':'NULL,NULL'},NEW.deposit_no,NEW.check_no,NEW.updated_by,NEW.change_note); END`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_payment_posting_lookup ON customer_payments(account_number,deposit_no,reference)').run();
}
// Reject mixed/unknown environments, review cases and anything other than a captured sale.
export const eligible=(alias='p')=>`${alias}.status='captured' AND ${alias}.amount_cents>0 AND ${alias}.currency='USD'
 AND (EXISTS(SELECT 1 FROM heartland_payment_attempts a WHERE a.intent_id=${alias}.id AND a.environment='production')
 OR EXISTS(SELECT 1 FROM hosted_payment_links h WHERE h.intent_id=${alias}.id AND h.environment='production'))
 AND NOT EXISTS(SELECT 1 FROM heartland_payment_attempts a WHERE a.intent_id=${alias}.id AND a.environment<>'production')
 AND NOT EXISTS(SELECT 1 FROM hosted_payment_links h WHERE h.intent_id=${alias}.id AND h.environment<>'production')
 AND NOT EXISTS(SELECT 1 FROM hosted_payment_reviews r WHERE r.intent_id=${alias}.id AND NOT EXISTS(
 SELECT 1 FROM hosted_payment_review_resolutions x WHERE x.intent_id=r.intent_id))`;
export const ctes=`posting_matches AS (
 SELECT l.intent_id,COUNT(*) AS match_count,SUM(CAST(ROUND(m.amount*100) AS INTEGER)) AS matched_cents,
 COUNT(DISTINCT m.payment_date) AS payment_dates,COUNT(DISTINCT m.deposit_date) AS deposit_dates,
 COUNT(DISTINCT m.posting_date) AS posting_dates,
 COUNT(DISTINCT COALESCE(NULLIF(m.source_invoice_no,''),'(on account)')) AS invoice_count,
 SUM(CASE WHEN trim(m.posting_date)='' OR m.amount<=0 THEN 1 ELSE 0 END) AS invalid_rows,
 MAX(m.posting_date) AS mas90_posting_date,MAX(m.deposit_date) AS mas90_deposit_date,
 GROUP_CONCAT(DISTINCT NULLIF(m.source_invoice_no,'')) AS mas90_invoices,
 MAX(m.imported_at) AS imported_at
 FROM online_payment_posting l JOIN customer_payments m ON m.account_number=l.account_number
 AND m.deposit_no=l.deposit_no AND m.reference=l.check_no GROUP BY l.intent_id
), posting_state AS (
 SELECT p.id AS intent_id,l.deposit_no AS entered_deposit_no,l.check_no AS entered_check_no,
 COALESCE(l.revision,0) AS posting_revision,l.updated_by AS posting_updated_by,l.updated_at AS posting_updated_at,
 CASE WHEN x.matched_cents=p.amount_cents AND x.invalid_rows=0 AND x.payment_dates=1 AND x.deposit_dates=1 AND x.posting_dates=1 AND x.invoice_count=x.match_count THEN 1 ELSE 0 END AS posting_match_ready,
 x.mas90_posting_date,x.mas90_deposit_date,x.mas90_invoices,x.imported_at AS posting_imported_at,
 CASE WHEN NOT (${eligible()}) THEN 'not_applicable'
 WHEN l.intent_id IS NULL THEN 'ready'
 WHEN NOT EXISTS(SELECT 1 FROM admin_import_metadata WHERE import_type='payments' AND last_import_status='completed') THEN 'awaiting_import'
 WHEN x.intent_id IS NULL THEN 'awaiting_import'
 WHEN x.matched_cents<>p.amount_cents OR x.invalid_rows<>0 OR x.payment_dates<>1 OR x.deposit_dates<>1 OR x.posting_dates<>1 OR x.invoice_count<>x.match_count THEN 'review'
 ELSE 'posted' END AS posting_status
 FROM online_payment_transactions p LEFT JOIN online_payment_posting l ON l.intent_id=p.id
 LEFT JOIN posting_matches x ON x.intent_id=p.id
)`;
export const labels={ready:'Ready for MAS 90 entry',awaiting_import:'Entered — awaiting verification',review:'Posting needs review',posted:'Posted in MAS 90',not_applicable:'Not eligible for posting'};
export async function detail(env,id){
  const row=await env.DB.prepare(`WITH ${ctes} SELECT * FROM posting_state WHERE intent_id=?`).bind(id).first();
  if(!row)return null;
  const allocations=row.posting_status==='posted'?(await env.DB.prepare(`SELECT source_invoice_no AS invoice_no,amount,posting_date,deposit_date FROM customer_payments
    WHERE account_number=(SELECT account_number FROM online_payment_transactions WHERE id=?) AND deposit_no=? AND reference=? ORDER BY source_invoice_no,id`).bind(id,row.entered_deposit_no,row.entered_check_no).all()).results:[];
  return {...row,allocations};
}
export async function save({request,env,id,actor}){
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const origin=request.headers.get('Origin');
  if((origin&&origin!==new URL(request.url).origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply({success:false,error:'Use the portal to save posting references.'},403);
  let b;try{b=await request.json();}catch{return reply({success:false,error:'Invalid posting data.'},400);}
  if(!b||typeof b!=='object'||Array.isArray(b))return reply({success:false,error:'Invalid posting data.'},400);
  const deposit=typeof b.deposit_no==='string'?b.deposit_no.trim():'',check=typeof b.check_no==='string'?b.check_no.trim():'';
  const note=typeof b.note==='string'?b.note.trim():'';
  if(!deposit||!check||deposit.length>100||check.length>150||/[\x00-\x1f\x7f]/.test(deposit+check)||!Number.isSafeInteger(b.revision)||b.revision<0||note.length>500||b.revision>0&&!note)
    return reply({success:false,error:'Enter Deposit No. and Check No. Corrections also require a reason (maximum 500 characters).'},400);
  const p=await env.DB.prepare(`SELECT id FROM online_payment_transactions p WHERE id=? AND ${eligible()}`).bind(id).first();
  if(!p)return reply({success:false,error:'Only verified, approved live payments can be linked to MAS 90.'},409);
  try{
    const result=await env.DB.prepare(`INSERT INTO online_payment_posting(intent_id,account_number,deposit_no,check_no,revision,updated_by,change_note)
    SELECT p.id,p.account_number,?,?,?, ?,? FROM online_payment_transactions p WHERE p.id=? AND ${eligible()}
    AND (?=0 OR EXISTS(SELECT 1 FROM online_payment_posting l WHERE l.intent_id=p.id AND l.revision=?))
    ON CONFLICT(intent_id) DO UPDATE SET deposit_no=excluded.deposit_no,check_no=excluded.check_no,revision=excluded.revision,
    updated_by=excluded.updated_by,change_note=excluded.change_note,updated_at=CURRENT_TIMESTAMP
    WHERE online_payment_posting.revision=excluded.revision-1`).bind(deposit,check,b.revision+1,actor,note,id,b.revision,b.revision).run();
    if(!result.meta?.changes)return reply({success:false,error:'Another employee changed this record. Refresh it before saving again.'},409);
    return reply({success:true,posting:await detail(env,id)});
  }catch(error){
    if(/unique/i.test(String(error)))return reply({success:false,error:'This customer’s Deposit No. and Check No. are already linked to another online payment.'},409);
    console.error('Posting save failed',error);return reply({success:false,error:'Posting references could not be saved. Refresh to check the record before retrying.'},500);
  }
}
export async function history(env,account){
  const imported=(await env.DB.prepare('SELECT *,source_invoice_no AS invoice_no,\'mas90\' AS source,\'posted\' AS status FROM customer_payments WHERE account_number=?').bind(account).all()).results||[];
  const online=(await env.DB.prepare(`WITH ${ctes} SELECT p.*,s.*,'portal' AS source,p.amount_cents/100.0 AS amount,
    p.provider_reference AS confirmation_number,COALESCE(NULLIF(p.provider_transaction_id,''),p.provider_reference) AS reference,
    CASE WHEN EXISTS(SELECT 1 FROM heartland_payment_attempts a WHERE a.intent_id=p.id AND a.environment='sandbox') OR EXISTS(SELECT 1 FROM hosted_payment_links h WHERE h.intent_id=p.id AND h.environment='sandbox') THEN 'sandbox'
    WHEN (${eligible()}) THEN 'production' ELSE 'unknown' END AS environment,
    CASE WHEN EXISTS(SELECT 1 FROM hosted_payment_reviews r WHERE r.intent_id=p.id AND NOT EXISTS(SELECT 1 FROM hosted_payment_review_resolutions x WHERE x.intent_id=p.id)) THEN 'review' ELSE p.status END AS history_status
    FROM online_payment_transactions p JOIN posting_state s ON s.intent_id=p.id WHERE p.account_number=?
    AND p.status IN ('captured','declined','processing','pending','failed','expired','canceled')`).bind(account).all()).results||[];
  const matched=new Set(online.filter(r=>r.posting_status==='posted'||r.posting_status==='awaiting_import'&&r.posting_match_ready===1).map(r=>JSON.stringify([r.entered_deposit_no,r.entered_check_no])));
  const importedFields=['id','account_number','payment_date','posting_date','deposit_date','deposit_no','invoice_no','amount','reference','description','imported_at','source','status'];
  const rows=imported.filter(r=>!matched.has(JSON.stringify([r.deposit_no,r.reference]))).map(r=>Object.fromEntries(importedFields.map(k=>[k,r[k]??''])));
  for(const r of online){
    r.status=r.history_status;
    r.payment_date=globalThis.WootenTime.dateKey(r.created_at);
    r.posting_date=r.posting_status==='posted'?r.mas90_posting_date:'';
    r.deposit_date=r.posting_status==='posted'?r.mas90_deposit_date:'';
    r.deposit_no=r.posting_status==='posted'?r.entered_deposit_no:'';
    r.check_no=r.posting_status==='posted'?r.entered_check_no:'';
    r.invoice_no=r.posting_status==='posted'?r.mas90_invoices:'';
    r.allocations=r.posting_status==='posted'?imported.filter(m=>m.deposit_no===r.entered_deposit_no&&m.reference===r.entered_check_no).map(m=>({invoice_no:m.invoice_no,amount:m.amount,posting_date:m.posting_date})):[];
    r.description=(r.environment==='sandbox'?'Sandbox test — no live funds. ':'')+'Online payment — '+(r.status==='captured'?'approved':r.status)+'.'+(r.posting_status!=='not_applicable'?' '+labels[r.posting_status]+'.':'');
    // Explicit customer allowlist: no gateway secrets, idempotency keys, or private employee notes.
    const allowed=['id','account_number','payment_date','posting_date','deposit_date','deposit_no','check_no','invoice_no','amount','reference','confirmation_number','description','source','status','environment','created_at','updated_at','completed_at','card_brand','card_last4','posting_status','allocations'];
    rows.push(Object.fromEntries(allowed.map(k=>[k,r[k]??''])));
  }
  return {rows,totalPaid:imported.reduce((sum,r)=>sum+Math.round(Number(r.amount)*100),0)/100};
}
