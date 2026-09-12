import '../assets/js/wooten-central-time.js';
const labels={captured:'Approved',pending:'Pending',canceled:'Canceled',declined:'Declined (Denied)'};
const channels=['email','sms','admin_sms'];
const sandbox=`EXISTS(SELECT 1 FROM heartland_payment_attempts a WHERE a.intent_id=p.id AND a.environment='sandbox') OR EXISTS(SELECT 1 FROM hosted_payment_links h WHERE h.intent_id=p.id AND h.environment='sandbox')`;
export async function ensureSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sandbox_payment_notifications (
    id INTEGER PRIMARY KEY,intent_id TEXT NOT NULL,status TEXT NOT NULL,account_number TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,currency TEXT NOT NULL,reference TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated INTEGER NOT NULL DEFAULT 0,admin_read INTEGER NOT NULL DEFAULT 0,customer_name TEXT,email TEXT,phone TEXT,
    title TEXT,message TEXT,checked_at TEXT NOT NULL DEFAULT '',
    ${channels.map(c=>`${c}_state TEXT NOT NULL DEFAULT 'queued',${c}_id TEXT,${c}_note TEXT,${c}_attempt_at TEXT`).join(',')},
    UNIQUE(intent_id,status))`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS sandbox_payment_status_event AFTER UPDATE OF status ON online_payment_transactions
    WHEN OLD.status<>NEW.status AND NEW.status IN ('captured','pending','canceled','declined')
    BEGIN INSERT OR IGNORE INTO sandbox_payment_notifications(intent_id,status,account_number,amount_cents,currency,reference)
    VALUES(NEW.id,NEW.status,NEW.account_number,NEW.amount_cents,NEW.currency,COALESCE(NULLIF(NEW.provider_reference,''),NEW.id)); END`).run();
  // Activation and customer portal insertion are atomic. Deleting a read portal
  // notification later does not cause it to be recreated by status polling.
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS sandbox_payment_portal_notice AFTER UPDATE OF activated ON sandbox_payment_notifications
    WHEN OLD.activated=0 AND NEW.activated=1 BEGIN
    INSERT INTO portal_notifications(account_number,title,message,action_type,action_id)
    VALUES(NEW.account_number,NEW.title,NEW.message,'sandbox_payment',NEW.id); END`).run();
}
export async function detail(env,id){
  return (await env.DB.prepare(`SELECT id,status,created_at,title,${channels.map(c=>`${c}_state,${c}_id,${c}_note,${c}_attempt_at`).join(',')}
    FROM sandbox_payment_notifications WHERE intent_id=? AND activated=1 ORDER BY id`).bind(id).all()).results||[];
}
export async function pump(env,transport){
  for(const c of channels)await env.DB.prepare(`UPDATE sandbox_payment_notifications SET ${c}_state='uncertain',${c}_note='Delivery result unknown. Check the provider before sending again.'
    WHERE ${c}_state='sending' AND julianday(${c}_attempt_at)<julianday('now','-10 minutes')`).run();
  const events=(await env.DB.prepare(`SELECT n.id FROM sandbox_payment_notifications n JOIN online_payment_transactions p ON p.id=n.intent_id
    WHERE (${sandbox}) AND (n.activated=0 OR ${channels.map(c=>`n.${c}_state IN ('queued','waiting')`).join(' OR ')}) ORDER BY n.checked_at,n.id LIMIT 8`).all()).results||[];
  for(const {id} of events){
    await env.DB.prepare('UPDATE sandbox_payment_notifications SET checked_at=CURRENT_TIMESTAMP WHERE id=?').bind(id).run();
    const row=await env.DB.prepare(`SELECT n.*,c.account_name,c.email AS customer_email,c.phone AS customer_phone FROM sandbox_payment_notifications n
      JOIN online_payment_transactions p ON p.id=n.intent_id LEFT JOIN customers c ON c.account_number=n.account_number WHERE n.id=? AND (${sandbox}) LIMIT 1`).bind(id).first();
    if(!row)continue;
    const title='Sandbox payment — '+labels[row.status];
    const message=`SANDBOX TEST — ${labels[row.status]}. Test amount: ${row.currency} ${(row.amount_cents/100).toFixed(2)}. Reference: ${row.reference}. Recorded: ${globalThis.WootenTime.dateTime(row.created_at)}. No live funds were collected. This test will not be posted to your account or change your balance.`;
    await env.DB.prepare(`UPDATE sandbox_payment_notifications SET activated=1,customer_name=?,email=?,phone=?,title=?,message=? WHERE id=? AND activated=0`)
      .bind(row.account_name||'Customer',row.customer_email||'',row.customer_phone||'',title,message,id).run();
    const n=await env.DB.prepare('SELECT * FROM sandbox_payment_notifications WHERE id=?').bind(id).first();
    for(const c of channels){
      if(!['queued','waiting'].includes(n[c+'_state']))continue;
      const phone=c==='admin_sms'?String(env.PAYMENT_ADMIN_SMS_TO||'').trim():n.phone;
      if(c==='admin_sms'&&!phone){await state(env,id,c,'waiting','Set PAYMENT_ADMIN_SMS_TO to the office/admin SMS number.');continue;}
      if(!(c==='email'?n.email:phone)){await state(env,id,c,'skipped','Customer contact information is missing.');continue;}
      const channel=c==='email'?'email':'sms';
      if(!transport.configured(channel)){await state(env,id,c,'waiting','Waiting for messaging service configuration.');continue;}
      const claimed=await env.DB.prepare(`UPDATE sandbox_payment_notifications SET ${c}_state='sending',${c}_attempt_at=CURRENT_TIMESTAMP,${c}_note=''
        WHERE id=? AND ${c}_state IN ('queued','waiting')`).bind(id).run();
      if(!claimed.meta?.changes)continue;
      try{
        const result=await transport.send(channel,{...n,phone,subject:n.title+' — '+n.reference,
          message:c==='admin_sms'?`Customer #${n.account_number} (${n.customer_name}). ${n.message}`:n.message,
          sandbox_notice_id:n.id,sandbox_notice_channel:c});
        if(!result?.id)throw new Error('Missing provider message ID');
        await env.DB.prepare(`UPDATE sandbox_payment_notifications SET ${c}_state='accepted',${c}_id=?,${c}_note='Accepted by provider; delivery is not yet confirmed.' WHERE id=? AND ${c}_state='sending'`).bind(result.id,id).run();
      }catch(e){await state(env,id,c,e.definite?'failed':'uncertain',e.definite?String(e.message).slice(0,400):'Delivery result unknown. Check the provider before sending again.');}
    }
  }
}
async function state(env,id,c,value,note){
  const prior=['waiting','skipped'].includes(value)?"('queued','waiting')":"('sending')";
  await env.DB.prepare(`UPDATE sandbox_payment_notifications SET ${c}_state=?,${c}_note=? WHERE id=? AND ${c}_state IN ${prior}`).bind(value,note,id).run();
}
// Only invoked after the existing Twilio webhook signature check.
export async function smsStatus(env,sid,status,note,id,c){
  if(!sid||!['sms','admin_sms'].includes(c))return;
  const value=status==='delivered'?'delivered':['failed','opted_out'].includes(status)?'failed':'accepted';
  await env.DB.prepare(`UPDATE sandbox_payment_notifications SET ${c}_state=?,${c}_id=?,${c}_note=?
    WHERE id=? AND (${c}_id=? OR (${c}_id IS NULL AND ${c}_state='sending')) AND ${c}_state NOT IN ('delivered','failed')`)
    .bind(value,sid,note||(value==='delivered'?'Delivery confirmed by Twilio.':'Accepted by Twilio; delivery is not yet confirmed.'),Number(id)||0,sid).run();
}
