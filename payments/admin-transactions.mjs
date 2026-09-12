import * as Posting from './mas90-posting.mjs';
import * as Notices from './notifications.mjs';
import * as StatusEmails from './status-emails.mjs';
import '../assets/js/wooten-central-time.js';
const portalTime=globalThis.WootenTime;
// Read-only admin reporting over the saved online payment ledger.
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const statuses=['approved','pending','declined','canceled','unsubmitted','expired','failed','review','unknown'];
const providers=['heartland','globalpayments','unknown'];
const environments=['sandbox','production','unknown'];
const base=`WITH raw_transactions AS (
 SELECT p.rowid AS ledger_row,p.id,p.account_number,
 COALESCE((SELECT c.account_name FROM customers c WHERE c.account_number=p.account_number LIMIT 1),'') AS account_name,
 p.amount_cents,p.currency,p.payment_type,p.status AS saved_status,
 CASE WHEN EXISTS(SELECT 1 FROM hosted_payment_reviews r WHERE r.intent_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM hosted_payment_review_resolutions r WHERE r.intent_id=p.id) THEN 'review'
 WHEN p.status='captured' THEN 'approved' WHEN p.status IN ('pending','processing') THEN 'pending'
 WHEN p.status='initiated' THEN 'unsubmitted'
 WHEN p.status IN ('declined','canceled','expired','failed') THEN p.status ELSE 'unknown' END AS status,
 CASE WHEN a.intent_id IS NOT NULL THEN 'heartland' WHEN h.intent_id IS NOT NULL THEN 'globalpayments' ELSE 'unknown' END AS provider,
 CASE WHEN COALESCE(a.environment,h.environment) IN ('sandbox','production') THEN COALESCE(a.environment,h.environment) ELSE 'unknown' END AS environment,
 p.provider_reference,p.provider_transaction_id,p.provider_status,p.card_brand,p.card_last4,
 p.result_code,substr(p.result_message,1,2000) AS result_message,
 p.created_at,p.updated_at,p.completed_at,p.expires_at,
 COALESCE(a.last_check_ms,h.last_check_ms,0) AS last_check_ms,
 substr(COALESCE(a.last_error,h.last_error,''),1,2000) AS verification_detail
 FROM online_payment_transactions p
 LEFT JOIN heartland_payment_attempts a ON a.intent_id=p.id
 LEFT JOIN hosted_payment_links h ON h.intent_id=p.id
) , ${Posting.ctes}, transactions AS (
 SELECT t.*,s.posting_status,s.entered_deposit_no,s.entered_check_no,s.posting_revision,s.posting_updated_by,s.posting_updated_at,
 s.mas90_posting_date,s.mas90_deposit_date,s.mas90_invoices,s.posting_imported_at
 FROM raw_transactions t JOIN posting_state s ON s.intent_id=t.id
)`;
const columns=`id,account_number,account_name,amount_cents,currency,payment_type,status,saved_status,provider,environment,
 provider_reference,provider_transaction_id,provider_status,card_brand,card_last4,created_at,updated_at,completed_at,posting_status,entered_deposit_no,entered_check_no,posting_revision,posting_updated_by,posting_updated_at,mas90_posting_date,mas90_deposit_date,mas90_invoices,posting_imported_at`;
function invalid(message){const error=new Error(message);error.status=400;throw error;}
function integer(value,fallback,max){if(value===null)return fallback;if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max||Number(value)<1)invalid('Invalid page or page size.');return Number(value);}
function date(value){if(!value)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)invalid('Enter a valid date.');return value;}
function cents(value){if(!/^\d+(?:\.\d{1,2})?$/.test(value))invalid('Enter an amount with no more than two decimal places.');const result=Math.round(Number(value)*100);if(!Number.isSafeInteger(result))invalid('Amount is too large.');return result;}

export async function handle({request,env,ensureSchema,ensureImportedSchema,ensurePostingSchema,actor}){
  // Dispatcher authenticates admin users and checks Payment Transactions permission.
  if(!env.ADMIN_IMPORT_KEY||request.headers.get('X-Admin-Key')!==String(env.ADMIN_IMPORT_KEY))return response({success:false,error:'Admin authorization is required.'},401);
  if(!['GET','POST'].includes(request.method))return response({success:false,error:'Method not allowed.'},405);
  try{
    if(!env.DB)return response({success:false,error:'The payment database is unavailable.'},503);
    const url=new URL(request.url),params=url.searchParams;
    const detail=url.pathname.slice('/api/admin/payment-transactions'.length);
    await ensureSchema();await ensurePostingSchema();
    if(request.method==='POST'){
      const read=detail.match(/^\/([^/]+)\/notification-read$/);
      if(read){
        if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return response({success:false,error:'Use the portal to acknowledge notifications.'},403);
        await env.DB.prepare('UPDATE payment_notification_events SET admin_read=1 WHERE intent_id=? AND activated=1').bind(decodeURIComponent(read[1])).run();
        return response({success:true});
      }
      const match=detail.match(/^\/([^/]+)\/posting$/);
      if(!match)return response({success:false,error:'Method not allowed.'},405);
      let id;try{id=decodeURIComponent(match[1]);}catch{invalid('Invalid transaction reference.');}
      return Posting.save({request,env,id,actor});
    }

    if(detail.startsWith('/imported/')){
      const id=detail.slice('/imported/'.length);
      if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id)))return response({success:false,error:'Payment not found.'},404);
      await ensureImportedSchema();
      const transaction=await env.DB.prepare(`SELECT 'mas90-'||p.id AS id,p.account_number,
        COALESCE(NULLIF((SELECT c.account_name FROM customers c WHERE c.account_number=p.account_number LIMIT 1),''),p.customer_name,'') AS account_name,
        CAST(ROUND(p.amount*100) AS INTEGER) AS amount_cents,'USD' AS currency,'mas90' AS source,
        'posted' AS status,'posted' AS saved_status,'account_history' AS environment,'mas90' AS provider,
        p.reference AS provider_reference,p.payment_type,p.payment_date,p.posting_date,p.deposit_date,p.deposit_no,
        p.source_invoice_no AS invoice_no,p.imported_at,p.description AS result_message
        FROM customer_payments p WHERE p.id=?`).bind(Number(id)).first();
      return transaction?response({success:true,transaction}):response({success:false,error:'Payment not found.'},404);
    }
    if(detail){
      if(!/^\/[^/]+$/.test(detail))return response({success:false,error:'Transaction not found.'},404);
      let id;try{id=decodeURIComponent(detail.slice(1));}catch{invalid('Invalid transaction reference.');}
      if(id.length>200)invalid('Invalid transaction reference.');
      await ensureSchema();
      const transaction=await env.DB.prepare(base+` SELECT ${columns},result_code,result_message,expires_at,last_check_ms,verification_detail FROM transactions WHERE id=?`).bind(id).first();
      if(transaction){transaction.status_emails=await StatusEmails.detail(env,id);transaction.notifications=await Notices.detail(env,id);transaction.posting=await Posting.detail(env,id);transaction.posting_history=(await env.DB.prepare('SELECT revision,old_deposit_no,old_check_no,deposit_no,check_no,actor,note,created_at FROM online_payment_posting_audit WHERE intent_id=? ORDER BY id DESC').bind(id).all()).results||[];}
      return transaction?response({success:true,transaction}):response({success:false,error:'Transaction not found.'},404);
    }
    const page=integer(params.get('page'),1,10000000),pageSize=integer(params.get('page_size'),20,200);
    const predicates=[],args=[];
    for(const [name,allowed] of [['status',statuses],['provider',providers],['environment',environments]]){
      const value=params.get(name)||'';if(value){if(!allowed.includes(value))invalid('Invalid '+name+' filter.');predicates.push(name+'=?');args.push(value);}
    }
    const posting=params.get('posting')||'';
    if(posting){if(!Object.hasOwn(Posting.labels,posting))invalid('Invalid posting status.');predicates.push('posting_status=?');args.push(posting);}
    const from=date(params.get('from')),to=date(params.get('to'));
    if(from&&to&&from>to)invalid('The start date must be on or before the end date.');
    if(from){predicates.push('julianday(created_at)>=julianday(?)');args.push(portalTime.dayStart(from));}
    if(to){predicates.push('julianday(created_at)<julianday(?)');args.push(portalTime.dayStart(to,true));}
    let min,max;
    if(params.get('min_amount')){min=cents(params.get('min_amount'));predicates.push('amount_cents>=?');args.push(min);}
    if(params.get('max_amount')){max=cents(params.get('max_amount'));predicates.push('amount_cents<=?');args.push(max);}
    if(min!==undefined&&max!==undefined&&min>max)invalid('The minimum amount cannot exceed the maximum amount.');
    const q=String(params.get('q')||'').trim();if(q.length>160)invalid('Keep searches under 160 characters.');
    if(q){predicates.push("(account_number LIKE ? ESCAPE '\\' OR account_name LIKE ? ESCAPE '\\' OR provider_reference LIKE ? ESCAPE '\\' OR provider_transaction_id LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR card_last4 LIKE ? ESCAPE '\\')");const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(...Array(6).fill(pattern));}
    const orders={newest:'julianday(created_at) DESC,ledger_row DESC',oldest:'julianday(created_at) ASC,ledger_row ASC',amount_high:'amount_cents DESC,ledger_row DESC',amount_low:'amount_cents ASC,ledger_row ASC'};
    const sort=params.get('sort')||'newest';if(!Object.hasOwn(orders,sort))invalid('Invalid sorting option.');
    let snapshot=params.get('snapshot');
    if(snapshot!==null&&(!/^\d+$/.test(snapshot)||!Number.isSafeInteger(Number(snapshot))))invalid('Invalid export snapshot.');
    await ensureSchema();
    if(snapshot===null)snapshot=String((await env.DB.prepare('SELECT COALESCE(MAX(rowid),0) AS id FROM online_payment_transactions').first()).id);
    predicates.push('ledger_row<=?');args.push(Number(snapshot));
    const where=' WHERE '+predicates.join(' AND ');
    const groups=await env.DB.prepare(base+` SELECT status,currency,environment,COUNT(*) AS count,
      SUM(amount_cents) AS amount_cents FROM transactions`+where+' GROUP BY status,currency,environment').bind(...args).all();
    const summary={total:0,approved:0,pending:0,declined:0,canceled:0,review:0};
    const amounts=Object.fromEntries(Object.keys(summary).map(key=>[key,new Map()]));
    for(const group of groups.results||[]){
      const count=Number(group.count),value=Number(group.amount_cents);
      for(const key of ['total',group.status]){
        if(!Object.hasOwn(summary,key))continue;
        summary[key]+=count;
        // Test and live values, and different currencies, are never combined.
        const groupKey=JSON.stringify([group.environment,group.currency]);
        const aggregate=amounts[key].get(groupKey)||{environment:group.environment,currency:group.currency,amount_cents:0};
        aggregate.amount_cents+=value;amounts[key].set(groupKey,aggregate);
      }
    }
    const summaryAmounts=Object.fromEntries(Object.entries(amounts).map(([key,values])=>[key,[...values.values()]]));
    const pages=Math.max(1,Math.ceil(Number(summary.total)/pageSize)),currentPage=Math.min(page,pages);
    const rows=await env.DB.prepare(base+` SELECT ${columns} FROM transactions`+where+' ORDER BY '+orders[sort]+' LIMIT ? OFFSET ?').bind(...args,pageSize,(currentPage-1)*pageSize).all();
    return response({success:true,transactions:rows.results||[],summary,summary_amounts:summaryAmounts,total:Number(summary.total),page:currentPage,page_size:pageSize,pages,has_more:currentPage<pages,snapshot});
  }catch(error){
    if(error.status===400)return response({success:false,error:error.message},400);
    console.error('Admin payment transactions failed',error);
    return response({success:false,error:'Payment transactions could not be loaded. Please try again.'},500);
  }
}
