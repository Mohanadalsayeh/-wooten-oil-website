/* Ver736: every preview uses a new in-portal document, including Windows browser tabs. */
import {statementBuildCombinedPdf} from './wooten-statement-pdf.mjs?v=494';
import {openStatementAppPreview} from './wooten-statement-app-preview.mjs?v=736';

const section=document.getElementById('documentSectionSendStatements');
const button=document.getElementById('statementPreview');
const status=document.getElementById('statementBatchStatus');
function filenamePart(value,length=60){
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,length).replace(/-+$/g,'');
}
export function statementPreviewFilename(accounts,statementDate,customerName=''){
  const parts=String(statementDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!parts)throw new Error('Choose the statement date.');
  const date=parts[2]+parts[3]+parts[1];
  if(accounts.length===1){
    const customer=[filenamePart(customerName),filenamePart(accounts[0],24)].filter(Boolean).join('-');
    return 'Wooten-Oil-Statement-Preview-'+customer+'-'+date+'.pdf';
  }
  return 'Wooten-Oil-Statements-Preview-'+accounts.length+'-Customers-'+date+'.pdf';
}

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
    const accounts=Array.from(window.WootenStatementGetSelectedAccounts?.()||window.WootenStatementSelectedAccounts||[]).map(String);
    const requestId=crypto.randomUUID();
    const statementDate=document.getElementById('statementBatchDate').value;
    const customerName=accounts.length===1?window.WootenStatementCustomerName?.(accounts[0])||'':'';
    const paymentCount=Number(document.getElementById('statementPaymentCount').value||0);
    if(!key){window.ensureAdminLoginKey?.('Enter your Admin Import Key to continue.');message('Sign in as an administrator to preview statements.',false);return;}
    if(!accounts.length){message('Select at least one customer.',false);return;}
    if(!statementDate){message('Choose the statement date.',false);return;}

    let fleet;

    const appPreview=openStatementAppPreview(button);
    const controls=Array.from(section.querySelectorAll('input,select,button'));
    const disabled=controls.map(control=>control.disabled);
    controls.forEach(control=>{control.disabled=true;});
    button.dataset.requestPending='true';
    button.setAttribute('aria-busy','true');
    button.textContent='Preparing Preview…';

    try{
      await window.WootenStatementFleet.ready();
      if(appPreview?.closed)return;
      fleet=window.WootenStatementFleet.options('manual',true);
      controls.forEach(control=>{control.disabled=true;});
      const parts=[];
      for(let start=0;start<accounts.length;start+=20){
        const batch=accounts.slice(start,start+20);
        const preparing='Preparing statements '+(start+1)+'–'+(start+batch.length)+' of '+accounts.length+'…';
        message(preparing);appPreview?.message(preparing);
        const response=await fetch('/api/admin/statements/preview?preview='+encodeURIComponent(requestId),{
          method:'POST',cache:'no-store',signal:appPreview?.signal,
          headers:{'X-Admin-Key':key,'Content-Type':'application/json','Accept':'application/pdf'},
          body:JSON.stringify({accounts:batch,statement_date:statementDate,payment_count:paymentCount,fleet,preview_request_id:requestId})
        });
        if(!response.ok){
          const data=await response.json().catch(()=>({}));
          throw new Error(data.error||'The statement preview could not be completed.');
        }
        if(!String(response.headers.get('Content-Type')||'').includes('application/pdf')||Number(response.headers.get('X-Statement-Customer-Count'))!==batch.length){
          throw new Error('The preview did not include every selected customer. Please try again.');
        }
        const returnedId=response.headers.get('X-Statement-Preview-Id');
        const returnedAccounts=response.headers.get('X-Statement-Accounts');
        if(!returnedId||!returnedAccounts)throw new Error('Upload the Ver733 Worker update, then preview statements again.');
        if(returnedId!==requestId||returnedAccounts!==batch.join(',')){
          throw new Error('The returned preview does not match the selected customers. No PDF was opened. Please try again.');
        }
        parts.push(new Uint8Array(await response.arrayBuffer()));
        button.textContent='Preparing Preview… '+(start+batch.length)+' / '+accounts.length;
      }
      const pdf=statementBuildCombinedPdf(parts);
      if(pdf.byteLength>32*1024*1024)throw new Error('This preview is larger than 32 MB. Select fewer customers and preview again.');
      const filename=statementPreviewFilename(accounts,statementDate,customerName);
      if(appPreview.closed)return;
      const selectionLabel=accounts.length===1?((customerName?customerName+' · ':'')+'Customer # '+accounts[0]):accounts.length+' selected customers';
      await appPreview.show(pdf,filename,selectionLabel);
      if(appPreview.closed)return;
      message('Preview ready: '+(accounts.length===1?((customerName?customerName+' — ':'')+'Customer # '+accounts[0]):accounts.length+' customer statements in one PDF')+'. Nothing has been sent.',true);
    }catch(error){
      if(!appPreview?.closed){
        const text=error.message||'The statement preview could not be completed.';
        message(text,false);appPreview?.message(text);
      }
    }finally{
      controls.forEach((control,index)=>{control.disabled=disabled[index];});
      delete button.dataset.requestPending;
      button.removeAttribute('aria-busy');
      button.textContent='Preview Statements';
      button.disabled=!(window.WootenStatementSelectedAccounts?.size);
      if(appPreview?.closed){message('Preview closed. Your customer selection is unchanged.');button.focus({preventScroll:true});}
    }
  });
}
