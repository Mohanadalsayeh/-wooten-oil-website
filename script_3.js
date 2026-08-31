
let preparedRows=[];

function formatImportUpdateDate(value){
  if(!value) return "Not imported yet";
  let raw=String(value).trim();
  // SQLite CURRENT_TIMESTAMP is UTC and has no timezone suffix.
  if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)){
    raw=raw.replace(" ","T")+"Z";
  }
  const d=new Date(raw);
  if(Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-US",{
    month:"short",
    day:"numeric",
    year:"numeric",
    hour:"numeric",
    minute:"2-digit"
  });
}

function setImportLastUpdate(kind,value,by){
  const el=document.getElementById(
    kind==="payments" ? "paymentImportLastUpdateValue" : "customerImportLastUpdateValue"
  );
  if(el) el.textContent=formatImportUpdateDate(value);
  const byEl=document.getElementById(kind==="payments"?"paymentImportLastUpdateBy":"customerImportLastUpdateBy");
  if(byEl)byEl.textContent="Imported by: "+(by||"—");
}

async function loadImportLastUpdates(){
  const key=document.getElementById("adminKey")?.value.trim();
  if(!key) return;
  try{
    const res=await fetch("/api/admin/import-status",{
      headers:{"X-Admin-Key":key,"Accept":"application/json"},
      cache:"no-store"
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok || data.success===false) return;
    setImportLastUpdate("customers",data.customers_last_import_at||"",data.customers_last_import_by||"");
    setImportLastUpdate("payments",data.payments_last_import_at||"",data.payments_last_import_by||"");
  }catch(e){
    console.warn("Could not load import update times",e);
  }
}


const aliases={
  account_number:["customerno","customer_no","accountnum","accountnumber","account_number","acctnum","acctnumber"],
  account_name:["accountname","account_name","customername","name"],
  address1:["addressline1","address1","address","street","streetaddress"],
  address2:["addressline2","address2","address_2","suite"],
  city:["city"],
  state:["state"],
  zip_code:["zipcode","zip","zip_code","postalcode"],
  phone:["telephoneno","telephone_no","phone1","phone","phonenumber","phone_number"],
  email:["email","emailaddress","email_address"],
  current_balance:["currentbalance","current_balance","currentbal","current"],
  aging_category_1:["agingcategory1","aging_category_1","aging1","age1"],
  aging_category_2:["agingcategory2","aging_category_2","aging2","age2"],
  aging_category_3:["agingcategory3","aging_category_3","aging3","age3"],
  aging_category_4:["agingcategory4","aging_category_4","aging4","age4"],
  statement_cycle:["statementcycle","statement_cycle","stmtcycle","statementcode","cycle"]
};

function keyify(v){return String(v??"").trim().toLowerCase().replace(/[^a-z0-9_]/g,"");}
function pick(row,names){
  const map={};
  Object.keys(row).forEach(k=>map[keyify(k)]=row[k]);
  for(const n of names){ if(map[keyify(n)]!==undefined) return map[keyify(n)]; }
  return "";
}
function clean(v){return String(v??"").trim();}
function normalizeAccount(v){
  let s=clean(v);
  if(/^\d+(\.0+)?$/.test(s)) s=String(parseInt(s,10));
  s=s.replace(/\D/g,"");
  return s ? s.padStart(7,"0") : "";
}
function normalizePhone(v){return clean(v).replace(/[^\d]/g,"");}
function normalizeMoney(v){const n=Number(clean(v).replace(/[$,]/g,"")); return Number.isFinite(n)?n:0;}
function mapRow(row){
  return {
    account_number:normalizeAccount(pick(row,aliases.account_number)),
    account_name:clean(pick(row,aliases.account_name)),
    address1:clean(pick(row,aliases.address1)),
    address2:clean(pick(row,aliases.address2)),
    city:clean(pick(row,aliases.city)),
    state:clean(pick(row,aliases.state)),
    zip_code:clean(pick(row,aliases.zip_code)).replace(/\.0+$/,""),
    phone:normalizePhone(pick(row,aliases.phone)),
    email:clean(pick(row,aliases.email)),
    current_balance:normalizeMoney(pick(row,aliases.current_balance)),
    aging_category_1:normalizeMoney(pick(row,aliases.aging_category_1)),
    aging_category_2:normalizeMoney(pick(row,aliases.aging_category_2)),
    aging_category_3:normalizeMoney(pick(row,aliases.aging_category_3)),
    aging_category_4:normalizeMoney(pick(row,aliases.aging_category_4)),
    statement_cycle:(()=>{const cycle=clean(pick(row,aliases.statement_cycle)).toUpperCase();return cycle?cycle==='C'||cycle==='W'?'B':'A':'';})()
  };
}
function setStatus(msg,good=true){
  const el=document.getElementById("status");
  el.className="status show "+(good?"ok":"bad");
  el.textContent=msg;
}
function updateImportProgress(kind,{processed=0,total=0,imported=0,batch=0,batches=0,state="running",label=""}={}){
  const prefix=kind==="payments"?"paymentImport":"customerImport";
  const box=document.getElementById(prefix+"Progress");
  const safeTotal=Math.max(0,Number(total)||0);
  const safeProcessed=Math.max(0,Math.min(safeTotal,Number(processed)||0));
  const percent=safeTotal?Math.round((safeProcessed/safeTotal)*100):0;
  box.hidden=false;
  box.classList.toggle("is-complete",state==="complete");
  box.classList.toggle("is-failed",state==="failed");
  document.getElementById(prefix+"ProgressTitle").textContent=label||(kind==="payments"?"Importing customer payments":"Importing customers");
  document.getElementById(prefix+"ProgressPercent").textContent=percent+"%";
  document.getElementById(prefix+"ProgressBar").style.width=percent+"%";
  const track=document.getElementById(prefix+"ProgressTrack");
  track.setAttribute("aria-valuenow",String(percent));
  document.getElementById(prefix+"ProgressCount").textContent=`Imported ${Number(imported||0).toLocaleString()} • Processed ${safeProcessed.toLocaleString()} of ${safeTotal.toLocaleString()}`;
  document.getElementById(prefix+"ProgressBatch").textContent=batches?`Batch ${Math.min(batch,batches)} of ${batches}`:"Preparing batches";
}
function updatePreviewProgress(kind,{processed=0,total=0,phase="reading"}={}){
  const prefix=kind==="payments"?"paymentPreview":"customerPreview";
  const box=document.getElementById(prefix+"Progress");
  const track=document.getElementById(prefix+"ProgressTrack");
  box.hidden=false;
  if(phase==="reading"){
    box.classList.add("is-indeterminate");
    document.getElementById(prefix+"ProgressLabel").textContent=kind==="payments"?"Reading payment file…":"Reading customer file…";
    document.getElementById(prefix+"ProgressCount").textContent="Preparing rows";
    track.removeAttribute("aria-valuenow");
    return;
  }
  box.classList.remove("is-indeterminate");
  const safeTotal=Math.max(0,Number(total)||0);
  const safeProcessed=Math.max(0,Math.min(safeTotal,Number(processed)||0));
  const percent=safeTotal?Math.round((safeProcessed/safeTotal)*100):100;
  document.getElementById(prefix+"ProgressLabel").textContent=kind==="payments"?"Preparing payment preview…":"Preparing customer preview…";
  document.getElementById(prefix+"ProgressCount").textContent=`${safeProcessed.toLocaleString()} of ${safeTotal.toLocaleString()} • ${percent}%`;
  document.getElementById(prefix+"ProgressBar").style.width=percent+"%";
  track.setAttribute("aria-valuenow",String(percent));
}
function hidePreviewProgress(kind){
  const prefix=kind==="payments"?"paymentPreview":"customerPreview";
  const box=document.getElementById(prefix+"Progress");
  box.classList.remove("is-indeterminate");
  box.hidden=true;
}
async function mapPreviewRowsInBatches(rows,mapper,kind,batchSize=500){
  const source=Array.isArray(rows)?rows:[];
  const mapped=[];
  for(let i=0;i<source.length;i+=batchSize){
    const chunk=source.slice(i,i+batchSize);
    for(const row of chunk)mapped.push(mapper(row));
    updatePreviewProgress(kind,{processed:Math.min(i+chunk.length,source.length),total:source.length,phase:"mapping"});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!source.length)updatePreviewProgress(kind,{processed:0,total:0,phase:"mapping"});
  return mapped;
}
function beginDatabaseLoadProgress(kind){
  const prefix=kind==="payments"?"paymentDatabaseLoad":"customerDatabaseLoad";
  const box=document.getElementById(prefix+"Progress");
  box.hidden=false;
  box.classList.add("is-indeterminate");
  document.getElementById(prefix+"ProgressLabel").textContent=kind==="payments"?"Loading payments…":"Loading customers database…";
  document.getElementById(prefix+"ProgressCount").textContent="Requesting records";
  document.getElementById(prefix+"ProgressTrack").removeAttribute("aria-valuenow");
}
function updateDatabaseLoadProgress(kind,processed,total){
  const prefix=kind==="payments"?"paymentDatabaseLoad":"customerDatabaseLoad";
  const box=document.getElementById(prefix+"Progress");
  const safeTotal=Math.max(0,Number(total)||0);
  const safeProcessed=Math.max(0,Math.min(safeTotal,Number(processed)||0));
  const percent=safeTotal?Math.round((safeProcessed/safeTotal)*100):100;
  box.classList.remove("is-indeterminate");
  document.getElementById(prefix+"ProgressLabel").textContent=kind==="payments"?"Loading payment records in batches…":"Loading customer records in batches…";
  document.getElementById(prefix+"ProgressCount").textContent=`${safeProcessed.toLocaleString()} of ${safeTotal.toLocaleString()} • ${percent}%`;
  document.getElementById(prefix+"ProgressBar").style.width=percent+"%";
  document.getElementById(prefix+"ProgressTrack").setAttribute("aria-valuenow",String(percent));
}
function hideDatabaseLoadProgress(kind){
  const prefix=kind==="payments"?"paymentDatabaseLoad":"customerDatabaseLoad";
  const box=document.getElementById(prefix+"Progress");
  box.classList.remove("is-indeterminate");
  box.hidden=true;
}
async function renderDatabaseRowsInBatches(rows,render,kind,batchSize=10){
  const source=Array.isArray(rows)?rows:[];
  if(!source.length){render([]);updateDatabaseLoadProgress(kind,0,0);return;}
  for(let end=batchSize;end<source.length+batchSize;end+=batchSize){
    const processed=Math.min(end,source.length);
    render(source.slice(0,processed));
    updateDatabaseLoadProgress(kind,processed,source.length);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
}
function beginAdminActionProgress(prefix,label){
  const box=document.getElementById(prefix+"Progress");
  if(!box)return;
  box.hidden=false;
  box.classList.add("is-indeterminate");
  document.getElementById(prefix+"ProgressLabel").textContent=label;
  document.getElementById(prefix+"ProgressCount").textContent="Requesting records";
  document.getElementById(prefix+"ProgressTrack").removeAttribute("aria-valuenow");
}
function updateAdminActionProgress(prefix,processed,total,label){
  const box=document.getElementById(prefix+"Progress");
  if(!box)return;
  const safeTotal=Math.max(0,Number(total)||0);
  const safeProcessed=Math.max(0,Math.min(safeTotal,Number(processed)||0));
  const percent=safeTotal?Math.round((safeProcessed/safeTotal)*100):100;
  box.classList.remove("is-indeterminate");
  if(label)document.getElementById(prefix+"ProgressLabel").textContent=label;
  document.getElementById(prefix+"ProgressCount").textContent=`${safeProcessed.toLocaleString()} of ${safeTotal.toLocaleString()} • ${percent}%`;
  document.getElementById(prefix+"ProgressBar").style.width=percent+"%";
  document.getElementById(prefix+"ProgressTrack").setAttribute("aria-valuenow",String(percent));
}
function hideAdminActionProgress(prefix){
  const box=document.getElementById(prefix+"Progress");
  if(!box)return;
  box.classList.remove("is-indeterminate");
  box.hidden=true;
}
function customerPreviewFilteredRows(){
  const q=(document.getElementById("customerPreviewSearch")?.value||"").trim().toLowerCase();
  const state=document.getElementById("customerStateFilter")?.value||"all";
  const email=document.getElementById("customerEmailFilter")?.value||"all";
  const balance=document.getElementById("customerBalanceFilter")?.value||"all";
  const sort=document.getElementById("customerPreviewSort")?.value||"account_asc";
  let rows=preparedRows.filter(r=>{
    if(q && ![r.account_number,r.account_name,r.address1,r.address2,r.city,r.state,r.zip_code,r.phone,r.email].join(" ").toLowerCase().includes(q)) return false;
    if(state!=="all" && String(r.state||"").toUpperCase()!==state) return false;
    if(email==="with" && !String(r.email||"").trim()) return false;
    if(email==="without" && String(r.email||"").trim()) return false;
    const b=Number(r.current_balance||0);
    if(balance==="positive" && !(b>0)) return false;
    if(balance==="zero" && Math.abs(b)>=0.005) return false;
    if(balance==="credit" && !(b<0)) return false;
    return true;
  });
  rows=rows.slice().sort((a,b)=>{
    if(sort==="account_desc") return String(b.account_number).localeCompare(String(a.account_number));
    if(sort==="name_asc") return String(a.account_name||"").localeCompare(String(b.account_name||""));
    if(sort==="name_desc") return String(b.account_name||"").localeCompare(String(a.account_name||""));
    if(sort==="balance_desc") return Number(b.current_balance||0)-Number(a.current_balance||0);
    if(sort==="balance_asc") return Number(a.current_balance||0)-Number(b.current_balance||0);
    return String(a.account_number).localeCompare(String(b.account_number));
  });
  return rows;
}
function updateCustomerPreviewFilters(){
  const sel=document.getElementById("customerStateFilter");
  if(!sel) return;
  const states=[...new Set(preparedRows.map(r=>String(r.state||"").trim().toUpperCase()).filter(Boolean))].sort();
  sel.innerHTML='<option value="all">All states</option>'+states.map(s=>`<option value="${s}">${s}</option>`).join("");
}
function render(rows,total,skipped){
  document.getElementById("summary").style.display="grid";
  document.getElementById("tablewrap").style.display="block";
  document.getElementById("customerPreviewTools").style.display="grid";
  document.getElementById("mRows").textContent=total;
  document.getElementById("mValid").textContent=preparedRows.length;
  document.getElementById("mSkipped").textContent=skipped;
  const filtered=customerPreviewFilteredRows();
  document.getElementById("customerPreviewCount").textContent=`${filtered.length.toLocaleString()} matching customer(s) • showing first ${Math.min(filtered.length,200).toLocaleString()}`;
  const body=document.getElementById("previewBody");
  body.innerHTML="";
  filtered.slice(0,200).forEach(r=>{
    const tr=document.createElement("tr");
    [r.account_number,r.account_name,r.address1,r.address2,r.city,r.state,r.zip_code,r.phone,r.email,r.statement_cycle,r.current_balance,r.aging_category_1,r.aging_category_2,r.aging_category_3,r.aging_category_4].forEach(v=>{
      const td=document.createElement("td");td.textContent=v;tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

["customerPreviewSearch","customerStateFilter","customerEmailFilter","customerBalanceFilter","customerPreviewSort"].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener(id==="customerPreviewSearch"?"input":"change",()=>{if(preparedRows.length) render(preparedRows,Number(document.getElementById("mRows").textContent||preparedRows.length),Number(document.getElementById("mSkipped").textContent||0));});
});
async function waitForAccessReader(){
  if(window.wootenReadAccessFile) return;
  if(window.wootenMdbReaderError) throw new Error("The Access database reader could not be loaded.");
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("The Access reader is taking too long to load. Check the internet connection and try again.")),15000);
    window.addEventListener("wooten-mdb-reader-ready",()=>{clearTimeout(timer);resolve();},{once:true});
  });
}
async function parseFile(file,mode="customers"){
  const ext=file.name.toLowerCase().split(".").pop();

  if(ext==="mdb"||ext==="accdb"){
    await waitForAccessReader();
    const result=await window.wootenReadAccessFile(file,mode);
    return result;
  }

  if(ext==="csv"){
    const text=await file.text();
    const wb=XLSX.read(text,{type:"string"});
    const ws=wb.Sheets[wb.SheetNames[0]];
    return {rows:XLSX.utils.sheet_to_json(ws,{defval:"",raw:false}),tableName:ws?.name||"CSV"};
  }

  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:"array",cellText:true,cellDates:false});
  const ws=wb.Sheets[wb.SheetNames[0]];
  return {rows:XLSX.utils.sheet_to_json(ws,{defval:"",raw:false}),tableName:wb.SheetNames[0]||"Excel"};
}

function isMicrosoftAccessMdb(file){return !!file&&/\.mdb$/i.test(String(file.name||""));}
document.getElementById("customerFile").addEventListener("change",event=>{
  const file=event.target.files?.[0];
  if(file&&!isMicrosoftAccessMdb(file)){event.target.value="";setStatus("Only a Microsoft Access *.mdb file can be selected.",false);}
});
document.getElementById("paymentFile").addEventListener("change",event=>{
  const file=event.target.files?.[0];
  if(file&&!isMicrosoftAccessMdb(file)){event.target.value="";setPaymentStatus("Only a Microsoft Access *.mdb file can be selected.",false);}
});

document.getElementById("previewBtn").addEventListener("click",async()=>{
  const file=document.getElementById("customerFile").files[0];
  if(!file){setStatus("Choose a Microsoft Access *.mdb file first.",false);return;}
  if(!isMicrosoftAccessMdb(file)){setStatus("Only a Microsoft Access *.mdb file can be imported.",false);return;}
  const previewBtn=document.getElementById("previewBtn");
  previewBtn.disabled=true;
  previewBtn.textContent="Loading Customers…";
  document.getElementById("customerImportProgress").hidden=true;
  document.getElementById("mImported").textContent="0";
  updatePreviewProgress("customers",{phase:"reading"});
  await new Promise(resolve=>requestAnimationFrame(resolve));
  try{
    const parsed=await parseFile(file,"customers");
    const raw=parsed.rows;
    if(file.name.toLowerCase().endsWith(".mdb")||file.name.toLowerCase().endsWith(".accdb")){
      setStatus(`Access database opened: ${parsed.tableName} • ${raw.length.toLocaleString()} row(s) found.`);
    }
    const mapped=await mapPreviewRowsInBatches(raw,mapRow,"customers",500);
    preparedRows=mapped.filter(r=>r.account_number && r.account_name);
    updateCustomerPreviewFilters();
    render(preparedRows,raw.length,raw.length-preparedRows.length);
    document.getElementById("importBtn").disabled=preparedRows.length===0;
    setStatus(`Preview ready: ${preparedRows.length} valid customer records.`);
  }catch(e){
    console.error(e); setStatus("Could not read this file. Export it from Access as Excel or CSV and try again.",false);
  }finally{
    hidePreviewProgress("customers");
    previewBtn.disabled=false;
    previewBtn.textContent="Preview Customers";
  }
});

document.getElementById("importBtn").addEventListener("click",async()=>{
  const key=document.getElementById("adminKey").value.trim();
  if(!key){setStatus("Enter your Admin Import Key in the Admin Login window first.",false);return;}
  if(!preparedRows.length){setStatus("Preview a customer file first.",false);return;}
  const btn=document.getElementById("importBtn");
  const chunkSize=500;
  const total=preparedRows.length;
  const batches=Math.ceil(total/chunkSize);
  let processed=0;
  let imported=0;
  let reactivationRequired=0;
  let currentBatch=0;
  let latestCustomerImportAt="";
  btn.disabled=true; btn.textContent="Importing batch 1 of "+batches;
  updateImportProgress("customers",{processed:0,total,imported:0,batch:1,batches,label:"Importing customers"});
  try{
    for(let i=0;i<total;i+=chunkSize){
      currentBatch=Math.floor(i/chunkSize)+1;
      btn.textContent=`Importing batch ${currentBatch} of ${batches}`;
      const chunk=preparedRows.slice(i,i+chunkSize);
      const res=await fetch("/api/admin/customers-import",{
        method:"POST",
        headers:{"Content-Type":"application/json","X-Admin-Key":key},
        body:JSON.stringify({customers:chunk})
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok || data.success===false) throw new Error(data.error||`Customer import failed during batch ${currentBatch}.`);
      processed+=chunk.length;
      imported+=Number(data.processed||chunk.length);
      reactivationRequired+=Number(data.email_changes_requiring_reactivation||0);
      if(data.imported_at)latestCustomerImportAt=data.imported_at;
      document.getElementById("mImported").textContent=imported;
      updateImportProgress("customers",{processed,total,imported,batch:currentBatch,batches,label:"Importing customers"});
      setStatus(`Importing customers: ${imported.toLocaleString()} imported • batch ${currentBatch} of ${batches}${reactivationRequired?` • ${reactivationRequired.toLocaleString()} email change${reactivationRequired===1?"":"s"} require reactivation`:""}.`);
    }
    if(latestCustomerImportAt)setImportLastUpdate("customers",latestCustomerImportAt,window.wootenAdminUser?.display_name||"Wooten Oil Admin");
    updateImportProgress("customers",{processed:total,total,imported,batch:batches,batches,state:"complete",label:"Customer import complete"});
    setStatus(`Success: ${imported.toLocaleString()} customer records were added or updated in ${batches} batch${batches===1?"":"es"}.${reactivationRequired?` ${reactivationRequired.toLocaleString()} account${reactivationRequired===1?"":"s"} had an email change and must reactivate online access.`:""}`);
  }catch(e){
    console.error(e);
    updateImportProgress("customers",{processed,total,imported,batch:currentBatch||1,batches,state:"failed",label:"Customer import stopped"});
    setStatus((e.message||"Import failed.")+` ${imported.toLocaleString()} customer(s) completed before the error.`,false);
  }finally{
    btn.disabled=false; btn.textContent="Upload / Update Customers";
  }
});


/* CUSTOMER PAYMENTS IMPORT */
let preparedPaymentRows=[];

const paymentAliases={
  deposit_date:["DepositDate"],
  deposit_no:["DepositNo","DepositNumber"],
  deposit_type:["DepositType"],
  account_number:["CustomerNo","AccountNumber","AccountNo","AcctNumber","AcctNo"],
  check_no:["CheckNo","CheckNumber"],
  posting_date:["PostingDate","PaymentDate","DatePaid","PaidDate","TransactionDate","PostDate"],
  customer_name:["CustomerName","AccountName","Name"],
  invoice_no:["InvoiceNo","InvoiceNumber"],
  amount:["CashAmountApplied","PaymentAmount","Amount","PaidAmount","Payment"],
  discount_amount:["DiscountAmountApplied","DiscountAmount","Discount"],
  payment_type:["PaymentType","PaymentMethod","Method"],
  description:["DepositDesc","Description","Memo","Comment","Comments","Notes"]
};
function paymentPick(row,names){
  const map={};Object.keys(row||{}).forEach(k=>map[keyify(k)]=row[k]);
  for(const n of names){const v=map[keyify(n)];if(v!==undefined&&v!==null&&String(v).trim()!=="") return v;} return "";
}
function normalizePaymentDate(v){
  if(v===undefined||v===null||v==="") return "";
  if(v instanceof Date && !Number.isNaN(v.getTime())){
    return [v.getFullYear(),String(v.getMonth()+1).padStart(2,"0"),String(v.getDate()).padStart(2,"0")].join("-");
  }
  const numeric=Number(v);
  if(Number.isFinite(numeric)&&numeric>20000&&numeric<100000){
    const d=new Date(Date.UTC(1899,11,30)+Math.round(numeric)*86400000);
    return [d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,"0"),String(d.getUTCDate()).padStart(2,"0")].join("-");
  }
  const s=clean(v);if(!s) return "";
  let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);if(m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);if(m){let y=m[3];if(y.length===2)y=(Number(y)>=70?"19":"20")+y;return `${y}-${String(m[1]).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}`;}
  const d=new Date(s);return Number.isNaN(d.getTime())?"":[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}
function mapPaymentRow(row){
  const depositDate=normalizePaymentDate(paymentPick(row,paymentAliases.deposit_date));
  const postingDate=normalizePaymentDate(paymentPick(row,paymentAliases.posting_date));
  const depositNo=clean(paymentPick(row,paymentAliases.deposit_no));
  const checkNo=clean(paymentPick(row,paymentAliases.check_no));
  const amount=normalizeMoney(paymentPick(row,paymentAliases.amount));
  return {
    deposit_date:depositDate,deposit_no:depositNo,deposit_type:clean(paymentPick(row,paymentAliases.deposit_type)),
    account_number:normalizeAccount(paymentPick(row,paymentAliases.account_number)),check_no:checkNo,posting_date:postingDate,
    customer_name:clean(paymentPick(row,paymentAliases.customer_name)),invoice_no:clean(paymentPick(row,paymentAliases.invoice_no)),
    cash_amount_applied:amount,discount_amount_applied:normalizeMoney(paymentPick(row,paymentAliases.discount_amount)),
    payment_date:postingDate||depositDate,amount:amount,reference:checkNo||(depositNo?`Deposit ${depositNo}`:""),
    payment_type:clean(paymentPick(row,paymentAliases.payment_type)),description:clean(paymentPick(row,paymentAliases.description))
  };
}
function paymentRowIsValid(row){
  return !!row.account_number &&
         !!row.payment_date &&
         Number.isFinite(Number(row.amount)) &&
         Number(row.amount)!==0;
}

function setPaymentStatus(msg,good=true){
  const el=document.getElementById("paymentImportStatus");
  el.className="status show "+(good?"ok":"bad");
  el.textContent=msg;
}

function paymentMoney(v){
  const n=Number(v||0);
  return n.toLocaleString("en-US",{style:"currency",currency:"USD"});
}

function paymentDisplayDate(value){
  if(!value) return "";
  const s=String(value).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return `${m[2]}-${m[3]}-${m[1]}`;
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m) return `${String(m[1]).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}-${m[3]}`;
  const d=new Date(s);
  if(Number.isNaN(d.getTime())) return s;
  return `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}-${d.getFullYear()}`;
}

function paymentPreviewFilteredRows(){
  const q=(document.getElementById("paymentPreviewSearch")?.value||"").trim().toLowerCase();
  const depType=document.getElementById("paymentDepositTypeFilter")?.value||"all";
  const amountFilter=document.getElementById("paymentAmountFilter")?.value||"all";
  const sort=document.getElementById("paymentPreviewSort")?.value||"posting_desc";
  let rows=preparedPaymentRows.filter(r=>{
    if(q && ![r.deposit_date,r.deposit_no,r.deposit_type,r.account_number,r.check_no,r.posting_date,r.customer_name,r.invoice_no,r.cash_amount_applied,r.discount_amount_applied].join(" ").toLowerCase().includes(q)) return false;
    if(depType!=="all" && String(r.deposit_type||"")!==depType) return false;
    const amt=Number(r.cash_amount_applied||0);
    if(amountFilter==="positive" && !(amt>0)) return false;
    if(amountFilter==="zero" && Math.abs(amt)>=0.005) return false;
    if(amountFilter==="negative" && !(amt<0)) return false;
    return true;
  });
  rows=rows.slice().sort((a,b)=>{
    if(sort==="posting_asc") return String(a.posting_date||a.deposit_date).localeCompare(String(b.posting_date||b.deposit_date));
    if(sort==="customer_asc") return String(a.account_number).localeCompare(String(b.account_number));
    if(sort==="customer_desc") return String(b.account_number).localeCompare(String(a.account_number));
    if(sort==="amount_desc") return Number(b.cash_amount_applied||0)-Number(a.cash_amount_applied||0);
    if(sort==="amount_asc") return Number(a.cash_amount_applied||0)-Number(b.cash_amount_applied||0);
    return String(b.posting_date||b.deposit_date).localeCompare(String(a.posting_date||a.deposit_date));
  });
  return rows;
}
function updatePaymentPreviewFilters(){
  const sel=document.getElementById("paymentDepositTypeFilter");if(!sel)return;
  const types=[...new Set(preparedPaymentRows.map(r=>String(r.deposit_type||"").trim()).filter(Boolean))].sort();
  sel.innerHTML='<option value="all">All types</option>'+types.map(v=>`<option value="${v}">${v}</option>`).join("");
}
function renderPaymentPreview(rows,total,skipped){
  document.getElementById("paymentImportSummary").style.display="grid";
  document.getElementById("paymentPreviewWrap").style.display="block";
  document.getElementById("paymentPreviewTools").style.display="grid";
  document.getElementById("pmRows").textContent=total;
  document.getElementById("pmValid").textContent=preparedPaymentRows.length;
  document.getElementById("pmSkipped").textContent=skipped;
  const filtered=paymentPreviewFilteredRows();
  document.getElementById("paymentPreviewCount").textContent=`${filtered.length.toLocaleString()} matching payment row(s) • showing first ${Math.min(filtered.length,200).toLocaleString()}`;
  const body=document.getElementById("paymentPreviewBody");body.innerHTML="";
  filtered.slice(0,200).forEach(r=>{
    const tr=document.createElement("tr");
    [paymentDisplayDate(r.deposit_date),r.deposit_no,r.deposit_type,r.account_number,r.check_no,paymentDisplayDate(r.posting_date),r.customer_name,r.invoice_no,paymentMoney(r.cash_amount_applied),paymentMoney(r.discount_amount_applied)].forEach(v=>{
      const td=document.createElement("td");td.textContent=v??"";tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

["paymentPreviewSearch","paymentDepositTypeFilter","paymentAmountFilter","paymentPreviewSort"].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener(id==="paymentPreviewSearch"?"input":"change",()=>{if(preparedPaymentRows.length) renderPaymentPreview(preparedPaymentRows,Number(document.getElementById("pmRows").textContent||preparedPaymentRows.length),Number(document.getElementById("pmSkipped").textContent||0));});
});
document.getElementById("paymentPreviewBtn").addEventListener("click",async()=>{
  const file=document.getElementById("paymentFile").files[0];
  if(!file){
    setPaymentStatus("Choose a Microsoft Access *.mdb customer payments file first.",false);
    return;
  }
  if(!isMicrosoftAccessMdb(file)){
    setPaymentStatus("Only a Microsoft Access *.mdb customer payments file can be imported.",false);
    return;
  }
  const previewBtn=document.getElementById("paymentPreviewBtn");
  previewBtn.disabled=true;
  previewBtn.textContent="Loading Payments…";
  document.getElementById("paymentImportProgress").hidden=true;
  document.getElementById("pmImported").textContent="0";
  updatePreviewProgress("payments",{phase:"reading"});
  await new Promise(resolve=>requestAnimationFrame(resolve));

  try{
    const parsed=await parseFile(file,"payments");
    const raw=parsed.rows;
    if(file.name.toLowerCase().endsWith(".mdb")||file.name.toLowerCase().endsWith(".accdb")){
      setPaymentStatus(`Access database opened: ${parsed.tableName} • ${raw.length.toLocaleString()} row(s) found.`);
    }
    const mapped=await mapPreviewRowsInBatches(raw,mapPaymentRow,"payments",500);
    preparedPaymentRows=mapped.filter(paymentRowIsValid);
    updatePaymentPreviewFilters();

    renderPaymentPreview(
      preparedPaymentRows,
      raw.length,
      raw.length-preparedPaymentRows.length
    );
    document.getElementById("paymentImportBtn").disabled=preparedPaymentRows.length===0;

    if(preparedPaymentRows.length){
      setPaymentStatus(`Preview ready: ${preparedPaymentRows.length} individual payment row(s) found.`);
    }else{
      setPaymentStatus(
        "No valid payments were found. This importer expects CustomerNo, PostingDate or DepositDate, and CashAmountApplied.",
        false
      );
    }
  }catch(e){
    console.error(e);
    setPaymentStatus("Could not read the payments file. Please use MDB, ACCDB, Excel, or CSV format.",false);
  }finally{
    hidePreviewProgress("payments");
    previewBtn.disabled=false;
    previewBtn.textContent="Preview Payments";
  }
});

document.getElementById("paymentImportBtn").addEventListener("click",async()=>{
  const key=document.getElementById("adminKey").value.trim();
  if(!key){
    window.ensureAdminLoginKey?.("Enter your Admin Import Key to import customer payments.");
    setPaymentStatus("Enter your Admin Import Key in the Admin Login window first.",false);
    return;
  }
  if(!preparedPaymentRows.length){
    setPaymentStatus("Preview a customer payments file first.",false);
    return;
  }

  const btn=document.getElementById("paymentImportBtn");
  const chunkSize=1000;
  const total=preparedPaymentRows.length;
  const batches=Math.ceil(total/chunkSize);
  let processed=0;
  let imported=0;
  let duplicates=0;
  let skipped=0;
  let currentBatch=0;
  let latestPaymentImportAt="";
  btn.disabled=true;
  btn.textContent="Importing batch 1 of "+batches;
  updateImportProgress("payments",{processed:0,total,imported:0,batch:1,batches,label:"Importing customer payments"});

  try{
    // Keep each request comfortably below payload and D1 batch limits.
    for(let i=0;i<preparedPaymentRows.length;i+=chunkSize){
      currentBatch=Math.floor(i/chunkSize)+1;
      btn.textContent=`Importing batch ${currentBatch} of ${batches}`;
      const chunk=preparedPaymentRows.slice(i,i+chunkSize);
      const res=await fetch("/api/admin/customer-payments-import",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "X-Admin-Key":key
        },
        body:JSON.stringify({payments:chunk})
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok || data.success===false){
        throw new Error(data.error||"Payment import failed.");
      }
      imported+=Number(data.inserted||0);
      duplicates+=Number(data.duplicates||0);
      skipped+=Number(data.skipped||0);
      processed+=chunk.length;
      if(data.imported_at) latestPaymentImportAt=data.imported_at;
      document.getElementById("pmImported").textContent=imported;
      updateImportProgress("payments",{processed,total,imported,batch:currentBatch,batches,label:"Importing customer payments"});
      setPaymentStatus(`Importing payments: ${imported.toLocaleString()} added • ${processed.toLocaleString()} of ${total.toLocaleString()} processed • batch ${currentBatch} of ${batches}.`);
    }

    document.getElementById("pmImported").textContent=imported;
    if(latestPaymentImportAt) setImportLastUpdate("payments",latestPaymentImportAt,window.wootenAdminUser?.display_name||"Wooten Oil Admin");
    updateImportProgress("payments",{processed:total,total,imported,batch:batches,batches,state:"complete",label:"Payment import complete"});
    setPaymentStatus(
      `Payment import complete: ${imported} new payment(s) added`+
      (duplicates?`, ${duplicates} duplicate(s) skipped`:"")+
      (skipped?`, ${skipped} invalid row(s) skipped`:"")+"."
    );
  }catch(e){
    console.error(e);
    updateImportProgress("payments",{processed,total,imported,batch:currentBatch||1,batches,state:"failed",label:"Payment import stopped"});
    if(String(e.message||"").toLowerCase().includes("unauthorized")){
      setPaymentStatus("The Admin Import Key is not valid.",false);
    }else{
      setPaymentStatus((e.message||"Payment import failed.")+` ${imported.toLocaleString()} payment(s) were added before the error.`,false);
    }
  }finally{
    btn.disabled=false;
    btn.textContent="Import Payments";
  }
});



/* LIVE CUSTOMER PAYMENTS DATABASE */
(function(){
  const loadBtn=document.getElementById("livePaymentLoadBtn");
  if(!loadBtn) return;

  const refreshBtn=document.getElementById("livePaymentRefreshBtn");
  const clearBtn=document.getElementById("livePaymentClearBtn");
  const search=document.getElementById("livePaymentSearch");
  const depositType=document.getElementById("livePaymentDepositType");
  const fromDate=document.getElementById("livePaymentFromDate");
  const toDate=document.getElementById("livePaymentToDate");
  const amountFilter=document.getElementById("livePaymentAmountFilter");
  const sort=document.getElementById("livePaymentSort");
  const status=document.getElementById("livePaymentStatus");
  const meta=document.getElementById("livePaymentMeta");
  const totalEl=document.getElementById("livePaymentTotal");
  const rangeEl=document.getElementById("livePaymentRange");
  const tableWrap=document.getElementById("livePaymentTableWrap");
  const tbody=document.getElementById("livePaymentBody");
  const pagination=document.getElementById("livePaymentPagination");
  const prevBtn=document.getElementById("livePaymentPrevBtn");
  const nextBtn=document.getElementById("livePaymentNextBtn");
  const pageInfo=document.getElementById("livePaymentPageInfo");

  let page=1;
  const pageSize=50;
  let loaded=false;
  let requestSerial=0;
  let debounceTimer=null;

  function esc(v){
    return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function money(v){
    const n=Number(v||0);
    return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number.isFinite(n)?n:0);
  }
  function dateDisplay(v){
    if(!v) return "—";
    const s=String(v).trim();
    let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return `${m[2]}-${m[3]}-${m[1]}`;
    m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if(m) return `${String(m[1]).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}-${m[3]}`;
    return s;
  }
  function setStatus(message,good=false){
    if(!message){status.className="status";status.textContent="";return;}
    status.className="status show "+(good?"ok":"bad");
    status.textContent=message;
  }
  function buildUrl(){
    const params=new URLSearchParams({
      page:String(page),
      page_size:String(pageSize),
      search:search.value.trim(),
      deposit_type:depositType.value,
      date_from:fromDate.value,
      date_to:toDate.value,
      amount:amountFilter.value,
      sort:sort.value
    });
    return "/api/admin/customer-payments-database?"+params.toString();
  }
  function renderRows(rows){
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="10"><div class="db-empty">No payment records match the current search and filters.</div></td></tr>';
      return;
    }
    tbody.innerHTML=rows.map(row=>`<tr>
      <td>${esc(dateDisplay(row.deposit_date))}</td>
      <td>${esc(row.deposit_no||"—")}</td>
      <td>${esc(row.deposit_type||"—")}</td>
      <td class="live-payment-customer">${esc(row.account_number||"")}</td>
      <td>${esc(row.reference||"—")}</td>
      <td>${esc(dateDisplay(row.posting_date||row.payment_date))}</td>
      <td>${esc(row.customer_name||"—")}</td>
      <td>${esc(row.invoice_no||"—")}</td>
      <td class="money">${money(row.amount)}</td>
      <td class="money">${money(row.discount_amount)}</td>
    </tr>`).join("");
  }
  function populateDepositTypes(types){
    const current=depositType.value;
    const list=Array.isArray(types)?types:[];
    depositType.innerHTML='<option value="all">All types</option>'+list.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if(list.includes(current)) depositType.value=current;
  }
  async function loadPayments(){
    const key=document.getElementById("adminKey").value.trim();
    if(!key){
      window.ensureAdminLoginKey?.("Enter your Admin Import Key to load the live payment database.");
      setStatus("Enter the Admin Import Key in the Admin Login window first.");
      return;
    }

    const serial=++requestSerial;
    loadBtn.disabled=true;
    loadBtn.textContent="Loading Payments…";
    refreshBtn.disabled=true;
    beginDatabaseLoadProgress("payments");
    await new Promise(resolve=>requestAnimationFrame(resolve));
    setStatus("Loading customer payments…",true);

    try{
      const response=await fetch(buildUrl(),{
        headers:{"X-Admin-Key":key,"Accept":"application/json"},
        cache:"no-store"
      });
      const data=await response.json().catch(()=>({}));
      if(serial!==requestSerial) return;
      if(!response.ok||data.success===false) throw new Error(data.error||"Customer payments could not be loaded.");

      loaded=true;
      await renderDatabaseRowsInBatches(Array.isArray(data.payments)?data.payments:[],renderRows,"payments",10);
      populateDepositTypes(data.deposit_types||[]);

      const total=Number(data.total||0);
      totalEl.textContent=total.toLocaleString();
      const start=total?((Number(data.page||1)-1)*Number(data.page_size||pageSize))+1:0;
      const end=total?Math.min(start+Number(data.page_size||pageSize)-1,total):0;
      rangeEl.textContent=`Showing ${start.toLocaleString()}–${end.toLocaleString()}`;

      page=Number(data.page||1);
      const pages=Math.max(1,Number(data.pages||1));
      pageInfo.textContent=`Page ${page.toLocaleString()} of ${pages.toLocaleString()}`;
      prevBtn.disabled=page<=1;
      nextBtn.disabled=page>=pages;

      meta.style.display="flex";
      tableWrap.style.display="block";
      pagination.style.display=pages>1?"flex":"none";
      refreshBtn.disabled=false;
      setStatus(`Live payment database loaded • ${total.toLocaleString()} matching row(s).`,true);
    }catch(error){
      console.error(error);
      setStatus(error.message||"Customer payments could not be loaded.");
    }finally{
      hideDatabaseLoadProgress("payments");
      loadBtn.disabled=false;
      loadBtn.textContent="Load Payments";
      if(loaded) refreshBtn.disabled=false;
    }
  }
  function resetAndLoad(){
    if(!loaded) return;
    page=1;
    loadPayments();
  }
  function debounceLoad(){
    if(!loaded) return;
    clearTimeout(debounceTimer);
    debounceTimer=setTimeout(()=>{page=1;loadPayments();},350);
  }

  loadBtn.addEventListener("click",()=>{page=1;loadPayments();});
  refreshBtn.addEventListener("click",()=>loadPayments());
  search.addEventListener("input",debounceLoad);
  [depositType,fromDate,toDate,amountFilter,sort].forEach(el=>el.addEventListener("change",resetAndLoad));

  clearBtn.addEventListener("click",()=>{
    search.value="";
    depositType.value="all";
    fromDate.value="";
    toDate.value="";
    amountFilter.value="all";
    sort.value="posting_desc";
    page=1;
    if(loaded) loadPayments();
  });

  prevBtn.addEventListener("click",()=>{if(page>1){page--;loadPayments();}});
  nextBtn.addEventListener("click",()=>{page++;loadPayments();});
})();



/* CLEAR SERVER DATABASES */
function initDatabaseClearControls(){

  const modal=document.getElementById("databaseClearModal");
  const title=document.getElementById("databaseClearTitle");
  const message=document.getElementById("databaseClearMessage");
  const warning=document.getElementById("databaseClearWarning");
  const passwordChoice=document.getElementById("databaseClearPasswordChoice");
  const keyInput=document.getElementById("databaseClearAdminKey");
  const status=document.getElementById("databaseClearStatus");
  const cancelBtn=document.getElementById("databaseClearCancelBtn");
  const confirmBtn=document.getElementById("databaseClearConfirmBtn");
  const clearCustomersBtn=document.getElementById("clearCustomerDatabaseBtn");
  const clearPaymentsBtn=document.getElementById("clearPaymentDatabaseBtn");

  if(!modal||!confirmBtn||!clearCustomersBtn||!clearPaymentsBtn) return;

  let target="";

  function setClearStatus(text,good=false){
    if(!text){status.className="status";status.textContent="";return;}
    status.className="status show "+(good?"ok":"bad");
    status.textContent=text;
  }

  function openClearModal(kind){
    target=kind;
    keyInput.value="";
    setClearStatus("");

    if(kind==="customers"){
      title.textContent="Clear Customer Database";
      message.textContent="Choose whether to preserve or remove existing customer login passwords, then enter the Admin Import Key.";
      warning.innerHTML="<strong>This cannot be undone.</strong> The MAS 90 customer data will be cleared from the server.";
      if(passwordChoice) passwordChoice.style.display="block";
      const keepRadio=passwordChoice?.querySelector('input[value="keep"]');
      if(keepRadio) keepRadio.checked=true;
      confirmBtn.textContent="OK — Clear Customer Database";
    }else{
      title.textContent="Clear Customer Payments Database";
      message.textContent="This will permanently delete every customer payment record stored on the server.";
      warning.innerHTML="<strong>This cannot be undone.</strong> Make sure the original Customer Payments MDB/Access file is available so the payment history can be imported again.";
      if(passwordChoice) passwordChoice.style.display="none";
      confirmBtn.textContent="OK — Clear Payment Database";
    }

    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    setTimeout(()=>keyInput.focus(),50);
  }

  function closeClearModal(){
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    keyInput.value="";
    target="";
    if(passwordChoice) passwordChoice.style.display="none";
    setClearStatus("");
  }

  clearCustomersBtn?.addEventListener("click",()=>openClearModal("customers"));
  clearPaymentsBtn?.addEventListener("click",()=>openClearModal("payments"));
  cancelBtn.addEventListener("click",closeClearModal);
  modal.querySelectorAll("[data-clear-close]").forEach(el=>el.addEventListener("click",closeClearModal));
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&modal.classList.contains("open")) closeClearModal();
  });

  confirmBtn.addEventListener("click",async()=>{
    const key=keyInput.value.trim();
    if(!key){
      setClearStatus("Enter the Admin Import Key before continuing.");
      keyInput.focus();
      return;
    }
    if(!target) return;

    const label=target==="customers"?"Customer Database":"Customer Payments Database";
    const passwordAction=target==="customers"
      ? (document.querySelector('input[name="customerPasswordAction"]:checked')?.value||"keep")
      : "";
    const passwordText=target==="customers"
      ? (passwordAction==="keep"
          ? "\n\nCustomer login passwords will be KEPT."
          : "\n\nCustomer login passwords will also be CLEARED.")
      : "";
    const ok=window.confirm(
      `FINAL CONFIRMATION\n\nAre you sure you want to permanently clear the ${label} from the server?${passwordText}\n\nClick OK to continue or Cancel to stop.`
    );
    if(!ok) return;

    confirmBtn.disabled=true;
    cancelBtn.disabled=true;
    setClearStatus("Verifying Admin Import Key and clearing the database…",true);

    try{
      const res=await fetch("/api/admin/clear-database",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "X-Admin-Key":key,
          "Accept":"application/json"
        },
        body:JSON.stringify({database:target,password_action:passwordAction})
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.success===false) throw new Error(data.error||"Database could not be cleared.");

      const extra=target==="customers"
        ? (data.passwords_preserved ? " Customer login passwords were preserved." : " Customer login passwords were cleared.")
        : "";
      setClearStatus(`${label} cleared successfully. ${Number(data.deleted||0).toLocaleString()} record(s) removed.${extra}`,true);

      if(target==="customers"){
        const body=document.getElementById("dbTableBody");
        if(body) body.innerHTML="";
        ["dbMeta","dbTableWrap","dbPagination"].forEach(id=>{
          const el=document.getElementById(id);if(el) el.style.display="none";
        });
        if(typeof setImportLastUpdate==="function") setImportLastUpdate("customers","");
      }else{
        const body=document.getElementById("livePaymentBody");
        if(body) body.innerHTML="";
        ["livePaymentMeta","livePaymentTableWrap","livePaymentPagination"].forEach(id=>{
          const el=document.getElementById(id);if(el) el.style.display="none";
        });
        if(typeof setImportLastUpdate==="function") setImportLastUpdate("payments","");
      }

      setTimeout(closeClearModal,1800);
    }catch(error){
      console.error(error);
      setClearStatus(error.message||"Database could not be cleared.");
    }finally{
      confirmBtn.disabled=false;
      cancelBtn.disabled=false;
    }
  });

}
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",initDatabaseClearControls,{once:true});
}else{
  initDatabaseClearControls();
}


let inboxMessages=[];
let inboxPage=1;
const inboxPageSize=20;

function renderInboxMessages(){
  const body=document.getElementById("inboxBody");
  const wrap=document.getElementById("inboxTableWrap");
  const mobileCards=document.getElementById("mobileInboxCards");
  const search=(document.getElementById("inboxSearch")?.value||"").trim().toLowerCase();
  const typeFilter=document.getElementById("inboxTypeFilter")?.value||"";
  const count=document.getElementById("inboxFilterCount");
  const pagination=document.getElementById("inboxPagination");
  const prevBtn=document.getElementById("inboxPrevBtn");
  const nextBtn=document.getElementById("inboxNextBtn");
  const pageInfo=document.getElementById("inboxPageInfo");

  const sortBy=document.getElementById("inboxSort")?.value||"newest";

  const filtered=inboxMessages.filter(message=>{
    if(typeFilter && message.type!==typeFilter) return false;
    if(!search) return true;

    const haystack=[
      message.customer_name,
      message.account_number,
      message.customer_email,
      message.type,
      message.subject,
      message.from,
      message.snippet
    ].map(v=>String(v||"").toLowerCase()).join(" ");

    return haystack.includes(search);
  });

  const dateValue=(m)=>{
    const d=new Date(m?.date||"");
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  };
  const textValue=(v)=>String(v||"").trim().toLowerCase();
  const accountValue=(v)=>{
    const n=parseInt(String(v||"").replace(/\D/g,""),10);
    return Number.isFinite(n)?n:0;
  };

  filtered.sort((a,b)=>{
    switch(sortBy){
      case "oldest":
        return dateValue(a)-dateValue(b);
      case "name-az":
        return textValue(a.customer_name).localeCompare(textValue(b.customer_name));
      case "name-za":
        return textValue(b.customer_name).localeCompare(textValue(a.customer_name));
      case "account-asc":
        return accountValue(a.account_number)-accountValue(b.account_number);
      case "account-desc":
        return accountValue(b.account_number)-accountValue(a.account_number);
      case "type":
        return textValue(a.type).localeCompare(textValue(b.type)) || dateValue(b)-dateValue(a);
      case "subject":
        return textValue(a.subject).localeCompare(textValue(b.subject));
      case "newest":
      default:
        return dateValue(b)-dateValue(a);
    }
  });

  const pageCount=Math.max(1,Math.ceil(filtered.length/inboxPageSize));
  inboxPage=Math.min(inboxPage,pageCount);
  const pageStart=(inboxPage-1)*inboxPageSize;
  const pageMessages=filtered.slice(pageStart,pageStart+inboxPageSize);

  body.innerHTML="";
  mobileCards.innerHTML="";

  pageMessages.forEach(message=>{
    const raw=message.date||"";
    const d=new Date(raw);
    const receivedText=raw&&!Number.isNaN(d.getTime())?d.toLocaleString():raw;

    /* Desktop table row */
    const row=document.createElement("tr");

    [
      message.customer_name||"—",
      message.account_number||"—",
      message.type||"Message",
      receivedText,
      message.subject||"(No subject)",
      message.from||"",
      message.customer_email||"—",
      message.snippet||""
    ].forEach(value=>{
      const td=document.createElement("td");
      td.textContent=value;
      row.appendChild(td);
    });

    body.appendChild(row);

    /* Mobile card */
    const card=document.createElement("article");
    card.className="mobile-inbox-card";

    const name=document.createElement("h3");
    name.className="mobile-inbox-card-name";
    name.textContent=message.customer_name||"Unknown Customer";
    card.appendChild(name);

    const meta=document.createElement("div");
    meta.className="mobile-inbox-card-meta";
    meta.textContent=`Account # ${message.account_number||"—"} • ${receivedText||"No date"}`;
    card.appendChild(meta);

    const type=document.createElement("span");
    type.className="mobile-inbox-card-type";
    type.textContent=message.type||"Message";
    card.appendChild(type);

    const subject=document.createElement("div");
    subject.className="mobile-inbox-card-subject";
    subject.textContent=message.subject||"(No subject)";
    card.appendChild(subject);

    function addRow(label,value){
      const r=document.createElement("div");
      r.className="mobile-inbox-row";

      const l=document.createElement("div");
      l.className="mobile-inbox-label";
      l.textContent=label;

      const v=document.createElement("div");
      v.className="mobile-inbox-value";
      v.textContent=value||"—";

      r.append(l,v);
      card.appendChild(r);
    }

    addRow("From",message.from||"");
    addRow("Email",message.customer_email||"");

    const messageBox=document.createElement("div");
    messageBox.className="mobile-inbox-message";

    const messageLabel=document.createElement("span");
    messageLabel.className="mobile-inbox-label";
    messageLabel.textContent="Message";

    const messageValue=document.createElement("div");
    messageValue.className="mobile-inbox-value";
    messageValue.textContent=message.snippet||"";

    messageBox.append(messageLabel,messageValue);
    card.appendChild(messageBox);

    mobileCards.appendChild(card);
  });

  if(count){
    const first=filtered.length?pageStart+1:0;
    const last=Math.min(pageStart+inboxPageSize,filtered.length);
    count.textContent=`Showing ${first}–${last} of ${filtered.length} matching message${filtered.length===1?"":"s"}`;
  }

  if(pagination) pagination.hidden=filtered.length<=inboxPageSize;
  if(prevBtn) prevBtn.disabled=inboxPage<=1;
  if(nextBtn) nextBtn.disabled=inboxPage>=pageCount;
  if(pageInfo) pageInfo.textContent=`Page ${inboxPage} of ${pageCount}`;

  /* Desktop only; CSS forces it hidden on phones. */
  wrap.style.display=filtered.length?"block":"none";
  mobileCards.style.display=filtered.length?"grid":"none";
}

async function loadGmailInbox(){
  const key=document.getElementById("adminKey").value.trim();
  const loadBtn=document.getElementById("loadInboxBtn");
  const refreshBtn=document.getElementById("refreshInboxBtn");
  const status=document.getElementById("inboxStatus");

  if(!key){
    status.className="status show bad";
    status.textContent="Enter your Admin Import Key in the Admin Login window first.";
    window.scrollTo({top:0,behavior:"smooth"});
    return;
  }

  loadBtn.disabled=true;
  loadBtn.textContent="Loading Outbox…";
  refreshBtn.disabled=true;
  beginAdminActionProgress("inboxLoad","Loading customer message outbox…");
  await new Promise(resolve=>requestAnimationFrame(resolve));
  status.className="status show";
  status.textContent="Loading customer messages…";

  try{
    const res=await fetch("/api/admin/gmail-inbox",{
      method:"GET",
      headers:{"X-Admin-Key":key},
      cache:"no-store"
    });

    const data=await res.json().catch(()=>({}));

    if(!res.ok||data.success===false){
      throw new Error(data.error||"Unable to load customer messages.");
    }

    const loadedMessages=Array.isArray(data.messages)?data.messages:[];
    inboxMessages=[];
    inboxPage=1;
    if(!loadedMessages.length){renderInboxMessages();updateAdminActionProgress("inboxLoad",0,0,"Loading outbox messages in batches…");}
    for(let i=0;i<loadedMessages.length;i+=20){
      const chunk=loadedMessages.slice(i,i+20);
      inboxMessages.push(...chunk);
      renderInboxMessages();
      updateAdminActionProgress("inboxLoad",inboxMessages.length,loadedMessages.length,"Loading outbox messages in batches…");
      await new Promise(resolve=>setTimeout(resolve,0));
    }

    status.className="status show ok";
    status.textContent=`${inboxMessages.length} customer message${inboxMessages.length===1?"":"s"} loaded.`;

  }catch(error){
    inboxMessages=[];
    renderInboxMessages();
    status.className="status show bad";
    status.textContent=error.message||"Unable to load customer messages.";
  }finally{
    hideAdminActionProgress("inboxLoad");
    loadBtn.disabled=false;
    loadBtn.textContent="Load Outbox";
    refreshBtn.disabled=false;
  }
}

document.getElementById("loadInboxBtn").addEventListener("click",loadGmailInbox);
document.getElementById("refreshInboxBtn").addEventListener("click",loadGmailInbox);
document.getElementById("inboxSearch").addEventListener("input",()=>{inboxPage=1;renderInboxMessages();});
document.getElementById("inboxTypeFilter").addEventListener("change",()=>{inboxPage=1;renderInboxMessages();});
document.getElementById("inboxSort").addEventListener("change",()=>{inboxPage=1;renderInboxMessages();});
document.getElementById("inboxPrevBtn")?.addEventListener("click",()=>{if(inboxPage>1){inboxPage--;renderInboxMessages();}});
document.getElementById("inboxNextBtn")?.addEventListener("click",()=>{
  const search=(document.getElementById("inboxSearch")?.value||"").trim().toLowerCase();
  const typeFilter=document.getElementById("inboxTypeFilter")?.value||"";
  const total=inboxMessages.filter(message=>{
    if(typeFilter&&message.type!==typeFilter)return false;
    if(!search)return true;
    return [message.customer_name,message.account_number,message.customer_email,message.type,message.subject,message.from,message.snippet]
      .map(v=>String(v||"").toLowerCase()).join(" ").includes(search);
  }).length;
  if(inboxPage<Math.max(1,Math.ceil(total/inboxPageSize))){inboxPage++;renderInboxMessages();}
});

function normalizeActivationAccount(v){
  let s=String(v??"").trim();
  if(/^\d+(\.0+)?$/.test(s)) s=String(parseInt(s,10));
  s=s.replace(/\D/g,"");
  return s ? s.padStart(7,"0") : "";
}



async function loadGmailPortalSyncStatus(){
  const key=document.getElementById("adminKey").value.trim();
  const status=document.getElementById("gmailPortalSyncStatus");
  const meta=document.getElementById("gmailSyncMeta");
  if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');status.className="status show bad";status.textContent="Enter your Admin Import Key in the Admin Login window first.";return;}
  try{
    const res=await fetch("/api/admin/gmail-portal-sync/status",{headers:{"X-Admin-Key":key},cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.success===false) throw new Error(data.error||"Could not read Gmail sync status.");
    document.getElementById("gmailSyncLastSuccess").textContent=data.last_success_at?new Date(data.last_success_at).toLocaleString():"Not yet";
    document.getElementById("gmailSyncTotal").textContent=String(data.synced_notifications||0);
    document.getElementById("gmailSyncError").textContent=data.last_error||"None";
    meta.style.display="grid";
  }catch(error){status.className="status show bad";status.textContent=error.message||"Could not read Gmail sync status.";}
}
document.getElementById("gmailPortalSyncBtn").addEventListener("click",async()=>{
  const key=document.getElementById("adminKey").value.trim();
  const btn=document.getElementById("gmailPortalSyncBtn");
  const status=document.getElementById("gmailPortalSyncStatus");
  if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');status.className="status show bad";status.textContent="Enter your Admin Import Key in the Admin Login window first.";return;}
  btn.disabled=true;btn.textContent="Syncing…";status.className="status show";status.textContent="Checking Wooten Oil Gmail Sent messages…";
  try{
    const res=await fetch("/api/admin/gmail-portal-sync",{method:"POST",headers:{"X-Admin-Key":key},cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.success===false) throw new Error(data.error||"Gmail synchronization failed.");
    status.className="status show ok";
    status.textContent=`Gmail sync complete. ${data.notifications_created||0} new portal notification(s) created, ${data.duplicates||0} duplicate(s) skipped, ${data.unmatched_messages||0} sent message(s) had no matching customer email.`;
    await loadGmailPortalSyncStatus();
  }catch(error){status.className="status show bad";status.textContent=error.message||"Gmail synchronization failed.";}
  finally{btn.disabled=false;btn.textContent="Sync Gmail Sent Now";}
});
document.getElementById("gmailPortalSyncStatusBtn").addEventListener("click",loadGmailPortalSyncStatus);

/* Send Customer Notification */
const notifyAudienceOne=document.getElementById("notifyAudienceOne");
const notifyAudienceAll=document.getElementById("notifyAudienceAll");
const notifySendSms=document.getElementById("notifySendSms");
const notifyAccountInput=document.getElementById("notifyAccount");
const notifySendEmailInput=document.getElementById("notifySendEmail");
const notifyBroadcastWarning=document.getElementById("notifyBroadcastWarning");
const sendCustomerNotificationBtn=document.getElementById("sendCustomerNotificationBtn");
const notifyAttachmentsInput=document.getElementById("notifyAttachments");
const notifyAttachmentBox=document.getElementById("notifyAttachmentBox");
const notifyAttachmentList=document.getElementById("notifyAttachmentList");

let notifySingleEmailChoice=notifySendEmailInput.checked;

function formatNotifyFileSize(bytes){
  const n=Number(bytes||0);
  if(n<1024) return `${n} B`;
  if(n<1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/(1024*1024)).toFixed(1)} MB`;
}

function renderNotifyAttachmentList(){
  if(!notifyAttachmentList || !notifyAttachmentsInput) return;
  const files=Array.from(notifyAttachmentsInput.files||[]);
  notifyAttachmentList.innerHTML=files.map(file=>
    `<div class="notify-attachment-item"><strong>${String(file.name||"Attachment").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}</strong><span>${formatNotifyFileSize(file.size)}</span></div>`
  ).join("");
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const value=String(reader.result||"");
      resolve(value.includes(",")?value.split(",").pop():value);
    };
    reader.onerror=()=>reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function collectNotifyAttachments(){
  const files=Array.from(notifyAttachmentsInput?.files||[]);
  if(!files.length) return [];
  if(files.length>3) throw new Error("Choose no more than 3 attachments.");

  const allowed=new Set([
    "application/pdf","image/png","image/jpeg","image/gif","image/webp",
    "text/plain","text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]);

  let total=0;
  for(const file of files){
    if(file.size>5*1024*1024) throw new Error(`${file.name} is larger than 5 MB.`);
    total+=file.size;
    if(total>10*1024*1024) throw new Error("Total attachment size cannot exceed 10 MB.");
    if(file.type && !allowed.has(file.type)) throw new Error(`${file.name} is not an allowed attachment type.`);
  }

  const values=[];
  for(const file of files){
    values.push({
      filename:file.name,
      content_type:file.type||"application/octet-stream",
      size_bytes:file.size,
      content_base64:await fileToBase64(file)
    });
  }
  return values;
}

if(notifyAttachmentsInput){
  notifyAttachmentsInput.addEventListener("change",renderNotifyAttachmentList);
}

async function loadTwilioStatus(){
  const meta=document.getElementById("twilioStatusMeta");
  const btn=document.getElementById("twilioStatusBtn");
  const key=document.getElementById("adminKey").value.trim();
  if(!key){
    meta.className="twilio-status-meta bad";
    meta.textContent="Admin login required.";
    window.ensureAdminLoginKey?.("Enter your Admin Import Key to check Twilio.");
    return;
  }
  btn.disabled=true;
  meta.className="twilio-status-meta";
  meta.textContent="Checking Twilio configuration…";
  try{
    const res=await fetch("/api/admin/twilio/status",{headers:{"X-Admin-Key":key,"Accept":"application/json"},cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.success===false) throw new Error(data.error||"Could not check Twilio.");
    if(data.configured){
      meta.className="twilio-status-meta ok";
      meta.textContent=`Connected • ${data.sender_label||"Sender configured"}${data.account_sid_masked?` • ${data.account_sid_masked}`:""}`;
    }else{
      meta.className="twilio-status-meta bad";
      meta.textContent=`Not configured${data.missing?.length?` • Missing: ${data.missing.join(", ")}`:""}`;
    }
  }catch(error){
    meta.className="twilio-status-meta bad";
    meta.textContent=error.message||"Could not check Twilio.";
  }finally{btn.disabled=false;}
}
document.getElementById("twilioStatusBtn")?.addEventListener("click",loadTwilioStatus);

function updateNotificationAudience(){
  const sendAll=notifyAudienceAll.checked;
  if(notifySendSms){
    notifySendSms.disabled=sendAll;
    if(sendAll) notifySendSms.checked=false;
  }
  const smsNote=document.getElementById("notifySmsNote");
  if(smsNote){
    smsNote.textContent=sendAll
      ? "Bulk SMS is disabled here. Use one-customer SMS until Twilio A2P registration and customer opt-in are fully configured."
      : "SMS is available for one-customer notifications. The phone number comes from the MAS 90 customer record.";
  }

  if(sendAll){
    notifySingleEmailChoice=notifySendEmailInput.checked;
    notifyAccountInput.disabled=true;
    notifyAccountInput.value="";
    notifySendEmailInput.checked=true;
    notifySendEmailInput.disabled=true;
    if(notifyAttachmentsInput){
      notifyAttachmentsInput.value="";
      notifyAttachmentsInput.disabled=true;
      renderNotifyAttachmentList();
    }
    if(notifyAttachmentBox) notifyAttachmentBox.classList.add("disabled");
    notifyBroadcastWarning.classList.add("show");
    sendCustomerNotificationBtn.textContent="Send to All Customers";
  }else{
    notifyAccountInput.disabled=false;
    notifySendEmailInput.disabled=false;
    notifySendEmailInput.checked=notifySingleEmailChoice;
    if(notifyAttachmentsInput) notifyAttachmentsInput.disabled=false;
    if(notifyAttachmentBox) notifyAttachmentBox.classList.remove("disabled");
    notifyBroadcastWarning.classList.remove("show");
    sendCustomerNotificationBtn.textContent="Send Notification";
  }
}

notifyAudienceOne.addEventListener("change",updateNotificationAudience);
notifyAudienceAll.addEventListener("change",updateNotificationAudience);
notifySendEmailInput.addEventListener("change",()=>{
  if(!notifyAudienceAll.checked) notifySingleEmailChoice=notifySendEmailInput.checked;
});
updateNotificationAudience();

sendCustomerNotificationBtn.addEventListener("click",async()=>{
  const key=document.getElementById("adminKey").value.trim();
  const sendAll=notifyAudienceAll.checked;
  const account=sendAll ? "" : normalizeActivationAccount(notifyAccountInput.value);
  const title=document.getElementById("notifySubject").value.trim();
  const message=document.getElementById("notifyMessage").value.trim();
  const sendEmail=sendAll ? true : notifySendEmailInput.checked;
  const sendSms=!sendAll && !!notifySendSms?.checked;
  const btn=sendCustomerNotificationBtn;
  const status=document.getElementById("notifyStatus");

  if(!key){
    status.className="status show bad";
    status.textContent="Enter your Admin Import Key in the Admin Login window first.";
    return;
  }

  if(!title || !message || (!sendAll && !account)){
    status.className="status show bad";
    status.textContent=sendAll
      ? "Subject and message are required."
      : "Customer Number, subject and message are required.";
    return;
  }

  if(sendAll){
    const confirmed=window.confirm(
      "Send this notification to ALL customers who have a valid email address on file?\n\n"+
      "Each matching customer will receive an email and a portal notification."
    );
    if(!confirmed) return;
  }

  btn.disabled=true;
  btn.textContent=sendAll ? "Sending to All…" : "Sending…";
  status.className="status show";
  status.textContent=sendAll
    ? "Sending notification to all customers with email addresses…"
    : "Sending customer notification…";

  try{
    const attachments=sendAll ? [] : await collectNotifyAttachments();

    const res=await fetch("/api/admin/customer-notifications",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "X-Admin-Key":key
      },
      body:JSON.stringify({
        account_number:account,
        title,
        message,
        send_email:sendEmail,
        send_sms:sendSms,
        send_all_with_email:sendAll,
        attachments
      })
    });

    const data=await res.json().catch(()=>({}));
    if(!res.ok || data.success===false){
      throw new Error(data.error||"Could not send notification.");
    }

    status.className="status show ok";

    if(data.bulk){
      status.textContent=
        `Broadcast complete: ${data.customers_targeted||0} customer(s) targeted, `+
        `${data.notifications_saved||0} portal notification(s) saved, `+
        `${data.emails_sent||0} email(s) sent`+
        (data.emails_failed?`, ${data.emails_failed} email(s) failed`:"")+
        (data.invalid_email_customers?`, ${data.invalid_email_customers} invalid email record(s) skipped`:"")+
        (data.warning?`. ${data.warning}`:"")+
        ".";
    }else{
      status.textContent=
        `Portal notification #${data.notification_id||"saved"} saved for ${data.account_name||"customer"} (${data.account_number||account}).`+
        (data.email_sent?" Email sent too.":"")+
        (data.sms_sent?" SMS sent too.":"")+
        (data.warning?` ${data.warning}`:"");
    }

    document.getElementById("notifySubject").value="";
    document.getElementById("notifyMessage").value="";
    if(notifySendSms) notifySendSms.checked=false;
    if(notifyAttachmentsInput){
      notifyAttachmentsInput.value="";
      renderNotifyAttachmentList();
    }
  }catch(error){
    status.className="status show bad";
    status.textContent=error.message||"Could not send notification.";
  }finally{
    btn.disabled=false;
    btn.textContent=notifyAudienceAll.checked ? "Send to All Customers" : "Send Notification";
  }
});

document.getElementById("activationBtn").addEventListener("click",async()=>{
  const key=document.getElementById("adminKey").value.trim();
  const account=normalizeActivationAccount(document.getElementById("activationAccount").value);
  const btn=document.getElementById("activationBtn");
  const result=document.getElementById("activationResult");

  if(!key){
    setStatus("Enter your Admin Import Key in the Admin Login window first.",false);
    window.scrollTo({top:0,behavior:"smooth"});
    return;
  }

  if(!account){
    const el=document.getElementById("activationStatus");
    el.className="status show bad";
    el.textContent="Enter a valid Customer Number.";
    result.classList.remove("show");
    return;
  }

  btn.disabled=true;
  btn.textContent="Generating…";

  try{
    const res=await fetch("/api/admin/customer-activation-code",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "X-Admin-Key":key
      },
      body:JSON.stringify({account_number:account})
    });

    const data=await res.json().catch(()=>({}));
    if(!res.ok || data.success===false){
      throw new Error(data.error||"Could not generate activation code.");
    }

    document.getElementById("activationCustomerName").textContent=data.account_name||"Customer";
    document.getElementById("activationCustomerNumber").textContent=data.account_number||account;
    document.getElementById("activationCode").textContent=data.activation_code||"";
    document.getElementById("activationExpires").textContent=data.expires_at
      ? new Date(data.expires_at).toLocaleString()
      : "About 15 minutes";

    const el=document.getElementById("activationStatus");
    el.className="status show ok";
    el.textContent="One-time activation code generated successfully.";
    result.classList.add("show");
  }catch(e){
    const el=document.getElementById("activationStatus");
    el.className="status show bad";
    el.textContent=e.message||"Could not generate activation code.";
    result.classList.remove("show");
  }finally{
    btn.disabled=false;
    btn.textContent="Generate One-Time Code";
  }
});

document.getElementById("copyActivationCode").addEventListener("click",async()=>{
  const code=document.getElementById("activationCode").textContent.trim();
  if(!code) return;
  try{
    await navigator.clipboard.writeText(code);
    document.getElementById("copyActivationCode").textContent="Copied";
    setTimeout(()=>document.getElementById("copyActivationCode").textContent="Copy Code",1200);
  }catch{
    alert("Activation code: "+code);
  }
});



/* Password Reset Assistance for activated customers */
document.getElementById("resetAssistBtn").addEventListener("click",async()=>{
  const key=document.getElementById("adminKey").value.trim();
  const account=normalizeActivationAccount(document.getElementById("resetAssistAccount").value);
  const btn=document.getElementById("resetAssistBtn");
  const status=document.getElementById("resetAssistStatus");
  const result=document.getElementById("resetAssistResult");

  if(!key){
    status.className="status show bad";
    status.textContent="Enter your Admin Import Key in the Admin Login window first.";
    return;
  }

  if(!account){
    status.className="status show bad";
    status.textContent="Enter a valid Customer Number.";
    result.classList.remove("show");
    return;
  }

  btn.disabled=true;
  btn.textContent="Generating…";
  status.className="status show";
  status.textContent="Generating password reset code…";
  result.classList.remove("show");

  try{
    const res=await fetch("/api/admin/customer-password-reset-code",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "X-Admin-Key":key
      },
      body:JSON.stringify({account_number:account})
    });

    const data=await res.json().catch(()=>({}));
    if(!res.ok || data.success===false){
      throw new Error(data.error||"Could not generate password reset code.");
    }

    document.getElementById("resetAssistCustomerName").textContent=data.account_name||"Customer";
    document.getElementById("resetAssistCustomerNumber").textContent=data.account_number||account;
    document.getElementById("resetAssistCode").textContent=data.reset_code||"";
    document.getElementById("resetAssistExpires").textContent=data.expires_at
      ? new Date(data.expires_at).toLocaleString()
      : "About 15 minutes";

    status.className="status show ok";
    status.textContent="Password reset code generated successfully.";
    result.classList.add("show");
  }catch(error){
    status.className="status show bad";
    status.textContent=error.message||"Could not generate password reset code.";
    result.classList.remove("show");
  }finally{
    btn.disabled=false;
    btn.textContent="Generate Password Reset Code";
  }
});

document.getElementById("copyResetAssistCode").addEventListener("click",async()=>{
  const code=document.getElementById("resetAssistCode").textContent.trim();
  if(!code) return;
  const btn=document.getElementById("copyResetAssistCode");
  try{
    await navigator.clipboard.writeText(code);
    btn.textContent="Copied";
    setTimeout(()=>btn.textContent="Copy Code",1200);
  }catch{
    alert("Password reset code: "+code);
  }
});



/* Live D1 Customer Database — read only */
(function(){
  const search=document.getElementById("dbSearch");
  const emailFilter=document.getElementById("dbEmailFilter");
  const phoneFilter=document.getElementById("dbPhoneFilter");
  const onlineFilter=document.getElementById("dbOnlineFilter");
  const statusFilter=document.getElementById("dbStatusFilter");
  const sort=document.getElementById("dbSort");
  const loadBtn=document.getElementById("dbLoadBtn");
  const refreshBtn=document.getElementById("dbRefreshBtn");
  const status=document.getElementById("dbStatus");
  const meta=document.getElementById("dbMeta");
  const totalEl=document.getElementById("dbTotal");
  const rangeEl=document.getElementById("dbRange");
  const tableWrap=document.getElementById("dbTableWrap");
  const tbody=document.getElementById("dbTableBody");
  const pagination=document.getElementById("dbPagination");
  const prevBtn=document.getElementById("dbPrevBtn");
  const nextBtn=document.getElementById("dbNextBtn");
  const pageInfo=document.getElementById("dbPageInfo");

  if(!loadBtn) return;

  let page=1;
  const pageSize=50;
  let loaded=false;
  let requestSerial=0;
  let debounceTimer=null;

  function esc(value){
    return String(value??"").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function money(value){
    const n=Number(value||0);
    return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number.isFinite(n)?n:0);
  }

  function fmtDate(value){
    if(!value) return "—";
    const d=new Date(String(value).replace(" ","T")+"Z");
    if(Number.isNaN(d.getTime())) return esc(value);
    return d.toLocaleString();
  }

  function setDbStatus(message,good=false){
    if(!message){
      status.className="status";
      status.textContent="";
      return;
    }
    status.className="status show "+(good?"ok":"bad");
    status.textContent=message;
  }

  function buildUrl(){
    const params=new URLSearchParams({
      page:String(page),
      page_size:String(pageSize),
      search:search.value.trim(),
      email:emailFilter.value,
      phone:phoneFilter.value,
      online:onlineFilter.value,
      status:statusFilter.value,
      sort:sort.value
    });
    return "/api/admin/customers-database?"+params.toString();
  }

  let currentRows=[];

  function contactIcon(channel,label,available=true){
    const icons={
      email:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>',
      sms:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"></path><path d="M8 9h8M8 13h5"></path></svg>',
      portal:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 7h18"></path><circle cx="12" cy="12" r="2.4"></circle><path d="M7.5 19a4.5 4.5 0 0 1 9 0"></path></svg>'
    };
    const state=available?'available':'not activated';
    return '<span class="db-contact-indicator" data-channel="'+channel+'" data-available="'+(available?'true':'false')+'" title="'+esc(label+' '+state)+'" aria-label="'+esc(label+' '+state)+'">'+icons[channel]+'</span>';
  }

  function contactIcons(row){
    const hasEmail=!!String(row.email||'').trim();
    const hasPhone=!!String(row.phone||'').trim();
    const icons=(hasPhone?contactIcon('sms','SMS'):'')+
      contactIcon('portal','Customer Portal',!!row.online_activated)+
      (hasEmail?contactIcon('email','Email'):'');
    return '<div class="db-contact-icons">'+icons+'</div>';
  }

  function renderRows(rows){
    currentRows=rows;
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="8"><div class="db-empty">No customers match the current search and filters.</div></td></tr>';
      return;
    }

    tbody.innerHTML=rows.map((row,index)=>{
      const acct=row.account_number||"";
      const online=row.online_activated
        ? '<span class="db-badge good">Activated</span>'
        : '<span class="db-badge muted">Not activated</span>';
      const rawStatus=String(row.account_status||"").trim();
      const isActive=!rawStatus || rawStatus.toLowerCase()==="active";
      const statusBadge=isActive
        ? '<span class="db-badge good">Active</span>'
        : '<span class="db-badge warn">'+esc(rawStatus)+'</span>';

      return `<tr>
        <td class="account"><button class="db-customer-link" type="button" data-db-row="${index}" aria-label="View customer ${esc(acct)} details">${esc(acct)}</button></td>
        <td class="db-contact-cell">${contactIcons(row)}</td>
        <td class="db-company"><button class="db-customer-link" type="button" data-db-row="${index}" aria-label="View ${esc(row.account_name||"customer")} details">${esc(row.account_name||"")}</button></td>
        <td class="email-cell db-email" title="${esc(row.email||"")}">${esc(row.email||"—")}</td>
        <td>${esc(row.phone||"—")}</td>
        <td class="money">${money(row.current_balance)}</td>
        <td>${statusBadge}</td>
        <td>${online}</td>
      </tr>`;
    }).join("");
  }

  function renderCustomerDetails(row){
    if(!row) return;
    const modal=document.getElementById("dbCustomerModal");
    const body=document.getElementById("dbCustomerModalBody");
    const title=document.getElementById("dbCustomerModalTitle");
    const accountHeading=document.getElementById("dbCustomerModalAccount");

    title.textContent="Customer Details";
    if(accountHeading) accountHeading.textContent=(row.account_name||"Customer")+" — Customer # "+(row.account_number||"—");
    const statusText=String(row.account_status||"Active").trim()||"Active";
    const isActive=statusText.toLowerCase()==="active";
    const onlineActivated=!!row.online_activated;

    const formatDetailPhone=value=>{
      const digits=String(value||"").replace(/\D/g,"");
      const local=digits.length===11&&digits.startsWith("1")?digits.slice(1):digits;
      return local.length===10?`(${local.slice(0,3)}) ${local.slice(3,6)}-${local.slice(6)}`:String(value||"");
    };

    const contactFields=[
      ["Email",row.email,"email"],
      ["Phone",formatDetailPhone(row.phone),"phone"],
      ["Location",[row.city,row.state].filter(Boolean).join(", ")+(row.zip_code?" "+row.zip_code:""),"location"]
    ].filter(item=>String(item[1]||"").trim());

    const totalBalance=Number(row.current_balance||0)+Number(row.aging_category_1||0)+Number(row.aging_category_2||0)+Number(row.aging_category_3||0)+Number(row.aging_category_4||0);

    const contactHtml=contactFields.length
      ? `<div class="db-detail-grid">${
          contactFields.map(item=>`
            <div class="db-detail-box" data-field="${esc(item[2])}">
              <div class="db-detail-label">${esc(item[0])}</div>
              <div class="db-detail-value">${esc(item[1])}</div>
            </div>
          `).join("")
        }</div>`
      : `<div class="db-empty-contact">No contact information is currently stored for this customer.</div>`;

    body.innerHTML=`
      <div class="db-customer-summary">
        <span class="db-badge ${isActive?"good":"warn"}">${esc(statusText)}</span>
        <span class="db-badge ${onlineActivated?"good":"muted"}">${onlineActivated?"Online account activated":"Online account not activated"}</span>
        <span class="db-badge muted">Statement Cycle ${esc(row.statement_cycle||"Not set")}</span>
        <span class="db-customer-updated">Last updated ${fmtDate(row.updated_at)}</span>
      </div>

      <div class="db-detail-section">
        <div class="db-section-title">Contact Information</div>
        ${contactHtml}
      </div>

      <div class="db-detail-section">
        <div class="db-section-title">Account Balance & Aging</div>
        <div class="db-aging-grid">
          <div class="db-aging-box current-balance">
            <div class="db-detail-label">Current Balance</div>
            <div class="db-detail-value" title="${money(row.current_balance)}">${money(row.current_balance)}</div>
          </div>
          <div class="db-aging-box">
            <div class="db-detail-label">Aging 1</div>
            <div class="db-detail-value" title="${money(row.aging_category_1)}">${money(row.aging_category_1)}</div>
          </div>
          <div class="db-aging-box">
            <div class="db-detail-label">Aging 2</div>
            <div class="db-detail-value" title="${money(row.aging_category_2)}">${money(row.aging_category_2)}</div>
          </div>
          <div class="db-aging-box">
            <div class="db-detail-label">Aging 3</div>
            <div class="db-detail-value" title="${money(row.aging_category_3)}">${money(row.aging_category_3)}</div>
          </div>
          <div class="db-aging-box">
            <div class="db-detail-label">Aging 4</div>
            <div class="db-detail-value" title="${money(row.aging_category_4)}">${money(row.aging_category_4)}</div>
          </div>
          <div class="db-aging-box db-total-balance">
            <div class="db-detail-label">Total Balance</div>
            <div class="db-detail-value" title="${money(totalBalance)}">${money(totalBalance)}</div>
          </div>
        </div>
      </div>

      <div class="db-online-action ${onlineActivated?"is-active":"is-inactive"}">
        <h4>Online Account Access</h4>
        ${onlineActivated ? `
          <p>Deactivate only the customer's website login. Billing status, balances, and customer information will not be changed.</p>
          <button class="secondary db-deactivate-btn" id="dbDeactivateOnlineBtn" type="button">Deactivate Online Account</button>
          <div class="db-action-status" id="dbDeactivateStatus"></div>
        ` : `
          <p>This customer does not currently have an activated online account.</p>
        `}
      </div>`;

    modal.classList.add("show");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";

    const deactivateBtn=document.getElementById("dbDeactivateOnlineBtn");
    if(deactivateBtn){
      deactivateBtn.addEventListener("click",async()=>{
        const key=document.getElementById("adminKey").value.trim();
        const actionStatus=document.getElementById("dbDeactivateStatus");

        if(!key){
          actionStatus.className="db-action-status show bad";
          actionStatus.textContent="Enter the Admin Import Key in the Admin Login window first.";
          return;
        }

        const confirmed=confirm(
          `Deactivate the online account for ${row.account_name||"this customer"} (${row.account_number||""})?\n\n`+
          "The customer will be signed out and their current online password will no longer work. " +
          "This does NOT change their Wooten Oil billing account or balance."
        );
        if(!confirmed) return;

        deactivateBtn.disabled=true;
        deactivateBtn.textContent="Deactivating…";
        actionStatus.className="db-action-status show";
        actionStatus.textContent="Deactivating online account…";

        try{
          const response=await fetch("/api/admin/customer-online-deactivate",{
            method:"POST",
            headers:{
              "Content-Type":"application/json",
              "X-Admin-Key":key
            },
            body:JSON.stringify({account_number:row.account_number})
          });

          const data=await response.json().catch(()=>({}));
          if(!response.ok || data.success===false){
            throw new Error(data.error||"Could not deactivate the online account.");
          }

          row.online_activated=0;
          actionStatus.className="db-action-status show ok";
          actionStatus.textContent="Online account deactivated. The customer has been signed out and must activate the online account again before signing in.";
          deactivateBtn.remove();

          setTimeout(()=>{
            closeCustomerDetails();
            loadDatabase({silent:true});
          },1100);
        }catch(error){
          actionStatus.className="db-action-status show bad";
          actionStatus.textContent=error.message||"Could not deactivate the online account.";
          deactivateBtn.disabled=false;
          deactivateBtn.textContent="Deactivate Online Account";
        }
      });
    }
  }

  function closeCustomerDetails(){
    const modal=document.getElementById("dbCustomerModal");
    if(!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden","true");
    document.body.style.overflow="";
  }

  tbody.addEventListener("click",e=>{
    const btn=e.target.closest("[data-db-row]");
    if(!btn) return;
    const index=Number(btn.getAttribute("data-db-row"));
    if(Number.isInteger(index) && currentRows[index]) renderCustomerDetails(currentRows[index]);
  });

  document.getElementById("dbCustomerModalClose").addEventListener("click",closeCustomerDetails);
  document.getElementById("dbCustomerModal").addEventListener("click",e=>{
    if(e.target.id==="dbCustomerModal") closeCustomerDetails();
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape") closeCustomerDetails();
  });

  async function loadDatabase({silent=false}={}){
    const key=document.getElementById("adminKey").value.trim();
    if(!key){
      setDbStatus("Enter your Admin Import Key in the Admin Login window first.");
      return;
    }

    const serial=++requestSerial;
    loadBtn.disabled=true;
    loadBtn.textContent="Loading Customers…";
    refreshBtn.disabled=true;
    beginDatabaseLoadProgress("customers");
    await new Promise(resolve=>requestAnimationFrame(resolve));
    if(!silent){
      status.className="status show";
      status.textContent="Loading live customer database…";
    }

    try{
      const response=await fetch(buildUrl(),{
        method:"GET",
        headers:{"X-Admin-Key":key,"Accept":"application/json"},
        cache:"no-store"
      });
      const data=await response.json().catch(()=>({}));
      if(serial!==requestSerial) return;
      if(!response.ok || data.success===false){
        throw new Error(data.error||"Could not load customer database.");
      }

      loaded=true;
      const rows=Array.isArray(data.customers)?data.customers:[];
      const total=Number(data.total||0);
      const pages=Math.max(1,Number(data.pages||1));
      if(page>pages){
        page=pages;
      }

      await renderDatabaseRowsInBatches(rows,renderRows,"customers",10);
      totalEl.textContent=String(total);
      const start=total ? ((page-1)*pageSize)+1 : 0;
      const end=total ? Math.min(page*pageSize,total) : 0;
      rangeEl.textContent=`Showing ${start}–${end}`;
      pageInfo.textContent=`Page ${page} of ${pages}`;
      prevBtn.disabled=page<=1;
      nextBtn.disabled=page>=pages;

      meta.style.display="flex";
      tableWrap.style.display="block";
      pagination.style.display="flex";
      setDbStatus(`Live database loaded. ${total} customer(s) match the current view.`,true);
    }catch(error){
      setDbStatus(error.message||"Could not load customer database.");
    }finally{
      hideDatabaseLoadProgress("customers");
      loadBtn.disabled=false;
      loadBtn.textContent="Load Customers Database";
      refreshBtn.disabled=!loaded;
    }
  }

  function filtersChanged(){
    if(!loaded) return;
    page=1;
    loadDatabase({silent:true});
  }

  loadBtn.addEventListener("click",()=>{page=1;loadDatabase();});
  refreshBtn.addEventListener("click",()=>loadDatabase());
  emailFilter.addEventListener("change",filtersChanged);
  phoneFilter.addEventListener("change",filtersChanged);
  onlineFilter.addEventListener("change",filtersChanged);
  statusFilter.addEventListener("change",filtersChanged);
  sort.addEventListener("change",filtersChanged);
  prevBtn.addEventListener("click",()=>{if(page>1){page--;loadDatabase({silent:true});}});
  nextBtn.addEventListener("click",()=>{page++;loadDatabase({silent:true});});

  search.addEventListener("input",()=>{
    if(!loaded) return;
    clearTimeout(debounceTimer);
    debounceTimer=setTimeout(()=>{
      page=1;
      loadDatabase({silent:true});
    },300);
  });
})();


/* Edge-style admin tab navigation */
(function(){
  const tabs=Array.from(document.querySelectorAll("[data-admin-tab]"));
  const panels=Array.from(document.querySelectorAll("[data-admin-panel]"));
  const subtabs=Array.from(document.querySelectorAll("[data-admin-subtab]"));
  const validParents=new Set(tabs.map(t=>t.dataset.adminTab));
  const validPanels=new Set(panels.map(p=>p.dataset.adminPanel));
  const currentPage=document.getElementById("adminCurrentPage");
  const mobileTitle=document.getElementById("adminMobileTitle");
  const mobileMenuBtn=document.getElementById("adminMobileMenuBtn");
  const drawerClose=document.getElementById("adminDrawerClose");
  const drawerBackdrop=document.getElementById("adminDrawerBackdrop");
  const groups={
    customers:["customers","database"],
    communication:["communication","messages"],
    settings:["settings","gmail"]
  };
  const selectedChild={customers:"customers",communication:"communication",settings:"settings"};

  function parentFor(name){
    return Object.keys(groups).find(parent=>groups[parent].includes(name))||name;
  }

  function showAdminPage(name,{updateHash=true,focusTab=false}={}){
    if(!validPanels.has(name)&&!validParents.has(name)) name="dashboard";
    const parent=parentFor(name);
    if(groups[parent]&&groups[parent].includes(name)) selectedChild[parent]=name;
    const activePanel=groups[parent]?(selectedChild[parent]||groups[parent][0]):parent;
    tabs.forEach(tab=>{
      const active=tab.dataset.adminTab===parent;
      tab.setAttribute("aria-selected",active?"true":"false");
      tab.tabIndex=active?0:-1;
      if(active&&focusTab) tab.focus({preventScroll:true});
    });
    panels.forEach(panel=>{
      const active=panel.dataset.adminPanel===activePanel;
      panel.classList.toggle("is-active",active);
      panel.hidden=!active;
    });
    subtabs.forEach(subtab=>{
      const active=subtab.dataset.adminParent===parent&&subtab.dataset.adminSubtab===activePanel;
      subtab.setAttribute("aria-selected",active?"true":"false");
      subtab.tabIndex=active?0:-1;
    });
    const activeTab=tabs.find(tab=>tab.dataset.adminTab===parent);
    const label=activeTab?.dataset.adminLabel||activeTab?.textContent.trim()||"Overview";
    if(currentPage)currentPage.textContent=label;
    if(mobileTitle)mobileTitle.textContent=label;
    document.body.classList.remove("admin-drawer-open");
    mobileMenuBtn?.setAttribute("aria-expanded","false");
    if(updateHash){try{history.replaceState(null,"","#"+activePanel);}catch{}}
    try{sessionStorage.setItem("wootenAdminTab",activePanel);}catch{}
  }

  tabs.forEach((tab,index)=>{
    tab.addEventListener("click",()=>showAdminPage(tab.dataset.adminTab));
    tab.addEventListener("keydown",e=>{
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(e.key)) return;
      e.preventDefault();
      let next=index;
      if(e.key==="ArrowRight"||e.key==="ArrowDown") next=(index+1)%tabs.length;
      if(e.key==="ArrowLeft"||e.key==="ArrowUp") next=(index-1+tabs.length)%tabs.length;
      if(e.key==="Home") next=0;
      if(e.key==="End") next=tabs.length-1;
      showAdminPage(tabs[next].dataset.adminTab,{focusTab:true});
    });
  });

  subtabs.forEach(subtab=>{
    subtab.addEventListener("click",()=>{
      const parent=subtab.dataset.adminParent;
      const child=subtab.dataset.adminSubtab;
      if(groups[parent]&&groups[parent].includes(child)){
        selectedChild[parent]=child;
        showAdminPage(child);
      }
    });
  });

  document.querySelectorAll("[data-admin-open]").forEach(button=>button.addEventListener("click",()=>{
    const target=button.dataset.adminOpen;
    const tab=tabs.find(item=>item.dataset.adminTab===target&&!item.hidden);
    if(tab)showAdminPage(target);
  }));
  function closeDrawer(){document.body.classList.remove("admin-drawer-open");mobileMenuBtn?.setAttribute("aria-expanded","false");}
  mobileMenuBtn?.addEventListener("click",()=>{const open=!document.body.classList.contains("admin-drawer-open");document.body.classList.toggle("admin-drawer-open",open);mobileMenuBtn.setAttribute("aria-expanded",open?"true":"false");});
  drawerClose?.addEventListener("click",closeDrawer);
  drawerBackdrop?.addEventListener("click",closeDrawer);
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeDrawer();});
  function syncDrawerViewport(){const height=Math.round(window.visualViewport?.height||window.innerHeight);if(height>0)document.documentElement.style.setProperty("--admin-drawer-height",height+"px");}
  syncDrawerViewport();
  window.addEventListener("resize",syncDrawerViewport,{passive:true});
  window.visualViewport?.addEventListener("resize",syncDrawerViewport,{passive:true});
  const dashboardDate=document.getElementById("adminDashboardDate");
  if(dashboardDate)dashboardDate.textContent=new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric",timeZone:"America/Chicago"}).format(new Date())+" • Central Time";

  window.addEventListener("hashchange",()=>{
    const name=location.hash.replace(/^#/,"");
    if(validPanels.has(name)||validParents.has(name)) showAdminPage(name,{updateHash:false});
  });

  /* Always start every admin session on Dashboard.
     Previous tabs/hash values must never become the admin landing page. */
  window.showWootenAdminPage=showAdminPage;
  showAdminPage("dashboard",{updateHash:true});
})();

