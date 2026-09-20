// Ver511: private, read-only progress snapshots and exact PDFs for a statement job.
const parse=(value,fallback={})=>{try{return JSON.parse(value);}catch{return fallback;}};
export async function ensure(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS statement_progress_jobs (id TEXT PRIMARY KEY,run_id INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL,title TEXT NOT NULL,statement_date TEXT NOT NULL,options_json TEXT NOT NULL,customers_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS statement_progress_rows (job_id TEXT NOT NULL,account_number TEXT NOT NULL,data_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(job_id,account_number))`).run();
}
export async function create(env,{id,runId=0,source,title,date,options,customers}){
  await ensure(env);
  await env.DB.prepare(`INSERT OR IGNORE INTO statement_progress_jobs(id,run_id,source,title,statement_date,options_json,customers_json) VALUES(?,?,?,?,?,?,?)`).bind(id,runId,source,title,date,JSON.stringify(options),JSON.stringify(customers.map(c=>({account_number:String(c.account_number),account_name:String(c.account_name||c.account_number),total_balance:Number(c.total_balance)||0})))).run();
  return id;
}
export async function job(env,id){
  await ensure(env);
  const row=await env.DB.prepare('SELECT * FROM statement_progress_jobs WHERE id=?').bind(id).first();
  return row?{...row,options:parse(row.options_json),customers:parse(row.customers_json,[])}:null;
}
export function initial(customer,options){
  return {...customer,stage:'queued',pdf_ready:false,channels:Object.fromEntries(['portal','email','sms'].map(c=>[c,{status:options[c]?'queued':'not_selected',reason:''}]))};
}
export async function claim(env,id,customer,options){
  const row=initial(customer,options);row.stage='generating';
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO statement_progress_rows(job_id,account_number,data_json) VALUES(?,?,?)`).bind(id,customer.account_number,JSON.stringify(row)).run();
  return Number(result?.meta?.changes)===1?row:null;
}
export async function save(env,id,row){
  if(!id)return;
  await env.DB.prepare(`UPDATE statement_progress_rows SET data_json=?,updated_at=CURRENT_TIMESTAMP WHERE job_id=? AND account_number=?`).bind(JSON.stringify(row),id,row.account_number).run();
}
export async function savedRow(env,id,account){return parse((await env.DB.prepare('SELECT data_json FROM statement_progress_rows WHERE job_id=? AND account_number=?').bind(id,account).first())?.data_json,null);}
export async function snapshot(env,id){
  const item=await job(env,id);if(!item)return null;
  const records=(await env.DB.prepare('SELECT account_number,data_json,updated_at FROM statement_progress_rows WHERE job_id=?').bind(id).all()).results||[];
  const byAccount=new Map(records.map(r=>[r.account_number,{...parse(r.data_json),updated_at:r.updated_at}]));
  const rows=item.customers.map(c=>byAccount.get(c.account_number)||initial(c,item.options));
  // Provider callbacks may arrive after the request finished. Read their latest status.
  const smsRows=rows.filter(r=>r.sms_sid);
  for(let i=0;i<smsRows.length;i+=80){
    const chunk=smsRows.slice(i,i+80);
    try{
      const logs=(await env.DB.prepare(`SELECT sms_sid,sms_status,sms_error_code,sms_error_message FROM admin_communication_log WHERE sms_sid IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk.map(r=>r.sms_sid)).all()).results||[];
      const states=new Map(logs.map(r=>[r.sms_sid,r]));
      for(const row of chunk){
        const state=states.get(row.sms_sid),status=String(state?.sms_status||'').toLowerCase();
        if(['delivered','read'].includes(status))row.channels.sms={status:'delivered',reason:'Delivery confirmed by SMS provider.'};
        if(['failed','undelivered','opted_out','canceled'].includes(status))row.channels.sms={status:'failed',reason:[state.sms_error_message||'The SMS provider reported '+status+'.',state.sms_error_code?'Code '+state.sms_error_code:''].filter(Boolean).join(' ')};
      }
    }catch(error){if(!String(error?.message||error).includes('no such table'))throw error;}
  }
  let runStatus='',runResults=[];
  if(item.run_id){const run=await env.DB.prepare('SELECT status,detail_json FROM statement_schedule_runs WHERE id=?').bind(item.run_id).first();runStatus=String(run?.status||'');runResults=parse(run?.detail_json,[]);}
  const stopped=runStatus&&runStatus!=='running';
  for(const row of rows){
    if(stopped&&!['complete','failed'].includes(row.stage)){
      row.stage='stopped';row.error=runResults.find(r=>r.account_number===row.account_number)?.error||'Run ended before this customer completed ('+runStatus+').';
      for(const channel of Object.values(row.channels))if(['queued','sending'].includes(channel.status)){channel.status='not_sent';channel.reason=row.error;}
    }
    row.pdf_ready=Boolean(row.pdf_key);delete row.pdf_key;delete row.result;
  }
  const processed=rows.filter(r=>['complete','failed','stopped'].includes(r.stage)).length;
  const failed=rows.filter(r=>r.stage==='failed'||r.stage==='stopped'||Object.values(r.channels).some(c=>c.status==='failed')).length;
  return {id:item.id,run_id:item.run_id,source:item.source,title:item.title,statement_date:item.statement_date,created_at:item.created_at,options:item.options,rows,processed,total:rows.length,failed,complete:processed===rows.length,status:runStatus||((processed===rows.length)?'completed':'running')};
}
export async function recent(env){
  await ensure(env);
  return (await env.DB.prepare('SELECT id,run_id,source,title,statement_date,created_at FROM statement_progress_jobs ORDER BY created_at DESC,rowid DESC LIMIT 30').all()).results||[];
}
