/* Ver665 — Cloudflare-compatible push delivery; never follow provider redirects. */
const utf8=new TextEncoder();
export const bytes=v=>utf8.encode(v);
export const join=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;};
export const encode=v=>btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function decode(v){if(typeof v!=='string'||!/^[-_A-Za-z0-9]+$/.test(v))throw Error('Invalid key.');return Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export async function digest(v){return encode(await crypto.subtle.digest('SHA-256',bytes(v)));}
export function endpoint(value){
 const u=new URL(value);const h=u.hostname;
 const allowed=h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h.endsWith('.push.services.mozilla.com')||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com');
 if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!allowed||value.length>4096)throw Error('Unsupported notification provider.');return u.href;
}
export function subscription(value){
 const p=decode(value?.keys?.p256dh),a=decode(value?.keys?.auth);
 if(p.length!==65||p[0]!==4||a.length!==16)throw Error('Invalid notification subscription.');
 return {endpoint:endpoint(value.endpoint),keys:{p256dh:encode(p),auth:encode(a)}};
}
export function configuration(env){
 try{
  const k=JSON.parse(env.WEB_PUSH_PRIVATE_JWK||'null');
  if(k?.kty!=='EC'||k.crv!=='P-256'||decode(k.x).length!==32||decode(k.y).length!==32||decode(k.d).length!==32)return null;
  return {key:{kty:k.kty,crv:k.crv,x:k.x,y:k.y,d:k.d},publicKey:encode(join(new Uint8Array([4]),decode(k.x),decode(k.y))),subject:'mailto:support@wootenoil.com'};
 }catch{return null;}
}
async function hkdf(input,salt,info,length){
 const key=await crypto.subtle.importKey('raw',input,'HKDF',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8));
}
export async function encrypt(sub,payload,options={}){
 const receiver=decode(sub.keys.p256dh),auth=decode(sub.keys.auth);
 const pair=options.pair||await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const sender=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const receiverKey=await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiverKey},pair.privateKey,256));
 const ikm=await hkdf(shared,auth,join(bytes('WebPush: info\0'),receiver,sender),32);
 const salt=options.salt||crypto.getRandomValues(new Uint8Array(16));
 const keyBytes=await hkdf(ikm,salt,bytes('Content-Encoding: aes128gcm\0'),16);
 const nonce=await hkdf(ikm,salt,bytes('Content-Encoding: nonce\0'),12);
 const plain=bytes(payload);if(plain.length>3000)throw Error('Notification is too large.');
 const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,join(plain,new Uint8Array([2]))));
 const recordSize=new Uint8Array(4);new DataView(recordSize.buffer).setUint32(0,4096);
 return join(salt,recordSize,new Uint8Array([65]),sender,encrypted);
}
export async function send(env,sub,payload,transport=fetch){
 const cfg=configuration(env);if(!cfg)throw Error('Push setup is incomplete.');
 sub=subscription(sub);
 const now=Math.floor(Date.now()/1000);
 const token=encode(bytes(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+encode(bytes(JSON.stringify({aud:new URL(sub.endpoint).origin,exp:now+3600,sub:cfg.subject})));
 const key=await crypto.subtle.importKey('jwk',cfg.key,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const sig=encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,bytes(token)));
 // Workers supports manual/follow, not error. Never forward signed requests to redirects.
 const response=await transport(sub.endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'vapid t='+token+'.'+sig+', k='+cfg.publicKey,'Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',TTL:'3600',Urgency:'normal',Topic:(await digest(payload.tag)).slice(0,32)},body:await encrypt(sub,JSON.stringify(payload))});
 await response.body?.cancel();
 return {status:response.status,retryAfter:Math.max(0,Math.min(86400,Number(response.headers.get('Retry-After'))||0))};
}
