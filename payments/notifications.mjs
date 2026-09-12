import {eligible} from './mas90-posting.mjs';

// A transition event, not a scan of historical approvals. Installing this feature
// never sends confirmations for payments captured before installation.
export async function ensureSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS payment_notification_events (
    id INTEGER PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated INTEGER NOT NULL DEFAULT 0, admin_read INTEGER NOT NULL DEFAULT 0,
    account_number TEXT, customer_name TEXT, reference TEXT, amount_cents INTEGER,
    email TEXT, phone TEXT, message TEXT,
    email_state TEXT NOT NULL DEFAULT 'queued',email_id TEXT,email_note TEXT,
    sms_state TEXT NOT NULL DEFAULT 'queued',sms_id TEXT,sms_note TEXT,
    checked_at TEXT NOT NULL DEFAULT '', email_attempt_at TEXT,sms_attempt_at TEXT
  )`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS payment_received_event AFTER UPDATE OF status ON online_payment_transactions
    WHEN NEW.status='captured' AND OLD.status<>'captured'
    BEGIN INSERT OR IGNORE INTO payment_notification_events(intent_id) VALUES(NEW.id); END`).run();
}
export async function detail(env,id){
  return env.DB.prepare(`SELECT activated,created_at,email_state,email_id,email_note,email_attempt_at,
    sms_state,sms_id,sms_note,sms_attempt_at FROM payment_notification_events WHERE intent_id=?`).bind(id).first();
}
const ready=(p='p')=>`(${eligible(p)}) AND trim(${p}.provider_transaction_id)<>''`;
export async function pump(env,transport){
  // Recover abandoned claims without resending a message that may have reached a provider.
  for(const c of ['email','sms'])await env.DB.prepare(`UPDATE payment_notification_events SET ${c}_state='uncertain',
    ${c}_note='Delivery result unknown. Check the provider before sending again.'
    WHERE ${c}_state='sending' AND julianday(${c}_attempt_at)<julianday('now','-10 minutes')`).run();
  const events=(await env.DB.prepare(`SELECT n.id,n.intent_id FROM payment_notification_events n
    JOIN online_payment_transactions p ON p.id=n.intent_id
    WHERE ${ready()} AND (n.activated=0 OR n.email_state IN ('queued','waiting') OR n.sms_state IN ('queued','waiting'))
    ORDER BY n.checked_at,n.id LIMIT 8`).all()).results||[];
  for(const event of events){
    await env.DB.prepare('UPDATE payment_notification_events SET checked_at=CURRENT_TIMESTAMP WHERE id=?').bind(event.id).run();
    const p=await env.DB.prepare(`SELECT p.*,c.account_name,c.email,c.phone FROM online_payment_transactions p
      LEFT JOIN customers c ON c.account_number=p.account_number WHERE p.id=? AND ${ready()} LIMIT 1`).bind(event.intent_id).first();
    if(!p)continue;
    const reference=p.provider_reference||p.id;
    const message=`Wooten Oil: Your payment of $${(p.amount_cents/100).toFixed(2)} has been received. Confirmation: ${reference}. It will be posted to your account within 24 business hours.`;
    await env.DB.prepare(`UPDATE payment_notification_events SET activated=1,account_number=?,customer_name=?,reference=?,amount_cents=?,email=?,phone=?,message=? WHERE id=? AND activated=0`)
      .bind(p.account_number,p.account_name||'Customer',reference,p.amount_cents,p.email||'',p.phone||'',message,event.id).run();
    const n=await env.DB.prepare('SELECT * FROM payment_notification_events WHERE id=?').bind(event.id).first();
    for(const channel of ['email','sms']){
      if(!['queued','waiting'].includes(n[channel+'_state']))continue;
      const destination=channel==='email'?n.email:n.phone;
      if(!destination){await state(env,n.id,channel,'skipped','No customer '+(channel==='email'?'email address':'phone number')+' on file.');continue;}
      if(!transport.configured(channel)){await state(env,n.id,channel,'waiting','Waiting for '+(channel==='email'?'email':'SMS')+' service configuration.');continue;}
      const claim=await env.DB.prepare(`UPDATE payment_notification_events SET ${channel}_state='sending',${channel}_attempt_at=CURRENT_TIMESTAMP,${channel}_note=''
        WHERE id=? AND ${channel}_state IN ('queued','waiting') AND EXISTS(SELECT 1 FROM online_payment_transactions p WHERE p.id=intent_id AND ${ready()})`).bind(n.id).run();
      if(!claim.meta?.changes)continue;
      try{
        const result=await transport.send(channel,n);
        if(!result?.id)throw new Error('The provider did not return a message ID.');
        await env.DB.prepare(`UPDATE payment_notification_events SET ${channel}_state='accepted',${channel}_id=?,${channel}_note='Accepted by the messaging provider; delivery is not yet confirmed.' WHERE id=? AND ${channel}_state='sending'`).bind(result.id,n.id).run();
      }catch(error){
        await state(env,n.id,channel,error.definite?'failed':'uncertain',error.definite?String(error.message).slice(0,400):'Delivery result unknown. Check the provider before sending again.');
      }
    }
  }
}
async function state(env,id,channel,value,note){
  const prior=['waiting','skipped'].includes(value)?"('queued','waiting')":"('sending')";
  await env.DB.prepare(`UPDATE payment_notification_events SET ${channel}_state=?,${channel}_note=? WHERE id=? AND ${channel}_state IN ${prior}`).bind(value,note,id).run();
}
// Caller verifies Twilio's signature before invoking this function.
export async function smsStatus(env,sid,status,note,eventId){
  if(!sid)return;
  const value=status==='delivered'?'delivered':['failed','opted_out'].includes(status)?'failed':'accepted';
  await env.DB.prepare(`UPDATE payment_notification_events SET sms_state=?,sms_note=?,sms_id=? WHERE (sms_id=? OR (id=? AND sms_state='sending' AND sms_id IS NULL))
    AND sms_state NOT IN ('delivered','failed')`).bind(value,note|| (value==='delivered'?'Delivery confirmed by Twilio.':'Accepted by Twilio; delivery is not yet confirmed.'),sid,sid,Number(eventId)||0).run();
}
