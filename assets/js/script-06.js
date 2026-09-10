/* Global Payments external checkout. Card details stay on the hosted page. */
(function(){
  'use strict';
  var full=document.getElementById('payFullBalance');
  var partial=document.getElementById('payPartialBalance');
  var row=document.getElementById('partialPaymentRow');
  var amount=document.getElementById('partialPaymentAmount');
  var button=document.getElementById('portalPaymentContinue');
  var message=document.getElementById('portalPaymentMessage');
  var secure=document.getElementById('portalSecurePayment');
  var secureAmount=document.getElementById('portalSecurePaymentAmount');
  var result=document.getElementById('portalPaymentResult');
  var check=document.getElementById('portalPaymentCheck');
  var resume=document.getElementById('portalPaymentResume');
  if(!full||!partial||!row||!button||!message||!secure||!check||!resume)return;
  var busy=false,checking=false,statusUnavailable=false,currentAccount='',generation=0,payment=null,announced='';
  var returnId=new URL(window.location.href).searchParams.get('payment_return')||'';
  if(!/^[0-9a-f-]{36}$/i.test(returnId))returnId='';
  function setMessage(text,state){
    message.textContent=text||'';
    message.className='payment-coming-soon'+(text?' show':'')+(state?' '+state:'');
  }
  function setBusy(value){
    busy=value;
    button.disabled=value||checking||statusUnavailable||Boolean(payment&&payment.active);
    button.setAttribute('aria-busy',value?'true':'false');
    button.textContent=value?'Opening Secure Payment…':'Continue to Secure Payment';
    full.disabled=partial.disabled=value||Boolean(payment&&payment.active);
    if(amount)amount.disabled=value||Boolean(payment&&payment.active);
  }
  function safeUrl(value,environment){
    var url=new URL(value);
    var origin=environment==='production'?'https://apis.globalpay.com':'https://apis.sandbox.globalpay.com';
    if(url.origin!==origin||url.username||url.password||url.pathname.indexOf('/ucp/')!==0)throw new Error('The secure payment address could not be verified.');
    return url.href;
  }
  async function requestJson(url,options){
    var response=await fetch(url,Object.assign({credentials:'same-origin',cache:'no-store'},options||{}));
    var data=await response.json().catch(function(){return {};});
    if(!response.ok||!data||data.success!==true){
      var error=new Error((data&&data.error)||'Your payment status could not be checked.');
      error.status=response.status;error.payment=data&&data.payment;throw error;
    }
    return data;
  }
  function renderPayment(data){
    payment=data||null;
    secure.hidden=!payment;resume.hidden=true;resume.removeAttribute('href');setBusy(false);
    if(!payment)return;
    secureAmount.textContent='$'+payment.amount;
    var text='',state='processing',test=payment.environment==='sandbox';
    if(payment.status==='captured'){
      text=(test?'Sandbox test payment approved. No live payment was collected. ':'Payment received. ')+
        'Confirmation '+payment.reference+' for $'+payment.amount+'.'+
        (test?'':' Your account balance may take up to 24 business hours to update.');
      state='success';
      if(announced!==payment.payment_intent_id){
        announced=payment.payment_intent_id;
        window.dispatchEvent(new CustomEvent('wooten:payment-completed',{detail:payment}));
      }
    }else if(payment.active){
      text=payment.verification_pending
        ?'The saved payment link is awaiting verification. No successful payment has been confirmed. Please do not start another payment. We will keep checking even if you close this page.'
        :payment.last_attempt_declined
          ?'The last card attempt was declined. You can return to the same secure payment page to try again.'
          :payment.redirect_url
            ?'You have an earlier saved checkout. Use Resume Secure Payment to continue it. No successful payment has been confirmed.'
            :payment.pending_reason==='transaction_unresolved'
              ?'An earlier checkout is awaiting a final transaction result from Global Payments. No successful payment has been confirmed.'
              :payment.pending_reason==='transaction_record_missing'
                ?'Global Payments reports prior use of an earlier payment link, but we have not confirmed a successful payment. We are checking its payment record.'
                :payment.pending_reason==='link_closing'
                  ?'An earlier payment link is closing or has expired. We are checking for a payment before allowing a new checkout.'
                  :'An earlier saved checkout is still unresolved. No successful payment has been confirmed.';
      if(!payment.redirect_url&&!payment.verification_pending&&!payment.last_attempt_declined){
        text+=' Opening this form does not start a new payment. We will keep checking even if you close this page. Please do not start another payment.';
      }
      if(payment.redirect_url){resume.href=safeUrl(payment.redirect_url,payment.environment);resume.hidden=false;}
      if(test)text+=' Sandbox: use a test card only.';
      if(test&&!payment.redirect_url&&payment.verification_detail)text+=' Verification detail: '+payment.verification_detail;
    }else{
      state=payment.status==='declined'||payment.status==='failed'?'error':'processing';
      text=payment.status==='declined'?'This payment attempt was declined and the payment link is closed.':
        payment.status==='canceled'?'The processor confirmed that this payment link is inactive and unpaid.':
        payment.status==='expired'?'This payment link expired without a confirmed payment.':
        'The secure payment link could not be opened. You can start a new payment.';
    }
    result.textContent=text;result.className='portal-payment-result show '+state;
  }
  async function refreshStatus(){
    if(busy||checking||!currentAccount)return;
    checking=true;check.disabled=true;setBusy(false);var ticket=generation;
    try{
      var data=await requestJson('/api/customer/payment/status'+(returnId?'?id='+encodeURIComponent(returnId):''));
      if(ticket!==generation)return;
      if(!data.payment&&returnId){returnId='';data=await requestJson('/api/customer/payment/status');}
      if(ticket!==generation)return;
      statusUnavailable=false;
      renderPayment(data.payment);
      if(returnId&&data.payment){
        returnId='';
        var url=new URL(window.location.href);url.searchParams.delete('payment_return');
        window.history.replaceState(null,'',url.pathname+url.search+url.hash);
        window.dispatchEvent(new CustomEvent('wooten:payment-show'));
      }
    }catch(error){
      if(ticket===generation&&error.status!==401){
        statusUnavailable=true;setBusy(false);setMessage(error.message,'error');
        secure.hidden=false;secureAmount.textContent=payment?'$'+payment.amount:'';
        resume.hidden=true;resume.removeAttribute('href');
        result.className='portal-payment-result show processing';
        result.textContent='Please check the payment status again before continuing.';
      }
    }finally{
      checking=false;check.disabled=false;setBusy(busy);
      if(ticket!==generation&&currentAccount)refreshStatus();
    }
  }
  async function beginPayment(){
    if(busy||checking||statusUnavailable||(payment&&payment.active))return;
    var value=String(amount&&amount.value||'').trim(),paymentType=partial.checked?'partial':'full';
    if(paymentType==='partial'&&(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)<1)){
      setMessage('Please enter a partial payment amount of at least $1.00.','error');amount.focus();return;
    }
    var ticket=generation;
    setBusy(true);setMessage('Opening the Global Payments secure payment page…','processing');
    try{
      var data=await requestJson('/api/customer/payment/session',{
        method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},
        body:JSON.stringify({payment_type:paymentType,amount:paymentType==='partial'?value:undefined})
      });
      if(ticket!==generation)return;
      renderPayment(data);setBusy(true);
      window.location.assign(safeUrl(data.redirect_url,data.environment));
    }catch(error){
      if(ticket!==generation)return;
      setMessage(error.message,'error');
      if(error.payment){statusUnavailable=false;renderPayment(error.payment);}
      else{
        // A lost response may still have created a link. Read the saved status
        // before enabling another submission or showing an old failed attempt.
        statusUnavailable=true;setBusy(false);
        await refreshStatus();
      }
    }
  }
  function choiceChanged(){
    row.classList.toggle('show',partial.checked);
    if(partial.checked&&amount)amount.focus();
    setMessage('','');
  }
  full.addEventListener('change',choiceChanged);
  partial.addEventListener('change',choiceChanged);
  button.addEventListener('click',beginPayment);
  check.addEventListener('click',refreshStatus);
  window.addEventListener('wooten:payment-account',function(event){
    var account=String(event.detail&&event.detail.account_number||'');
    if(account!==currentAccount){generation++;currentAccount=account;payment=null;announced='';statusUnavailable=false;secure.hidden=true;setMessage('','');setBusy(false);}
    refreshStatus();
  });
  window.addEventListener('pageshow',function(){setBusy(false);refreshStatus();});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)refreshStatus();});
  window.setInterval(function(){if(!document.hidden&&(statusUnavailable||(payment&&payment.active)))refreshStatus();},30000);
})();
