// Certification-only additions. Production remains disabled by heartland.mjs.
export const developerId='002914',versionNumber='6408',authorizationVersion='WO-ACH-1';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const bad=message=>Object.assign(new Error(message),{http:422});
export const definitiveCardDeclines=new Set(['02','03','04','05','12','13','14','15','41','43','44','51','52','53','54','56','57','58','61','62','63','65','78','EB','EC','N7','R1']);
export function billing(value){
  if(!value||typeof value!=='object')throw bad('Enter the billing address and ZIP code.');
  const address=String(value.address||'').trim(),zip=String(value.zip||'').trim().replace(/-/g,'');
  if(!address||address.length>100||/[\x00-\x1f\x7f]/.test(address)||!/^\d{5}(?:\d{4})?$/.test(zip))throw bad('Enter a valid billing street address and 5- or 9-digit ZIP code.');
  const shipDate=String(value.ship_date||'');
  if(shipDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(shipDate)||!Number.isFinite(Date.parse(shipDate))||new Date(shipDate).toISOString().slice(0,10)!==shipDate))throw bad('Enter a valid shipment date or leave it blank for an account payment.');
  return {address,zip,ship_date:shipDate};
}
export function cardSale(p,token,b){
  const direct=b.ship_date?'<DirectMktData><DirectMktInvoiceNbr>'+esc(p.provider_reference)+'</DirectMktInvoiceNbr><DirectMktShipMonth>'+Number(b.ship_date.slice(5,7))+'</DirectMktShipMonth><DirectMktShipDay>'+Number(b.ship_date.slice(8,10))+'</DirectMktShipDay></DirectMktData>':'';
  return '<Block1><CardData><TokenData><TokenValue>'+esc(token)+'</TokenValue><CardPresent>N</CardPresent><ReaderPresent>N</ReaderPresent></TokenData></CardData><Amt>'+(p.amount_cents/100).toFixed(2)+'</Amt><CardHolderData><CardHolderAddr>'+esc(b.address)+'</CardHolderAddr><CardHolderZip>'+esc(b.zip)+'</CardHolderZip></CardHolderData>'+direct+'<AllowDup>N</AllowDup><AllowPartialAuth>N</AllowPartialAuth><Ecommerce>ECOM</Ecommerce><AdditionalTxnFields><InvoiceNbr>'+esc(p.provider_reference)+'</InvoiceNbr></AdditionalTxnFields></Block1>';
}
export function bank(value){
  if(!value||typeof value!=='object')throw bad('Enter the sandbox bank details.');
  const name=String(value.name||'').trim(),routing=String(value.routing||'').trim(),account=String(value.account||'').trim();
  // This build accepts only the bank numbers supplied by Heartland's test script.
  if(routing!=='122000030'||account!=='1357902468')throw bad('Sandbox only: use the routing and account numbers from Heartland’s ACH test script.');
  if(name.length<2||name.length>100||/[\x00-\x1f\x7f]/.test(name))throw bad('Enter the account holder’s full name.');
  if(!['CHECKING','SAVINGS'].includes(value.account_type)||!['PERSONAL','BUSINESS'].includes(value.check_type))throw bad('Choose the bank account type and ownership.');
  if(value.check_type==='BUSINESS'&&value.account_type!=='CHECKING')throw bad('The supplied business ACH test uses checking.');
  if(value.accepted!==true||value.authorization_version!==authorizationVersion)throw bad('Accept the displayed ACH authorization before paying.');
  return {name,routing,account,account_type:value.account_type,check_type:value.check_type};
}
export function authorization(amount){return 'By checking “I agree,” I authorize Wooten Oil Co Inc. to debit the bank account entered on this form for $'+(amount/100).toFixed(2)+'. This is a one-time payment to be initiated on the next business day or as soon as practical thereafter. If the payment cannot be completed, including because of insufficient funds or incorrect information, I remain responsible for the unpaid balance. A printable payment status record is available after submission. For changes or questions, contact Wooten Oil at (901) 476-2684 or support@wootenoil.com. Sandbox test only: no live funds will be transferred.';}
export function achSale(p,b){return '<Block1><CheckAction>SALE</CheckAction><AccountInfo><RoutingNumber>'+esc(b.routing)+'</RoutingNumber><AccountNumber>'+esc(b.account)+'</AccountNumber><AccountType>'+b.account_type+'</AccountType></AccountInfo><DataEntryMode>MANUAL</DataEntryMode><CheckType>'+b.check_type+'</CheckType><VerifyInfo><CheckVerify>N</CheckVerify><ACHVerify>N</ACHVerify></VerifyInfo><Amt>'+(p.amount_cents/100).toFixed(2)+'</Amt><SECCode>WEB</SECCode><ConsumerInfo><CheckName>'+esc(b.name)+'</CheckName></ConsumerInfo><AdditionalTxnFields><InvoiceNbr>'+esc(p.provider_reference)+'</InvoiceNbr></AdditionalTxnFields></Block1>';}
export async function ensure(env){await env.DB.prepare(`CREATE TABLE IF NOT EXISTS heartland_certification (
 intent_id TEXT PRIMARY KEY,method TEXT NOT NULL DEFAULT 'card',holder TEXT NOT NULL DEFAULT '',
 account_type TEXT NOT NULL DEFAULT '',check_type TEXT NOT NULL DEFAULT '',bank_last4 TEXT NOT NULL DEFAULT '',routing_last4 TEXT NOT NULL DEFAULT '',
 authorization_text TEXT NOT NULL DEFAULT '',authorization_version TEXT NOT NULL DEFAULT '',authorized_at TEXT NOT NULL DEFAULT '',
 avs_code TEXT NOT NULL DEFAULT '',cvv_code TEXT NOT NULL DEFAULT '',ach_state TEXT NOT NULL DEFAULT '',
 void_state TEXT NOT NULL DEFAULT '',void_txn_id TEXT NOT NULL DEFAULT '',void_requested_at TEXT NOT NULL DEFAULT '',void_actor TEXT NOT NULL DEFAULT '')`).run();}
export async function metadata(env,id){return await env.DB.prepare('SELECT * FROM heartland_certification WHERE intent_id=?').bind(id).first();}
export function publicMetadata(m){if(!m)return {payment_method:'card'};return {payment_method:m.method,holder:m.holder,account_type:m.account_type,check_type:m.check_type,bank_last4:m.bank_last4,routing_last4:m.routing_last4,authorization_text:m.authorization_text,authorization_version:m.authorization_version,authorized_at:m.authorized_at,avs_code:m.avs_code,cvv_code:m.cvv_code,ach_state:m.ach_state,void_state:m.void_state,void_txn_id:m.void_txn_id};}
