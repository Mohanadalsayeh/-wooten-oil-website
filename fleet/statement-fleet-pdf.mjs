// Ver691: fleet supplement page streams use the statement's F1/F2 fonts.
const plain=v=>String(v??'').normalize('NFKD').replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
const esc=v=>plain(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const qty=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:3}):'-';
function wrap(v,n){const s=plain(v)||'-',lines=[];let line='';for(let word of s.split(' ')){while(word.length>n){if(line){lines.push(line);line='';}lines.push(word.slice(0,n));word=word.slice(n);}if(!word)continue;if(line.length+word.length+1>n){lines.push(line);line='';}line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;}
function day(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);return m?m[2]+'/'+m[3]+'/'+m[1]+(m[4]?' '+m[4]+':'+m[5]:''):plain(v)||'-';}
function central(v){if(!v)return 'Not available';const date=new Date(v);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date)+' CT':'Not available';}
export function pages(fleet,customer,statementDate,letterhead){
 if(!fleet?.cards?.length)return [];
 const result=[];let ops=[],y=0;
 const text=(x,top,value,size=9,bold=false)=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf 0.08 0.19 0.29 rg ${x} ${top} Td (${esc(value)}) Tj ET`);
 const line=top=>ops.push(`0.82 0.88 0.92 RG 0.5 w 42 ${top} m 570 ${top} l S`);
 const finish=()=>{line(82);text(42,68,'Fleet data retrieved: '+central(fleet.retrieved),8);text(42,56,'Saved API results through '+day(fleet.through)+'. Fuel totals include completed transactions only.',7.5);result.push(ops.join('\n'));ops=[];};
 const cols=[42,111,201,325,514],sizes=[13,17,23,35,10];
 const labels=['TRANS #|STATUS','RECEIVED','MERCHANT','FUEL / QUANTITY','GALLONS'];
 const headings=()=>{ops.push(`0.94 0.97 0.99 rg 42 ${y-30} 528 30 re f`);labels.forEach((v,i)=>v.split('|').forEach((part,j)=>text(cols[i]+4,y-12-j*10,part,7.3,true)));y-=32;};
 let card,continued=false;
 function start(){
  ops.push(letterhead());text(42,655,'Fleet Cards & Transactions',13,true);text(42,637,day(statementDate)+' | Customer # '+customer.account_number,9);
  y=620;for(const v of wrap(customer.account_name,90)){text(42,y,v,10,true);y-=13;}
  text(42,y,'Period: '+day(fleet.range.from)+' 00:00 through '+day(fleet.range.to)+' 23:59 (Central dates)',8.5);y-=21;
  text(42,y,'Card '+(card.info.card_number||'Not reported')+(continued?' - continued':''),12,true);y-=17;
  const labels={status:'Status',card_type:'Type',cardholder:'Cardholder',driver_id:'Driver ID',driver_no:'Driver number',vehicle_id:'Vehicle ID',vehicle_no:'Vehicle number',assigned_to:'Assigned to',last_used_on:'Last used'};
  const details=Object.entries(labels).filter(([k])=>card.info[k]).map(([k,label])=>label+': '+(k==='last_used_on'?day(card.info[k]):card.info[k]));
  if(!details.length)details.push('Card information from transaction records.');
  for(const v of wrap(details.join(' | '),111)){text(42,y,v,8);y-=11;}
  y-=9;headings();
 }
 function next(){finish();continued=true;start();}
 for(card of fleet.cards){
  continued=false;start();
  if(!card.transactions.length){text(46,y-15,'No saved transactions in this period.',9);y-=32;}
  for(const [transactionIndex,t] of card.transactions.entries()){
   const cells=[t.id+' / '+t.status,day(t.received),t.merchant,t.products.map(p=>p.name+': '+qty(p.quantity)).join('; ')||'No reported fuel',qty(t.quantity)];
   const lines=cells.map((v,i)=>wrap(v,sizes[i]));
   const extra=[t.driver&&'Driver: '+t.driver,t.vehicle&&'Vehicle: '+t.vehicle,t.odometer&&'Odometer: '+t.odometer,t.auth&&'Auth ref: '+t.auth,t.invoice&&'Invoice: '+t.invoice,t.entry&&'Entry: '+t.entry,t.type&&'Type: '+t.type,!t.counted&&'Excluded from gallon total'+(t.complete?(t.hasFuel?' (quantity unavailable)':' (no reported fuel)'):' (not completed)')].filter(Boolean).join(' | ');
   const extras=extra?wrap(extra,112):[];
   const count=Math.max(...lines.map(a=>a.length));
   const reserve=transactionIndex===card.transactions.length-1?70:0;
   if(y-Math.min(150,count*11+extras.length*10+14)-reserve<100)next();
   for(let i=0;i<count;i++){if(y<115)next();lines.forEach((a,c)=>{if(a[i])text(cols[c]+4,y-12,a[i],8,c===0);});y-=11;}
   y-=4;
   for(const v of extras){if(y<112)next();text(46,y-10,v,7.5);y-=10;}
   y-=7;line(y);
  }
  if(y<150)next();y-=23;
  text(42,y,(card.missing?'Known completed gallons':'Total gallons used')+' for this card: '+qty(card.total),11,true);y-=16;
  if(card.missing){text(42,y,card.missing+' completed transaction(s) have no reported fuel quantity; total is incomplete.',8);y-=12;}
  if(card.excluded){text(42,y,card.excluded+' non-completed transaction(s) shown above are excluded from the total.',8);y-=12;}
  finish();
 }
 return result;
}
