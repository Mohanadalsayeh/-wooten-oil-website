(function(){
  const form=document.getElementById('fuelRequestForm');
  const overlay=document.getElementById('fuelSendOverlay');
  const yes=document.getElementById('fuelSentYes');
  const no=document.getElementById('fuelSentNo');
  const title=document.getElementById('fuelSendTitle');
  const msg=document.getElementById('fuelSendMessage');
  const status=document.getElementById('fuelSendStatus');
  if(!form) return;

  const FORM_ENDPOINT='/api/fuel-request';
  let pendingRequest=null;

  const value=id=>document.getElementById(id).value.trim();

  function newRequestNumber(){
    const now=new Date();
    const date=String(now.getFullYear()).slice(-2)+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0');
    const random=Math.floor(1000+Math.random()*9000);
    return 'WO-'+date+'-'+random;
  }

  function closeOverlay(){
    overlay.classList.remove('show');
  }

  function showConfirmation(request){
    title.textContent='Ready to Submit Your Fuel Request?';
    msg.innerHTML='Please confirm that you want to send this fuel request directly to Wooten Oil.<div class="tracking-number-box"><small>Request Number</small><strong>'+request.requestNumber+'</strong></div>';
    yes.textContent='Yes, Submit Request';
    yes.disabled=false;
    yes.style.display='inline-flex';
    no.textContent='Cancel';
    no.style.display='inline-flex';
    if(status) status.textContent='Your request will be sent directly from this website. No personal email app is required.';
    overlay.dataset.stage='confirm';
    overlay.classList.add('show');
  }

  function showSending(){
    title.textContent='Sending Fuel Request…';
    msg.innerHTML='Please keep this page open while your request is being submitted to Wooten Oil.';
    yes.disabled=true;
    yes.textContent='Sending…';
    no.style.display='none';
    if(status) status.textContent='Submitting request securely…';
    overlay.dataset.stage='sending';
  }

  function showSuccess(requestNumber,warning){
    title.textContent='Fuel Request Submitted Successfully';
    msg.innerHTML='Thank you for contacting Wooten Oil. Your fuel request has been submitted. Please save this request number for your records.<div class="tracking-number-box"><small>Request Number</small><strong>'+requestNumber+'</strong></div>';
    yes.style.display='none';
    yes.disabled=false;
    no.style.display='inline-flex';
    no.textContent='Done';
    if(status) status.textContent=warning||"Your request was received by Wooten Oil's website system and the email notification was sent.";
    overlay.dataset.stage='complete';
    var customerAccount=document.getElementById('fuelCustomerAccount');
    if(customerAccount && customerAccount.value && window.wootenAddCustomerNotification){
      window.wootenAddCustomerNotification(
        customerAccount.value,
        'Fuel Request Submitted',
        'Your fuel request '+requestNumber+' was received by Wooten Oil.'
      );
    }
    form.reset();
    pendingRequest=null;
  }

  function showError(message){
    title.textContent='Request Could Not Be Sent';
    msg.innerHTML='We could not submit your fuel request right now. Your information is still on the form, so you can try again.';
    yes.style.display='inline-flex';
    yes.disabled=false;
    yes.textContent='Try Again';
    no.style.display='inline-flex';
    no.textContent='Close';
    if(status) status.textContent=message || 'Please check your internet connection and try again.';
    overlay.dataset.stage='error';
  }

  async function sendRequest(request){
    showSending();
    const payload={
      requestNumber:request.requestNumber,
      customerAccountNumber:request.customerAccountNumber || '',
      customerName:request.customerName,
      phone:request.phone,
      email:request.email || '',
      deliveryAddress:request.deliveryAddress,
      fuelType:request.fuelType,
      gallons:request.gallons,
      deliveryDate:request.deliveryDate || '',
      notes:request.notes || '',
      submittedFrom:window.location.href
    };

    try{
      const fetchRequest=window.wootenCustomerFetch||window.fetch.bind(window);
      const response=await fetchRequest(FORM_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(payload)
      });
      let data={};
      try{ data=await response.json(); }catch(err){}
      if(!response.ok || data.success===false){
        throw new Error(data.error || data.message || 'Wooten Oil server returned an error.');
      }
      showSuccess(request.requestNumber,data.warning||'');
    }catch(err){
      console.error('Fuel request submission failed:',err);
      showError('The request was not confirmed as sent. Please try again.');
    }finally{
      if(overlay.dataset.stage==='sending'){
        showError('The request was not confirmed as sent. Please try again.');
      }
    }
  }

  form.addEventListener('submit',function(e){
    e.preventDefault();
    if(!form.reportValidity()) return;
    pendingRequest={
      requestNumber:newRequestNumber(),
      customerAccountNumber:value('fuelCustomerAccount'),
      customerName:value('customerName'),
      phone:value('phone'),
      email:value('email'),
      deliveryAddress:value('deliveryAddress'),
      fuelType:value('fuelType'),
      gallons:value('gallons'),
      deliveryDate:value('deliveryDate'),
      notes:value('notes')
    };
    showConfirmation(pendingRequest);
  });

  if(yes) yes.addEventListener('click',function(){
    if(overlay.dataset.stage==='confirm' && pendingRequest){
      sendRequest(pendingRequest);
    }else if(overlay.dataset.stage==='error' && pendingRequest){
      sendRequest(pendingRequest);
    }
  });

  if(no) no.addEventListener('click',function(){
    if(overlay.dataset.stage==='sending') return;
    closeOverlay();
    if(overlay.dataset.stage==='confirm' || overlay.dataset.stage==='complete') pendingRequest=null;
  });
})();
