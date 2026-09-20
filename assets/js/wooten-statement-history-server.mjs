// Ver527: one paginated history of saved scheduled, test, and manual runs.
import * as Progress from './wooten-statement-progress-server.mjs';
const parse=(value,fallback=[])=>{try{return JSON.parse(value);}catch{return fallback;}};
const integer=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
const manualRun=job=>({id:job.id,progress_job_id:job.id,run_type:'manual',title:job.title,
  started_at:job.created_at,statement_date:job.statement_date,
  status:job.complete?(job.failed?'Completed with errors':'Completed'):'In progress',
  customer_count:job.total,processed_count:job.processed,failure_count:job.failed,
  results:(job.rows||[]).map(row=>({...row,success:!!row.pdf_ready}))});

export async function history(env,params){
  await Progress.ensure(env);
  const pageSize=20,query=String(params.get('search')||'').trim().slice(0,200).toLowerCase();
  // New runs do not shift the pages during navigation. Refresh starts a new view.
  const token=String(params.get('snapshot')||'');
  let bounds;
  if(/^\d+:\d+$/.test(token)){
    const [scheduled,manual]=token.split(':').map(integer);bounds={scheduled,manual};
  }else{
    bounds=await env.DB.prepare(`SELECT
      COALESCE((SELECT MAX(id) FROM statement_schedule_runs),0) AS scheduled,
      COALESCE((SELECT MAX(rowid) FROM statement_progress_jobs WHERE source='manual'),0) AS manual`).first();
  }
  const snapshot=integer(bounds.scheduled)+':'+integer(bounds.manual);
  const base=`WITH history AS (
    SELECT 'scheduled' AS source,CAST(r.id AS TEXT) AS id,r.id AS sort_id,
      julianday(r.started_at) AS sort_at,r.started_at,'' AS title,'' AS statement_date,
      CASE WHEN ?='' THEN 1 ELSE instr(lower(
        CASE WHEN r.run_type LIKE 'test_%' THEN 'test run ' ELSE '' END ||
        CASE WHEN r.run_type LIKE '%weekly' THEN 'B Weekly Biweekly Cycle B' WHEN r.run_type LIKE '%midmonth' THEN 'Legacy Mid-Month' ELSE 'A Monthly Cycle A' END || ' ' ||
        COALESCE(r.started_at,'') || ' ' || COALESCE(r.status,'') || ' ' || replace(COALESCE(r.status,''),'_',' ') || ' ' || COALESCE(r.detail_json,'')),?)>0 END AS matches
    FROM statement_schedule_runs r WHERE r.id<=?
    UNION ALL
    SELECT 'manual',j.id,j.rowid,julianday(j.created_at),j.created_at,j.title,j.statement_date,
      CASE WHEN ?='' THEN 1 ELSE instr(lower(j.title || ' Manual send ' || j.created_at || ' ' || j.statement_date || ' ' || j.customers_json || ' ' ||
        CASE WHEN (SELECT COUNT(*) FROM statement_progress_rows p WHERE p.job_id=j.id AND json_extract(p.data_json,'$.stage') IN ('complete','failed','stopped'))<json_array_length(j.customers_json)
          THEN 'In progress running queued' ELSE 'Completed' END || ' ' ||
        CASE WHEN EXISTS(SELECT 1 FROM statement_progress_rows p WHERE p.job_id=j.id AND (json_extract(p.data_json,'$.stage') IN ('failed','stopped') OR EXISTS(SELECT 1 FROM json_each(p.data_json,'$.channels') c WHERE json_extract(c.value,'$.status')='failed')))
          THEN 'Completed with errors failed' ELSE '' END),?)>0
        OR EXISTS(SELECT 1 FROM statement_progress_rows p WHERE p.job_id=j.id AND instr(lower(p.data_json),?)>0) END
    FROM statement_progress_jobs j WHERE j.source='manual' AND j.rowid<=?
  )`;
  const args=[query,query,integer(bounds.scheduled),query,query,query,integer(bounds.manual)];
  const counts=await env.DB.prepare(base+' SELECT COUNT(*) AS total,COALESCE(SUM(matches),0) AS filtered_total FROM history').bind(...args).first();
  const total=Number(counts.total)||0,filteredTotal=Number(counts.filtered_total)||0;
  const pages=Math.max(1,Math.ceil(filteredTotal/pageSize));
  const page=Math.min(pages,Math.max(1,integer(params.get('page'))||1));
  const records=(await env.DB.prepare(base+' SELECT source,id,started_at,title,statement_date FROM history WHERE matches ORDER BY sort_at DESC,source ASC,sort_id DESC LIMIT ? OFFSET ?').bind(...args,pageSize,(page-1)*pageSize).all()).results||[];
  const ids=records.filter(row=>row.source==='scheduled').map(row=>Number(row.id));
  const saved=ids.length?(await env.DB.prepare(`SELECT * FROM statement_schedule_runs WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results||[]:[];
  const scheduled=new Map(saved.map(row=>[String(row.id),{...row,detail_json:undefined,customers_json:undefined,config_json:undefined,
    results:parse(row.detail_json),combined_pdf_parts:parse(row.combined_pdf_parts_json),group_combined_pdf_parts:parse(row.group_combined_pdf_parts_json)}]));
  const runs=[];
  for(let start=0;start<records.length;start+=4){
    runs.push(...await Promise.all(records.slice(start,start+4).map(async record=>{
      if(record.source==='scheduled')return scheduled.get(record.id);
      try{const job=await Progress.snapshot(env,record.id);if(!job)throw new Error('Missing run');return manualRun(job);}
      catch{return {id:record.id,progress_job_id:record.id,run_type:'manual',title:record.title,started_at:record.started_at,statement_date:record.statement_date,status:'Details unavailable',details_unavailable:'Sending details could not be loaded. Click the run title or refresh to retry.'};}
    })));
  }
  return {runs:runs.filter(Boolean),pagination:{page,page_size:pageSize,pages,total,filtered_total:filteredTotal,snapshot},search:query};
}
