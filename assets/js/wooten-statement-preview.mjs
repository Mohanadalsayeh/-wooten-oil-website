/* Ver731: readable names in the native preview and its Save/Download action. */
import {statementBuildCombinedPdf} from './wooten-statement-pdf.mjs?v=494';

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
async function openNamedPreview(popup,pdf,filename,key){
  if(pdf.byteLength>32*1024*1024)throw new Error('This preview is larger than 32 MB. Select fewer customers and preview again.');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pdf)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const response=await fetch('/api/admin/statements/preview-file-ticket',{
    method:'POST',cache:'no-store',headers:{'X-Admin-Key':key,'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({filename,size:pdf.byteLength,sha256})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ticket)throw new Error(data.error||'Update the portal Worker from Ver731, then preview statements again.');
  if(popup.closed)throw new Error('The preview window was closed. Click Preview Statements again to reopen it.');
  const doc=popup.document;
  doc.title=filename;
  doc.body.textContent='Opening '+filename+'…';
  const form=doc.createElement('form');
  form.method='POST';form.enctype='multipart/form-data';
  form.action=new URL('/api/statement-preview/'+encodeURIComponent(filename),window.location.origin).href;
  form.hidden=true;
  const authorization=doc.createElement('input');authorization.type='hidden';authorization.name='ticket';authorization.value=data.ticket;
  const input=doc.createElement('input');input.type='file';input.name='pdf';
  const transfer=new popup.DataTransfer();
  transfer.items.add(new popup.File([pdf],filename,{type:'application/pdf'}));
  input.files=transfer.files;
  form.append(authorization,input);doc.body.append(form);
  // A native response retains Content-Disposition; a blob URL would lose it.
  form.submit();
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
    const accounts=Array.from(window.WootenStatementSelectedAccounts||[]);
    const statementDate=document.getElementById('statementBatchDate').value;
    const customerName=accounts.length===1?window.WootenStatementCustomerName?.(accounts[0])||'':'';
    const paymentCount=Number(document.getElementById('statementPaymentCount').value||0);
    if(!key){window.ensureAdminLoginKey?.('Enter your Admin Import Key to continue.');message('Sign in as an administrator to preview statements.',false);return;}
    if(!accounts.length){message('Select at least one customer.',false);return;}
    if(!statementDate){message('Choose the statement date.',false);return;}

    let fleet;

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
    const controls=Array.from(section.querySelectorAll('input,select,button'));
    const disabled=controls.map(control=>control.disabled);
    controls.forEach(control=>{control.disabled=true;});
    button.dataset.requestPending='true';
    button.setAttribute('aria-busy','true');
    button.textContent='Preparing Preview…';

    try{
      await window.WootenStatementFleet.ready();
      fleet=window.WootenStatementFleet.options('manual',true);
      controls.forEach(control=>{control.disabled=true;});
      const parts=[];
      for(let start=0;start<accounts.length;start+=20){
        const batch=accounts.slice(start,start+20);
        message('Preparing statements '+(start+1)+'–'+(start+batch.length)+' of '+accounts.length+'…');
        const response=await fetch('/api/admin/statements/preview',{
          method:'POST',cache:'no-store',
          headers:{'X-Admin-Key':key,'Content-Type':'application/json','Accept':'application/pdf'},
          body:JSON.stringify({accounts:batch,statement_date:statementDate,payment_count:paymentCount,fleet})
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
      const filename=statementPreviewFilename(accounts,statementDate,customerName);
      await openNamedPreview(popup,pdf,filename,key);
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
