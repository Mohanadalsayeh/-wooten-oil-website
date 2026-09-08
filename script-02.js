(function(){
  const overlay=document.getElementById('contactMessageOverlay');
  const form=document.getElementById('contactMessageForm');
  const closeBtn=document.getElementById('contactMessageClose');
  const cancelBtn=document.getElementById('contactMessageCancel');
  const submitBtn=document.getElementById('contactMessageSubmit');
  const status=document.getElementById('contactMessageStatus');
  if(!overlay || !form) return;

  const ENDPOINT='/api/contact-message';

  function sendContactRequest(payload){
    const options={
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify(payload)
    };
    if(typeof window.wootenCustomerFetch==='function'){
      return window.wootenCustomerFetch(ENDPOINT,options,{
        timeoutMs:20000,
        timeoutMessage:'Sending the message took too long. Check your connection and try again.'
      });
    }

    /* Defensive fallback if the shared portal request helper did not load. */
    if(typeof AbortController!=='function') return fetch(ENDPOINT,options);
    const controller=new AbortController();
    let timedOut=false;
    const timer=setTimeout(function(){timedOut=true;controller.abort();},20000);
    return fetch(ENDPOINT,Object.assign({},options,{signal:controller.signal}))
      .catch(function(error){
        if(timedOut) throw new Error('Sending the message took too long. Check your connection and try again.');
        throw error;
      })
      .finally(function(){clearTimeout(timer);});
  }

  function newReference(){
    const now=new Date();
    const date=String(now.getFullYear()).slice(-2)+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0');
    const random=Math.floor(1000+Math.random()*9000);
    return 'MSG-'+date+'-'+random;
  }

  let contactMessageSent=false;

  function openContact(e){
    if(e) e.preventDefault();
    contactMessageSent=false;
    status.className='contact-message-status';
    status.textContent='';
    submitBtn.disabled=false;
    submitBtn.textContent='Send Message';
    cancelBtn.textContent='Cancel';
    overlay.classList.add('show');
    document.body.style.overflow='hidden';
    setTimeout(function(){document.getElementById('contactName').focus();},50);
  }

  function closeContact(){
    overlay.classList.remove('show');
    document.body.style.overflow='';
    if(contactMessageSent){
      window.scrollTo({top:0,left:0,behavior:'smooth'});
    }
  }

  document.querySelectorAll('.js-contact-open').forEach(function(link){link.addEventListener('click',openContact);});
  closeBtn.addEventListener('click',closeContact);
  cancelBtn.addEventListener('click',closeContact);
  overlay.addEventListener('click',function(e){if(e.target===overlay) closeContact();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape' && overlay.classList.contains('show')) closeContact();});

  form.addEventListener('submit',async function(e){
    e.preventDefault();
    if(!form.reportValidity()) return;

    const referenceNumber=newReference();
    const payload={
      referenceNumber:referenceNumber,
      name:document.getElementById('contactName').value.trim(),
      email:document.getElementById('contactEmail').value.trim(),
      phone:document.getElementById('contactPhone').value.trim(),
      subject:document.getElementById('contactSubject').value.trim(),
      message:document.getElementById('contactMessage').value.trim(),
      submittedFrom:window.location.href
    };

    submitBtn.disabled=true;
    submitBtn.textContent='Sending…';
    status.className='contact-message-status show';
    status.textContent='Sending your message to Wooten Oil…';

    try{
      const response=await sendContactRequest(payload);
      let data={};
      try{data=await response.json();}catch(err){}
      if(!response.ok || data.success===false){throw new Error(data.error || 'The message could not be sent.');}

      status.className='contact-message-status show success';
      status.innerHTML='Your message was sent successfully. We also sent a confirmation to <strong>'+escapeHtml(payload.email)+'</strong>.<div class="contact-reference"><small>Message Reference</small><strong>'+escapeHtml(referenceNumber)+'</strong></div>';
      form.reset();
      contactMessageSent=true;
      submitBtn.textContent='Message Sent';
      cancelBtn.textContent='Done';
    }catch(err){
      console.error('Contact message failed:',err);
      status.className='contact-message-status show error';
      status.textContent=err.message || 'Your message could not be sent. Please try again.';
      submitBtn.disabled=false;
      submitBtn.textContent='Try Again';
    }
  });

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch];});
  }
})();
