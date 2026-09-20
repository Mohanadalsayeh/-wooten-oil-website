/* Ver530: open the preview directly without a separate preview-links panel. */
import {statementBuildCombinedPdf} from './wooten-statement-pdf.mjs?v=494';

const section=document.getElementById('documentSectionSendStatements');
const button=document.getElementById('statementPreview');
const status=document.getElementById('statementBatchStatus');
let previewUrl='';

function message(text,ok){
  status.textContent=text;
  status.className='status show'+(ok===true?' ok':ok===false?' bad':'');
}

if(section&&button&&status){
  button.addEventListener('click',async()=>{
    if(button.dataset.requestPending==='true')return;
    const send=document.getElementById('statementGenerateSend');
    if(send.dataset.requestPending==='true'||document.getElementById('statementLoadCustomers').disabled){
      message('Please wait for the current operation to finish.',false);return;
    }
    const key=document.getElementById('adminKey').value.trim();
    const accounts=Array.from(window.WootenStatementSelectedAccounts||[]);
    const statementDate=document.getElementById('statementBatchDate').value;
    const paymentCount=Number(document.getElementById('statementPaymentCount').value||0);
    if(!key){window.ensureAdminLoginKey?.('Enter your Admin Import Key to continue.');message('Sign in as an administrator to preview statements.',false);return;}
    if(!accounts.length){message('Select at least one customer.',false);return;}
    if(!statementDate){message('Choose the statement date.',false);return;}

    // Open synchronously so phone browsers can display the finished PDF in a tab.
    let popup=null;
    try{
      popup=window.open('about:blank','_blank');
      if(popup){
        popup.opener=null;
        popup.document.title='Preparing statement preview';
        popup.document.body.textContent='Preparing your statement preview. Nothing is being sent.';
      }
    }catch{try{popup?.close();}catch{}popup=null;}
    if(!popup||popup.closed){
      message('Allow pop-ups for this site, then click Preview Statements again to open your PDF.',false);return;
    }
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}
    const controls=Array.from(section.querySelectorAll('input,select,button'));
    const disabled=controls.map(control=>control.disabled);
    controls.forEach(control=>{control.disabled=true;});
    button.dataset.requestPending='true';
    button.setAttribute('aria-busy','true');
    button.textContent='Preparing Preview…';

    try{
      const parts=[];
      for(let start=0;start<accounts.length;start+=20){
        const batch=accounts.slice(start,start+20);
        message('Preparing statements '+(start+1)+'–'+(start+batch.length)+' of '+accounts.length+'…');
        const response=await fetch('/api/admin/statements/preview',{
          method:'POST',cache:'no-store',
          headers:{'X-Admin-Key':key,'Content-Type':'application/json','Accept':'application/pdf'},
          body:JSON.stringify({accounts:batch,statement_date:statementDate,payment_count:paymentCount})
        });
        if(!response.ok){
          const data=await response.json().catch(()=>({}));
          throw new Error(data.error||'The statement preview could not be completed.');
        }
        if(!String(response.headers.get('Content-Type')||'').includes('application/pdf')||Number(response.headers.get('X-Statement-Customer-Count'))!==batch.length){
          throw new Error('The preview did not include every selected customer. Please try again.');
        }
        parts.push(new Uint8Array(await response.arrayBuffer()));
        button.textContent='Preparing Preview… '+(start+batch.length)+' / '+accounts.length;
      }
      const pdf=statementBuildCombinedPdf(parts);
      previewUrl=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'}));
      if(popup.closed)throw new Error('The preview window was closed. Click Preview Statements again to reopen it.');
      try{popup.location.replace(previewUrl);}catch{throw new Error('The preview window could not open the PDF. Allow pop-ups for this site, then click Preview Statements again.');}
      message('Preview ready: '+accounts.length+' customer statement'+(accounts.length===1?'':'s')+' in one PDF. Nothing has been sent.',true);
    }catch(error){
      try{if(popup&&!popup.closed)popup.close();}catch{}
      message(error.message||'The statement preview could not be completed.',false);
    }finally{
      controls.forEach((control,index)=>{control.disabled=disabled[index];});
      delete button.dataset.requestPending;
      button.removeAttribute('aria-busy');
      button.textContent='Preview Statements';
      button.disabled=!(window.WootenStatementSelectedAccounts?.size);
    }
  });
}
