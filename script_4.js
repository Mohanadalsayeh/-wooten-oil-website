
(function(){
  const sectionButtons=Array.from(document.querySelectorAll('[data-document-section]'));
  const customerDocumentsSection=document.getElementById('documentSectionCustomerDocuments');
  const sendStatementsSection=document.getElementById('documentSectionSendStatements');
  const statementSchedulingSection=document.getElementById('documentSectionStatementScheduling');
  sectionButtons.forEach(button=>button.addEventListener('click',function(){
    const section=button.dataset.documentSection;
    customerDocumentsSection.hidden=section!=='customer-documents';
    sendStatementsSection.hidden=section!=='send-statements';
    if(statementSchedulingSection)statementSchedulingSection.hidden=section!=='statement-scheduling';
    sectionButtons.forEach(item=>item.setAttribute('aria-selected',item===button?'true':'false'));
    if(section==='statement-scheduling'&&typeof window.loadStatementScheduling==='function')window.loadStatementScheduling();
  }));
  const account=document.getElementById('docAccount');
  const type=document.getElementById('docType');
  const date=document.getElementById('docDate');
  const title=document.getElementById('docTitle');
  const file=document.getElementById('docFile');
  const upload=document.getElementById('docUploadBtn');
  const load=document.getElementById('docLoadBtn');
  const status=document.getElementById('docStatus');
  const meta=document.getElementById('docCustomerMeta');
  const list=document.getElementById('docList');
  const portalNotification=document.getElementById('docPortalNotification');
  const emailPdf=document.getElementById('docEmailPdf');
  const smsLink=document.getElementById('docSmsLink');
  if(!account||!upload||!load||!status||!list) return;

  function normalize(v){
    let s=String(v||'').replace(/\D/g,'');
    return s?s.padStart(7,'0'):'';
  }
  function setStatus(message,ok){
    status.className='status show '+(ok===true?'ok':ok===false?'bad':'');
    status.textContent=message||'';
  }
  function formatDate(v){
    if(!v) return 'No date';
    try{
      const d=/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(v+'T12:00:00'):new Date(v);
      return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    }catch{return v;}
  }
  function formatSize(n){
    n=Number(n||0);
    if(n<1024) return n+' B';
    if(n<1024*1024) return (n/1024).toFixed(1)+' KB';
    return (n/(1024*1024)).toFixed(1)+' MB';
  }
  function render(data){
    const docs=Array.isArray(data.documents)?data.documents:[];
    list.innerHTML='';
    if(data.customer){
      meta.style.display='block';
      meta.textContent=(data.customer.account_name||'Customer')+' • Customer # '+(data.customer.account_number||'');
    }
    if(!docs.length){
      const empty=document.createElement('div');
      empty.className='doc-admin-empty';
      empty.textContent='No statements or invoices have been uploaded for this customer.';
      list.appendChild(empty);
      return;
    }
    docs.forEach(d=>{
      const row=document.createElement('div'); row.className='doc-admin-row';
      const badge=document.createElement('div'); badge.className='doc-admin-badge'; badge.textContent=d.document_type||'document';
      const main=document.createElement('div'); main.className='doc-admin-main';
      const strong=document.createElement('strong'); strong.textContent=d.title||d.filename||'Document';
      const small=document.createElement('small');
      small.appendChild(document.createTextNode(formatDate(d.document_date||d.created_at)+' • '+formatSize(d.size_bytes)+' • '));
      const filenameLink=document.createElement('button');
      filenameLink.type='button';
      filenameLink.className='communication-pdf-link';
      filenameLink.textContent=d.filename||'PDF';
      filenameLink.addEventListener('click',function(){openAdminDocument(d.id);});
      small.appendChild(filenameLink);
      main.append(strong,small);
      const actions=document.createElement('div');
      actions.className='doc-admin-actions';

      const id=document.createElement('small');
      id.textContent='Document #'+d.id;
      actions.append(id);

      row.append(badge,main,actions); list.appendChild(row);
    });
  }

  async function openAdminDocument(id){
    const key=document.getElementById('adminKey').value.trim();
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');setStatus('Enter your Admin Import Key in the Admin Login window first.',false);return;}

    const popup=window.open('about:blank','_blank');
    try{
      const res=await fetch('/api/admin/customer-documents/'+encodeURIComponent(id)+'/file',{
        method:'GET',
        headers:{'X-Admin-Key':key},
        cache:'no-store'
      });
      if(!res.ok) throw new Error(await res.text()||'Document could not be opened.');
      const blob=await res.blob();
      const url=URL.createObjectURL(blob);
      if(popup) popup.location=url;
      else window.location.href=url;
      setTimeout(function(){URL.revokeObjectURL(url);},60000);
    }catch(e){
      if(popup) popup.close();
      setStatus(e.message||'Document could not be opened.',false);
    }
  }
  window.openAdminCustomerDocument=openAdminDocument;

  async function loadDocs(){
    const key=document.getElementById('adminKey').value.trim();
    const acct=normalize(account.value);
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');setStatus('Enter your Admin Import Key in the Admin Login window first.',false);return;}
    if(!acct){setStatus('Enter a valid Customer Number.',false);return;}
    account.value=acct;
    setStatus('Loading customer documents…');
    try{
      const res=await fetch('/api/admin/customer-documents?account_number='+encodeURIComponent(acct),{
        headers:{'X-Admin-Key':key,'Accept':'application/json'},cache:'no-store'
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.success===false) throw new Error(data.error||'Documents could not be loaded.');
      render(data); setStatus(data.documents.length+' document(s) found.',true);
    }catch(e){setStatus(e.message||'Documents could not be loaded.',false);}
  }
  load.addEventListener('click',loadDocs);

  upload.addEventListener('click',async()=>{
    const key=document.getElementById('adminKey').value.trim();
    const acct=normalize(account.value);
    const selected=file.files&&file.files[0];
    if(!key){window.ensureAdminLoginKey('Enter your Admin Import Key to continue.');setStatus('Enter your Admin Import Key in the Admin Login window first.',false);return;}
    if(!acct){setStatus('Enter a valid Customer Number.',false);return;}
    if(!selected){setStatus('Choose a PDF statement or invoice.',false);return;}
    if(!portalNotification.checked&&!emailPdf.checked&&!smsLink.checked){setStatus('Select at least one Sending Option.',false);return;}
    if(selected.size>10*1024*1024){setStatus('PDF files must be 10 MB or smaller.',false);return;}
    account.value=acct; upload.disabled=true; upload.textContent='Uploading…';
    try{
      const fd=new FormData();
      fd.append('account_number',acct);
      fd.append('document_type',type.value);
      fd.append('document_date',date.value||'');
      fd.append('title',title.value||'');
      fd.append('portal_notification',portalNotification.checked?'1':'0');
      fd.append('email_pdf',emailPdf.checked?'1':'0');
      fd.append('sms_link',smsLink.checked?'1':'0');
      fd.append('file',selected,selected.name);
      const res=await fetch('/api/admin/customer-documents/upload',{
        method:'POST',headers:{'X-Admin-Key':key},body:fd
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.success===false) throw new Error(data.error||'Upload failed.');
      setStatus(data.message||'Document uploaded successfully.',true);
      file.value=''; title.value='';
      await loadDocs();
    }catch(e){setStatus(e.message||'Upload failed.',false);}
    finally{upload.disabled=false;upload.textContent='Upload Document';}
  });
})();
