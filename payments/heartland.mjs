// Heartland Portico sandbox checkout. Card numbers/CVV never enter this module.
// Contract: official Portico WSDL/schema1 and Global Payments PorticoConnector.
import { DOMParser } from './vendor/xml-parser.mjs';
const NS='http://Hps.Exchange.PosGateway',SOAP='http://schemas.xmlsoap.org/soap/envelope/';
const ENDPOINT='https://cert.api2.heartlandportico.com/Hps.Exchange.PosGateway/PosGatewayService.asmx';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const positiveId=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v);
const cents=v=>/^\d+(?:\.\d{1,2})?$/.test(String(v))?Math.round(Number(v)*100):NaN;
const money=n=>(Number(n)/100).toFixed(2);
const responseCode=value=>value==='0'?'00':value;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const selected=env=>String(env.PAYMENT_PROVIDER||'').trim().toLowerCase()==='heartland';
export function configuration(env){
  const publicKey=String(env.HEARTLAND_PUBLIC_API_KEY||'').trim(),secretKey=String(env.HEARTLAND_SECRET_API_KEY||'').trim();
  if(String(env.HEARTLAND_ENVIRONMENT||'sandbox').trim().toLowerCase()!=='sandbox')throw new Error('This Heartland integration is enabled for sandbox testing only.');
  if(!/^pkapi_cert_[A-Za-z0-9_-]{8,200}$/.test(publicKey)||!/^skapi_cert_[A-Za-z0-9_-]{8,200}$/.test(secretKey))
    throw new Error('Configure the matching Heartland sandbox public and secret API keys in Cloudflare.');
  return {publicKey,secretKey};
}
async function fingerprint(env){
  const c=configuration(env),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.publicKey+'\n'+c.secretKey));
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function safeError(error,env){
  let s=String(error?.message||'Heartland verification could not be completed.');
  for(const key of [env.HEARTLAND_PUBLIC_API_KEY,env.HEARTLAND_SECRET_API_KEY])if(key)s=s.split(String(key)).join('[redacted]');
  return s.replace(/(?:skapi|pkapi|supt|hpt|tok)_[A-Za-z0-9_-]+/gi,'[redacted]').replace(/\b\d(?:[ -]?\d){11,18}\b/g,'[redacted]').slice(0,240);
}
const children=(node,name,namespace=NS)=>Array.from(node?.childNodes||[]).filter(n=>n.nodeType===1&&n.localName===name&&n.namespaceURI===namespace);
function one(node,name,required=true,namespace=NS){
  const all=children(node,name,namespace);if(all.length>1||(required&&all.length!==1))throw new Error('Heartland response has missing or repeated '+name+' fields.');
  return all[0]||null;
}
function field(node,name,required=false){
  const child=one(node,name,required);if(!child)return '';
  if(Array.from(child.childNodes).some(n=>n.nodeType===1))throw new Error('Heartland response contains an invalid '+name+' field.');
  return child.textContent.trim();
}
export function parseResponse(text,operation){
  if(typeof text!=='string'||text.length>500000||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Heartland returned an unsupported response.');
  const doc=new DOMParser({onError:()=>{throw new Error('Heartland returned invalid XML.');}}).parseFromString(text,'text/xml');
  const envelope=doc.documentElement;
  if(envelope?.localName!=='Envelope'||envelope.namespaceURI!==SOAP)throw new Error('Heartland returned an invalid SOAP envelope.');
  const body=one(envelope,'Body',true,SOAP);
  if(children(body,'Fault',SOAP).length)throw new Error('Heartland returned a gateway fault.');
  const version=one(one(body,'PosResponse'),'Ver1.0'),header=one(version,'Header');
  const code=field(header,'GatewayRspCode',true);
  if(!/^0+$/.test(code))throw new Error('Heartland gateway response code '+(/^-?\d{1,6}$/.test(code)?code:'unknown')+'. Payment result requires verification.');
  const node=one(one(version,'Transaction'),operation);
  // Portico's response-header site/device fields are optional. The exact
  // saved credential fingerprint always binds requests to their account.
  const site=field(header,'SiteId'),device=field(header,'DeviceId');
  if((site&&!positiveId(site))||(device&&!positiveId(device)))throw new Error('Heartland returned an invalid processing site or device.');
  const currency=field(header,'MerchCurrencyCode'),currencyText=field(header,'MerchCurrencyText');
  if((currency&&!['840','USD'].includes(currency))||(currencyText&&/^[A-Z]{3}$/.test(currencyText)&&currencyText!=='USD'))
    throw new Error('The Heartland account currency does not match USD.');
  return {header,node,site,device};
}
export function envelope(env,operation,content,reference=''){
  const {secretKey}=configuration(env);
  return '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="'+SOAP+'" xmlns="'+NS+'"><soap:Body><PosRequest><Ver1.0><Header>'+
    (reference?'<ClientTxnId>'+esc(reference)+'</ClientTxnId>':'')+'<SecretAPIKey>'+esc(secretKey)+'</SecretAPIKey><SDKNameVersion>WootenOil;HeartlandSandbox=1</SDKNameVersion></Header><Transaction><'+operation+'>'+content+'</'+operation+'></Transaction></Ver1.0></PosRequest></soap:Body></soap:Envelope>';
}
async function api(env,operation,content,reference=''){
  const response=await fetch(ENDPOINT,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'text/xml; charset=utf-8','Accept':'text/xml','SOAPAction':'""'},body:envelope(env,operation,content,reference)});
  if(response.status!==200)throw new Error('Heartland HTTP '+response.status+'. The payment result requires verification.');
  const reader=response.body.getReader();let length=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>500000){await reader.cancel();throw new Error('Heartland response exceeded the verification limit.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return parseResponse(new TextDecoder('utf-8',{fatal:true}).decode(bytes),operation);
}
export async function ensureSchema(env,helpers){
  await helpers.ensureHostedPaymentsSchema(env);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS heartland_payment_attempts (
    intent_id TEXT PRIMARY KEY,account_number TEXT NOT NULL,environment TEXT NOT NULL DEFAULT 'sandbox',
    key_fingerprint TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_ms INTEGER NOT NULL,
    submitted_ms INTEGER NOT NULL DEFAULT 0,site_id TEXT NOT NULL DEFAULT '',device_id TEXT NOT NULL DEFAULT '',
    last_check_ms INTEGER NOT NULL DEFAULT 0,next_check_ms INTEGER NOT NULL DEFAULT 0,
    lease_until_ms INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '')`).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_heartland_active_account ON heartland_payment_attempts(account_number) WHERE active=1').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS heartland_payment_health (id INTEGER PRIMARY KEY,heartbeat_ms INTEGER NOT NULL)').run();
}
async function record(env,id){return env.DB.prepare(`SELECT p.*,h.environment,h.active,h.key_fingerprint,h.created_ms,h.submitted_ms,h.site_id,h.device_id,h.last_check_ms,h.last_error,h.lease_until_ms
  FROM online_payment_transactions p JOIN heartland_payment_attempts h ON h.intent_id=p.id WHERE p.id=?`).bind(id).first();}
function publicPayment(p){return p?{provider:'heartland',payment_intent_id:p.id,environment:'sandbox',status:p.status,active:Boolean(p.active),
  amount:money(p.amount_cents),currency:p.currency,reference:p.provider_reference,transaction_id:p.provider_transaction_id||null,
  can_pay:p.last_check_ms>0&&p.status==='initiated'&&!p.submitted_ms&&!p.last_error&&Date.parse(p.expires_at)>Date.now(),
  verification_detail:p.last_error||null,review_required:p.result_code==='MULTIPLE_HEARTLAND_PAYMENTS'}:null;}
async function ready(env){const r=await env.DB.prepare('SELECT heartbeat_ms FROM heartland_payment_health WHERE id=1').first();return !!r&&Date.now()-Number(r.heartbeat_ms)<300000;}
async function context(request,env,helpers,write=false){
  const customer=await helpers.getCustomerFromSession(request,env);
  if(!customer)throw Object.assign(new Error('Please sign in to use payments.'),{http:401});
  if(write&&(!request.headers.get('Origin')||new URL(request.headers.get('Origin')).origin!==new URL(request.url).origin))throw Object.assign(new Error('Invalid payment request.'),{http:403});
  if(!env.DB)throw new Error('The customer database is not configured.');
  await ensureSchema(env,helpers);configuration(env);return customer;
}
async function bodyJson(request){const text=await request.text();if(text.length>4096)throw Object.assign(new Error('Payment request is too large.'),{http:400});try{return JSON.parse(text);}catch{throw Object.assign(new Error('Invalid payment request.'),{http:400});}}
async function find(env,p){
  const result=await api(env,'FindTransactions','<Criteria><StartUtcDT>'+new Date(p.created_ms-86400000).toISOString()+'</StartUtcDT><EndUtcDT>'+new Date(Date.now()+60000).toISOString()+'</EndUtcDT><ClientTxnId>'+esc(p.provider_reference)+'</ClientTxnId></Criteria><TzConversion>UTC</TzConversion>');
  if((p.site_id&&result.site&&result.site!==p.site_id)||(p.device_id&&result.device&&result.device!==p.device_id))throw new Error('Heartland reporting account does not match the saved checkout.');
  const nodes=children(result.node,'Transactions');if(nodes.length>50)throw new Error('Heartland returned too many records for this payment reference.');
  const ids=new Set();
  for(const row of nodes){
    const reference=field(row,'ClientTxnId',true);if(reference!==p.provider_reference)continue;
    const id=field(row,'GatewayTxnId',true);if(!positiveId(id)||ids.has(id))throw new Error('Heartland returned an invalid or repeated transaction ID.');
    ids.add(id);
  }
  if(ids.size>5)throw new Error('Multiple Heartland transaction records require review.');
  return {...result,ids:[...ids]};
}
function matchesScope(p,response){if((p.site_id&&response.site&&response.site!==p.site_id)||(p.device_id&&response.device&&response.device!==p.device_id))throw new Error('Heartland processing account does not match the saved checkout.');}
async function detail(env,p,id){
  const response=await api(env,'ReportTxnDetail','<TxnId>'+esc(id)+'</TxnId><TzConversion>UTC</TzConversion>');matchesScope(p,response);
  const n=response.node,d=one(n,'Data');
  const site=field(n,'SiteId',true),device=field(n,'DeviceId',true);
  if(field(n,'GatewayTxnId',true)!==id||field(n,'ClientTxnId',true)!==p.provider_reference||!positiveId(site)||!positiveId(device)||(p.site_id&&site!==p.site_id)||(p.device_id&&device!==p.device_id))
    throw new Error('Heartland transaction does not match the saved checkout reference and account.');
  if(field(n,'ServiceName',true)!=='CreditSale'||!/^0+$/.test(field(n,'GatewayRspCode',true))||cents(field(d,'Amt',true))!==Number(p.amount_cents))
    throw new Error('Heartland transaction type, gateway result or amount does not match the checkout.');
  const currency=field(n,'CurrencyCodeAlpha');if(currency&&currency!=='USD')throw new Error('Heartland transaction currency does not match USD.');
  const code=responseCode(field(d,'RspCode',true)),state=field(d,'TxnStatus',true),authorized=cents(field(d,'AuthAmt',true));
  // Require an active/settled sale. Unknown, void, refund and reversal states
  // remain reserved for review instead of being treated as a new payment.
  const approved=code==='00'&&authorized===Number(p.amount_cents)&&['active','settled','closed'].includes(state.toLowerCase());
  const declined=['05','51','54'].includes(code)&&authorized===0&&['declined','active'].includes(state.toLowerCase());
  return {id,code,state,approved,declined};
}
async function save(env,p,{status,active,id='',code='',message=''}){
  await env.DB.batch([
    env.DB.prepare(`UPDATE online_payment_transactions SET status=?,provider_transaction_id=CASE WHEN ?!='' THEN ? ELSE provider_transaction_id END,
      provider_status=?,result_code=?,result_message=?,updated_at=CURRENT_TIMESTAMP,completed_at=CASE WHEN ?=0 THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE completed_at END
      WHERE id=? AND status IN ('initiated','processing','pending') AND ? IN ('captured','declined','pending','failed')`).bind(status,id,id,status,code,message,active,p.id,status),
    env.DB.prepare(`UPDATE heartland_payment_attempts SET active=?,last_error='',last_check_ms=?,next_check_ms=? WHERE intent_id=? AND EXISTS(SELECT 1 FROM online_payment_transactions p WHERE p.id=? AND p.status=?)`).bind(active,Date.now(),Date.now()+120000,p.id,p.id,status)
  ]);
}
export async function reconcile(env,id){
  let p=await record(env,id);if(!p||!p.active)return p;
  if(p.status==='initiated'){
    if(Date.parse(p.expires_at)<=Date.now())await cancelDraft(env,p,'expired');return record(env,id);
  }
  const now=Date.now(),lease=now+180000;
  if(now-p.submitted_ms<20000||now-p.last_check_ms<15000)return p;
  const lock=await env.DB.prepare('UPDATE heartland_payment_attempts SET lease_until_ms=? WHERE intent_id=? AND lease_until_ms<?').bind(lease,id,now).run();
  if(!lock.meta?.changes)return p;
  try{
    p=await record(env,id);if(!p.active)return p;
    if(p.key_fingerprint!==await fingerprint(env))throw new Error('Restore the Heartland keys used for this checkout before checking its status.');
    const report=await find(env,p),ids=new Set(report.ids);
    if(p.provider_transaction_id)ids.add(p.provider_transaction_id);
    const rows=[];for(const txnId of ids)rows.push(await detail(env,p,txnId));
    const paid=rows.filter(row=>row.approved),uncertain=rows.filter(row=>!row.approved&&!row.declined);
    if(paid.length===1&&!uncertain.length&&!String(p.result_code||'').startsWith('MULTIPLE_'))await save(env,p,{status:'captured',active:0,id:paid[0].id,code:'00',message:'Heartland sandbox sale confirmed by transaction lookup.'});
    else if(paid.length>1)await save(env,p,{status:'pending',active:1,code:'MULTIPLE_HEARTLAND_PAYMENTS',message:'More than one successful Heartland sale requires review.'});
    else if(rows.length&&!paid.length&&!uncertain.length&&!String(p.result_code||'').startsWith('MULTIPLE_'))await save(env,p,{status:'declined',active:0,id:rows[0].id,code:rows[0].code,message:'Heartland confirmed the sandbox card attempt was declined.'});
    else await env.DB.prepare('UPDATE heartland_payment_attempts SET last_check_ms=?,next_check_ms=?,last_error=? WHERE intent_id=?')
      .bind(now,now+120000,rows.length?'Heartland has not returned a final matching payment result.':'No matching payment result is available yet. The original attempt remains reserved.',id).run();
  }catch(error){await env.DB.prepare('UPDATE heartland_payment_attempts SET last_check_ms=?,next_check_ms=?,last_error=? WHERE intent_id=?').bind(now,now+120000,safeError(error,env),id).run();}
  finally{await env.DB.prepare('UPDATE heartland_payment_attempts SET lease_until_ms=0 WHERE intent_id=? AND lease_until_ms=?').bind(id,lease).run();}
  return record(env,id);
}
export async function scheduled(env,helpers){
  if(!selected(env))return;
  await ensureSchema(env,helpers);configuration(env);
  const rows=await env.DB.prepare('SELECT intent_id FROM heartland_payment_attempts WHERE active=1 AND next_check_ms<=? ORDER BY next_check_ms LIMIT 4').bind(Date.now()).all();
  for(const row of rows.results||[])await reconcile(env,row.intent_id);
  await env.DB.prepare('INSERT INTO heartland_payment_health(id,heartbeat_ms) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET heartbeat_ms=excluded.heartbeat_ms').bind(Date.now()).run();
}
export async function status({request,env},helpers){
  try{
    const customer=await context(request,env,helpers),account=helpers.paymentAccount(customer.account_number);
    const id=new URL(request.url).searchParams.get('id');
    const row=id?await env.DB.prepare('SELECT h.intent_id FROM heartland_payment_attempts h JOIN online_payment_transactions p ON p.id=h.intent_id WHERE h.intent_id=? AND p.customer_id=? AND p.account_number=?').bind(id,customer.id,account).first():
      await env.DB.prepare('SELECT h.intent_id FROM heartland_payment_attempts h JOIN online_payment_transactions p ON p.id=h.intent_id WHERE p.customer_id=? AND p.account_number=? ORDER BY h.active DESC,h.created_ms DESC LIMIT 1').bind(customer.id,account).first();
    const p=row?await reconcile(env,row.intent_id):null;
    return json({success:true,provider:'heartland',public_api_key:configuration(env).publicKey,ready:await ready(env),payment:publicPayment(p)});
  }catch(error){return json({success:false,error:safeError(error,env)},error.http||503);}
}
async function cancelDraft(env,p,status='canceled'){
  await env.DB.batch([
    env.DB.prepare(`UPDATE online_payment_transactions SET status=?,result_code='UNSUBMITTED_CHECKOUT_CLOSED',completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='initiated'
      AND EXISTS(SELECT 1 FROM heartland_payment_attempts h WHERE h.intent_id=? AND h.submitted_ms=0)`).bind(status,p.id,p.id),
    env.DB.prepare(`UPDATE heartland_payment_attempts SET active=0 WHERE intent_id=? AND submitted_ms=0 AND EXISTS(SELECT 1 FROM online_payment_transactions p WHERE p.id=? AND p.status IN ('canceled','expired'))`).bind(p.id,p.id)
  ]);
}
export async function cancel({request,env},helpers){
  try{
    const c=await context(request,env,helpers,true),b=await bodyJson(request),p=await record(env,String(b.payment_intent_id||''));
    if(!p||Number(p.customer_id)!==Number(c.id)||p.account_number!==helpers.paymentAccount(c.account_number))return json({success:false,error:'Checkout not found.'},404);
    await cancelDraft(env,p);const after=await record(env,p.id);
    return json({success:true,payment:publicPayment(after)});
  }catch(error){return json({success:false,error:safeError(error,env)},error.http||503);}
}
export async function session({request,env},helpers){
  let created;
  try{
    const customer=await context(request,env,helpers,true),b=await bodyJson(request),account=helpers.paymentAccount(customer.account_number);
    if(!await ready(env))return json({success:false,error:'Heartland background confirmation is starting. Please try again after the next scheduled check.'},503);
    const amount=b.payment_type==='full'?helpers.onlinePaymentTotalCents(customer):b.payment_type==='partial'?helpers.onlinePaymentPartialCents(b.amount):0;
    const max=Number(env.HEARTLAND_MAX_PAYMENT_CENTS||1000000);
    if(!Number.isSafeInteger(amount)||amount<100||amount>max)return json({success:false,error:'Choose a payment of at least $1.00 within the configured payment limit.'},422);
    // Only known GP sandbox records are isolated. Unknown or production
    // unresolved payments must continue to block another processor's checkout.
    const other=await env.DB.prepare(`SELECT p.id FROM online_payment_transactions p LEFT JOIN hosted_payment_links h ON h.intent_id=p.id
      LEFT JOIN heartland_payment_attempts a ON a.intent_id=p.id WHERE p.account_number=? AND p.status IN ('processing','pending') AND a.intent_id IS NULL
      AND (h.environment IS NULL OR h.environment!='sandbox') LIMIT 1`).bind(account).first();
    if(other)return json({success:false,error:'An earlier payment requires confirmation before another checkout can begin.'},409);
    const active=await env.DB.prepare('SELECT intent_id FROM heartland_payment_attempts WHERE account_number=? AND active=1').bind(account).first();
    if(active){const p=await reconcile(env,active.intent_id);
      if(p.active){
        if(Number(p.customer_id)!==Number(customer.id))return json({success:false,error:'An earlier checkout on this account requires review.'},409);
        if(p.status==='initiated'&&Number(p.amount_cents)===amount&&p.key_fingerprint===await fingerprint(env)&&p.last_check_ms>0)return json({success:true,provider:'heartland',public_api_key:configuration(env).publicKey,payment:publicPayment(p)});
        return json({success:false,error:'Finish or cancel the saved checkout before starting another payment.',payment:publicPayment(p)},409);
      }
      if(p.status==='captured')return json({success:false,error:'The saved sandbox payment has now been confirmed. Review its confirmation before starting another payment.',payment:publicPayment(p)},409);
    }
    const recent=await env.DB.prepare('SELECT COUNT(*) n FROM heartland_payment_attempts WHERE account_number=? AND created_ms>?').bind(account,Date.now()-600000).first();
    if(Number(recent.n)>=6)return json({success:false,error:'Please wait before starting another payment attempt.'},429);
    const id=crypto.randomUUID(),reference='WOH-'+id,createdMs=Date.now(),hash=await fingerprint(env);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO online_payment_transactions(id,customer_id,account_number,amount_cents,currency,payment_type,status,provider_reference,idempotency_key,expires_at)
        VALUES(?,?,?,?,'USD',?,'initiated',?,?,?)`).bind(id,customer.id,account,amount,b.payment_type,reference,id,new Date(createdMs+15*60000).toISOString()),
      env.DB.prepare('INSERT INTO heartland_payment_attempts(intent_id,account_number,key_fingerprint,created_ms,next_check_ms) VALUES(?,?,?,?,?)').bind(id,account,hash,createdMs,createdMs)
    ]);created=id;
    const p=await record(env,id),probe=await find(env,p);
    if(probe.ids.length)throw new Error('The new payment reference unexpectedly already exists at Heartland.');
    await env.DB.prepare('UPDATE heartland_payment_attempts SET site_id=?,device_id=?,last_check_ms=? WHERE intent_id=?').bind(probe.site,probe.device,Date.now(),id).run();
    return json({success:true,provider:'heartland',public_api_key:configuration(env).publicKey,payment:publicPayment(await record(env,id))});
  }catch(error){
    if(created){const p=await record(env,created);if(p.status==='initiated'&&!p.submitted_ms)await save(env,p,{status:'failed',active:0,code:'SETUP_ERROR',message:'Heartland sandbox setup could not be verified.'});}
    return json({success:false,error:safeError(error,env)},error.http||503);
  }
}
async function executeCharge(env,p,token){
  try{
    const response=await api(env,'CreditSale','<Block1><CardData><TokenData><TokenValue>'+esc(token)+'</TokenValue><CardPresent>N</CardPresent><ReaderPresent>N</ReaderPresent></TokenData></CardData><Amt>'+money(p.amount_cents)+'</Amt><AllowDup>N</AllowDup><AllowPartialAuth>N</AllowPartialAuth><Ecommerce>ECOM</Ecommerce><AdditionalTxnFields><InvoiceNbr>'+esc(p.provider_reference)+'</InvoiceNbr></AdditionalTxnFields></Block1>',p.provider_reference);
    matchesScope(p,response);
    const reference=field(response.header,'ClientTxnId');if(reference&&reference!==p.provider_reference)throw new Error('Heartland returned a different checkout reference.');
    const id=field(response.header,'GatewayTxnId',true),code=responseCode(field(response.node,'RspCode',true)),auth=field(response.node,'AuthAmt');
    if(!positiveId(id))throw new Error('Heartland did not return a valid payment transaction ID.');
    if(code==='00'&&(!auth||cents(auth)===Number(p.amount_cents)))await save(env,p,{status:'captured',active:0,id,code,message:'Heartland sandbox CreditSale approved. No live funds collected.'});
    else if(['05','51','54'].includes(code)&&(!auth||cents(auth)===0))await save(env,p,{status:'declined',active:0,id,code,message:'Heartland declined the sandbox card attempt.'});
    else await save(env,p,{status:'pending',active:1,id,code:'AWAITING_HEARTLAND_RESULT',message:'Heartland payment result requires confirmation.'});
  }catch(error){
    await env.DB.batch([
      env.DB.prepare("UPDATE online_payment_transactions SET status='pending',result_code='AWAITING_HEARTLAND_RESULT',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='processing'").bind(p.id),
      env.DB.prepare('UPDATE heartland_payment_attempts SET last_error=?,next_check_ms=? WHERE intent_id=? AND active=1').bind(safeError(error,env),Date.now()+30000,p.id)
    ]).catch(()=>{});
  }
  return json({success:true,payment:publicPayment(await record(env,p.id))});
}
export async function charge({request,env,ctx},helpers){
  try{
    const c=await context(request,env,helpers,true),b=await bodyJson(request);
    if(Object.keys(b).some(key=>!['payment_intent_id','payment_reference'].includes(key)))return json({success:false,error:'Only the secure payment token and checkout ID are accepted.'},400);
    const token=b.payment_reference;
    if(typeof token!=='string'||token.length<10||token.length>300||!/[A-Za-z]/.test(token)||!/^[A-Za-z0-9_-]+$/.test(token))return json({success:false,error:'The secure card token is invalid. Enter the card details again.'},400);
    const p=await record(env,String(b.payment_intent_id||''));
    if(!p||Number(p.customer_id)!==Number(c.id)||p.account_number!==helpers.paymentAccount(c.account_number))return json({success:false,error:'Checkout not found.'},404);
    if(p.status!=='initiated'||p.submitted_ms)return json({success:true,payment:publicPayment(p)});
    if(Date.parse(p.expires_at)<=Date.now()){await cancelDraft(env,p,'expired');return json({success:true,payment:publicPayment(await record(env,p.id))});}
    if(!p.last_check_ms||p.key_fingerprint!==await fingerprint(env))throw new Error('The Heartland setup changed. Cancel this unsubmitted checkout and start again.');
    if(!await ready(env))throw new Error('Heartland background confirmation is unavailable. Please try again shortly.');
    const lock=await env.DB.prepare("UPDATE online_payment_transactions SET status='processing',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='initiated'").bind(p.id).run();
    if(!lock.meta?.changes)return json({success:true,payment:publicPayment(await record(env,p.id))});
    // Persist the submission marker before any request can reach the gateway.
    // Neither a browser retry nor cron will ever send this sale a second time.
    await env.DB.prepare('UPDATE heartland_payment_attempts SET submitted_ms=?,next_check_ms=? WHERE intent_id=?').bind(Date.now(),Date.now()+30000,p.id).run();
    const job=executeCharge(env,p,token);if(ctx?.waitUntil)ctx.waitUntil(job);
    return await job;
  }catch(error){return json({success:false,error:safeError(error,env)},error.http||503);}
}
