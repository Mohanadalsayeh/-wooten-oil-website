// Shared print letterhead for customer statements and statement administration reports.
export function statementLetterhead({width=612,height=792,margin=42,title='Account Statement'}={}){
  const escape=value=>String(value??'').replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim().replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  const ink='0.082 0.200 0.294',muted='0.357 0.427 0.494',red='0.831 0.141 0.169';
  const text=(value,x,y,size,bold=false,color=ink)=>`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${escape(value)}) Tj ET\n`;
  // Standard Helvetica-Bold widths keep the printed text flush with the right margin.
  const boldWidths=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  const boldWidth=(value,size)=>Array.from(value).reduce((sum,ch)=>sum+(boldWidths[ch.charCodeAt(0)-32]??556),0)*size/1000;
  const rightText=(value,y,size,color=ink)=>text(value,width-margin-boldWidth(value,size),y,size,true,color);
  const x=margin,y=height-64,s=32,r=8,k=r*.552285;
  let out=`q ${red} rg ${x+r} ${y} m ${x+s-r} ${y} l ${x+s-r+k} ${y} ${x+s} ${y+r-k} ${x+s} ${y+r} c ${x+s} ${y+s-r} l ${x+s} ${y+s-r+k} ${x+s-r+k} ${y+s} ${x+s-r} ${y+s} c ${x+r} ${y+s} l ${x+r-k} ${y+s} ${x} ${y+s-r+k} ${x} ${y+s-r} c ${x} ${y+r} l ${x} ${y+r-k} ${x+r-k} ${y} ${x+r} ${y} c h f Q\n`;
  out+=text('WO',x+4.8,y+10.5,14,true,'1 1 1');
  out+=text('WOOTEN OIL CO INC.',margin+42,height-53,17,true);
  out+=text('513 East Sanford Avenue, Covington, TN 38019',margin,height-79,9,false,muted);
  out+=text('(901) 476-2684  |  support@wootenoil.com',margin,height-94,9,false,muted);
  const titleX=width===612?414:width-310;
  const titleWidth=width-margin-titleX;
  out+=rightText('CUSTOMER ACCOUNTS',height-39,7.5,red);
  const safeTitle=String(title).replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
  let size=16,lines=[];
  for(;size>=8;size-=.5){
    const limit=Math.max(10,Math.floor(titleWidth/(size*.62)));lines=[];
    for(const word of safeTitle.split(' ')){
      let rest=word;
      if(lines.length&&lines[lines.length-1].length+1+rest.length<=limit){lines[lines.length-1]+=' '+rest;continue;}
      while(rest.length>limit){lines.push(rest.slice(0,limit));rest=rest.slice(limit);}
      if(rest)lines.push(rest);
    }
    if(lines.length<=3)break;
  }
  lines.forEach((line,index)=>{out+=rightText(line,height-57-index*(size+3),size);});
  out+=`${ink} RG 1.2 w ${margin} ${height-108} m ${width-margin} ${height-108} l S\n`;
  return out;
}
