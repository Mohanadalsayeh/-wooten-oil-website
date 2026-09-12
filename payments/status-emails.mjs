import '../assets/js/wooten-central-time.js';
const recipient='payments@wootenoil.com';
const labels={captured:'Approved',canceled:'Canceled',pending:'Pending',declined:'Declined (Denied)'};
export async function ensureSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS payment_status_emails (
    id INTEGER PRIMARY KEY,intent_id TEXT NOT NULL,status TEXT NOT NULL,
    account_number TEXT NOT NULL,amount_cents INTEGER NOT NULL,currency TEXT NOT NULL,
    reference TEXT,processor_id TEXT,event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    state TEXT NOT NULL DEFAULT 'queued',message_id TEXT,note TEXT,
    subject TEXT,message TEXT,recipient TEXT NOT NULL DEFAULT 'payments@wootenoil.com',
    checked_at TEXT NOT NULL DEFAULT '',attempt_at TEXT,UNIQUE(intent_id,status))`).run();
  // One notice for each outcome reached, never for a repeated poll or old record.
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS payment_status_email_event AFTER UPDATE OF status ON online_payment_transactions
    WHEN NEW.status<>OLD.status AND NEW.status IN ('captured','canceled','pending','declined')
    BEGIN INSERT OR IGNORE INTO payment_status_emails(intent_id,status,account_number,amount_cents,currency,reference,processor_id)
    VALUES(NEW.id,NEW.status,NEW.account_number,NEW.amount_cents,NEW.currency,COALESCE(NULLIF(NEW.provider_reference,''),NEW.id),NEW.provider_transaction_id); END`).run();
}
export async function detail(env,id){
  return (await env.DB.prepare(`SELECT status,event_at,state,message_id,note,recipient,attempt_at,subject FROM payment_status_emails WHERE intent_id=? ORDER BY id`).bind(id).all()).results||[];
}
export async function pump(env,transport){
  await env.DB.prepare(`UPDATE payment_status_emails SET state='uncertain',note='Delivery result unknown. Check the email provider before sending again.'
    WHERE state='sending' AND julianday(attempt_at)<julianday('now','-10 minutes')`).run();
  const rows=(await env.DB.prepare(`SELECT * FROM payment_status_emails WHERE state IN ('queued','waiting') ORDER BY checked_at,id LIMIT 8`).all()).results||[];
  for(const n of rows){
    await env.DB.prepare('UPDATE payment_status_emails SET checked_at=CURRENT_TIMESTAMP WHERE id=?').bind(n.id).run();
    if(!transport.configured('email')){
      await env.DB.prepare("UPDATE payment_status_emails SET state='waiting',note='Waiting for email service configuration.' WHERE id=? AND state IN ('queued','waiting')").bind(n.id).run();continue;
    }
    const p=await env.DB.prepare(`SELECT p.status AS current_status,
      (SELECT account_name FROM customers WHERE account_number=p.account_number LIMIT 1) AS customer_name,
      CASE WHEN EXISTS(SELECT 1 FROM heartland_payment_attempts WHERE intent_id=p.id AND environment='sandbox')
        OR EXISTS(SELECT 1 FROM hosted_payment_links WHERE intent_id=p.id AND environment='sandbox') THEN 'Sandbox test'
      WHEN EXISTS(SELECT 1 FROM heartland_payment_attempts WHERE intent_id=p.id AND environment='production')
        OR EXISTS(SELECT 1 FROM hosted_payment_links WHERE intent_id=p.id AND environment='production') THEN 'Production'
      ELSE 'Unknown environment' END AS environment,
      EXISTS(SELECT 1 FROM hosted_payment_reviews r WHERE r.intent_id=p.id AND NOT EXISTS(SELECT 1 FROM hosted_payment_review_resolutions x WHERE x.intent_id=p.id)) AS review
      FROM online_payment_transactions p WHERE p.id=?`).bind(n.intent_id).first();
    if(!p)continue;
    const status=labels[n.status],subject=`[${p.environment}] Payment ${status} — Customer #${n.account_number} — ${n.reference}`;
    const warning=p.environment==='Sandbox test'?'SANDBOX TEST: No live funds were collected. Do not post this test payment to MAS 90.':p.environment!=='Production'?'Payment environment is unknown. Verify the processor record before treating this as a live payment.':p.review?'Payment requires review. A successful live payment has not been verified.':n.status==='captured'?'An approved online payment was recorded. Follow the MAS 90 posting workflow; account posting is separate from payment approval.':'This status does not confirm receipt of funds. Do not post it as an approved payment.';
    const message=[`Wooten Oil payment status: ${status}`,`Customer: ${p.customer_name||'Name unavailable'}`,`Customer number: ${n.account_number}`,`Amount: ${n.currency} ${(n.amount_cents/100).toFixed(2)}`,`Reference: ${n.reference}`,`Processor transaction ID: ${n.processor_id||'Not available'}`,`Status date/time: ${globalThis.WootenTime.dateTime(n.event_at)}`,`Environment: ${p.environment}`,
      ...(p.current_status!==n.status?[`This is an earlier status event. Current saved status: ${labels[p.current_status]||p.current_status}.`]:[]),warning,'Open Payment Transactions in the admin portal to review the record.'].join('\n');
    const claim=await env.DB.prepare(`UPDATE payment_status_emails SET state='sending',attempt_at=CURRENT_TIMESTAMP,note='',subject=?,message=?,recipient=? WHERE id=? AND state IN ('queued','waiting')`).bind(subject,message,recipient,n.id).run();
    if(!claim.meta?.changes)continue;
    try{
      const result=await transport.send('email',{email:recipient,subject,message,reference:n.reference});
      if(!result?.id)throw new Error('Missing provider message ID.');
      await env.DB.prepare("UPDATE payment_status_emails SET state='accepted',message_id=?,note='Accepted by the email provider; inbox delivery is not confirmed.' WHERE id=? AND state='sending'").bind(result.id,n.id).run();
    }catch(e){
      await env.DB.prepare("UPDATE payment_status_emails SET state=?,note=? WHERE id=? AND state='sending'").bind(e.definite?'failed':'uncertain',e.definite?String(e.message).slice(0,400):'Delivery result unknown. Check the email provider before sending again.',n.id).run();
    }
  }
}
