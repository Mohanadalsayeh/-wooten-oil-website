/* Ver682: browser-session continuity for admin notification windows.
   The cookie is HttpOnly and session-only. Expiration is also enforced on the server. */
export const cookieName='__Host-wooten_admin_session';
const cookie=value=>cookieName+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict';
const clearCookie=cookie('')+'; Max-Age=0';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store, private'}});
const initialized=new WeakMap();
function read(request){
 const matches=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));
 if(matches.length!==1)return '';
 const value=matches[0].slice(cookieName.length+1);
 return /^(?:o|u)\.[a-f0-9-]{72}$/.test(value)?value:'';
}
function sameOrigin(request){
 return request.method==='POST'&&new URL(request.url).protocol==='https:'&&request.headers.get('Origin')===new URL(request.url).origin&&/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||'')&&request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
function withCookie(response,value){
 const headers=new Headers(response.headers);headers.set('Set-Cookie',value);headers.set('Cache-Control','no-store, private');
 return new Response(response.body,{status:response.status,headers});
}
async function ensure(env){
 if(!env.DB)throw Error('Admin session database unavailable.');
 if(!initialized.has(env.DB))initialized.set(env.DB,env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_browser_owner_sessions(token_hash TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,expires_at TEXT NOT NULL)`).run().catch(error=>{initialized.delete(env.DB);throw error;}));
 await initialized.get(env.DB);
}
async function credential(request,env,helpers){
 const value=read(request);if(!value)return null;
 const token=value.slice(2);
 if(value.startsWith('u.'))return token;
 if(!env.ADMIN_IMPORT_KEY)return null;
 await ensure(env);
 const row=await env.DB.prepare(`SELECT owner_hash FROM admin_browser_owner_sessions WHERE token_hash=? AND expires_at>CURRENT_TIMESTAMP`).bind(await helpers.hash(token)).first();
 return row&&row.owner_hash===await helpers.hash('browser-owner:'+env.ADMIN_IMPORT_KEY)?String(env.ADMIN_IMPORT_KEY):null;
}
async function revokeCookie(request,env,helpers){
 const value=read(request);if(!value||!env.DB)return;
 if(value.startsWith('o.')){
  await ensure(env);
  await env.DB.prepare('DELETE FROM admin_browser_owner_sessions WHERE token_hash=?').bind(await helpers.hash(value.slice(2))).run();
 }else{
  // The cookie uses the existing user session token, so revocation covers all its windows.
  await helpers.ensureUsers();
  await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await helpers.hash(value.slice(2))).run();
 }
}
export async function attach(request,env,response,helpers){
 if(!sameOrigin(request)||!response.ok)return response;
 const body=await response.clone().json();
 if(!body.success||!body.token||!body.user)return response;
 const existing=await credential(request,env,helpers);
 if(existing===body.token)return response;
 await revokeCookie(request,env,helpers);
 if(body.user.owner===true){
  await ensure(env);
  const token=crypto.randomUUID()+crypto.randomUUID();
  await env.DB.prepare('DELETE FROM admin_browser_owner_sessions WHERE expires_at<=CURRENT_TIMESTAMP').run();
  await env.DB.prepare('INSERT INTO admin_browser_owner_sessions(token_hash,owner_hash,expires_at) VALUES(?,?,?)').bind(await helpers.hash(token),await helpers.hash('browser-owner:'+env.ADMIN_IMPORT_KEY),helpers.expires()).run();
  return withCookie(response,cookie('o.'+token));
 }
 if(!/^[a-f0-9-]{72}$/.test(body.token))throw Error('Invalid admin session token.');
 return withCookie(response,cookie('u.'+body.token));
}
export async function restore(request,env,helpers){
 if(!sameOrigin(request))return json({success:false,error:'Use the admin portal to restore your session.'},403);
 try{
  const supplied=String(request.headers.get('X-Admin-Key')||'');
  const token=supplied||await credential(request,env,helpers);
  if(!token)return withCookie(json({success:false,code:read(request)?'session_expired':'no_browser_session'},401),clearCookie);
  const user=await helpers.validate(token);
  if(!user)return withCookie(json({success:false,code:'session_expired'},401),clearCookie);
  const response=json({success:true,token,user});
  // An already validated tab may establish the cookie during the rollout.
  return supplied?await attach(request,env,response,helpers):response;
 }catch{return json({success:false,error:'Your admin session could not be checked. Please try again.'},503);}
}
export async function clear(request,env,response,helpers){
 // Existing header-authenticated logout remains supported; cookies alone never
 // authorize a cross-origin request or an ordinary admin API operation.
 if(request.headers.get('Origin')!==new URL(request.url).origin&&!request.headers.get('X-Admin-Key'))return response;
 await revokeCookie(request,env,helpers);
 return withCookie(response,clearCookie);
}
