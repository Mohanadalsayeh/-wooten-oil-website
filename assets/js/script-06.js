/* Heartland hosted fields or Global Payments HPP, selected by server configuration. */
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
  var cardContainer=document.getElementById('heartlandCardForm'),cancelCard=document.getElementById('heartlandCancel'),note=document.getElementById('portalPaymentNote');
  var provider='globalpayments',publicKey='',serverReady=false,cardForm=null,mountedIntent='',mountSerial=0,tokenSubmitted=false,sdkPromise=null;
  var returnId=new URL(window.location.href).searchParams.get('payment_return')||'';
  if(!/^[0-9a-f-]{36}$/i.test(returnId))returnId='';
  var sandboxApproval='',sandboxExpires=0,approvalDialog=null,approvalPromise=null;
  function clearApproval(){sandboxApproval='';sandboxExpires=0;}
  function authorizeSandbox(){
    if(sandboxApproval&&sandboxExpires>Date.now()+5000)return Promise.resolve(true);
    if(approvalPromise)return approvalPromise;
    var ticket=generation;
    approvalPromise=new Promise(function(resolve){
      var previous=document.activeElement,dialog=document.createElement('dialog');
      approvalDialog=dialog;
      dialog.className='sandbox-admin-dialog';
      dialog.setAttribute('aria-labelledby','sandboxAdminTitle');
      dialog.innerHTML='<form><h2 id="sandboxAdminTitle">Sandbox payment approval</h2><p>Payments are currently for testing only. A Main Admin must enter their password to continue.</p><label for="sandboxAdminPassword">Main Admin password</label><input id="sandboxAdminPassword" type="password" autocomplete="off" required maxlength="512"><p class="sandbox-admin-error" role="alert"></p><div class="sandbox-admin-actions"><button type="button">Cancel</button><button type="submit">Authorize testing</button></div></form>';
      document.body.appendChild(dialog);
      var form=dialog.querySelector('form'),input=dialog.querySelector('input'),error=dialog.querySelector('[role="alert"]'),submit=dialog.querySelector('[type="submit"]'),done=false;
      function finish(ok){if(done)return;done=true;input.value='';dialog.close();dialog.remove();approvalDialog=null;approvalPromise=null;if(previous&&previous.isConnected)previous.focus();resolve(ok);}
      dialog.addEventListener('cancel',function(e){e.preventDefault();finish(false);});
      dialog.querySelector('[type="button"]').onclick=function(){finish(false);};
      dialog.addEventListener('approval-reset',function(){finish(false);});
      form.onsubmit=async function(e){
        e.preventDefault();if(submit.disabled)return;submit.disabled=true;submit.textContent='Checking…';error.textContent='';
        var password=input.value;input.value='';
        try{
          var pending=requestJson('/api/customer/payment/sandbox-authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password})});password='';
          var data=await pending;
          if(done||ticket!==generation)return;
          sandboxApproval=data.approval;sandboxExpires=data.expires;finish(true);
        }catch(err){if(!done){error.textContent=err.message;input.focus();}}
        finally{password='';submit.disabled=false;submit.textContent='Authorize testing';}
      };
      dialog.showModal();input.focus();
    });
    return approvalPromise;
  }
  function setMessage(text,state){
    message.textContent=text||'';
    message.className='payment-coming-soon'+(text?' show':'')+(state?' '+state:'');
  }
  function paymentBlocked(){return Boolean(payment&&(payment.active||payment.review_required));}
  function setBusy(value){
    busy=value;
    button.disabled=value||checking||statusUnavailable||paymentBlocked()||(provider==='heartland'&&!serverReady);
    button.setAttribute('aria-busy',value?'true':'false');
    button.textContent=provider==='heartland'?(value?'Please wait…':'Continue to Card Payment'):(value?'Opening Secure Payment…':'Continue to Secure Payment');
    full.disabled=partial.disabled=value||paymentBlocked();
    if(amount)amount.disabled=value||paymentBlocked();
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
  function disposeHeartland(){
    mountSerial++;mountedIntent='';
    if(cardForm){try{cardForm.dispose();}catch(ignore){}cardForm=null;}
    ['heartland-card-holder','heartland-card-number','heartland-card-expiration','heartland-card-cvv','heartland-card-submit'].forEach(function(id){var el=document.getElementById(id);if(el)el.textContent='';});
    if(cardContainer)cardContainer.hidden=true;
    if(cancelCard)cancelCard.hidden=true;
  }
  function acceptProvider(data){
    if(data.provider==='heartland'){
      provider='heartland';publicKey=data.public_api_key||publicKey;
      if(typeof data.ready==='boolean')serverReady=data.ready;
      if(note)note.textContent='Heartland securely processes your card details. Your payment status is saved to your account even if you close the portal.';
    }
  }
  function loadHeartland(){
    if(window.GlobalPayments)return Promise.resolve();
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise(function(resolve,reject){
      var script=document.createElement('script');script.src='https://js.globalpay.com/5.1.1/globalpayments.js';script.async=true;
      script.onload=function(){window.GlobalPayments?resolve():reject(new Error('Secure card fields could not be loaded.'));};
      script.onerror=function(){script.remove();sdkPromise=null;reject(new Error('Secure card fields could not be loaded. Check your connection and try Check Payment Status.'));};
      document.head.appendChild(script);
    });return sdkPromise;
  }
  async function mountHeartland(p){
    if(!cardContainer||mountedIntent===p.payment_intent_id)return;
    disposeHeartland();mountedIntent=p.payment_intent_id;tokenSubmitted=false;
    var serial=mountSerial,ticket=generation,id=p.payment_intent_id;
    cardContainer.hidden=false;cancelCard.hidden=false;
    try{
      if(!await authorizeSandbox()){mountedIntent='';cardContainer.hidden=true;return;}
      await loadHeartland();
      if(serial!==mountSerial||ticket!==generation||!payment||payment.payment_intent_id!==id||!payment.can_pay)return;
      window.GlobalPayments.configure({publicApiKey:publicKey});
      cardForm=window.GlobalPayments.ui.form({fields:{
        'card-holder-name':{target:'#heartland-card-holder',placeholder:'Name on card'},
        'card-number':{target:'#heartland-card-number',placeholder:'Card number'},
        'card-expiration':{target:'#heartland-card-expiration',placeholder:'MM / YYYY'},
        'card-cvv':{target:'#heartland-card-cvv',placeholder:'Security code'},
        submit:{target:'#heartland-card-submit',value:'Pay $'+p.amount+' — Sandbox'}
      },styles:{
        'html, body':{margin:'0',padding:'0',height:'100%',background:'#ffffff'},
        'input':{width:'100%',height:'48px','box-sizing':'border-box',padding:'0 12px',border:'0',outline:'0',color:'#17314b','font-family':'Arial, sans-serif','font-size':'16px',background:'#ffffff'},
        'button':{width:'100%',height:'48px',border:'0','border-radius':'8px',color:'#ffffff',background:'#bd182a','font-family':'Arial, sans-serif','font-size':'16px','font-weight':'700',cursor:'pointer'},
        'button:focus':{outline:'2px solid #17314b','outline-offset':'-4px'},
        '.error':{color:'#a91d29'}
      }});
      cardForm.on('token-success',async function(response){
        if(serial!==mountSerial||ticket!==generation||tokenSubmitted||!payment||payment.payment_intent_id!==id||!payment.can_pay)return;
        if(!response||typeof response.paymentReference!=='string'){setMessage('Heartland did not return a card token. Please check the card details.','error');return;}
        if(!await authorizeSandbox())return;
        if(ticket!==generation||serial!==mountSerial)return;
        tokenSubmitted=true;setBusy(true);cardContainer.hidden=true;cancelCard.hidden=true;
        result.textContent='Submitting your sandbox payment. Please wait for its saved result.';
        try{
          var data=await requestJson('/api/customer/payment/charge',{method:'POST',headers:{'Content-Type':'application/json','X-Sandbox-Approval':sandboxApproval},body:JSON.stringify({payment_intent_id:id,payment_reference:response.paymentReference})});
          if(ticket!==generation)return;
          clearApproval();setMessage('','');renderPayment(data.payment);
        }catch(error){
          if(ticket!==generation)return;
          // The sale may have reached Heartland. Only read status after a lost response.
          disposeHeartland();statusUnavailable=true;setBusy(false);setMessage('Checking the saved result of this payment…','processing');await refreshStatus();
        }
      });
      cardForm.on('token-error',function(){if(serial===mountSerial&&ticket===generation&&!tokenSubmitted)setMessage('Check the card details and try the sandbox payment again.','error');});
      if(cardForm.ready)cardForm.ready(function(){if(serial===mountSerial&&ticket===generation)setMessage('Sandbox checkout — use a test card only. No live funds will be collected.','processing');});
    }catch(error){if(serial===mountSerial&&ticket===generation){disposeHeartland();setMessage(error.message,'error');if(cancelCard)cancelCard.hidden=false;}}
  }
  function renderHeartland(p){
    if(!p){disposeHeartland();setMessage(serverReady?'Sandbox checkout — use a test card only.':'Sandbox checkout is waiting for its background confirmation service. Try Check Payment Status shortly.','processing');
      if(!serverReady){secure.hidden=false;secureAmount.textContent='';result.textContent='No payment has been started.';result.className='portal-payment-result show processing';}return;}
    secureAmount.textContent='$'+p.amount;
    var text='',state='processing';
    if(p.status==='initiated'){
      text=p.can_pay?'Your $'+p.amount+' sandbox checkout is ready. Enter a test card below, then press Pay. Opening this form does not submit a payment.':'This unsubmitted checkout is not ready. Cancel it and start again.';
      if(p.can_pay&&serverReady&&!statusUnavailable)mountHeartland(p);else{disposeHeartland();if(cancelCard)cancelCard.hidden=false;}
    }else{
      disposeHeartland();
      if(p.status==='captured'){
        text='Sandbox test payment approved for $'+p.amount+'. No live funds were collected. Confirmation: '+p.reference+'.';state='success';
        if(announced!==p.payment_intent_id){announced=p.payment_intent_id;window.dispatchEvent(new CustomEvent('wooten:payment-completed',{detail:p}));}
      }else if(p.active){
        text=p.review_required?'Your earlier sandbox payment needs review because Heartland returned more than one successful sale. Please contact Wooten Oil with reference '+p.reference+'.':
          'Your earlier $'+p.amount+' sandbox payment is awaiting confirmation. We will keep checking even if you close the portal. Opening this form does not start another payment.';
        if(p.review_required)state='review';
      }else if(p.status==='declined'){text='The sandbox card attempt was declined. You can start a new checkout to try another test card.';state='error';}
      else if(p.status==='canceled'||p.status==='expired')text='The unsubmitted sandbox checkout was '+p.status+'. You can choose an amount and start again.';
      else{text='The sandbox checkout could not be prepared. Check the Heartland setup before trying again.';state='error';}
    }
    result.textContent=text;result.className='portal-payment-result show '+state;
  }
  async function cancelHeartland(){
    if(busy||checking||!payment||payment.status!=='initiated')return;
    var ticket=generation,id=payment.payment_intent_id;disposeHeartland();setBusy(true);
    try{
      var data=await requestJson('/api/customer/payment/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payment_intent_id:id})});
      if(ticket===generation){setMessage('','');renderPayment(data.payment);}
    }catch(error){if(ticket===generation){statusUnavailable=true;setBusy(false);setMessage(error.message,'error');await refreshStatus();}}
  }

  function renderPayment(data){
    payment=data||null;
    secure.hidden=!payment;resume.hidden=true;resume.removeAttribute('href');setBusy(false);
    if(provider==='heartland'){renderHeartland(payment);return;}
    if(!payment)return;
    secureAmount.textContent='$'+payment.amount;
    var text='',state='processing',test=payment.environment==='sandbox';
    if(payment.review_required){
      state='review';
      var count=Number(payment.review_count);
      text='Payment review needed. Global Payments has reported '+(Number.isInteger(count)&&count>1?count:'multiple')+
        ' successful '+(test?'test ':'')+'transaction records for your earlier $'+payment.amount+
        ' checkout. Wooten Oil needs to review these records before another payment. Opening this form does not start a new payment.';
      if(test){
        text+='\n\nSandbox only: no live funds were collected.';
        if(payment.review_recorded_at)text+='\nReview recorded: '+WootenTime.dateTime(payment.review_recorded_at);
        if(Array.isArray(payment.review_transactions))payment.review_transactions.slice(0,10).forEach(function(tx,index){
          text+='\n\nRecord '+(index+1)+': '+tx.id+'\nStatus: '+tx.status+' | Amount: '+tx.currency+' '+(Number(tx.amount)/100).toFixed(2)+
            '\nCreated: '+(tx.time_created?WootenTime.dateTime(tx.time_created):'Not supplied');
          if(tx.account_id)text+='\nProcessing account: '+tx.account_id;
          if(tx.parent_resource_id)text+='\nParent reference: '+tx.parent_resource_id;
          text+='\nSecurity check reference: '+(tx.authentication_id||'Not returned by processor');
        });
      }
      if(payment.verification_pending)text+='\n\nThe latest status check is incomplete. The earlier review records remain saved.';
    }else if(payment.status==='captured'){
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
            ?payment.pending_reason==='review_existing_checkout'
              ?'Your earlier $'+payment.amount+' checkout is still saved. Use Resume Secure Payment to open that same secure page and review or complete it. No successful payment has been confirmed.'
              :'You have an earlier saved checkout. Use Resume Secure Payment to continue it. No successful payment has been confirmed.'
            :payment.pending_reason==='transaction_unresolved'
              ?'An earlier checkout is awaiting a final transaction result from Global Payments. No successful payment has been confirmed.'
              :payment.pending_reason==='return_unverified'
                ?'You returned from secure checkout. We are verifying its payment result with Global Payments. No successful payment has been confirmed yet.'
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
      statusUnavailable=false;acceptProvider(data);
      if(provider==='heartland')setMessage('','');
      renderPayment(data.payment);
      if(returnId&&data.payment){
        returnId='';
        var url=new URL(window.location.href);url.searchParams.delete('payment_return');
        window.history.replaceState(null,'',url.pathname+url.search+url.hash);
        window.dispatchEvent(new CustomEvent('wooten:payment-show'));
      }
    }catch(error){
      if(ticket===generation&&error.status!==401){
        statusUnavailable=true;if(provider==='heartland')disposeHeartland();setBusy(false);setMessage(error.message,'error');
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
    if(busy||checking||statusUnavailable||paymentBlocked()||(provider==='heartland'&&!serverReady))return;
    var value=String(amount&&amount.value||'').trim(),paymentType=partial.checked?'partial':'full';
    if(paymentType==='partial'&&(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)<1)){
      setMessage('Please enter a partial payment amount of at least $1.00.','error');amount.focus();return;
    }
    var ticket=generation;
    if(provider==='heartland'&&!await authorizeSandbox())return;
    if(ticket!==generation||busy)return;
    setBusy(true);setMessage(provider==='heartland'?'Preparing your secure card fields…':'Opening the Global Payments secure payment page…','processing');
    try{
      var data=await requestJson('/api/customer/payment/session',{
        method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','X-Sandbox-Approval':sandboxApproval},
        body:JSON.stringify({payment_type:paymentType,amount:paymentType==='partial'?value:undefined})
      });
      if(ticket!==generation)return;
      acceptProvider(data);
      if(provider==='heartland'){setMessage('','');renderPayment(data.payment);return;}
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
  if(cancelCard)cancelCard.addEventListener('click',cancelHeartland);
  window.addEventListener('wooten:payment-account',function(event){
    var account=String(event.detail&&event.detail.account_number||'');
    if(account!==currentAccount){generation++;clearApproval();if(approvalDialog)approvalDialog.dispatchEvent(new Event('approval-reset'));disposeHeartland();provider='globalpayments';serverReady=false;publicKey='';currentAccount=account;payment=null;announced='';statusUnavailable=false;secure.hidden=true;setMessage('','');setBusy(false);}
    refreshStatus();
  });
  window.addEventListener('pageshow',function(){setBusy(false);refreshStatus();});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)refreshStatus();});
  window.setInterval(function(){if(!document.hidden&&(statusUnavailable||paymentBlocked()))refreshStatus();},30000);
})();
