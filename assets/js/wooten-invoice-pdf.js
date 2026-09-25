/* Invoice exports use the portal's existing landscape table PDF layout. */
(()=>{
'use strict';
  function cleanText(value){
    return String(value==null?'':value)
      .replace(/\u00a0/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function asciiText(value){
    return cleanText(value)
      .replace(/[–—]/g,'-')
      .replace(/→/g,'->')
      .replace(/←/g,'<-')
      .replace(/•/g,'-')
      .replace(/[“”]/g,'"')
      .replace(/[‘’]/g,"'")
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^\x20-\x7e]/g,'?');
  }

  function pdfEscape(value){
    return asciiText(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  }

  function wrapText(value,maxChars,maxLines){
    const source=asciiText(value)||'-';
    const words=source.split(' ');
    const lines=[];
    let line='';
    function pushLongWord(word){
      while(word.length>maxChars){lines.push(word.slice(0,maxChars));word=word.slice(maxChars);if(lines.length>=maxLines)return '';}
      return word;
    }
    for(let word of words){
      if(lines.length>=maxLines)break;
      if(word.length>maxChars)word=pushLongWord(word);
      if(!word)continue;
      const candidate=line?line+' '+word:word;
      if(candidate.length<=maxChars)line=candidate;
      else{if(line)lines.push(line);line=word;}
    }
    if(line&&lines.length<maxLines)lines.push(line);
    if(!lines.length)lines.push('-');
    const originalLength=source.length;
    const shownLength=lines.join(' ').length;
    if(shownLength<originalLength&&lines.length){
      const last=lines.length-1;
      lines[last]=(lines[last].slice(0,Math.max(1,maxChars-3))+'...').slice(0,maxChars);
    }
    return lines;
  }

  function columnWidths(headers,rows,available){
    const count=headers.length;
    const minimum=Math.min(48,available/count);
    const weights=headers.map((header,index)=>{
      let longest=Math.min(30,Math.max(6,asciiText(header).length));
      rows.slice(0,100).forEach(row=>{longest=Math.max(longest,Math.min(30,asciiText(row[index]).length));});
      return longest;
    });
    const extra=Math.max(0,available-minimum*count);
    const totalWeight=weights.reduce((sum,value)=>sum+value,0)||1;
    return weights.map(weight=>minimum+extra*(weight/totalWeight));
  }

  async function preparePdfPages(data,onProgress){
    const pageWidth=792,pageHeight=612,margin=32,available=pageWidth-margin*2;
    const widths=columnWidths(data.headers,data.rows,available);
    if(data.fullCells){
      const card=data.headers.findIndex(h=>/^card number$/i.test(cleanText(h)));
      if(card>=0&&widths[card]<100){const extra=100-widths[card],rest=available-widths[card];widths.forEach((w,i)=>{widths[i]=i===card?100:w-extra*w/rest;});}
    }
    const headerLines=data.headers.map((text,index)=>wrapText(text,Math.max(3,Math.floor((widths[index]-6)/(7.5*.56))),4));
    const headerHeight=Math.max(24,Math.max(...headerLines.map(lines=>lines.length))*9+8);
    const customerLines=data.customerName?wrapText(data.customerName,100,Infinity):[];
    const customerHeight=customerLines.length*14;
    const tableTop=pageHeight-(data.statementLetterhead?142:72)-customerHeight;
    const printableHeight=tableTop-headerHeight-42;
    const pages=[[]];
    let used=0;
    for(let index=0;index<data.rows.length;index++){
      const source=data.rows[index];
      const lines=source.map((text,column)=>wrapText(text,Math.max(3,Math.floor((widths[column]-6)/(7.5*.52))),data.fullCells?Infinity:10));
      if(data.fullCells){
        const maxLines=Math.max(1,Math.floor((printableHeight-7)/9)),lineCount=Math.max(...lines.map(value=>value.length));
        for(let offset=0;offset<lineCount;offset+=maxLines){
          const chunk=lines.map(value=>value.slice(offset,offset+maxLines));
          const row={lines:chunk,height:Math.max(20,Math.max(...chunk.map(value=>value.length))*9+7)};
          if(pages[pages.length-1].length&&used+row.height>printableHeight){pages.push([]);used=0;}
          pages[pages.length-1].push(row);used+=row.height;
        }
        if(index%250===0){onProgress?.(index,data.rows.length,'Preparing pages');await new Promise(resolve=>setTimeout(resolve,0));}
        continue;
      }
      const row={lines,height:Math.max(20,Math.max(...lines.map(value=>value.length))*9+7)};
      if(pages[pages.length-1].length&&used+row.height>printableHeight){pages.push([]);used=0;}
      pages[pages.length-1].push(row);used+=row.height;
      if(index%250===0){onProgress?.(index,data.rows.length,'Preparing pages');await new Promise(resolve=>setTimeout(resolve,0));}
    }
    onProgress?.(data.rows.length,data.rows.length,'Preparing pages');
    return {pageWidth,pageHeight,margin,available,widths,headerLines,headerHeight,pages,tableTop,customerLines,customerHeight,statementLetterhead:data.statementLetterhead,statementRoundedPath:data.statementRoundedPath,boldColumns:data.headers.map(h=>/^card number$/i.test(cleanText(h)))};
  }

  function textCommand(text,x,y,font,size,color){
    return 'BT '+color+' rg /'+font+' '+size+' Tf 1 0 0 1 '+x.toFixed(2)+' '+y.toFixed(2)+' Tm ('+pdfEscape(text)+') Tj ET\n';
  }

  function pageContent(title,totalRecords,layout,rows,pageIndex,pageCount){
    const {pageWidth,pageHeight,margin,available,widths,headerLines,headerHeight}=layout;
    let out='';
    const generated=new Date().toLocaleString('en-US',{timeZone:'America/Chicago'});
    if(layout.statementLetterhead){
      out+=layout.statementLetterhead({width:pageWidth,height:pageHeight,margin,title});
      out+=textCommand('Total records: '+Number(totalRecords).toLocaleString('en-US')+'  -  Generated '+generated+' Central Time',margin,pageHeight-126,'F1',8,'0.38 0.46 0.55');
    }else{
      out+=textCommand(title,margin,pageHeight-34,'F2',15,'0.04 0.14 0.25');
      layout.customerLines.forEach((line,i)=>{out+=textCommand(line,margin,pageHeight-51-i*14,'F2',10,'0.08 0.19 0.30');});
      out+=textCommand('Total records: '+Number(totalRecords).toLocaleString('en-US')+'  -  Generated '+generated+' Central Time',margin,pageHeight-51-layout.customerHeight,'F1',8,'0.38 0.46 0.55');
      out+='0.81 0.16 0.18 RG 1.5 w '+margin+' '+(pageHeight-59-layout.customerHeight)+' m '+(pageWidth-margin)+' '+(pageHeight-59-layout.customerHeight)+' l S\n';
    }
    let top=layout.tableTop;
    let tablePath='';
    if(layout.statementRoundedPath){
      const tableHeight=headerHeight+rows.reduce((sum,row)=>sum+row.height,0);
      tablePath=layout.statementRoundedPath(margin,top-tableHeight,available,tableHeight);
      out+='q '+tablePath+' W n\n';
    }
    out+='0.94 0.96 0.98 rg '+margin+' '+(top-headerHeight)+' '+available+' '+headerHeight+' re f\n';
    out+='0.80 0.85 0.89 RG 0.55 w '+margin+' '+(top-headerHeight)+' '+available+' '+headerHeight+' re S\n';
    let x=margin;
    widths.forEach((width,index)=>{
      if(index)out+='0.84 0.88 0.91 RG 0.4 w '+x.toFixed(2)+' '+(top-headerHeight).toFixed(2)+' m '+x.toFixed(2)+' '+top.toFixed(2)+' l S\n';
      headerLines[index].forEach((line,lineIndex)=>{out+=textCommand(line,x+3,top-12-lineIndex*9,'F2',7.5,'0.08 0.19 0.30');});
      x+=width;
    });
    top-=headerHeight;
    rows.forEach((row,rowIndex)=>{
      const bottom=top-row.height;
      if(rowIndex%2===1)out+='0.985 0.99 0.995 rg '+margin+' '+bottom.toFixed(2)+' '+available+' '+row.height.toFixed(2)+' re f\n';
      out+='0.84 0.88 0.91 RG 0.4 w '+margin+' '+bottom.toFixed(2)+' '+available+' '+row.height.toFixed(2)+' re S\n';
      let cellX=margin;
      widths.forEach((width,index)=>{
        if(index)out+='0.88 0.91 0.94 RG 0.35 w '+cellX.toFixed(2)+' '+bottom.toFixed(2)+' m '+cellX.toFixed(2)+' '+top.toFixed(2)+' l S\n';
        row.lines[index].forEach((line,lineIndex)=>{out+=textCommand(line,cellX+3,top-11-lineIndex*9,layout.boldColumns[index]?'F2':'F1',7.5,'0.10 0.19 0.28');});
        cellX+=width;
      });
      top=bottom;
    });
    if(tablePath)out+='Q 0.80 0.85 0.89 RG 0.55 w '+tablePath+' S\n';
    out+=textCommand('Wooten Oil Co Inc. - Open Invoices',margin,22,'F1',8,'0.38 0.46 0.55');
    out+=textCommand('Page '+(pageIndex+1)+' of '+pageCount,pageWidth/2-22,22,'F2',8,'0.20 0.29 0.38');
    return out;
  }

  async function buildPdf(title,data,onProgress){
    const layout=await preparePdfPages(data,onProgress);
    const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
    const pageIds=[];
    for(let index=0;index<layout.pages.length;index++){
      const rows=layout.pages[index];
      const content=pageContent(title,data.recordCount??data.rows.length,layout,rows,index,layout.pages.length);
      const contentId=objects.length;
      objects.push('<< /Length '+content.length+' >>\nstream\n'+content+'endstream');
      const pageId=objects.length;
      objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+contentId+' 0 R >>');
      pageIds.push(pageId);
      if(index%20===0){onProgress?.(index,layout.pages.length,'Building PDF');await new Promise(resolve=>setTimeout(resolve,0));}
    }
    onProgress?.(layout.pages.length,layout.pages.length,'Building PDF');
    objects[2]='<< /Type /Pages /Count '+pageIds.length+' /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] >>';
    let pdf='%PDF-1.4\n';
    const offsets=[0];
    for(let id=1;id<objects.length;id++){
      offsets[id]=pdf.length;
      pdf+=id+' 0 obj\n'+objects[id]+'\nendobj\n';
    }
    const xref=pdf.length;
    pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
    for(let id=1;id<objects.length;id++)pdf+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
    pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
    return new Blob([pdf],{type:'application/pdf'});
  }


function buildDetail(data){
 const pages=[];let ops='',y=742;
 const text=(value,x,top,size=10,bold=false)=>{ops+='BT /'+(bold?'F2':'F1')+' '+size+' Tf 0.09 0.20 0.30 rg 1 0 0 1 '+x+' '+top+' Tm ('+pdfEscape(value)+') Tj ET\n';};
 const line=(top,x=40,end=572,red=false)=>{ops+=(red?'0.81 0.16 0.18':'0.80 0.85 0.90')+' RG '+(red?2:0.6)+' w '+x+' '+top+' m '+end+' '+top+' l S\n';};
 const footer=()=>{line(48);text(data.updated,40,33,8);pages.push(ops);ops='';};
 const header=()=>{ops+='0.83 0.15 0.19 rg 40 727 30 30 re f\n';ops+='BT /F2 11 Tf 1 1 1 rg 1 0 0 1 45 738 Tm (WO) Tj ET\n';text('WOOTEN OIL CO INC.',80,752,12,true);text('Covington, Tennessee',80,734,8);wrapText(data.title||'Invoice',28,Infinity).forEach((part,i)=>text(part,370,752-i*13,12,true));if(data.number)text(data.number,390,733,16,true);text(String(data.meta).replace(/·/g,'-'),370,716,8);line(703,40,572,true);y=679;};
 const ensure=h=>{if(y-h<72){footer();header();}};
 header();text('Customer',40,y,9);text(data.balanceLabel||'Invoice Remaining balance',390,y,9);y-=20;
 const names=wrapText(data.customer,42,Infinity);for(let i=0;i<names.length;i++){ensure(22);text(names[i],40,y,15,true);if(i===0)text(data.balance,440,y,22,true);y-=20;}
 text(data.account,40,y,9);y-=20;line(y);y-=24;
 function group(g,x,width){
  ensure(30);text(g.title,x,y,11,true);y-=14;
  for(const row of g.rows){const labels=wrapText(row[0],24,Infinity),values=wrapText(row[1],25,Infinity);const h=Math.max(labels.length,values.length)*12+14;ensure(h);const top=y-12;
   labels.forEach((v,i)=>text(v,x,top-i*12,9));values.forEach((v,i)=>text(v,x+width*.50,top-i*12,9,true));y-=h;line(y,x,x+width);
  }
 }
 const top=y;group(data.groups[0],40,250);const leftBottom=y;y=top;group(data.groups[1],322,250);y=Math.min(leftBottom,y)-24;
 if(data.groups[2])group(data.groups[2],322,250);
 for(const note of data.notes||[]){y-=20;for(const part of wrapText(note,105,Infinity)){ensure(14);text(part,40,y,9);y-=13;}}footer();
 const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];const ids=[];
 for(const content of pages){const cid=objects.length;objects.push('<< /Length '+content.length+' >>\nstream\n'+content+'endstream');ids.push(objects.length);objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+cid+' 0 R >>');}
 objects[2]='<< /Type /Pages /Count '+ids.length+' /Kids ['+ids.map(id=>id+' 0 R').join(' ')+'] >>';let pdf='%PDF-1.4\n';const offsets=[0];
 for(let i=1;i<objects.length;i++){offsets[i]=pdf.length;pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const xref=pdf.length;pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return new Blob([pdf],{type:'application/pdf'});
}

window.WootenInvoicePdf={buildDetail,build:(title,headers,rows,customerName='')=>buildPdf(title,{headers,rows,customerName,fullCells:true})};
})();
