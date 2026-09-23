// Track newly enrolled paper-statement customers atomically with customer imports.
export async function ensureNoEmailSchema(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS no_email_membership(account_number TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 0)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS no_email_import_additions(run_id TEXT NOT NULL,account_number TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(run_id,account_number))`).run();
}
export function noEmailImportStatements(env,accounts,runId){
 const statements=[];
 for(const account of new Set(accounts)){
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO no_email_import_additions(run_id,account_number)
   SELECT ?,c.account_number FROM customers c LEFT JOIN no_email_membership m ON m.account_number=c.account_number
   WHERE c.account_number=? AND trim(COALESCE(c.email,''))='' AND COALESCE(m.active,0)=0`).bind(runId,account));
  statements.push(env.DB.prepare(`INSERT INTO no_email_membership(account_number,active)
   SELECT account_number,CASE WHEN trim(COALESCE(email,''))='' THEN 1 ELSE 0 END FROM customers WHERE account_number=?
   ON CONFLICT(account_number) DO UPDATE SET active=excluded.active`).bind(account));
 }
 return statements;
}
export async function noEmailAddedCount(env,runId){
 if(!runId)return 0;
 const row=await env.DB.prepare(`SELECT COUNT(*) AS count FROM no_email_import_additions WHERE run_id=?`).bind(runId).first();
 return Number(row?.count||0);
}
