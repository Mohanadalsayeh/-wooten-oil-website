/* Wooten Oil invoice comment parser — Ver635.
 * Pure, local parsing: no requests or database changes.
 * Browser: WootenInvoiceCommentParser.parse(comment)
 * Node: require('./wooten-invoice-comment-parser.js')
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WootenInvoiceCommentParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DEFAULT_RULES=[
    {id:'premium_93',name:'Premium No Lead Gas (93 Octane)',aliases:['ht/gas']},
    {id:'regular_87',name:'Regular No Lead Gas (87 Octane)',aliases:['b/gas','b']},
    {id:'road_diesel_low_sulfur',name:'Road Diesel (Low Sulfur Diesel)',aliases:['lsdf','ls']},
    {id:'farm_diesel_off_road',name:'Farm Diesel (Off Road)',aliases:['hs','hsdf']}
  ];
  const normalize=value=>String(value).trim().toLowerCase();
  const numberPattern=/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
  const sum=(a,b)=>Math.round((a+b)*1e6)/1e6;
  function createParser(rules=DEFAULT_RULES){
    const ids=new Set(),aliases=new Set(),compiled=[];
    const catalog=rules.map(rule=>{
      if(!rule||!rule.id||!rule.name||!Array.isArray(rule.aliases)||!rule.aliases.length)throw Error('Each fuel rule needs an id, name, and aliases.');
      if(ids.has(rule.id))throw Error('Duplicate fuel id: '+rule.id);ids.add(rule.id);
      const item={id:rule.id,name:rule.name,aliases:rule.aliases.slice()};
      for(const alias of item.aliases){
        const tokens=String(alias).split('/').map(normalize),key=tokens.join('/');
        if(tokens.some(t=>!t||t==='gal'||numberPattern.test(t)))throw Error('Invalid fuel alias: '+alias);
        if(aliases.has(key))throw Error('Duplicate fuel alias: '+alias);aliases.add(key);
        compiled.push({id:item.id,name:item.name,tokens});
      }
      return item;
    });
    // Prefer the complete b/gas alias over its abbreviated b form.
    compiled.sort((a,b)=>b.tokens.length-a.tokens.length);
    function parse(comment){
      const original=comment==null?'':String(comment),tokens=original.split('/').map(normalize);
      const items=[],unparsed=[],warnings=[];
      const result={original,status:'unrecognized',items,totals:[],totalGallons:0,unparsed,warnings};
      if(!original.trim()){result.status='empty';return result;}
      if(tokens.at(-1)!=='gal'){
        warnings.push('The ending gal unit marker is missing. No gallons were inferred.');
        unparsed.push({text:original,reason:'missing_unit'});return result;
      }
      tokens.pop();
      for(let i=0;i<tokens.length;){
        const rule=compiled.find(r=>r.tokens.every((t,j)=>tokens[i+j]===t));
        if(!rule){unparsed.push({text:tokens[i],tokenIndex:i,reason:'unknown_token'});i++;continue;}
        const quantityIndex=i+rule.tokens.length,value=tokens[quantityIndex];
        if(value===undefined||!numberPattern.test(value)){
          unparsed.push({text:tokens.slice(i,quantityIndex).join('/'),tokenIndex:i,reason:'missing_or_invalid_quantity'});i=quantityIndex;continue;
        }
        const gallons=Number(value.replace(/,/g,''));
        if(!Number.isFinite(gallons)||gallons<0||gallons>Number.MAX_SAFE_INTEGER){
          unparsed.push({text:tokens.slice(i,quantityIndex+1).join('/'),tokenIndex:i,reason:'invalid_quantity'});i=quantityIndex+1;continue;
        }
        items.push({fuelId:rule.id,fuelName:rule.name,gallons,source:tokens.slice(i,quantityIndex+1).join('/')});
        i=quantityIndex+1;
      }
      const totals=new Map();
      for(const item of items){
        if(!totals.has(item.fuelId))totals.set(item.fuelId,{fuelId:item.fuelId,fuelName:item.fuelName,gallons:0});
        const total=totals.get(item.fuelId);total.gallons=sum(total.gallons,item.gallons);
      }
      result.totals=[...totals.values()];result.totalGallons=result.totals.reduce((n,t)=>sum(n,t.gallons),0);
      result.status=items.length?(unparsed.length?'partial':'complete'):'unrecognized';
      if(unparsed.length)warnings.push('Unrecognized or incomplete text requires review; totals include recognized entries only.');
      return result;
    }
    // Only fully recognized comments contribute to automatic invoice totals.
    // Call with one unique invoice per array item to avoid counting an invoice twice.
    function summarizeInvoices(invoices){
      const totals=new Map(),review=[],results=[];
      invoices.forEach((invoice,index)=>{
        const parsed=parse(invoice.Comment??invoice.comment),reference=invoice.invoice_no??invoice.InvoiceNo??index;
        results.push({reference,...parsed});
        if(parsed.status!=='complete'){review.push({reference,status:parsed.status,original:parsed.original});return;}
        for(const item of parsed.totals){
          if(!totals.has(item.fuelId))totals.set(item.fuelId,{...item,gallons:0});
          const total=totals.get(item.fuelId);total.gallons=sum(total.gallons,item.gallons);
        }
      });
      const values=[...totals.values()];
      return {totals:values,totalGallons:values.reduce((n,t)=>sum(n,t.gallons),0),includedInvoices:results.length-review.length,review,results};
    }
    return {parse,summarizeInvoices,rules:catalog};
  }
  return {...createParser(),createParser,DEFAULT_RULES:DEFAULT_RULES.map(r=>({...r,aliases:r.aliases.slice()}))};
});
