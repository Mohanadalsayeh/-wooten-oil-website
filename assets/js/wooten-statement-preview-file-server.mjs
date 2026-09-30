// Ver731: return an already-generated preview as a named, inline PDF.
// The ticket authorizes only these exact bytes for five minutes. No PDFs,
// documents, customer notifications, or delivery jobs are stored here.
export const maxPreviewBytes=32*1024*1024;
const ticketLifetime=300000;
const encoder=new TextEncoder();
const filenamePattern=/^Wooten-Oil-Statements?-Preview-[A-Za-z0-9-]{1,150}\.pdf$/;
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const error=(message,status=400)=>new Response(message,{status,headers:{...privateHeaders,'Content-Type':'text/plain; charset=utf-8'}});
const json=(body,status=200)=>Response.json(body,{status,headers:privateHeaders});
function encode(bytes){let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(value){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid ticket.');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));}
async function signingKey(env){return crypto.subtle.importKey('raw',encoder.encode('wooten-statement-preview-v1:'+env.ADMIN_IMPORT_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');}
function validFile(value){return filenamePattern.test(value.filename)&&Number.isSafeInteger(value.size)&&value.size>0&&value.size<=maxPreviewBytes&&/^[a-f0-9]{64}$/.test(value.sha256);}

// Called only after the portal's normal admin authorization and permissions.
export async function ticket(request,env,now=Date.now()){
  if(request.method!=='POST')return json({error:'Use POST.'},405);
  if(!env.ADMIN_IMPORT_KEY||request.headers.get('X-Admin-Key')!==env.ADMIN_IMPORT_KEY)return json({error:'Unauthorized.'},401);
  try{
    const input=await request.json();
    const value={filename:String(input.filename||''),size:input.size,sha256:String(input.sha256||''),expires:now+ticketLifetime};
    if(!validFile(value))return json({error:'The preview filename or file size is invalid. Preview up to 32 MB at a time.'},400);
    const payload=encode(encoder.encode(JSON.stringify(value)));
    const signature=encode(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),encoder.encode(payload))));
    return json({success:true,ticket:payload+'.'+signature});
  }catch{return json({error:'The named statement preview could not be prepared.'},400);}
}

export async function file(request,env,now=Date.now()){
  if(request.method!=='POST')return error('Open a new preview from Send Account Statements.',405);
  const url=new URL(request.url);
  if(!env.ADMIN_IMPORT_KEY||url.protocol!=='https:'||request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return error('Open this preview from the signed-in admin portal.',403);
  if(!/^multipart\/form-data;\s*boundary=/i.test(request.headers.get('Content-Type')||''))return error('Invalid preview upload.');
  if(Number(request.headers.get('Content-Length')||0)>maxPreviewBytes+16384)return error('The preview is too large. Select fewer customers.',413);
  let received=0,tooLarge=false;
  try{
    const limited=request.body.pipeThrough(new TransformStream({transform(chunk,controller){
      received+=chunk.byteLength;
      if(received>maxPreviewBytes+16384){tooLarge=true;throw Error('Preview too large.');}
      controller.enqueue(chunk);
    }}));
    const data=await new Response(limited,{headers:{'Content-Type':request.headers.get('Content-Type')}}).formData();
    const token=data.get('ticket');
    if(typeof token!=='string'||token.length>2048)return error('The preview authorization is invalid.',403);
    const parts=token.split('.');
    if(parts.length!==2||!(await crypto.subtle.verify('HMAC',await signingKey(env),decode(parts[1]),encoder.encode(parts[0]))))return error('The preview authorization is invalid.',403);
    const value=JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if(!validFile(value)||!Number.isSafeInteger(value.expires)||value.expires<=now||value.expires>now+ticketLifetime)return error('This preview expired. Click Preview Statements again.',403);
    if(url.pathname!=='/api/statement-preview/'+value.filename)return error('The preview filename does not match.',403);
    const pdf=data.get('pdf');
    if(!pdf||typeof pdf.arrayBuffer!=='function'||pdf.type!=='application/pdf'||pdf.size!==value.size||pdf.name!==value.filename)return error('The preview file does not match.',400);
    const bytes=await pdf.arrayBuffer();
    if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-'||await digest(bytes)!==value.sha256)return error('The preview file could not be verified.',400);
    return new Response(bytes,{headers:{...privateHeaders,'Content-Type':'application/pdf','Content-Length':String(value.size),'Content-Disposition':'inline; filename="'+value.filename+'"; filename*=UTF-8\'\''+encodeURIComponent(value.filename)}});
  }catch{return tooLarge?error('The preview is too large. Select fewer customers.',413):error('The statement preview could not open. Return to the portal and click Preview Statements again.',400);}
}
