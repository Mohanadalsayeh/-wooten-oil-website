/* Customer Portal Payment Options - UI only until secure payment processor is connected */
(function(){
  var full=document.getElementById('payFullBalance');
  var partial=document.getElementById('payPartialBalance');
  var row=document.getElementById('partialPaymentRow');
  var amount=document.getElementById('partialPaymentAmount');
  var button=document.getElementById('portalPaymentContinue');
  var message=document.getElementById('portalPaymentMessage');

  if(!full || !partial || !row || !button) return;

  function updatePaymentChoice(){
    if(partial.checked){
      row.classList.add('show');
      setTimeout(function(){ if(amount) amount.focus(); },50);
    }else{
      row.classList.remove('show');
      if(amount) amount.value='';
    }
    if(message) message.classList.remove('show');
  }

  full.addEventListener('change',updatePaymentChoice);
  partial.addEventListener('change',updatePaymentChoice);

  button.addEventListener('click',function(){
    if(partial.checked){
      var value=Number(amount && amount.value);
      if(!value || value<=0){
        if(message){
          message.textContent='Please enter a valid partial payment amount.';
          message.classList.add('show');
        }
        if(amount) amount.focus();
        return;
      }
    }
    if(message){
      message.textContent='Secure online payment processing is being connected. No payment has been submitted or charged.';
      message.classList.add('show');
    }
  });
})();
