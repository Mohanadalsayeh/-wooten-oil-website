// Ver656: session-scoped reads plus explicit on-open/on-refresh API retrieval.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const text=v=>typeof v==='string'?v:typeof v==='number'&&Number.isSafeInteger(v)?String(v):'';
const money=v=>finite(v)?v.toFixed(2):null;
const accountValid=v=>typeof v==='string'&&/^000\d{1,20}$/.test(v);
export const customerIDForAccount=account=>accountValid(account)?account.slice(3):null;
export function matchesAccount(customerID,account){
 const id=text(customerID).trim();
 // Existing Wooten mapping: add exactly three zeros, preserving source leading zeros.
 return accountValid(account)&&/^\d{1,20}$/.test(id)&&'000'+id===account;
}
export function fuelQuantity(row){
 const fuel=(row.Details||[]).filter(d=>d.IsFuel===true&&(d.IsTaxProduct!==true||String(d.ProductCategory||'').trim().toLowerCase()==='fuel products'));
 return fuel.length&&fuel.every(d=>finite(d.Quantity))?fuel.reduce((n,d)=>n+d.Quantity,0):null;
}
const sum=(items,key)=>{const values=items.map(r=>r[key]).filter(finite);return values.length?values.reduce((a,b)=>a+b,0):null;};
const unique=values=>[...new Set(values.map(text).map(v=>v.trim()).filter(Boolean))].join(', ');
const FIELDS=['ID','IssuerOrgID','CardHolderOrgID','CardHolderName','CardHolderStreet','CardHolderStreet2','CardHolderCity','CardHolderStateProvince','CardHolderPostalCode','CustomerID','MerchantOrgID','MerchantName','MerchantStreet','MerchantCity','MerchantStateProvince','MerchantPostalCode','CardNumber','CardTypeID','CardType','TranTypeID','TranType','EntryMethodID','EntryMethod','CardTranSourceID','CardTranSource','StatusID','Status','NetworkID','Network','DeclineReasonID','DeclineReason','AuthRef','ShiftNumber','InvoiceID','ReceivedDateTime','LocalDateTime','ProcessedDateTime','PostedDateTime','Odometer','RawVehicleID','RawDriverID','MiscData','TotalAmountOfSale','ResolvedTotalAmount','DriverID','DriverNumber','DriverName','VehicleID','VehicleNumber','VehicleDescription'];
const PRODUCT_FIELDS=['RowNumber','RawProductCode','ProductName','ProductCode','ResolvedProductID','ProductCategoryID','ProductCategory','IsFuel','IsTaxProduct','Quantity','RawUnitPrice','RawAmount','ResolvedUnitPrice','ResolvedAmount'];
const TAX_FIELDS=['TaxRowNumber','TaxAuthority','GovtLevel','TaxType','TaxRate','FederalTax','FederalTaxExempt','StateTax','StateTaxExempt','OtherTax','OtherTaxExempt','BaseAmount','BasePrice'];
const pick=(value,fields)=>Object.fromEntries(fields.map(k=>[k,typeof value?.[k]==='string'||typeof value?.[k]==='boolean'||finite(value?.[k])?value[k]:null]));
function project(row){
 const source=pick(row,FIELDS);
 source.Details=(Array.isArray(row.Details)?row.Details:[]).map(d=>({...pick(d,PRODUCT_FIELDS),Taxes:(Array.isArray(d.Taxes)?d.Taxes:[]).map(t=>pick(t,TAX_FIELDS))}));
 return {transaction_id:text(row.ID),card_number:text(row.CardNumber),customer_id:text(row.CustomerID),cardholder:text(row.CardHolderName),card_type:text(row.CardType),received_at:row.ReceivedDateTime,local_date_time:row.LocalDateTime,processed_on:row.ProcessedDateTime,posted_on:row.PostedDateTime,merchant:text(row.MerchantName),merchant_city:text(row.MerchantCity),status:text(row.Status),entry_method:text(row.EntryMethod),auth_ref:text(row.AuthRef),invoice_number:text(row.InvoiceID),total_sale:money(row.TotalAmountOfSale),billable_amount:money(row.ResolvedTotalAmount),driver_number:text(row.DriverNumber),driver_name:text(row.DriverName),vehicle_number:text(row.VehicleNumber),vehicle_description:text(row.VehicleDescription),raw_vehicle_id:text(row.RawVehicleID),odometer:row.Odometer,decline_reason:text(row.DeclineReason),transaction_type:text(row.TranType),fuel_quantity:fuelQuantity(source),source};
}
const numericKeys=new Set(['fuel_quantity','total_sale','billable_amount','transaction_count','odometer']);
const transactionSort=new Set(['transaction_id','received_at','local_date_time','entry_method','decline_reason','merchant','auth_ref','card_number','total_sale','billable_amount','cardholder','driver_number','driver_name','vehicle_number','vehicle_description','raw_vehicle_id','odometer','processed_on','posted_on','fuel_quantity','status','invoice_number','card_type']);
const cardSort=new Set(['card_number','card_type','cardholder','transaction_count','fuel_quantity','total_sale','last_used_on']);
const collator=new Intl.Collator('en-US',{numeric:true,sensitivity:'base'});
function compare(a,b,key,direction){
 const av=a[key],bv=b[key],missing=v=>v==null||v==='';
 if(missing(av)||missing(bv))return missing(av)===missing(bv)?0:missing(av)?1:-1;
 const difference=numericKeys.has(key)?Number(av)-Number(bv):collator.compare(String(av),String(bv));
 return difference*(direction==='desc'?-1:1)||collator.compare(a.transaction_id||a.card_number,b.transaction_id||b.card_number);
}
export function customerData(snapshot,account,query=new URLSearchParams()){
 if(!accountValid(account))return json({success:false,error:'Fleet account matching is unavailable for this account.'},403);
 // Never turn a single-card test into a customer-wide snapshot.
 if(!snapshot||snapshot.readOnly!==true||snapshot.cardNumber||!Array.isArray(snapshot.rows)||
    (snapshot.customerAccount&&snapshot.customerAccount!==account))snapshot=null;
 const transactions=(snapshot?.rows||[]).filter(r=>matchesAccount(r.CustomerID,account)).map(project);
 const byCard=new Map();
 for(const row of transactions){if(!row.card_number)continue;const list=byCard.get(row.card_number)||[];list.push(row);byCard.set(row.card_number,list);}
 const cards=[...byCard].map(([card_number,items])=>{
  items.sort((a,b)=>compare(a,b,'received_at','desc'));
  return {card_number,card_type:unique(items.map(r=>r.card_type)),cardholder:unique(items.map(r=>r.cardholder)),transaction_count:items.length,fuel_quantity:sum(items,'fuel_quantity'),quantity_reported_count:items.filter(r=>finite(r.fuel_quantity)).length,total_sale:money(sum(items.map(r=>({value:r.source.TotalAmountOfSale})),'value')),last_used_on:items[0].received_at,driver_names:unique(items.map(r=>r.driver_name)),driver_numbers:unique(items.map(r=>r.driver_number)),vehicle_numbers:unique(items.map(r=>r.vehicle_number)),vehicle_descriptions:unique(items.map(r=>r.vehicle_description)),networks:unique(items.map(r=>r.source.Network)),last_transaction_status:items[0].status,card_status:null};
 });
 const kind=query.get('kind')==='transactions'?'transactions':'cards';
 const search=(query.get('search')||'').trim().toLowerCase().slice(0,200);
 const flatten=value=>value&&typeof value==='object'?Object.values(value).flatMap(flatten):value==null?[]:[String(value)];
 let items=(kind==='transactions'?transactions:cards).filter(r=>!search||flatten(r).join(' ').toLowerCase().includes(search));
 const accepted=kind==='transactions'?transactionSort:cardSort;
 const sort=accepted.has(query.get('sort'))?query.get('sort'):kind==='transactions'?'received_at':'card_number';
 const direction=query.has('direction')?(query.get('direction')==='desc'?'desc':'asc'):kind==='transactions'?'desc':'asc';
 items.sort((a,b)=>compare(a,b,sort,direction));
 const total=items.length,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(pages,Math.max(1,parseInt(query.get('page'),10)||1));
 return json({success:true,source:'intevacon_api',kind,account_number:account,items:items.slice((page-1)*20,page*20),total,page,pages,
  summary:{cards:cards.length,transactions:transactions.length,fuel_quantity:sum(transactions,'fuel_quantity'),quantity_reported_count:transactions.filter(r=>finite(r.fuel_quantity)).length,total_sale:money(sum(transactions.map(r=>({value:r.source.TotalAmountOfSale})),'value'))},
  last_sync:snapshot?.completedAt||null,window_from:snapshot?.from||null,window_to:snapshot?.to||null,card_scope:'transactions',
  notice:snapshot?'Cards shown had transactions in this period. Card activation status is not supplied.':'No fleet activity has been retrieved for this account yet. Click Refresh to check Intevacon.'});
}
export async function handleCustomer({request,env,customer}){
 if(!customer)return json({success:false,error:'Please sign in to your Wooten Oil account.'},401);
 if(!['GET','POST'].includes(request.method))return json({success:false,error:'Method not allowed.'},405);
 if(!accountValid(customer.account_number))return json({success:false,error:'Fleet account matching is unavailable for this account.'},403);
 if(!env.INTEVACON_SCHEDULER)return json({success:false,error:'Fleet activity is temporarily unavailable.'},503);
 if(request.method==='POST'){
  if(request.headers.get('Origin')!==new URL(request.url).origin||!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))
   return json({success:false,error:'Refresh fleet activity from your customer portal.'},403);
  try{
   // The browser may request a refresh, but never selects an account, date range or API filter.
   const reader=request.body?.getReader();let size=0,body='';const decoder=new TextDecoder();
   if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>128){await reader.cancel();return json({success:false,error:'Invalid refresh request.'},400);}body+=decoder.decode(part.value,{stream:true});}
   const input=JSON.parse(body||'{}');
   if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length)return json({success:false,error:'Invalid refresh request.'},400);
  }catch{return json({success:false,error:'Invalid refresh request.'},400);}
 }
 const supplied=new URL(request.url).searchParams,internal=new URL('https://scheduler/'+(request.method==='POST'?'customer-refresh':'customer-data'));
 for(const key of ['kind','search','sort','direction','page'])if(supplied.has(key))internal.searchParams.set(key,supplied.get(key));
 // Only the authenticated server session chooses the account, never a browser parameter.
 internal.searchParams.set('account',customer.account_number);
 try{return await env.INTEVACON_SCHEDULER.get(env.INTEVACON_SCHEDULER.idFromName('wooten-api-sync')).fetch(new Request(internal,{method:request.method}));}
 catch{return json({success:false,error:'Fleet activity could not be loaded. Please try Refresh.'},503);}
}
