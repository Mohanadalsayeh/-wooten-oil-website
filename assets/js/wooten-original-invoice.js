/* Ver638: single inner scroll region. Ver636: original Wooten Oil stationery, populated from imported invoice data. */
(()=>{
'use strict';
const asset=new URL('../images/wooten-original-invoice.png',document.currentScript.src).href;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>/^\d{4}-\d{2}-\d{2}/.test(String(value||''))?String(value).slice(5,7)+'-'+String(value).slice(8,10)+'-'+String(value).slice(0,4):'';
function fields(invoice,customer={},parsed){
 const out=[];
 const add=(text,x,y,width,size=10,anchor='start')=>{if(text!==null&&text!==undefined&&String(text).trim())out.push({text:String(text),x,y,width,size,anchor});};
 add(invoice.InvoiceNo,520,38,71,10);
 add(invoice.CustomerNo?'Customer # '+invoice.CustomerNo:'',39,40,235,9);
 add(invoice.CustomerName||customer.account_name,39,58,235,10);
 add([customer.address1,customer.address2,customer.address3].filter(Boolean).join(', '),39,75,235,9);
 add([customer.city,[customer.state,customer.zip_code].filter(Boolean).join(' ')].filter(Boolean).join(', '),39,92,235,9);
 add(invoice.CustomerPONo,360,125,114,9);
 add(date(invoice.InvoiceDate),483,125,105,10);
 if(parsed.status==='complete')for(const total of parsed.totals){
  const y={premium_93:165.913,regular_87:200.348,road_diesel_low_sulfur:222.261,farm_diesel_off_road:249.261}[total.fuelId];
  if(y)add(new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(total.gallons),425, y,53,11,'middle');
 }
 return out;
}
function svg(invoice,customer,parsed){
 const overlay=fields(invoice,customer,parsed).map(f=>{
  const size=Math.min(f.size,f.width/Math.max(1,f.text.length*.57));
  return `<text x="${f.x}" y="${f.y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="600" text-anchor="${f.anchor}"${f.anchor==='middle'?' dominant-baseline="central"':''} fill="#102b45">${esc(f.text)}</text>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 504" role="img" aria-label="Wooten Oil invoice ${esc(invoice.InvoiceNo)}"><image href="${esc(asset)}" x="0" y="0" width="612" height="504"/>${overlay}</svg>`;
}
const style=document.createElement('style');style.textContent=`
.wo-original-dialog{width:min(1100px,96vw);max-width:96vw;padding:0;border:1px solid #cad9e5;border-radius:18px;color:#102b45;background:#fff;max-height:94dvh}
.wo-original-dialog[open]{display:flex;flex-direction:column;height:94dvh;max-height:94dvh;box-sizing:border-box;overflow:hidden}
.wo-original-head,.wo-original-foot,.wo-original-note{flex:0 0 auto}
.wo-original-dialog::backdrop{background:rgba(16,43,69,.55)}
.wo-original-head,.wo-original-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 20px}
.wo-original-head h2{margin:0;font-size:23px}.wo-original-note{margin:0;padding:0 20px 12px;color:#61758a;font-size:13px}
.wo-original-paper{overflow:auto;flex:1 1 auto;min-height:0;max-height:none;overscroll-behavior:contain;border-block:1px solid #d7e1ea;background:#edf3f7;padding:12px}
.wo-original-paper svg{display:block;width:100%;min-width:760px;background:#fff}
.wo-original-foot{justify-content:flex-end}.wo-original-dialog button{min-height:44px;padding:10px 18px;border:1px solid #c8d8e5;border-radius:12px;background:#e8eff4;color:#17324d;font:inherit;cursor:pointer}
.wo-original-dialog .wo-original-print{background:#195680;color:#fff}.wo-original-head button{font-size:24px}
@media(max-width:620px){.wo-original-head,.wo-original-foot{padding:12px}.wo-original-paper{padding:0}.wo-original-note{padding:0 12px 12px}}
`;document.head.append(style);
const dialog=document.createElement('dialog');dialog.className='wo-original-dialog';dialog.setAttribute('aria-label','Original invoice template');
dialog.innerHTML='<header class="wo-original-head"><h2>Original Invoice</h2><button type="button" data-close aria-label="Close original invoice">×</button></header><p class="wo-original-note" data-note role="status"></p><div class="wo-original-paper" data-paper></div><footer class="wo-original-foot"><button type="button" class="wo-original-print" data-print>Print</button><button type="button" data-close>Back</button></footer>';
document.body.append(dialog);
let opener=null,controller=null,serial=0,currentMarkup='',currentNumber='';
const q=s=>dialog.querySelector(s);
async function open(invoice,trigger){
 controller?.abort();controller=new AbortController();const ticket=++serial;
 opener=trigger;currentNumber=String(invoice.InvoiceNo||'');
 const parsed=window.WootenInvoiceCommentParser.parse(invoice.Comment);
 const note='Recreated from imported data using the original template; not a scanned invoice. '+(parsed.status==='complete'?'':'Fuel quantities need comment review and are left blank. ');
 currentMarkup=svg(invoice,{},parsed);q('[data-paper]').innerHTML=currentMarkup;q('[data-note]').textContent=note+'Loading available customer address…';
 if(!dialog.open)dialog.showModal();q('[data-close]').focus();
 try{
  const key=document.getElementById('adminKey')?.value.trim();
  if(!key||!invoice.CustomerNo)throw Error('No customer lookup available');
  const response=await fetch('/api/admin/customer-activity?'+new URLSearchParams({account_number:invoice.CustomerNo,chart_months:3}),{headers:{'X-Admin-Key':key,'Accept':'application/json'},cache:'no-store',signal:controller.signal});
  const data=await response.json();if(ticket!==serial||!dialog.open)return;
  if(!response.ok||!data.success||String(data.customer?.account_number)!==String(invoice.CustomerNo))throw Error('Customer address unavailable');
  currentMarkup=svg(invoice,data.customer,parsed);q('[data-paper]').innerHTML=currentMarkup;q('[data-note]').textContent=note+'Address comes from the current customer record; unavailable fields are blank.';
 }catch(error){if(ticket===serial&&error.name!=='AbortError')q('[data-note]').textContent=note+'Customer address unavailable; unavailable fields are blank.';}
}
function close(){if(dialog.open)dialog.close();}
dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',close));
dialog.addEventListener('close',()=>{serial++;controller?.abort();currentMarkup='';currentNumber='';q('[data-paper]').replaceChildren();q('[data-note]').textContent='';if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;});
q('[data-print]').addEventListener('click',()=>{
 if(!currentMarkup)return;
 const tab=window.open('','_blank');if(!tab){q('[data-note]').textContent='Please allow pop-ups to print the original invoice template.';return;}
 tab.opener=null;
 tab.document.write('<!doctype html><html><head><title>Invoice '+esc(currentNumber)+'</title><style>@page{size:8.5in 7in;margin:0}html,body{margin:0;padding:0}svg{display:block;width:8.5in;height:7in}button{margin:12px;padding:12px}@media print{button{display:none}}</style></head><body>'+currentMarkup+'<button onclick="window.print()">Print Invoice</button></body></html>');tab.document.close();
});
window.addEventListener('wooten-admin-auth-changed',close);
window.WootenOriginalInvoice={open,close,fields,svg};
})();
