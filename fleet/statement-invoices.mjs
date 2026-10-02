// Invoice supplements use the active MAS 90 open-invoice import and the customer's statement period.
const safeDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export async function load(db,account,period){
 if(!/^\d{7,20}$/.test(String(account||''))||!safeDay(period?.from)||!safeDay(period?.to)||period.from>period.to)throw Error('Choose a valid account and statement invoice period.');
 const table=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_import_active'").first();
 if(!table)return {available:false,rows:[],period};
 const active=await db.prepare('SELECT run_id FROM invoice_import_active WHERE id=1').first();
 if(!active)return {available:false,rows:[],period};
 const response=await db.prepare(`SELECT invoice_no,invoice_type,division,invoice_date,due_date,balance_cents
   FROM mas90_invoices WHERE run_id=? AND account_number=? AND invoice_date>=? AND invoice_date<=?
   ORDER BY invoice_date,invoice_no,invoice_type,division LIMIT 501`)
   .bind(active.run_id,account,period.from,period.to).all();
 const rows=response.results||[];
 if(rows.length>500)throw Error('More than 500 open invoices match this customer and period. Choose a shorter date range before generating the statement.');
 return {available:true,rows,period};
}
const clean=value=>String(value??'').normalize('NFKD').replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
const esc=value=>clean(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const date=value=>{const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[2]+'/'+m[3]+'/'+m[1]:'-';};
const money=cents=>{const n=Number(cents||0)/100;return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD'}):'-';};
export function pages(invoices,customer,statementDate,letterhead){
 if(!invoices)return [];
 const rows=invoices?.rows||[],period=invoices.period,perPage=25,parts=Math.max(1,Math.ceil(rows.length/perPage)),result=[];
 for(let page=0;page<parts;page++){
  const ops=[letterhead()];
  const text=(x,y,size,value,bold=false,color='0.08 0.19 0.29')=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg ${x} ${y} Td (${esc(value)}) Tj ET`);
  const line=y=>ops.push(`0.82 0.88 0.92 RG 0.5 w 42 ${y} m 570 ${y} l S`);
  text(42,655,13,'MAS 90 Open Invoices',true);
  text(42,637,9,'Statement: '+date(statementDate)+'  |  Customer # '+customer.account_number);
  text(42,619,9,'Invoice dates: '+date(period.from)+' through '+date(period.to)+' (inclusive)');
  text(42,597,8,'Current open-invoice import only; paid invoices may no longer appear.',false,'0.34 0.40 0.46');
  text(42,579,9,clean(customer.account_name||'Customer').slice(0,85),true);
  ops.push('0.94 0.97 0.99 rg 42 535 528 27 re f');
  for(const [x,label] of [[48,'INVOICE #'],[170,'TYPE'],[223,'DIV'],[263,'INVOICE DATE'],[364,'DUE DATE'],[466,'OPEN BALANCE']])text(x,545,8,label,true);
  const slice=rows.slice(page*perPage,(page+1)*perPage);
  slice.forEach((row,i)=>{
   const y=520-i*17;
   if(i%2===1)ops.push(`0.975 0.981 0.987 rg 42 ${y-4} 528 17 re f`);
   text(48,y,8,String(row.invoice_no||'').slice(0,22));text(170,y,8,String(row.invoice_type||'').slice(0,8));
   text(223,y,8,String(row.division||'').slice(0,5));text(263,y,8,date(row.invoice_date));text(364,y,8,date(row.due_date));text(466,y,8,money(row.balance_cents));
  });
  if(!rows.length)text(48,511,9,invoices.available?'No open invoices in this period.':'No MAS 90 open-invoice import is available.');
  line(82);text(42,68,8,'Open invoice records: '+rows.length+(parts>1?'  |  Section '+(page+1)+' of '+parts:''));
  text(42,56,7.5,'Open balances reflect the latest import and may differ from balances on the invoice date.');
  result.push(ops.join('\n'));
 }
 return result;
}
