// Statement-only product breakdown. Never substitute tax rates or exempt taxes for charged amounts.
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const cents=v=>finite(v)?Math.round(v*100):null;
export function productBreakdown(detail){
 const taxes=Array.isArray(detail.Taxes)?detail.Taxes:[];
 // BaseAmount repeats on tax rows; count it once, and require agreement.
 const bases=taxes.map(t=>t.BaseAmount);
 const base=bases.length&&bases.every(finite)&&bases.every(v=>Math.abs(v-bases[0])<0.000001)?cents(bases[0]):null;
 const sum=key=>taxes.length&&taxes.every(t=>finite(t[key]))?Math.round(taxes.reduce((n,t)=>n+t[key],0)*100):null;
 const federal=sum('FederalTax'),state=sum('StateTax'),other=sum('OtherTax');
 const known=[base,federal,state,other].every(Number.isSafeInteger);
 return {base,federal,state,other,total:known?base+federal+state+other:null};
}
export function fuelSummary(cards){
 const groups=new Map();
 for(const card of cards)for(const transaction of card.transactions||[]){
  if(!transaction.complete)continue;
  for(const product of transaction.products||[]){
   const key=String(product.code||'')+'|'+String(product.name||'Fuel').toLowerCase();
   let row=groups.get(key);
   if(!row){row={name:product.name||'Fuel',quantity:0,base:0,federal:0,state:0,other:0,total:0};groups.set(key,row);}
   row.quantity=finite(row.quantity)&&finite(product.quantity)?Math.round((row.quantity+product.quantity)*1000)/1000:null;
   for(const field of ['base','federal','state','other','total'])row[field]=Number.isSafeInteger(row[field])&&Number.isSafeInteger(product.breakdown?.[field])?row[field]+product.breakdown[field]:null;
  }
 }
 const rows=[...groups.values()];
 const total={name:'Total',quantity:0,base:0,federal:0,state:0,other:0,total:0};
 for(const row of rows)for(const key of ['quantity','base','federal','state','other','total'])total[key]=finite(total[key])&&finite(row[key])?total[key]+row[key]:null;
 if(finite(total.quantity))total.quantity=Math.round(total.quantity*1000)/1000;
 return {rows,total};
}
