// Short-lived, customer-bound permission for sandbox testing only.
const encoder=new TextEncoder();
const fail=(message,http=403)=>Object.assign(new Error(message),{http});
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
async function key(env){
  if(!env.ADMIN_IMPORT_KEY)throw fail('Sandbox testing requires a configured Main Admin password.');
  return crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_IMPORT_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function approve(env,customer,password,matches){
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS sandbox_approval_limits (customer_id INTEGER PRIMARY KEY, attempts INTEGER NOT NULL, window_ms INTEGER NOT NULL)').run();
  const now=Date.now();
  const row=await env.DB.prepare(`INSERT INTO sandbox_approval_limits(customer_id,attempts,window_ms) VALUES(?,1,?)
    ON CONFLICT(customer_id) DO UPDATE SET attempts=CASE WHEN window_ms<=? THEN 1 ELSE attempts+1 END,
    window_ms=CASE WHEN window_ms<=? THEN excluded.window_ms ELSE window_ms END RETURNING attempts`).bind(customer.id,now,now-900000,now-900000).first();
  if(row.attempts>5)throw fail('Too many approval attempts. Please wait 15 minutes.',429);
  if(typeof password!=='string'||!await matches(password,env))throw fail('The Main Admin password is incorrect.');
  const expires=now+600000;
  const payload=hex(encoder.encode(JSON.stringify({purpose:'sandbox-payment',customer:customer.id,account:customer.account_number,expires})));
  const signature=hex(await crypto.subtle.sign('HMAC',await key(env),encoder.encode(payload)));
  return {approval:payload+'.'+signature,expires};
}
export async function requireApproval(request,env,customer){
  try{
    const token=request.headers.get('X-Sandbox-Approval')||'';
    if(token.length>2000)throw Error();
    const [payload,signature,...extra]=token.split('.');
    if(extra.length||!payload||!/^([a-f0-9]{2})+$/.test(payload)||!signature||!/^[a-f0-9]{64}$/.test(signature))throw Error();
    const bytes=s=>Uint8Array.from(s.match(/../g),v=>parseInt(v,16));
    if(!await crypto.subtle.verify('HMAC',await key(env),bytes(signature),encoder.encode(payload)))throw Error();
    const p=JSON.parse(new TextDecoder().decode(bytes(payload)));
    if(p.purpose!=='sandbox-payment'||p.customer!==customer.id||p.account!==customer.account_number||p.expires<=Date.now()||p.expires>Date.now()+600000)throw Error();
  }catch{throw fail('Main Admin approval is required before a sandbox payment. Please authorize testing again.');}
}
