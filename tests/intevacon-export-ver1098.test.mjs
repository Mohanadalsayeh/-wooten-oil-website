import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {exportHistoryPage} from '../fleet/intevacon-history.mjs';

const rows=[
 {ID:'12345678901234567890',CustomerID:'0012',CardNumber:'00001234',Status:'Declined',
  DeclineReason:'PIN Invalid',ReceivedDateTime:'2026-10-15T18:01:00',LocalDateTime:null,Details:[]},
 {ID:'010',CustomerID:'3031',CardNumber:'31069704',Status:'Invoiced',
  ReceivedDateTime:'2026-10-15T10:30:00',LocalDateTime:'2026-10-12T09:30:00',
  Details:[{RowNumber:1,ProductCode:'001',ProductName:'Diesel',Quantity:22.5,
   Taxes:[{TaxRowNumber:1,TaxAuthority:'TN',StateTax:1.35}]}]},
 {ID:'011',CustomerID:'3031',CardNumber:'31069704',Status:'Processed',
  ReceivedDateTime:'2026-10-14T00:30:00',LocalDateTime:'2026-10-13T23:30:00',
  Details:[]}
];
function dbFake() {
 return {batch:async()=>[],prepare(sql){
  return {bind(...args){
    return {async first(){
      const selected=select(sql,args);return {total:selected.length};
    },async all(){
      const selected=select(sql,args);
      const limit=args[args.length-2],offset=args[args.length-1];
      return {results:selected.slice(offset,offset+limit).map(r=>({id:r.ID,row_json:JSON.stringify(r),fetched_at:'2026-10-16T00:00:00Z'}))};
    }};
  }};
 }};
}
function select(sql,args){
 let selected=[...rows];
 if(sql.includes('received_at>=?'))selected=selected.filter(r=>r.ReceivedDateTime>=args[0]&&r.ReceivedDateTime<=args[1]);
 if(sql.includes('instr(search_text'))selected=selected.filter(r=>JSON.stringify(r).toLowerCase().includes(args[2]));
 if(sql.includes('card_number=?'))selected=selected.filter(r=>r.CardNumber===args.at(-3));
 return selected.sort((a,b)=>a.ID.localeCompare(b.ID));
}
test('full database ignores the active date range and includes declined records and nested API product taxes',async()=>{
 const data=await exportHistoryPage(dbFake(),new URLSearchParams({scope:'full',page:'1',from:'2026-10-15T00:00',to:'2026-10-15T23:59'}));
 assert.equal(data.total,3);assert.equal(data.items[0].Details[0].Taxes[0].StateTax,1.35);
 assert.ok(data.items.some(x=>x.Status==='Declined'));
 assert.equal(data.items.find(x=>x.Status==='Declined').ID,'12345678901234567890');
});
test('filtered PDF backend honors From, To and search for all matching saved records',async()=>{
 const data=await exportHistoryPage(dbFake(),new URLSearchParams({scope:'filtered',from:'2026-10-15T00:00',to:'2026-10-15T23:59',search:'invoiced'}));
 assert.equal(data.total,1);assert.equal(data.items[0].ID,'010');
});
test('invalid or oversized ranges rejected and no database rows deleted',async()=>{
 await assert.rejects(exportHistoryPage(dbFake(),new URLSearchParams({scope:'filtered',from:'2026-01-01T00:00',to:'2026-10-01T00:00'})),/92 days/);
 assert.equal(rows.length,3);
});
function fakeEl(value=''){
 const handlers={};return {value,textContent:'',hidden:false,disabled:false,dataset:{},
  classList:{toggle(){}},addEventListener(name,fn){handlers[name]=fn;},
  click(){handlers.click?.();},setAttribute(){},
  get handlers(){return handlers;}};
}
test('Excel export produces all transaction fields plus product/tax worksheets; PDF is not restricted to visible columns',async()=>{
 const ids=['apiTestExportPdf','apiTestExportExcel','apiTestExportCancel','apiTestExportStatus','adminKey','apiTestResults'];
 const els=Object.fromEntries(ids.map(x=>[x,fakeEl()]));els.adminKey.value='admin-test';
 const written=[];const pdfs=[];
 const workbookSheets={};
 const xlsx={utils:{
  book_new:()=>({Sheets:{}}),
  book_append_sheet(book,sheet,name){book.Sheets[name]=sheet;workbookSheets[name]=sheet;},
  aoa_to_sheet(matrix){return {matrix,'!ref':'A1:B2',...Object.fromEntries(matrix.flatMap((row,r)=>row.map((v,c)=>[`${String.fromCharCode(65+c)}${r+1}`,{v}])))};},
  encode_cell({r,c}){return String.fromCharCode(65+c)+(r+1);}
 },writeFile(book,name){written.push({book,name});}};
 const window={addEventListener(){},XLSX:xlsx,WootenIntevaconExportContext:{allowed:()=>true,current:()=>({loaded:true,historyMode:false,total:2,rows:[rows[0],rows[1]],search:''})},
  WootenAdminTablePdf:{async exportData(title,headers,pdfRows){pdfs.push({title,headers,rows:pdfRows});}}};
 const context={window,document:{getElementById(id){return els[id];}},
  XLSX:xlsx,confirm:()=>true,URL,URLSearchParams,AbortController,DOMException,console,Intl,Date,Number,Math,String,Array,Object,Set,Map,
  setTimeout,clearTimeout,MutationObserver:class {observe(){}},fetch:async request=>{
   assert.match(request,/\/api\/admin\/fleet\/export/);
   return {ok:true,json:async()=>({success:true,total:2,pages:1,page:1,items:[rows[1],rows[0]]})};
  }};
 vm.runInNewContext(fs.readFileSync(new URL('../assets/js/wooten-intevacon-api-export.js',import.meta.url),'utf8'),context);
 els.apiTestExportExcel.click();await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(written.length,1,els.apiTestExportStatus.textContent);
 const book=written[0].book;
 assert.deepEqual(Object.keys(book.Sheets),['Transactions','Products','Taxes']);
 assert.ok(book.Sheets.Transactions.matrix[0].includes('ReceivedDateTime'));
 assert.ok(book.Sheets.Transactions.matrix[0].includes('LocalDateTime'));
 assert.ok(book.Sheets.Transactions.matrix[0].includes('DeclineReason'),JSON.stringify(book.Sheets.Transactions.matrix[0]));
 assert.ok(book.Sheets.Products.matrix[0].includes('ProductCode'));
 assert.ok(book.Sheets.Taxes.matrix[0].includes('StateTax'));
 els.apiTestExportPdf.click();await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(pdfs.length,1);
 assert.ok(pdfs[0].rows.some(r=>r[2]==='DeclineReason'&&r[3]==='PIN Invalid'));
 assert.ok(pdfs[0].rows.some(r=>r[2]==='StateTax'&&r[3]==='1.35'));
});
