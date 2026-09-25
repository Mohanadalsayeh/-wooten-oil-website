/* Read-only invoice browsing. Customer account scope comes only from the session. */
import {schema} from './wooten-invoices-server.mjs';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie, X-Admin-Key'}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const account=value=>{const s=String(value??'').trim();if(!/^\d{1,7}$/.test(s))throw fail('Invalid customer number.');return s.padStart(7,'0');};
const positive=(value,fallback,max)=>{const n=Number(value);return Number.isInteger(n)&&n>0?Math.min(n,max):fallback;};
const columns='division,account_number,invoice_no,invoice_type,invoice_date,due_date,customer_name,balance_cents';
const detailFields=['ARDivisionNo','CustomerNo','InvoiceNo','InvoiceType','InvoiceDate','InvoiceDueDate','InvoiceDiscountDate','CustomerName','Balance','DiscountAmt','SalesTaxAmt','FreightAmt','CustomerPONo','TermsCode'];
export async function readInvoices({request,env,customer=null,admin=false}){
 try{
  if(request.method!=='GET')return reply({success:false,error:'Method not allowed.'},405);
  if(!admin&&!customer)return reply({success:false,error:'Please sign in to view your invoices.'},401);
  if(!env?.DB)return reply({success:false,error:'Invoice database is not configured.'},503);
  const p=new URL(request.url).searchParams,requested=p.get('account_number');
  const selected=admin?(requested?account(requested):''):account(customer.account_number);
  if(!admin&&requested&&account(requested)!==selected)throw fail('This account is not selected in your session.',403);
  await schema(env.DB);const db=env.DB;
  const active=await db.prepare('SELECT r.* FROM invoice_import_active a JOIN invoice_import_runs r ON r.run_id=a.run_id WHERE a.id=1').first();
  // Do not expose administrative actors, staged imports, or raw source JSON to customers.
  const imported=active?{completed_at:active.completed_at,mode:active.mode}:null;
  const latest=admin?await db.prepare('SELECT status FROM invoice_import_runs ORDER BY seq DESC LIMIT 1').first():null;
  const base={success:true,active:imported,...(admin?{latest}:{}),account_number:selected,customer_name:admin?'':String(customer.account_name||'')};
  if(p.get('detail')==='1'){
   if(!selected)throw fail('Choose a customer first.');
   const keys=['division','invoice_no','invoice_type'].map(k=>{const v=p.get(k);if(!v||v.length>40)throw fail('The complete invoice reference is required.');return v;});
   if(!active)throw fail('Invoice is no longer available. Refresh the invoice list.',404);
   const row=await db.prepare(`SELECT source_json FROM mas90_invoices WHERE run_id=? AND account_number=? AND division=? AND invoice_no=? AND invoice_type=?`).bind(active.run_id,selected,...keys).first();
   if(!row)throw fail('Invoice is no longer available. Refresh the invoice list.',404);
   const source=JSON.parse(row.source_json),invoice={};
   for(const key of [...detailFields,...(admin?['SalespersonName','Comment']:[])])invoice[key]=source[key]??null;
   return reply({...base,invoice});
  }
  const size=positive(p.get('page_size'),20,500),requestedPage=positive(p.get('page'),1,1000000);
  if(!active)return reply({...base,total:0,rows:[],page:1,pages:1,page_size:size,invoice_types:[]});
  const where=['run_id=?'],args=[active.run_id];
  if(selected){where.push('account_number=?');args.push(selected);}
  const scope=where.join(' AND '),scopeArgs=[...args];
  const search=(p.get('search')||'').trim().slice(0,120);
  if(search){const pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';where.push("(account_number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR invoice_no LIKE ? ESCAPE '\\')");args.push(pattern,pattern,pattern);}
  const type=p.get('invoice_type')||'all';if(type!=='all'){where.push('invoice_type=?');args.push(type.slice(0,40));}
  const from=p.get('date_from')||'',to=p.get('date_to')||'';
  for(const value of [from,to])if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw fail('Choose a valid invoice date.');
  if(from&&to&&from>to)throw fail('Invoice Date From must be on or before Invoice Date To.');
  if(from){where.push('invoice_date>=?');args.push(from);}if(to){where.push('invoice_date<=?');args.push(to);}
  const balances={positive:'balance_cents>0',zero:'balance_cents=0',credit:'balance_cents<0'};
  if(Object.hasOwn(balances,p.get('balance')))where.push(balances[p.get('balance')]);
  const orders={division_asc:'division ASC',division_desc:'division DESC',invoice_desc:'invoice_date DESC',invoice_asc:'invoice_date ASC',due_asc:'due_date IS NULL,due_date ASC',due_desc:'due_date IS NULL,due_date DESC',customer_asc:'account_number ASC',customer_desc:'account_number DESC',name_asc:'customer_name COLLATE NOCASE ASC',name_desc:'customer_name COLLATE NOCASE DESC',number_asc:'invoice_no ASC',number_desc:'invoice_no DESC',type_asc:'invoice_type ASC',type_desc:'invoice_type DESC',balance_asc:'balance_cents ASC',balance_desc:'balance_cents DESC'};
  const order=Object.hasOwn(orders,p.get('sort'))?orders[p.get('sort')]:orders.invoice_desc,filter=where.join(' AND ');
  const count=await db.prepare(`SELECT COUNT(*) total FROM mas90_invoices WHERE ${filter}`).bind(...args).first();
  const total=count.total,pages=Math.max(1,Math.ceil(total/size)),page=Math.min(requestedPage,pages);
  const rows=await db.prepare(`SELECT ${columns} FROM mas90_invoices WHERE ${filter} ORDER BY ${order},account_number,invoice_no,invoice_type,division LIMIT ? OFFSET ?`).bind(...args,size,(page-1)*size).all();
  const types=await db.prepare(`SELECT DISTINCT invoice_type FROM mas90_invoices WHERE ${scope} ORDER BY invoice_type`).bind(...scopeArgs).all();
  return reply({...base,total,page,pages,page_size:size,rows:rows.results||[],invoice_types:(types.results||[]).map(r=>r.invoice_type)});
 }catch(e){return reply({success:false,error:e.status?e.message:'Invoices could not be loaded. Please try again.'},e.status||500);}
}
