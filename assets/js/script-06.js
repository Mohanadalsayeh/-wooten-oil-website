/* Embedded Global Payments card checkout for the customer portal. */
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
  var formHost=document.getElementById('globalPaymentsCardForm');
  var cancel=document.getElementById('portalPaymentCancel');
  var result=document.getElementById('portalPaymentResult');
  if(!full||!partial||!row||!button||!message||!secure||!formHost)return;

  var gpForm=null;
  var activeIntent='';
  var processing=false;
  var libraryPromise=null;

  function setMessage(text,state){
    message.textContent=text||'';
    message.className='payment-coming-soon'+(text?' show':'')+(state?' '+state:'');
  }
  function setResult(text,state){
    if(!result)return;
    result.textContent=text||'';
    result.className='portal-payment-result'+(text?' show':'')+(state?' '+state:'');
  }
  function setBusy(busy,label){
    button.disabled=!!busy;
    button.setAttribute('aria-busy',busy?'true':'false');
    button.textContent=label||(busy?'Preparing Secure Payment…':'Continue to Secure Payment');
    full.disabled=!!busy;
    partial.disabled=!!busy;
    if(amount)amount.disabled=!!busy;
  }
  function disposeForm(){
    try{if(gpForm&&typeof gpForm.dispose==='function')gpForm.dispose();}catch(e){}
    gpForm=null;
    formHost.innerHTML='';
  }
  function closeSecurePayment(){
    disposeForm();
    activeIntent='';
    processing=false;
    secure.hidden=true;
    setResult('','');
    setBusy(false);
  }
  function updatePaymentChoice(){
    if(partial.checked){
      row.classList.add('show');
      setTimeout(function(){if(amount)amount.focus();},50);
    }else{
      row.classList.remove('show');
      if(amount)amount.value='';
    }
    closeSecurePayment();
    setMessage('','');
  }
  function loadGlobalPayments(){
    if(window.GlobalPayments)return Promise.resolve(window.GlobalPayments);
    if(libraryPromise)return libraryPromise;
    libraryPromise=new Promise(function(resolve,reject){
      var script=document.createElement('script');
      script.src='https://js.globalpay.com/4.1.11/globalpayments.js';
      script.async=true;
      script.onload=function(){window.GlobalPayments?resolve(window.GlobalPayments):reject(new Error('Secure payment library did not initialize.'));};
      script.onerror=function(){reject(new Error('Secure payment library could not be loaded.'));};
      document.head.appendChild(script);
    }).catch(function(error){libraryPromise=null;throw error;});
    return libraryPromise;
  }
  async function requestJson(url,options){
    var response=await fetch(url,Object.assign({credentials:'same-origin',cache:'no-store'},options||{}));
    var data=await response.json().catch(function(){return {};});
    if(!response.ok||data.success===false){
      var error=new Error(data.error||'The payment request could not be completed.');
      error.status=response.status;
      error.diagnostic=data.diagnostic||'';
      if(error.diagnostic)console.error('Wooten payment diagnostic:',error.diagnostic);
      throw error;
    }
    return data;
  }
  async function chargePayment(paymentReference){
    if(processing||!activeIntent)return;
    processing=true;
    setBusy(true,'Processing Payment…');
    setResult('Your payment is processing. Please do not close this page or submit another payment.','processing');
    if(cancel)cancel.disabled=true;
    try{
      var data=await requestJson('/api/customer/payment/charge',{
        method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},
        body:JSON.stringify({payment_intent_id:activeIntent,payment_reference:paymentReference})
      });
      disposeForm();
      setResult('Payment approved. Confirmation '+(data.reference||data.transaction_id||'received')+' for $'+data.amount+'. Your account balance may take up to 24 business hours to update.','success');
      setMessage('Payment submitted successfully.','success');
      window.dispatchEvent(new CustomEvent('wooten:payment-completed',{detail:data}));
      activeIntent='';
    }catch(error){
      disposeForm();
      activeIntent='';
      var text=error.message||'The payment could not be completed.';
      setResult(error.diagnostic?text+' ['+error.diagnostic+']':text,'error');
      setMessage(text,'error');
    }finally{
      processing=false;
      if(cancel)cancel.disabled=false;
      setBusy(false);
    }
  }
  function stylePortalCardForm(form){
    // Parent rules style labels/layout. The SDK sends field rules into its
    // hosted iframes; no card data or iframe document is accessed here.
    if(!document.getElementById('wooten-secure-card-theme')){
      var sheet=document.createElement('style');
      sheet.id='wooten-secure-card-theme';
      sheet.textContent=[
        '#globalPaymentsCardForm{font-family:inherit;gap:0;}',
        '#globalPaymentsCardForm .sandbox-warning{background:#fff8e7!important;border:1px solid #ecd99d;border-radius:12px;padding:13px 14px!important;color:#6b5318!important;font-family:inherit!important;font-size:.84rem!important;font-weight:400!important;line-height:1.5;text-align:left!important;margin-bottom:5px!important;}',
        '#globalPaymentsCardForm label{font-family:inherit;font-size:15px;font-weight:700;color:#4e5c6d;margin:16px 0 8px;}',
        '#globalPaymentsCardForm iframe{min-height:54px!important;height:54px!important;display:block;border:0;}',
        '#globalPaymentsCardForm .credit-card-submit{margin:20px 0 16px;}',
        '#globalPaymentsCardForm .credit-card-card-cvv iframe{width:calc(100% - 40px);}',
        '#globalPaymentsCardForm .tooltip{width:32px;height:48px;border:1px solid #d6dde5;border-radius:11px;margin:2px 0 0 6px;color:#53606d;box-sizing:border-box;}',
        '@media(min-width:800px){#globalPaymentsCardForm .credit-card-card-expiration,#globalPaymentsCardForm .credit-card-card-cvv{flex:1 1 0;min-width:0;}#globalPaymentsCardForm .credit-card-card-expiration{margin-right:10px;}#globalPaymentsCardForm .credit-card-card-cvv{margin-left:10px;}}',
        '@media(max-width:799px){#globalPaymentsCardForm .credit-card-card-expiration,#globalPaymentsCardForm .credit-card-card-cvv{flex:1 1 100%;margin-left:0;margin-right:0;}}'
      ].join('\n');
      document.head.appendChild(sheet);
    }
    var font=window.getComputedStyle(amount||button).fontFamily;
    form.ready(function(){
      if(form!==gpForm)return;
      form.addStylesheet({
        '#secure-payment-field':{'box-sizing':'border-box','width':'calc(100% - 4px)','height':'48px','margin':'2px','padding':'0 13px','border':'1px solid #d6dde5','border-radius':'11px','background-color':'#ffffff','font-family':font,'font-size':'16px','font-weight':'500','color':'#182331','transition':'border-color .15s ease, box-shadow .15s ease'},
        '#secure-payment-field:hover':{'border-color':'#a7b6c7'},
        '#secure-payment-field:focus':{'border-color':'#294866','box-shadow':'0 0 0 2px rgba(41,72,102,.14)','outline':'none'},
        '#secure-payment-field::placeholder':{'color':'#7a8694','opacity':'1'},
        '#secure-payment-field.card-number, #secure-payment-field.card-cvv':{'padding-right':'42px'},
        '#secure-payment-field[type=button]':{'height':'48px','width':'calc(100% - 4px)','margin':'2px','border':'1px solid #bd1e2d','border-radius':'11px','background-color':'#bd1e2d','color':'#ffffff','font-family':font,'font-size':'16px','font-weight':'600','text-transform':'none','padding':'10px 14px','cursor':'pointer'},
        '#secure-payment-field[type=button]:hover':{'background-color':'#a91926','border-color':'#a91926'},
        '#secure-payment-field[type=button]:focus':{'border-color':'#294866','box-shadow':'0 0 0 2px rgba(41,72,102,.2)','outline':'none'},
        '#secure-payment-field[type=button]:disabled':{'opacity':'.6','cursor':'not-allowed'}
      });
    });
  }
  function mountCardForm(session){
    disposeForm();
    window.GlobalPayments.configure({accessToken:session.access_token,apiVersion:'2021-03-22',env:session.environment==='production'?'production':'sandbox'});
    gpForm=window.GlobalPayments.creditCard.form('#globalPaymentsCardForm',{style:'gp-default',amount:session.amount,enableSavedPaymentMethods:false});
    stylePortalCardForm(gpForm);
    gpForm.on('token-success',function(response){
      var reference=response&&response.paymentReference;
      if(!reference){setResult('The card could not be secured. Please try again.','error');return;}
      chargePayment(reference);
    });
    gpForm.on('token-error',function(){setResult('Please check the card details and try again. No payment has been submitted.','error');});
  }
  async function beginPayment(){
    if(processing)return;
    var paymentType=partial.checked?'partial':'full';
    var value=String(amount&&amount.value||'').trim();
    if(paymentType==='partial'&&(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)<1)){
      setMessage('Please enter a partial payment amount of at least $1.00.','error');
      if(amount)amount.focus();
      return;
    }
    closeSecurePayment();
    setBusy(true);
    setMessage('Preparing the secure card form…','processing');
    try{
      var session=await requestJson('/api/customer/payment/session',{
        method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},
        body:JSON.stringify({payment_type:paymentType,amount:paymentType==='partial'?value:undefined})
      });
      await loadGlobalPayments();
      activeIntent=session.payment_intent_id;
      secure.hidden=false;
      if(secureAmount)secureAmount.textContent='$'+session.amount;
      setResult('','');
      mountCardForm(session);
      setMessage('Enter your card details below. Card information is sent directly to Global Payments.','success');
      secure.scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(error){
      closeSecurePayment();
      var text=error.message||'The secure payment form could not be started.';
      setMessage(error.diagnostic?text+' ['+error.diagnostic+']':text,'error');
    }finally{setBusy(false);}
  }

  full.addEventListener('change',updatePaymentChoice);
  partial.addEventListener('change',updatePaymentChoice);
  button.addEventListener('click',beginPayment);
  if(cancel)cancel.addEventListener('click',function(){closeSecurePayment();setMessage('Payment canceled. No charge was submitted.','');});
  window.addEventListener('pagehide',disposeForm);
})();
