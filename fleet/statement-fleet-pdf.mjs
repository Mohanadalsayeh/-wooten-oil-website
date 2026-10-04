import {fuelSummary} from './statement-fuel-summary.mjs';
// Ver727: fleet supplement page streams use the statement's F1/F2 fonts.
const fontWidths=[[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]];
const plain=v=>String(v??'').normalize('NFKD').replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
const esc=v=>plain(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const qty=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:3}):'-';
const money=cents=>Number.isSafeInteger(cents)?(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'}):'-';
function wrap(v,n){const s=plain(v)||'-',lines=[];let line='';for(let word of s.split(' ')){while(word.length>n){if(line){lines.push(line);line='';}lines.push(word.slice(0,n));word=word.slice(n);}if(!word)continue;if(line.length+word.length+1>n){lines.push(line);line='';}line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;}
function day(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);return m?m[2]+'/'+m[3]+'/'+m[1]+(m[4]?' '+m[4]+':'+m[5]:''):plain(v)||'-';}
function central(v){if(!v)return 'Not available';const date=new Date(v);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date)+' CT':'Not available';}
export function pages(fleet,customer,statementDate,letterhead){
 // Ver718: omit zero-gallon cards before pagination and numbering.
 const cards=(fleet?.cards||[]).filter(card=>card.total!==0);
 if(!cards.length)return [];
 const result=[];let ops=[],y=0;
 const text=(x,top,value,size=9,bold=false)=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf 100 Tz 0.08 0.19 0.29 rg ${x} ${top} Td (${esc(value)}) Tj ET`);
 const line=top=>ops.push(`0.82 0.88 0.92 RG 0.5 w 42 ${top} m 570 ${top} l S`);
 const finish=()=>{line(82);text(42,68,'Fleet data retrieved: '+central(fleet.retrieved),8);text(42,56,'Saved API results through '+day(fleet.through)+'. Totals include completed transactions only.',7.5);result.push(ops.join('\n'));ops=[];};
 const cols=[42,114,218,332,434,500],widths=[72,104,114,102,66,70];
 const single=(x,top,value,width,bold=false,right=false)=>{
  const v=plain(value)||'-';
  // Fit the actual Helvetica glyph widths without wrapping or removing data.
  const measured=[...v].reduce((n,c)=>n+fontWidths[bold?1:0][c.charCodeAt(0)-32],0)*8/1000;
  const scale=Math.min(100,(width-8)/Math.max(1,measured)*100);
  const position=right?x+width-4-measured*scale/100:x+4;
  ops.push(`BT /${bold?'F2':'F1'} 8 Tf ${scale.toFixed(2)} Tz 0.08 0.19 0.29 rg ${position} ${top} Td (${esc(v)}) Tj ET`);
 };
 const shortDay=v=>day(v).replace(/(\d{2}\/\d{2}\/)\d{2}(\d{2})/,'$1$2');
 const labels=['TRANS #','DATE / TIME','LOCATION','FUEL','GALLONS','SALE'];
 const headings=()=>{ops.push(`0.94 0.97 0.99 rg 42 ${y-30} 528 30 re f`);labels.forEach((v,i)=>v.split('|').forEach((part,j)=>text(cols[i]+4,y-12-j*10,part,7.3,true)));y-=32;};
 let card,cardIndex=0,continued=false;
 function startPage(){
  ops.push(letterhead());text(42,655,'Fleet Cards & Transactions',13,true);text(42,637,day(statementDate)+' | Customer # '+customer.account_number,9);
  y=620;for(const v of wrap(customer.account_name,90)){text(42,y,v,10,true);y-=13;}
  text(42,y,'Period: '+day(fleet.range.from)+' '+(fleet.range.fromTime||'00:00:00')+' through '+day(fleet.range.to)+' '+(fleet.range.toTime||'23:59:59')+' CT',8.5);y-=21;
 }
 function cardDetails(){
  const labels={status:'Status',card_type:'Type',cardholder:'Cardholder',driver_id:'Driver ID',driver_no:'Driver number',vehicle_id:'Vehicle ID',vehicle_no:'Vehicle number',assigned_to:'Assigned to',last_used_on:'Last used'};
  const details=Object.entries(labels).filter(([k])=>card.info[k]).map(([k,label])=>label+': '+(k==='last_used_on'?day(card.info[k]):card.info[k]));
  if(!details.length)details.push('Card information from transaction records.');
  return wrap(details.join(' | '),105);
 }
 function cardHeader(){
  const details=cardDetails();
  const height=35+details.length*11;
  ops.push(`0.94 0.97 0.99 rg 42 ${y-height+13} 528 ${height} re f`);
  text(50,y,'(Card '+(cardIndex+1)+'/'+cards.length+') '+(card.info.card_number||'Not reported')+(continued?' - continued':''),12,true);y-=17;
  for(const v of details){text(50,y,v,8);y-=11;}
  y-=18;headings();
 }
 function next(){finish();continued=true;startPage();cardHeader();}
 function summaryHead(){
  text(42,y,'Fuel Summary - All Cards',12,true);y-=18;
  text(42,y,'Completed fuel only. Base Price and taxes are dollar amounts, not per-gallon rates.',7.5);y-=15;
  const xs=[42,173,240,306,372,438,504],ws=[131,67,66,66,66,66,66];
  ops.push(`0.94 0.97 0.99 rg 42 ${y-25} 528 25 re f`);
  ['PRODUCT','QUANTITY (GAL)','BASE PRICE','FEDERAL TAX','STATE TAX','OTHER TAXES','TOTAL'].forEach((v,i)=>single(xs[i],y-15,v,ws[i],true));y-=27;
 }
 function summaryRow(row,bold=false){
  const xs=[42,173,240,306,372,438,504],ws=[131,67,66,66,66,66,66];
  const values=[row.name,qty(row.quantity),...['base','federal','state','other','total'].map(k=>money(row[k]))];
  values.forEach((v,i)=>single(xs[i],y-14,v,ws[i],bold,i>0));y-=24;line(y);
 }
 startPage();summaryHead();
 const summary=fuelSummary(cards);
 for(const row of summary.rows){if(y<160){finish();startPage();summaryHead();}summaryRow(row);}
 if(y<175){finish();startPage();summaryHead();}
 summaryRow(summary.total,true);y-=14;
 text(42,y,'- = breakdown unavailable or incomplete. Base amounts count once per fuel product line.',7.5);y-=12;
 text(42,y,'Fuel summary total = base + charged taxes. Card sales are the reported transaction sale amounts.',7.5);y-=12;
 for(const [index,currentCard] of cards.entries()){
  card=currentCard;cardIndex=index;
  continued=false;
  // Keep each card header with its first transaction (and total for short cards).
  const needed=67+cardDetails().length*11+24+(card.transactions.length<=1?100:0);
  if(!ops.length)startPage();
  else if(y-20-needed<100){finish();startPage();}
  else y-=20;
  cardHeader();
  if(!card.transactions.length){text(46,y-15,'No saved transactions in this period.',9);y-=32;}
  for(const [transactionIndex,t] of card.transactions.entries()){
   const cells=[t.id+(!t.complete?' *':''),shortDay(t.received),t.merchant,t.products.map(p=>p.name).join('; ')||'No fuel',qty(t.quantity),money(t.saleCents)];
   const reserve=transactionIndex===card.transactions.length-1?100:0;
   if(y-24-reserve<100)next();
   cells.forEach((value,i)=>single(cols[i],y-14,value,widths[i],i===0,i>=4));
   y-=24;line(y);
  }

  if(y<180)next();y-=23;
  text(42,y,(card.missing?'Known completed gallons':'Total gallons used')+' for this card: '+qty(card.total),11,true);y-=16;
  const completed=card.transactions.filter(t=>t.complete);
  const missingAmounts=completed.filter(t=>!Number.isSafeInteger(t.saleCents)).length;
  const saleTotal=completed.reduce((sum,t)=>sum+(Number.isSafeInteger(t.saleCents)?t.saleCents:0),0);
  text(42,y,(missingAmounts?'Known completed sale amount':'Total sale amount')+' for this card: '+money(saleTotal),11,true);y-=16;
  if(missingAmounts){text(42,y,missingAmounts+' completed transaction(s) have no reported sale amount; total is incomplete.',8);y-=12;}
  if(card.missing){text(42,y,card.missing+' completed transaction(s) have no reported fuel quantity; total is incomplete.',8);y-=12;}
  if(card.excluded){text(42,y,card.excluded+' transaction(s) marked * are not completed and excluded from totals.',8);y-=12;}
  line(y);
 }
 if(ops.length)finish();
 return result;
}
