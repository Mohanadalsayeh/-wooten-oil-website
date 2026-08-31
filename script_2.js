
try{
  const [{Buffer},mdbModule]=await Promise.all([
    import("https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm"),
    import("https://cdn.jsdelivr.net/npm/mdb-reader@3.2.0/+esm")
  ]);
  const MDBReader=mdbModule.default;

  function n(v){return String(v||"").replace(/[^a-z0-9]/gi,"").toLowerCase();}
  function score(cols,mode){
    const set=new Set((cols||[]).map(n));
    const wanted=mode==="payments"
      ?["depositdate","depositno","customerno","checkno","postingdate","customername","invoiceno","cashamountapplied","discountamountapplied"]
      :["customerno","customername","currentbalance","addressline1","city","state","zipcode","telephoneno","emailaddress"];
    return wanted.reduce((s,k)=>s+(set.has(k)?1:0),0);
  }

  window.wootenReadAccessFile=async(file,mode)=>{
    const reader=new MDBReader(Buffer.from(await file.arrayBuffer()));
    const names=reader.getTableNames();
    if(!names?.length) throw new Error("No tables were found in this Access database.");

    let best=null;
    for(const name of names){
      try{
        const table=reader.getTable(name);
        const cols=table.getColumnNames();
        const s=score(cols,mode);
        if(!best||s>best.score) best={name,table,cols,score:s};
      }catch(e){}
    }

    const minimum=mode==="payments"?3:2;
    if(!best||best.score<minimum){
      throw new Error(mode==="payments"
        ?"Could not find the payment table. Expected fields such as CustomerNo, PostingDate and CashAmountApplied."
        :"Could not find the customer table. Expected fields such as CustomerNo and CustomerName.");
    }

    const rows=best.table.getData();
    return {rows:Array.isArray(rows)?rows:[],tableName:best.name,columns:best.cols};
  };

  window.dispatchEvent(new Event("wooten-mdb-reader-ready"));
}catch(error){
  console.error("MDB reader failed to load",error);
  window.wootenMdbReaderError=error;
}
