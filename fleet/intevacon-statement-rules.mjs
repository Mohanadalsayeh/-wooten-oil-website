// Ver1099 — Separate fleet transaction history from billable statement purchases.
// Intevacon LocalDateTime is a source wall-clock timestamp. Never reinterpret
// offset-free values as UTC or silently substitute ReceivedDateTime.
const completeStatuses=new Set(['processed','invoiced','complete','completed']);
const validDay=(y,m,d)=>{
 const t=new Date(Date.UTC(y,m-1,d));
 return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d;
};
export function isCompletedTransaction(row){
 const status=String(row?.Status??'').trim().toLowerCase();
 // An explicit status always wins over potentially stale/inconsistent numeric IDs.
 if(status)return completeStatuses.has(status);
 return [2,6,7].includes(Number(row?.StatusID));
}
export function localPurchaseKey(value){
 const raw=String(value??'').trim();
 let y,m,d,h=0,min=0,s=0,ms=0;
 const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
 const us=iso?null:raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))?$/i);
 if(iso){[y,m,d]=iso.slice(1,4).map(Number);h=Number(iso[4]??0);min=Number(iso[5]??0);s=Number(iso[6]??0);ms=Number((iso[7]||'').padEnd(3,'0')||0);}
 else if(us){m=Number(us[1]);d=Number(us[2]);y=Number(us[3]);h=Number(us[4]??0);min=Number(us[5]??0);s=Number(us[6]??0);if(us[7]){if(h<1||h>12)return null;h=h%12+(us[7].toUpperCase()==='PM'?12:0);}}
 else return null;
 if(!validDay(y,m,d)||h>23||min>59||s>59)return null;
 const pad=(value,len=2)=>String(value).padStart(len,'0');
 return `${pad(y,4)}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(s)}.${pad(ms,3)}`;
}
export function isWithinStatementPeriod(row,range){
 if(!isCompletedTransaction(row))return false;
 const time=localPurchaseKey(row.LocalDateTime);
 if(!time)return false;
 const from=`${range.from}T${range.fromTime||'00:00:00'}.000`;
 const to=`${range.to}T${range.toTime||'23:59:59'}.999`;
 return time>=from&&time<=to;
}
