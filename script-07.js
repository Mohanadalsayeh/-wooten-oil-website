/* Customer Portal */
(function(){
  var form=document.getElementById('portalLoginForm');
  var loginCard=document.getElementById('portalLoginCard');
  var activationCard=document.getElementById('portalActivationCard');
  var resetCard=document.getElementById('portalResetCard');
  var accountCard=document.getElementById('portalAccountCard');
  var status=document.getElementById('portalStatus');
  var signIn=document.getElementById('portalSignIn');
  var logout=document.getElementById('portalLogout');
  var desktopCustomerAccount=document.getElementById('desktopCustomerAccount');
  var desktopCustomerLogout=document.getElementById('desktopCustomerLogout');
  var mobileCustomerAccount=document.getElementById('mobileCustomerAccount');
  var mobileCustomerLogout=document.getElementById('mobileCustomerLogout');
  var activateLink=document.getElementById('portalActivateLink');
  var forgotPassword=document.getElementById('portalForgotPassword');
  var useResetCode=document.getElementById('portalUseResetCode');
  var resetBack=document.getElementById('resetBack');
  var resetStart=document.getElementById('resetStart');
  var resetHaveCode=document.getElementById('resetHaveCode');
  var resetComplete=document.getElementById('resetComplete');
  var resetStatus=document.getElementById('resetStatus');
  var resetDetails=document.getElementById('resetDetails');
  var resetInstructions=document.getElementById('resetInstructions');
  var resetOfficeHelp=document.getElementById('resetOfficeHelp');
  var activationBack=document.getElementById('activationBack');
  var activationStart=document.getElementById('activationStart');
  var activationComplete=document.getElementById('activationComplete');
  var activationStatus=document.getElementById('activationStatus');
  var activationDetails=document.getElementById('activationDetails');
  var activationInstructions=document.getElementById('activationInstructions');
  if(!form || !loginCard || !activationCard || !resetCard || !accountCard) return;

  
  var activePortalCustomer=null;
  var pendingDocumentToken=(new URLSearchParams(window.location.search)).get('document_token')||'';

  function openPendingDocument(){
    if(!pendingDocumentToken) return false;
    var token=pendingDocumentToken;
    pendingDocumentToken='';
    try{ window.history.replaceState(null,'',window.location.pathname+'#customer-login'); }catch(e){}
    window.location.assign('/open-document/'+encodeURIComponent(token));
    return true;
  }

  function customerFuelAddress(c){
    var street=[clean(c && c.address1),clean(c && c.address2),clean(c && c.address3)].filter(Boolean).join(', ');
    var cityState=[clean(c && c.city),clean(c && c.state)].filter(Boolean).join(', ');
    var cityLine=[cityState,clean(c && c.zip_code)].filter(Boolean).join(' ');
    return [street,cityLine].filter(Boolean).join(', ');
  }

  function prefillFuelRequest(c){
    if(!c) return;
    activePortalCustomer=c;

    var account=clean(c.account_number);
    var accountField=document.getElementById('fuelCustomerAccountField');
    var accountInput=document.getElementById('fuelCustomerAccount');
    var note=document.getElementById('fuelPrefillNote');

    if(accountField) accountField.style.display=account?'block':'none';
    if(accountInput) accountInput.value=account;
    if(note) note.style.display='flex';

    var nameInput=document.getElementById('customerName');
    var phoneInput=document.getElementById('phone');
    var emailInput=document.getElementById('email');
    var addressInput=document.getElementById('deliveryAddress');

    if(nameInput && clean(c.account_name)) nameInput.value=clean(c.account_name);
    if(phoneInput && clean(c.phone)) phoneInput.value=clean(c.phone);
    if(emailInput && clean(c.email)) emailInput.value=clean(c.email);
    if(addressInput && customerFuelAddress(c)) addressInput.value=customerFuelAddress(c);
  }

  function clearFuelAccountIndicator(){
    activePortalCustomer=null;
    var accountField=document.getElementById('fuelCustomerAccountField');
    var accountInput=document.getElementById('fuelCustomerAccount');
    var note=document.getElementById('fuelPrefillNote');
    if(accountField) accountField.style.display='none';
    if(accountInput) accountInput.value='';
    if(note) note.style.display='none';
  }

  
  var headerNotificationMenu=document.getElementById('headerNotificationMenu');
  var headerNotificationList=document.getElementById('headerNotificationList');
  var headerNotificationsClose=document.getElementById('headerNotificationsClose');
  var customerNotificationPopup=document.getElementById('customerNotificationPopup');
  var customerNotificationPopupClose=document.getElementById('customerNotificationPopupClose');
  var customerNotificationPopupTitle=document.getElementById('customerNotificationPopupTitle');
  var customerNotificationPopupDate=document.getElementById('customerNotificationPopupDate');
  var customerNotificationPopupMessage=document.getElementById('customerNotificationPopupMessage');
  var customerNotificationPopupFrom=document.getElementById('customerNotificationPopupFrom');
  var customerNotificationPopupTo=document.getElementById('customerNotificationPopupTo');
  var customerNotificationPopupAttachments=document.getElementById('customerNotificationPopupAttachments');
  var customerNotificationPopupAttachmentList=document.getElementById('customerNotificationPopupAttachmentList');
  var customerNotificationPopupCard=document.getElementById('customerNotificationPopupCard');
  var activeNotificationDocumentId=null;
  var mobileHeaderNotifications=document.getElementById('mobileHeaderNotifications');
  var mobileHeaderCustomerName=document.getElementById('mobileHeaderCustomerName');
  var mobileHeaderNotificationBadge=document.getElementById('mobileHeaderNotificationBadge');
  var dashboardNotifications=document.getElementById('dashboardNotifications');
  var dashboardNotificationPanel=document.getElementById('dashboardNotificationPanel');
  var markNotificationsRead=document.getElementById('markNotificationsRead');

  var LOGIN_ENDPOINT='/api/customer/login';
  var ME_ENDPOINT='/api/customer/me';
  var LOGOUT_ENDPOINT='/api/customer/logout';
  var ACTIVATE_START_ENDPOINT='/api/customer/activation/start';
  var ACTIVATE_SET_PASSWORD_ENDPOINT='/api/customer/activation/set-password';
  var RESET_START_ENDPOINT='/api/customer/password-reset/start';
  var RESET_COMPLETE_ENDPOINT='/api/customer/password-reset/complete';
  var dashboard=document.getElementById('customerDashboard');
  var accountDetails=document.getElementById('customerAccountDetails');
  var dashboardViewAccount=document.getElementById('dashboardViewAccount');
  var dashboardMakePayment=document.getElementById('dashboardMakePayment');
  var dashboardRequestFuel=document.getElementById('dashboardRequestFuel');
  var dashboardFuelHistory=document.getElementById('dashboardFuelHistory');
  var dashboardDocuments=document.getElementById('dashboardDocuments');
  var dashboardPayments=document.getElementById('dashboardPayments');
  var paymentHistory=document.getElementById('customerPaymentHistory');
  var paymentHistoryBack=document.getElementById('paymentHistoryBack');
  var paymentHistoryRefresh=document.getElementById('paymentHistoryRefresh');
  var paymentHistorySearch=document.getElementById('paymentHistorySearch');
  var paymentHistorySort=document.getElementById('paymentHistorySort');
  var paymentHistoryResultsMeta=document.getElementById('paymentHistoryResultsMeta');
  var paymentHistoryStatus=document.getElementById('paymentHistoryStatus');
  var paymentHistoryList=document.getElementById('paymentHistoryList');
  var paymentHistoryTotal=document.getElementById('paymentHistoryTotal');
  var paymentHistoryRows=[];
  var PAYMENT_HISTORY_ENDPOINT='/api/customer/payments';
  var customerDocuments=document.getElementById('customerDocuments');
  var customerDocumentsBack=document.getElementById('customerDocumentsBack');
  var customerDocumentsRefresh=document.getElementById('customerDocumentsRefresh');
  var customerDocumentsSearch=document.getElementById('customerDocumentsSearch');
  var customerDocumentsTypeFilter=document.getElementById('customerDocumentsTypeFilter');
  var customerDocumentsStatus=document.getElementById('customerDocumentsStatus');
  var customerDocumentsList=document.getElementById('customerDocumentsList');
  var customerDocumentRows=[];
  var CUSTOMER_DOCUMENTS_ENDPOINT='/api/customer/documents';
  var dashboardLogout=document.getElementById('dashboardLogout');
  var dashboardBack=document.getElementById('dashboardBack');
  var fuelHistory=document.getElementById('customerFuelHistory');
  var fuelHistoryBack=document.getElementById('fuelHistoryBack');
  var fuelHistoryRefresh=document.getElementById('fuelHistoryRefresh');
  var fuelHistorySearch=document.getElementById('fuelHistorySearch');
  var fuelHistoryClear=document.getElementById('fuelHistoryClear');
  var fuelHistorySort=document.getElementById('fuelHistorySort');
  var fuelHistoryResultsMeta=document.getElementById('fuelHistoryResultsMeta');
  var fuelHistoryStatus=document.getElementById('fuelHistoryStatus');
  var fuelHistoryList=document.getElementById('fuelHistoryList');
  var fuelHistoryRows=[];
  var FUEL_HISTORY_ENDPOINT='/api/customer/fuel-requests';

  function showDashboardView(){
    if(dashboard) dashboard.classList.remove('dashboard-hidden');
    if(accountDetails) accountDetails.classList.remove('show');
    if(fuelHistory) fuelHistory.classList.remove('show');
    if(customerDocuments) customerDocuments.classList.remove('show');
    if(paymentHistory) paymentHistory.classList.remove('show');
  }
  function showAccountDetails(focusPayment){
    if(dashboard) dashboard.classList.add('dashboard-hidden');
    if(fuelHistory) fuelHistory.classList.remove('show');
    if(customerDocuments) customerDocuments.classList.remove('show');
    if(paymentHistory) paymentHistory.classList.remove('show');
    if(accountDetails) accountDetails.classList.add('show');
    setTimeout(function(){
      var target=focusPayment?document.getElementById('portalPaymentPanel'):accountDetails;
      if(target && target.scrollIntoView) target.scrollIntoView({behavior:'smooth',block:'start'});
    },30);
  }




  function customerDocumentFormatDate(value){
    if(!value) return 'Date not specified';
    try{
      var d=/^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(value+'T12:00:00')
        : new Date(value);
      if(Number.isNaN(d.getTime())) return value;
      return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    }catch(e){return value;}
  }

  function customerDocumentSize(bytes){
    var n=Number(bytes||0);
    if(n<1024) return n+' B';
    if(n<1024*1024) return (n/1024).toFixed(1)+' KB';
    return (n/(1024*1024)).toFixed(1)+' MB';
  }

  function renderCustomerDocuments(){
    if(!customerDocumentsList) return;
    var q=String(customerDocumentsSearch && customerDocumentsSearch.value || '').trim().toLowerCase();
    var type=String(customerDocumentsTypeFilter && customerDocumentsTypeFilter.value || 'all');
    var rows=(customerDocumentRows||[]).filter(function(r){
      if(type!=='all' && String(r.document_type||'')!==type) return false;
      if(!q) return true;
      return [
        r.title,r.filename,r.document_type,r.document_date
      ].join(' ').toLowerCase().indexOf(q)!==-1;
    });

    customerDocumentsList.innerHTML='';
    if(!rows.length){
      var empty=document.createElement('div');
      empty.className='customer-document-empty';
      empty.textContent=(customerDocumentRows||[]).length
        ? 'No documents match your search.'
        : 'No statements or invoices are available yet.';
      customerDocumentsList.appendChild(empty);
      return;
    }

    rows.forEach(function(r){
      var row=document.createElement('div');
      row.className='customer-document-row';
      row.setAttribute('data-document-id',String(r.id||''));

      var icon=document.createElement('div');
      icon.className='customer-document-icon';
      icon.textContent=String(r.document_type||'PDF').slice(0,3);

      var main=document.createElement('div');
      main.className='customer-document-main';
      var title=document.createElement('strong');
      title.textContent=r.title || r.filename || 'Account Document';
      var meta=document.createElement('small');
      meta.textContent=(r.document_type==='invoice'?'Invoice':'Statement')+' • '+customerDocumentFormatDate(r.document_date||r.created_at)+' • '+customerDocumentSize(r.size_bytes);
      main.appendChild(title);
      main.appendChild(meta);

      var open=document.createElement('button');
      open.type='button';
      open.className='customer-document-open';
      open.textContent='Open PDF';
      open.addEventListener('click',function(){ openCustomerDocument(r.id); });

      row.appendChild(icon);
      row.appendChild(main);
      row.appendChild(open);
      customerDocumentsList.appendChild(row);
    });
  }

  function openCustomerDocument(id){
    var documentId=Number(id||0);
    if(!Number.isInteger(documentId) || documentId<=0){
      alert('Document could not be opened.');
      return;
    }
    window.location.assign('/api/customer/documents/'+encodeURIComponent(documentId)+'/file');
  }

  async function loadCustomerDocuments(){
    if(customerDocumentsStatus){
      customerDocumentsStatus.className='customer-documents-status show';
      customerDocumentsStatus.textContent='Loading statements and invoices…';
    }
    try{
      var response=await fetch(CUSTOMER_DOCUMENTS_ENDPOINT,{
        method:'GET',credentials:'same-origin',cache:'no-store',
        headers:{'Accept':'application/json'}
      });
      var data=await response.json().catch(function(){return {};});
      if(!response.ok || data.success===false) throw new Error(data.error||'Documents could not be loaded.');
      customerDocumentRows=Array.isArray(data.documents)?data.documents:[];
      renderCustomerDocuments();
      if(customerDocumentsStatus){
        customerDocumentsStatus.className='customer-documents-status';
        customerDocumentsStatus.textContent='';
      }
    }catch(error){
      customerDocumentRows=[];
      renderCustomerDocuments();
      if(customerDocumentsStatus){
        customerDocumentsStatus.className='customer-documents-status show error';
        customerDocumentsStatus.textContent=error.message||'Documents could not be loaded.';
      }
    }
  }

  async function showCustomerDocuments(focusDocumentId){
    if(dashboard) dashboard.classList.add('dashboard-hidden');
    if(accountDetails) accountDetails.classList.remove('show');
    if(fuelHistory) fuelHistory.classList.remove('show');
    if(paymentHistory) paymentHistory.classList.remove('show');
    if(customerDocuments) customerDocuments.classList.add('show');
    await loadCustomerDocuments();

    if(focusDocumentId){
      setTimeout(function(){
        var target=customerDocumentsList && customerDocumentsList.querySelector('[data-document-id="'+String(focusDocumentId)+'"]');
        if(target){
          target.classList.add('notification-focus');
          if(target.scrollIntoView) target.scrollIntoView({behavior:'smooth',block:'center'});
          setTimeout(function(){target.classList.remove('notification-focus');},3000);
        }
      },60);
    }
  }
  window.wootenOpenCustomerDocuments=function(documentId){
    showCustomerDocuments(documentId||null);
  };

  function historyDate(value){
    if(!value) return '—';
    try{
      var d=new Date(value);
      if(Number.isNaN(d.getTime())) return value;
      return d.toLocaleString('en-US',{
        month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'
      });
    }catch(e){return value;}
  }

  function historyDeliveryDate(value){
    if(!value) return 'Flexible / Not specified';
    try{
      var parts=String(value).split('-');
      if(parts.length===3){
        return new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]))
          .toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      }
    }catch(e){}
    return value;
  }

  function historyText(value,fallback){
    var s=String(value==null?'':value).trim();
    return s || (fallback||'—');
  }


  function fuelHistorySearchText(row){
    return [
      row && row.request_number,
      row && row.fuel_type,
      row && row.gallons,
      row && row.delivery_date,
      row && row.delivery_address,
      row && row.notes,
      row && row.received_at
    ].map(function(v){return String(v==null?'':v).toLowerCase();}).join(' ');
  }

  function fuelHistoryTime(value){
    var t=Date.parse(value||'');
    return Number.isFinite(t)?t:0;
  }

  function fuelHistoryDeliveryTime(value){
    if(!value) return 0;
    var t=Date.parse(String(value)+'T12:00:00');
    return Number.isFinite(t)?t:0;
  }

  function fuelHistoryGallons(value){
    var n=Number(String(value==null?'':value).replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  }

  function filteredSortedFuelHistory(){
    var query=String(fuelHistorySearch && fuelHistorySearch.value || '').trim().toLowerCase();
    var sort=String(fuelHistorySort && fuelHistorySort.value || 'newest');
    var rows=(fuelHistoryRows||[]).slice();

    if(query){
      var tokens=query.split(/\s+/).filter(Boolean);
      rows=rows.filter(function(row){
        var haystack=fuelHistorySearchText(row);
        return tokens.every(function(token){return haystack.indexOf(token)!==-1;});
      });
    }

    rows.sort(function(a,b){
      if(sort==='oldest') return fuelHistoryTime(a.received_at)-fuelHistoryTime(b.received_at);
      if(sort==='request_asc') return historyText(a.request_number,'').localeCompare(historyText(b.request_number,''),undefined,{numeric:true,sensitivity:'base'});
      if(sort==='request_desc') return historyText(b.request_number,'').localeCompare(historyText(a.request_number,''),undefined,{numeric:true,sensitivity:'base'});
      if(sort==='delivery_asc') return fuelHistoryDeliveryTime(a.delivery_date)-fuelHistoryDeliveryTime(b.delivery_date);
      if(sort==='delivery_desc') return fuelHistoryDeliveryTime(b.delivery_date)-fuelHistoryDeliveryTime(a.delivery_date);
      if(sort==='gallons_desc') return fuelHistoryGallons(b.gallons)-fuelHistoryGallons(a.gallons);
      if(sort==='gallons_asc') return fuelHistoryGallons(a.gallons)-fuelHistoryGallons(b.gallons);
      if(sort==='fuel_asc') return historyText(a.fuel_type,'').localeCompare(historyText(b.fuel_type,''),undefined,{sensitivity:'base'});
      return fuelHistoryTime(b.received_at)-fuelHistoryTime(a.received_at);
    });

    return rows;
  }

  function updateFuelHistoryView(){
    var rows=filteredSortedFuelHistory();
    renderFuelHistory(rows);

    if(fuelHistoryResultsMeta){
      var total=(fuelHistoryRows||[]).length;
      var query=String(fuelHistorySearch && fuelHistorySearch.value || '').trim();
      if(!total){
        fuelHistoryResultsMeta.textContent='';
      }else if(query){
        fuelHistoryResultsMeta.textContent=rows.length+' of '+total+' requests match your search';
      }else{
        fuelHistoryResultsMeta.textContent=total+' request'+(total===1?'':'s');
      }
    }

    if(fuelHistoryClear){
      var hasSearch=String(fuelHistorySearch && fuelHistorySearch.value || '').length>0;
      fuelHistoryClear.classList.toggle('show',hasSearch);
    }
  }

  function renderFuelHistory(rows){
    if(!fuelHistoryList) return;
    fuelHistoryList.innerHTML='';

    if(!Array.isArray(rows) || !rows.length){
      var empty=document.createElement('div');
      empty.className='fuel-history-empty';
      var searching=String(fuelHistorySearch && fuelHistorySearch.value || '').trim().length>0;
      empty.textContent=searching
        ? 'No fuel requests match your search.'
        : 'No fuel requests are saved to this online account yet.';
      fuelHistoryList.appendChild(empty);
      return;
    }

    rows.forEach(function(r){
      var card=document.createElement('article');
      card.className='fuel-history-card';

      var top=document.createElement('div');
      top.className='fuel-history-card-top';

      var number=document.createElement('div');
      number.className='fuel-history-number';
      number.textContent=historyText(r.request_number,'Fuel Request');

      var submitted=document.createElement('div');
      submitted.className='fuel-history-date';
      submitted.textContent=historyDate(r.received_at);

      top.appendChild(number);
      top.appendChild(submitted);
      card.appendChild(top);

      var grid=document.createElement('div');
      grid.className='fuel-history-grid';

      function addItem(label,value,full){
        var item=document.createElement('div');
        item.className='fuel-history-item'+(full?' full':'');
        var small=document.createElement('small');
        small.textContent=label;
        var strong=document.createElement('strong');
        strong.textContent=value;
        item.appendChild(small);
        item.appendChild(strong);
        grid.appendChild(item);
      }

      addItem('Fuel Type',historyText(r.fuel_type),'');
      addItem('Estimated Gallons',historyText(r.gallons),'');
      addItem('Preferred Delivery Date',historyDeliveryDate(r.delivery_date),'');
      addItem('Delivery Address',historyText(r.delivery_address),'');
      if(historyText(r.notes,'') ){
        addItem('Notes',historyText(r.notes),true);
      }

      card.appendChild(grid);

      var badge=document.createElement('span');
      badge.className='fuel-history-badge';
      badge.textContent='Submitted';
      card.appendChild(badge);

      fuelHistoryList.appendChild(card);
    });
  }

  async function loadFuelHistory(){
    if(!fuelHistoryList) return;
    if(fuelHistoryStatus){
      fuelHistoryStatus.className='fuel-history-status show info';
      fuelHistoryStatus.textContent='Loading fuel request history…';
    }
    if(fuelHistoryRefresh) fuelHistoryRefresh.disabled=true;

    try{
      var response=await fetch(FUEL_HISTORY_ENDPOINT,{
        method:'GET',
        credentials:'same-origin',
        cache:'no-store',
        headers:{'Accept':'application/json'}
      });
      var data=await response.json().catch(function(){return {};});
      if(!response.ok || data.success===false){
        throw new Error(data.error || 'Fuel request history could not be loaded.');
      }
      fuelHistoryRows=Array.isArray(data.requests)?data.requests:[];
      updateFuelHistoryView();
      if(fuelHistoryStatus){
        fuelHistoryStatus.className='fuel-history-status';
        fuelHistoryStatus.textContent='';
      }
    }catch(error){
      if(fuelHistoryStatus){
        fuelHistoryStatus.className='fuel-history-status show error';
        fuelHistoryStatus.textContent=error.message || 'Fuel request history could not be loaded.';
      }
    }finally{
      if(fuelHistoryRefresh) fuelHistoryRefresh.disabled=false;
    }
  }

  function showFuelHistory(){
    if(dashboard) dashboard.classList.add('dashboard-hidden');
    if(accountDetails) accountDetails.classList.remove('show');
    if(customerDocuments) customerDocuments.classList.remove('show');
    if(paymentHistory) paymentHistory.classList.remove('show');
    if(fuelHistory) fuelHistory.classList.add('show');
    loadFuelHistory();
  }


  function paymentHistoryDate(value){
    if(!value) return '—';
    var s=String(value).trim();
    var m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return m[2]+'-'+m[3]+'-'+m[1];
    m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if(m) return String(m[1]).padStart(2,'0')+'-'+String(m[2]).padStart(2,'0')+'-'+m[3];
    return s;
  }

  function paymentSearchText(row){
    return [
      row.payment_date,
      row.posting_date,
      row.deposit_date,
      row.amount,
      row.reference,
      row.invoice_no,
      row.deposit_no,
      row.description
    ].map(function(v){return String(v==null?'':v).toLowerCase();}).join(' ');
  }

  function filteredSortedPayments(){
    var q=String(paymentHistorySearch && paymentHistorySearch.value || '').trim().toLowerCase();
    var rows=(paymentHistoryRows||[]).slice();
    if(q){
      var tokens=q.split(/\s+/).filter(Boolean);
      rows=rows.filter(function(r){var h=paymentSearchText(r);return tokens.every(function(t){return h.indexOf(t)!==-1;});});
    }
    var sort=String(paymentHistorySort && paymentHistorySort.value || 'newest');
    rows.sort(function(a,b){
      if(sort==='oldest') return String(a.payment_date||'').localeCompare(String(b.payment_date||''));
      if(sort==='amount_desc') return Number(b.amount||0)-Number(a.amount||0);
      if(sort==='amount_asc') return Number(a.amount||0)-Number(b.amount||0);
      if(sort==='reference_asc') return String(a.reference||'').localeCompare(String(b.reference||''),undefined,{numeric:true,sensitivity:'base'});
      return String(b.payment_date||'').localeCompare(String(a.payment_date||''));
    });
    return rows;
  }

  function renderPaymentHistory(){
    if(!paymentHistoryList) return;
    var rows=filteredSortedPayments();
    paymentHistoryList.innerHTML='';
    if(paymentHistoryResultsMeta){
      var total=(paymentHistoryRows||[]).length;
      var q=String(paymentHistorySearch && paymentHistorySearch.value || '').trim();
      paymentHistoryResultsMeta.textContent=q ? rows.length+' of '+total+' payments match your search' : (total ? total+' payment'+(total===1?'':'s') : '');
    }
    if(!rows.length){
      var empty=document.createElement('div');empty.className='payment-history-empty';
      empty.textContent=(paymentHistoryRows||[]).length?'No payments match your search.':'No payment history is available for this account yet.';
      paymentHistoryList.appendChild(empty);return;
    }
    rows.forEach(function(r){
      var card=document.createElement('article');card.className='payment-history-card';
      var top=document.createElement('div');top.className='payment-history-card-top';
      var amt=document.createElement('strong');amt.textContent=money(r.amount);
      var date=document.createElement('time');date.textContent=paymentHistoryDate(r.payment_date);
      top.appendChild(amt);top.appendChild(date);card.appendChild(top);
      var grid=document.createElement('div');grid.className='payment-history-grid';
      function add(label,value,full){var item=document.createElement('div');item.className='payment-history-item'+(full?' full':'');var s=document.createElement('small');s.textContent=label;var v=document.createElement('strong');v.textContent=value||'—';item.appendChild(s);item.appendChild(v);grid.appendChild(item);}
      add('Check No',r.reference||'—');
      add('Invoice No',r.invoice_no||'—');
      add('Deposit No',r.deposit_no||'—');
      add('Deposit Date',paymentHistoryDate(r.deposit_date));
      add('Posting Date',paymentHistoryDate(r.posting_date||r.payment_date));
      if(String(r.description||'').trim()) add('Description / Memo',r.description,true);
      card.appendChild(grid);paymentHistoryList.appendChild(card);
    });
  }

  async function loadPaymentHistory(){
    if(paymentHistoryStatus){paymentHistoryStatus.className='payment-history-status show';paymentHistoryStatus.textContent='Loading payment history…';}
    if(paymentHistoryRefresh) paymentHistoryRefresh.disabled=true;
    try{
      var response=await fetch(PAYMENT_HISTORY_ENDPOINT,{method:'GET',credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}});
      var data=await response.json().catch(function(){return {};});
      if(!response.ok || data.success===false) throw new Error(data.error||'Payment history could not be loaded.');
      paymentHistoryRows=Array.isArray(data.payments)?data.payments:[];
      if(paymentHistoryTotal) paymentHistoryTotal.textContent=money(data.total_paid||0);
      renderPaymentHistory();
      if(paymentHistoryStatus){paymentHistoryStatus.className='payment-history-status';paymentHistoryStatus.textContent='';}
    }catch(error){
      paymentHistoryRows=[];renderPaymentHistory();
      if(paymentHistoryStatus){paymentHistoryStatus.className='payment-history-status show error';paymentHistoryStatus.textContent=error.message||'Payment history could not be loaded.';}
    }finally{if(paymentHistoryRefresh) paymentHistoryRefresh.disabled=false;}
  }

  function showPaymentHistory(){
    if(dashboard) dashboard.classList.add('dashboard-hidden');
    if(accountDetails) accountDetails.classList.remove('show');
    if(fuelHistory) fuelHistory.classList.remove('show');
    if(customerDocuments) customerDocuments.classList.remove('show');
    if(paymentHistory) paymentHistory.classList.add('show');
    loadPaymentHistory();
  }

  function money(v){
    var n=Number(v);
    if(!Number.isFinite(n)) n=0;
    return n.toLocaleString('en-US',{style:'currency',currency:'USD'});
  }
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function numberValue(v){
    if(v == null || v === '') return 0;
    var n=Number(String(v).replace(/[$,]/g,''));
    return Number.isFinite(n)?n:0;
  }
  function firstNumber(c,names){
    for(var i=0;i<names.length;i++){
      if(c && c[names[i]] != null && c[names[i]] !== '') return numberValue(c[names[i]]);
    }
    return 0;
  }
  function setStatus(el,message,good){
    if(!el) return;
    el.className='portal-status show '+(good?'ok':'error');
    el.textContent=message;
  }
  function clearStatus(el){
    if(!el) return;
    el.className='portal-status';
    el.textContent='';
  }
  function addressOf(c){
    var street=[clean(c.address1),clean(c.address2),clean(c.address3)].filter(Boolean).join(', ');
    var cityState=[clean(c.city),clean(c.state)].filter(Boolean).join(', ');
    var tail=[cityState,clean(c.zip_code)].filter(Boolean).join(' ');
    return [street,tail].filter(Boolean).join(' • ') || '—';
  }
  function updateCustomerMenu(c){
    var account=clean(c && c.account_number);
    if(account){
      document.body.classList.add('customer-signed-in');
      if(desktopCustomerAccount) desktopCustomerAccount.textContent='Customer # '+account;
      if(mobileCustomerAccount) mobileCustomerAccount.textContent='Customer # '+account;
      if(mobileHeaderCustomerName) mobileHeaderCustomerName.textContent=clean(c && c.account_name)||('Customer # '+account);
    }else{
      clearFuelAccountIndicator();
      document.body.classList.remove('customer-signed-in');
      if(desktopCustomerAccount) desktopCustomerAccount.textContent='Customer #';
      if(mobileCustomerAccount) mobileCustomerAccount.textContent='Customer #';
      if(mobileHeaderCustomerName) mobileHeaderCustomerName.textContent='Customer';
      if(mobileHeaderNotificationBadge) mobileHeaderNotificationBadge.style.display='none';
    }
  }
  function hideAll(){
    loginCard.style.display='none';
    activationCard.classList.remove('show');
    resetCard.classList.remove('show');
    accountCard.classList.remove('show');
  }
  function showLogin(){
    hideAll();
    loginCard.style.display='block';
  }
  function showActivation(account){
    hideAll();
    activationCard.classList.add('show');
    clearStatus(activationStatus);
    activationDetails.classList.remove('show');
    activationInstructions.textContent='';
    document.getElementById('activation-code').value='';
    document.getElementById('activation-password').value='';
    document.getElementById('activation-confirm').value='';
    if(account) document.getElementById('activation-account').value=account;
    setTimeout(function(){ document.getElementById('activation-account').focus(); },50);
  }

  function showReset(identifier){
    hideAll();
    resetCard.classList.add('show');
    clearStatus(resetStatus);
    resetDetails.classList.remove('show');
    resetInstructions.textContent='';
    if(resetOfficeHelp) resetOfficeHelp.style.display='none';
    document.getElementById('reset-code').value='';
    document.getElementById('reset-password').value='';
    document.getElementById('reset-confirm').value='';
    if(identifier) document.getElementById('reset-identifier').value=identifier;
    setTimeout(function(){ document.getElementById('reset-identifier').focus(); },50);
  }

  function showAccount(c){
    showDashboardView();
    prefillFuelRequest(c);
    if(window.wootenRenderCustomerNotifications) window.wootenRenderCustomerNotifications(c.account_number);
    document.getElementById('acctName').textContent=clean(c.account_name)||'Customer Account';
    document.getElementById('acctNumber').textContent=clean(c.account_number)?'Customer # '+clean(c.account_number):'';
    var currentBalance=firstNumber(c,['current_balance','current','aging_current','aging_category_0','age_current']);
    var aging1=firstNumber(c,['aging_category_1','aging1','age_1','aging_1','balance_31_60']);
    var aging2=firstNumber(c,['aging_category_2','aging2','age_2','aging_2','balance_61_90']);
    var aging3=firstNumber(c,['aging_category_3','aging3','age_3','aging_3','balance_91_120']);
    var aging4=firstNumber(c,['aging_category_4','aging4','age_4','aging_4','balance_over_120']);
    var previousBalance=aging1+aging2+aging3+aging4;
    var totalBalance=currentBalance+previousBalance;
    document.getElementById('acctBalance').textContent=money(currentBalance);
    document.getElementById('acctPreviousBalance').textContent=money(previousBalance);
    document.getElementById('acctTotalBalance').textContent=money(totalBalance);

    var statementValues={
      statementTotalBalance:totalBalance,
      statementCurrentBalance:currentBalance,
      statementPastDue:previousBalance,
      statementAgingCurrent:currentBalance,
      statementAging1:aging1,
      statementAging2:aging2,
      statementAging3:aging3,
      statementAging4:aging4,
      statementAgingTotal:totalBalance
    };
    Object.keys(statementValues).forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.textContent=money(statementValues[id]);
    });
    var statementUpdated=document.getElementById('statementUpdated');
    if(statementUpdated){
      statementUpdated.textContent=(new Date()).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
    }

    var fullLabel=document.getElementById('payFullBalanceLabel');
    if(fullLabel) fullLabel.textContent='Pay Full Balance — '+money(totalBalance);
    updateCustomerMenu(c);
    document.getElementById('acctTerms').textContent=clean(c.terms_description)||'—';
    document.getElementById('acctCreditHold').textContent=clean(c.credit_hold)||'—';
    document.getElementById('acctCreditLimit').textContent=money(c.credit_limit);
    document.getElementById('acctPhone').textContent=clean(c.phone)||'—';
    document.getElementById('acctEmail').textContent=clean(c.email)||'—';
    document.getElementById('acctAddress').textContent=addressOf(c);
    hideAll();
    accountCard.classList.add('show');
  }
  async function loadCurrentAccount(silent){
    try{
      var r=await fetch(ME_ENDPOINT,{method:'GET',headers:{'Accept':'application/json'},credentials:'same-origin',cache:'no-store'});
      if(r.status===401){ updateCustomerMenu(null); if(!silent) showLogin(); return false; }
      var d=await r.json().catch(function(){return {};});
      if(!r.ok || d.success===false || !d.customer){ updateCustomerMenu(null); return false; }
      showAccount(d.customer);
      return true;
    }catch(e){ return false; }
  }
  async function refreshCustomerMenu(){
    try{
      var r=await fetch(ME_ENDPOINT,{method:'GET',headers:{'Accept':'application/json'},credentials:'same-origin',cache:'no-store'});
      if(r.status===401){ updateCustomerMenu(null); return; }
      var d=await r.json().catch(function(){return {};});
      if(r.ok && d.success!==false && d.customer){ updateCustomerMenu(d.customer); prefillFuelRequest(d.customer); }
      else updateCustomerMenu(null);
    }catch(e){}
  }

  form.addEventListener('submit',async function(e){
    e.preventDefault();
    if(!form.reportValidity()) return;
    clearStatus(status);
    signIn.disabled=true;
    signIn.textContent='Signing In…';
    try{
      var user=document.getElementById('portal-user').value.trim();
      var payload={
        user:user,
        password:document.getElementById('portal-password').value,
        remember_me:!!(document.getElementById('portal-remember') && document.getElementById('portal-remember').checked)
      };
      var r=await fetch(LOGIN_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify(payload)
      });
      var d=await r.json().catch(function(){return {};});
      if(!r.ok || d.success===false){
        if(d.setup_required){
          showActivation(d.account_number || user);
          setStatus(activationStatus,'This account has not been activated for online access yet. Continue below to activate it.',false);
          return;
        }
        throw new Error(d.error || 'The customer number/email or password is incorrect.');
      }
      if(d.customer){ showAccount(d.customer); }
      else if(!(await loadCurrentAccount(false))){ throw new Error('Signed in, but the account information could not be loaded.'); }
      document.getElementById('portal-password').value='';
      if(openPendingDocument()) return;
    }catch(err){
      setStatus(status,err.message || 'Sign in failed. Please try again.',false);
    }finally{
      signIn.disabled=false;
      signIn.textContent='Sign In';
    }
  });


  
  
  
  if(mobileHeaderCustomerName) mobileHeaderCustomerName.addEventListener('click',async function(){
    location.hash='customer-login';
    var ok=await loadCurrentAccount(true);
    if(!ok) showLogin();
    else showDashboardView();
  });

  if(mobileHeaderNotifications) mobileHeaderNotifications.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    var account=activePortalCustomer && activePortalCustomer.account_number;
    if(account && window.wootenRenderCustomerNotifications) window.wootenRenderCustomerNotifications(account);
    if(headerNotificationMenu) headerNotificationMenu.classList.toggle('show');
  });

  

  function formatPopupFileSize(bytes){
    var n=Number(bytes||0);
    if(n<1024) return n+' B';
    if(n<1024*1024) return (n/1024).toFixed(1)+' KB';
    return (n/(1024*1024)).toFixed(1)+' MB';
  }

  function formatNotificationPopupDate(value){
    try{
      var d=new Date(value);
      if(Number.isNaN(d.getTime())) return String(value||'');
      return d.toLocaleString('en-US',{
        month:'short',
        day:'numeric',
        year:'numeric',
        hour:'numeric',
        minute:'2-digit'
      });
    }catch(e){
      return String(value||'');
    }
  }

  function renderCustomerNotificationPopup(notification){
    if(!customerNotificationPopup){
      customerNotificationPopup=document.getElementById('customerNotificationPopup');
      customerNotificationPopupClose=document.getElementById('customerNotificationPopupClose');
      customerNotificationPopupTitle=document.getElementById('customerNotificationPopupTitle');
      customerNotificationPopupDate=document.getElementById('customerNotificationPopupDate');
      customerNotificationPopupMessage=document.getElementById('customerNotificationPopupMessage');
      customerNotificationPopupFrom=document.getElementById('customerNotificationPopupFrom');
      customerNotificationPopupTo=document.getElementById('customerNotificationPopupTo');
      customerNotificationPopupCard=document.getElementById('customerNotificationPopupCard');
      customerNotificationPopupAttachments=document.getElementById('customerNotificationPopupAttachments');
      customerNotificationPopupAttachmentList=document.getElementById('customerNotificationPopupAttachmentList');
    }
    if(!notification || !customerNotificationPopup) return;

    if(customerNotificationPopup) customerNotificationPopup.setAttribute('data-active-notification-id',String(notification.id||''));
    if(customerNotificationPopupTitle) customerNotificationPopupTitle.textContent=notification.title || 'Wooten Oil';
    if(customerNotificationPopupMessage) customerNotificationPopupMessage.textContent=notification.message || '';
    if(customerNotificationPopupDate) customerNotificationPopupDate.textContent=notification.display_date || formatNotificationPopupDate(notification.created_at);
    if(customerNotificationPopupFrom){
      customerNotificationPopupFrom.textContent=
        (notification.sender_name||'Wooten Oil Co Inc.')+
        ' <'+(notification.sender_email||'support@wootenoil.com')+'>';
    }
    if(customerNotificationPopupTo) customerNotificationPopupTo.textContent=notification.recipient_email || '';

    var attachments=Array.isArray(notification.attachments)?notification.attachments:[];
    var looksLikeDocumentNotification=/statement|invoice/i.test(String(notification.title||'')+' '+String(notification.message||''));
    var isDocumentNotification=String(notification.action_type||'')==='customer_documents' || looksLikeDocumentNotification;
    var linkedDocumentId=Number(notification.action_id||0);
    activeNotificationDocumentId=isDocumentNotification && linkedDocumentId>0 ? linkedDocumentId : null;

    if(customerNotificationPopupCard){
      customerNotificationPopupCard.classList.remove('document-notification-clickable');
      customerNotificationPopupCard.setAttribute('aria-label','Wooten Oil Notification');
      customerNotificationPopupCard.removeAttribute('role');
      customerNotificationPopupCard.removeAttribute('tabindex');
    }

    if(customerNotificationPopupAttachmentList){
      var rows=attachments.map(function(a){
        var name=String(a.filename||'Attachment');
        var safeName=name.replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
        var safeUrl=String(a.url||'').replace(/"/g,'%22');
        return '<button class="customer-notification-attachment" type="button" data-attachment-url="'+safeUrl+'" data-attachment-name="'+safeName+'">'+
          '<span class="customer-notification-attachment-name">📎 '+safeName+' <small>('+formatPopupFileSize(a.size_bytes)+')</small></span>'+
          '<span class="customer-notification-attachment-open">Open</span>'+
          '</button>';
      });

      var documentFilename=String(notification.document_filename||'').trim();
      var hasPdfDocument=isDocumentNotification && /\.pdf$/i.test(documentFilename);

      if(hasPdfDocument){
        var safeDocumentName=documentFilename.replace(/[&<>"']/g,function(c){
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });

        rows.unshift(
          '<span class="customer-notification-document-link-label">PDF File</span>'+
          '<a href="#" class="customer-notification-document-link" title="Open PDF" data-document-id="'+
            String(activeNotificationDocumentId||'')+
          '">'+safeDocumentName+'</a>'
        );
      }

      customerNotificationPopupAttachmentList.innerHTML=rows.join('');
    }

    if(customerNotificationPopupAttachments){
      var documentFilename=String(notification.document_filename||'').trim();
      var hasPdfDocument=isDocumentNotification && /\.pdf$/i.test(documentFilename);
      customerNotificationPopupAttachments.classList.toggle('show',attachments.length>0 || hasPdfDocument);
      customerNotificationPopupAttachments.classList.toggle('document-notification-footer',hasPdfDocument);
    }

    bindCustomerNotificationAttachmentList();
    customerNotificationPopup.classList.add('show');
    document.body.style.overflow='hidden';
  }

  function notificationFromClickedItem(item){
    if(!item) return null;

    var titleEl=item.querySelector('strong');
    var messageEl=item.querySelector('p');
    var dateEl=item.querySelector('time');

    return {
      id:item.getAttribute('data-notification-id')||'',
      title:(titleEl && titleEl.textContent) || item.getAttribute('data-notification-title') || 'Wooten Oil',
      message:(messageEl && messageEl.textContent) || item.getAttribute('data-notification-message') || '',
      created_at:item.getAttribute('data-notification-created-at') || '',
      display_date:(dateEl && dateEl.textContent) || item.getAttribute('data-notification-date') || '',
      sender_name:'Wooten Oil Co Inc.',
      sender_email:'support@wootenoil.com',
      recipient_email:item.getAttribute('data-notification-to')||'',
      action_type:item.getAttribute('data-notification-action-type')||'',
      action_id:item.getAttribute('data-notification-action-id')||'',
      document_title:item.getAttribute('data-notification-document-title')||'',
      document_filename:item.getAttribute('data-notification-document-filename')||'',
      attachments:(function(){
        try{
          var raw=item.getAttribute('data-notification-attachments')||'';
          if(!raw) return [];
          var parsed=JSON.parse(decodeURIComponent(raw));
          return Array.isArray(parsed)?parsed:[];
        }catch(e){
          console.error('Could not read notification attachment metadata',e);
          return [];
        }
      })()
    };
  }

  async function loadExactCustomerNotification(id){
    var response=await fetch('/api/customer/notifications/detail/'+encodeURIComponent(id),{
      method:'GET',
      credentials:'same-origin',
      cache:'no-store',
      headers:{'Accept':'application/json'}
    });

    var data=await response.json().catch(function(){return {};});

    if(!response.ok || data.success===false || !data.notification){
      throw new Error(data.error || 'Notification could not be opened.');
    }

    return data.notification;
  }

  async function openCustomerNotificationPopup(item){
    if(!item) return;

    var id=item.getAttribute('data-notification-id')||'';
    var fallback=notificationFromClickedItem(item);

    /* Always open immediately using exactly what the customer can already see
       in the dropdown. This guarantees the subject/body do not disappear. */
    if(fallback){
      renderCustomerNotificationPopup(fallback);

      if(customerNotificationPopupDate && fallback.display_date){
        customerNotificationPopupDate.textContent=fallback.display_date;
      }

      /* Keep any attachment metadata already delivered with the notification list
         visible while the exact detail request is loading. */
    }

    if(!id) return;

    try{
      var fullNotification=await loadExactCustomerNotification(id);
      if(fullNotification && fallback){
        if(!fullNotification.action_type && fallback.action_type){
          fullNotification.action_type=fallback.action_type;
        }
        if((fullNotification.action_id==null || fullNotification.action_id==='') && fallback.action_id){
          fullNotification.action_id=fallback.action_id;
        }
        if(!fullNotification.document_title && fallback.document_title){
          fullNotification.document_title=fallback.document_title;
        }
        if(!fullNotification.document_filename && fallback.document_filename){
          fullNotification.document_filename=fallback.document_filename;
        }
      }
      if(
        fullNotification &&
        (!Array.isArray(fullNotification.attachments) || !fullNotification.attachments.length) &&
        fallback &&
        Array.isArray(fallback.attachments) &&
        fallback.attachments.length
      ){
        fullNotification.attachments=fallback.attachments;
      }
      renderCustomerNotificationPopup(fullNotification);
    }catch(error){
      console.error('Notification detail load failed',error);

      /* Keep the visible fallback message open. Show a useful attachment error
         instead of closing or blanking the popup. */
      if(customerNotificationPopupAttachments){
        customerNotificationPopupAttachments.classList.add('show');
      }
      if(customerNotificationPopupAttachmentList){
        customerNotificationPopupAttachmentList.innerHTML=
          '<div style="padding:11px 12px;border:1px solid #fecaca;background:#fff7f7;border-radius:10px;color:#991b1b;font-size:.85rem">'+
          'The full notification details could not be loaded. Please refresh the page and try again.'+
          '</div>';
      }
    }
  }
  window.wootenOpenCustomerNotificationPopup=openCustomerNotificationPopup;



  var notificationPdfOpening=false;

  async function openNotificationLinkedPdf(documentId,filename){
    if(notificationPdfOpening) return;
    notificationPdfOpening=true;
    var id=Number(documentId||0);

    if(!id){
      var notificationId=customerNotificationPopup && customerNotificationPopup.getAttribute('data-active-notification-id');
      if(notificationId){
        try{
          var resolveResponse=await fetch('/api/customer/notifications/document-resolve?notification_id='+encodeURIComponent(notificationId),{
            method:'GET',
            credentials:'same-origin',
            cache:'no-store',
            headers:{'Accept':'application/json'}
          });
          var resolveData=await resolveResponse.json().catch(function(){return {};});
          if(resolveResponse.ok && resolveData.success!==false && Number(resolveData.document_id)>0){
            id=Number(resolveData.document_id);
            activeNotificationDocumentId=id;
          }
        }catch(e){}
      }
    }

    if(!id){
      notificationPdfOpening=false;
      alert('The statement or invoice file could not be located.');
      return;
    }

    /* Use one authenticated, normal URL in the current tab. Android Chrome can
       open duplicate tabs and fail to render PDFs when a blank tab is replaced
       with a temporary blob URL after an asynchronous fetch. */
    window.location.assign('/api/customer/documents/'+encodeURIComponent(id)+'/file');
  }

  async function openNotificationLinkedDocuments(){
    var documentId=activeNotificationDocumentId;

    if(!documentId){
      var notificationId=customerNotificationPopup && customerNotificationPopup.getAttribute('data-active-notification-id');
      if(notificationId){
        try{
          var response=await fetch('/api/customer/notifications/document-resolve?notification_id='+encodeURIComponent(notificationId),{
            method:'GET',
            credentials:'same-origin',
            cache:'no-store',
            headers:{'Accept':'application/json'}
          });
          var data=await response.json().catch(function(){return {};});
          if(response.ok && data.success!==false && Number(data.document_id)>0){
            documentId=Number(data.document_id);
            activeNotificationDocumentId=documentId;
          }
        }catch(e){}
      }
    }

    if(!documentId) return;

    closeCustomerNotificationPopup();
    if(window.wootenOpenCustomerDocuments){
      window.wootenOpenCustomerDocuments(documentId);
    }
  }


  async function openCustomerNotificationAttachment(button){
    if(!button) return;

    var url=button.getAttribute('data-attachment-url')||'';
    var filename=button.getAttribute('data-attachment-name')||'Attachment';
    var openLabel=button.querySelector('.customer-notification-attachment-open');

    if(!url) return;

    /* Open a blank tab immediately while the click is still a user gesture.
       This avoids browser popup blockers after the authenticated fetch finishes. */
    var previewWindow=null;
    try{
      previewWindow=window.open('about:blank','_blank');
      if(previewWindow){
        previewWindow.document.title='Opening '+filename;
        previewWindow.document.body.innerHTML=
          '<div style="font-family:Arial,sans-serif;padding:24px;color:#17314b">Opening attachment…</div>';
      }
    }catch(e){previewWindow=null;}

    button.disabled=true;
    if(openLabel) openLabel.textContent='Opening…';

    try{
      var response=await fetch(url,{
        method:'GET',
        credentials:'same-origin',
        cache:'no-store'
      });

      if(!response.ok){
        var errorText=await response.text().catch(function(){return '';});
        throw new Error(errorText || ('Attachment could not be opened ('+response.status+').'));
      }

      var blob=await response.blob();
      var blobUrl=URL.createObjectURL(blob);

      if(previewWindow && !previewWindow.closed){
        previewWindow.location.replace(blobUrl);
      }else{
        /* Fallback when the browser blocks a new tab. */
        var a=document.createElement('a');
        a.href=blobUrl;
        a.target='_blank';
        a.rel='noopener';
        a.download='';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      setTimeout(function(){URL.revokeObjectURL(blobUrl);},60000);
    }catch(err){
      if(previewWindow && !previewWindow.closed){
        try{previewWindow.close();}catch(e){}
      }
      alert(err && err.message ? err.message : 'Attachment could not be opened.');
    }finally{
      button.disabled=false;
      if(openLabel) openLabel.textContent='Open';
    }
  }

  function bindCustomerNotificationAttachmentList(){
    if(!customerNotificationPopupAttachmentList){
      customerNotificationPopupAttachmentList=document.getElementById('customerNotificationPopupAttachmentList');
    }
    if(customerNotificationPopupAttachmentList && !customerNotificationPopupAttachmentList.dataset.boundAttachmentClick){
      customerNotificationPopupAttachmentList.dataset.boundAttachmentClick='1';
      customerNotificationPopupAttachmentList.addEventListener('click',function(e){
        var documentLink=e.target.closest('.customer-notification-document-link');
        if(documentLink){
          e.preventDefault();
          e.stopPropagation();
          openNotificationLinkedPdf(
            documentLink.getAttribute('data-document-id')||activeNotificationDocumentId,
            documentLink.textContent||'PDF'
          );
          return;
        }

        var button=e.target.closest('.customer-notification-attachment');
        if(!button) return;
        e.preventDefault();
        e.stopPropagation();
        openCustomerNotificationAttachment(button);
      });
    }
  }
  bindCustomerNotificationAttachmentList();

  function closeCustomerNotificationPopup(){
    if(!customerNotificationPopup) return;
    customerNotificationPopup.classList.remove('show');
    document.body.style.overflow='';
  }

  if(customerNotificationPopupClose) customerNotificationPopupClose.addEventListener('click',closeCustomerNotificationPopup);
  if(customerNotificationPopup) customerNotificationPopup.addEventListener('click',function(e){
    if(e.target===customerNotificationPopup) closeCustomerNotificationPopup();
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && customerNotificationPopup && customerNotificationPopup.classList.contains('show')) closeCustomerNotificationPopup();
  });

  if(headerNotificationsClose) headerNotificationsClose.addEventListener('click',function(){
    if(headerNotificationMenu) headerNotificationMenu.classList.remove('show');
  });

  if(headerNotificationList) headerNotificationList.addEventListener('click',function(e){
    var item=e.target.closest('.header-notification-item');
    if(!item) return;
    var account=activePortalCustomer && activePortalCustomer.account_number;
    var id=item.getAttribute('data-notification-id');

    openCustomerNotificationPopup(item);
    if(headerNotificationMenu) headerNotificationMenu.classList.remove('show');

    if(account && id && window.wootenMarkOneCustomerNotificationRead){
      window.wootenMarkOneCustomerNotificationRead(account,id);
    }
  });

  document.addEventListener('click',function(e){
    if(!headerNotificationMenu || !headerNotificationMenu.classList.contains('show')) return;
    if(headerNotificationMenu.contains(e.target)) return;
    if(mobileHeaderNotifications && mobileHeaderNotifications.contains(e.target)) return;
    headerNotificationMenu.classList.remove('show');
  });

  if(dashboardNotifications) dashboardNotifications.addEventListener('click',function(){
    var open=dashboardNotificationPanel && dashboardNotificationPanel.classList.toggle('show');
    dashboardNotifications.setAttribute('aria-expanded',open?'true':'false');
    var account=activePortalCustomer && activePortalCustomer.account_number;
    if(account && window.wootenRenderCustomerNotifications) window.wootenRenderCustomerNotifications(account);
  });

  if(markNotificationsRead) markNotificationsRead.addEventListener('click',function(){
    var account=activePortalCustomer && activePortalCustomer.account_number;
    if(account && window.wootenMarkCustomerNotificationsRead) window.wootenMarkCustomerNotificationsRead(account);
  });

  window.addEventListener('wooten-notifications-changed',function(e){
    var account=activePortalCustomer && activePortalCustomer.account_number;
    if(account && e.detail && String(e.detail.account).replace(/\D/g,'')===String(account).replace(/\D/g,'')){
      if(window.wootenRenderCustomerNotifications) window.wootenRenderCustomerNotifications(account);
    }
  });

  if(dashboardViewAccount) dashboardViewAccount.addEventListener('click',function(){ showAccountDetails(false); });
  if(dashboardMakePayment) dashboardMakePayment.addEventListener('click',function(){ showAccountDetails(true); });
  if(dashboardRequestFuel) dashboardRequestFuel.addEventListener('click',function(){
    showDashboardView();
    window.location.href='request-fuel.html';
  });
  if(dashboardPayments) dashboardPayments.addEventListener('click',function(){ showPaymentHistory(); });
  if(paymentHistoryBack) paymentHistoryBack.addEventListener('click',function(){ showDashboardView(); });
  if(paymentHistoryRefresh) paymentHistoryRefresh.addEventListener('click',function(){ loadPaymentHistory(); });
  if(paymentHistorySearch) paymentHistorySearch.addEventListener('input',function(){ renderPaymentHistory(); });
  if(paymentHistorySort) paymentHistorySort.addEventListener('change',function(){ renderPaymentHistory(); });
  if(dashboardDocuments) dashboardDocuments.addEventListener('click',function(){ showCustomerDocuments(); });
  if(customerDocumentsBack) customerDocumentsBack.addEventListener('click',function(){ showDashboardView(); });
  if(customerDocumentsRefresh) customerDocumentsRefresh.addEventListener('click',function(){ loadCustomerDocuments(); });
  if(customerDocumentsSearch) customerDocumentsSearch.addEventListener('input',function(){ renderCustomerDocuments(); });
  if(customerDocumentsTypeFilter) customerDocumentsTypeFilter.addEventListener('change',function(){ renderCustomerDocuments(); });
  if(dashboardFuelHistory) dashboardFuelHistory.addEventListener('click',function(){ showFuelHistory(); });
  if(fuelHistoryRefresh) fuelHistoryRefresh.addEventListener('click',function(){ loadFuelHistory(); });
  if(fuelHistorySearch) fuelHistorySearch.addEventListener('input',function(){ updateFuelHistoryView(); });
  if(fuelHistorySort) fuelHistorySort.addEventListener('change',function(){ updateFuelHistoryView(); });
  if(fuelHistoryClear) fuelHistoryClear.addEventListener('click',function(){
    if(fuelHistorySearch){
      fuelHistorySearch.value='';
      fuelHistorySearch.focus();
    }
    updateFuelHistoryView();
  });
  if(fuelHistoryBack) fuelHistoryBack.addEventListener('click',function(){ showDashboardView(); });
  if(dashboardBack) dashboardBack.addEventListener('click',function(){ showDashboardView(); });
  if(dashboardLogout) dashboardLogout.addEventListener('click',function(){ if(portalLogout) portalLogout.click(); });

  if(forgotPassword) forgotPassword.addEventListener('click',function(){
    var existing=document.getElementById('portal-user').value.trim();
    if(!existing){
      setStatus(status,'Enter your email address or Customer Number first, then select Forgot password.',false);
      document.getElementById('portal-user').focus();
      return;
    }
    showReset(existing);
  });

  if(useResetCode) useResetCode.addEventListener('click',function(){
    var existing=document.getElementById('portal-user').value.trim();
    showReset(existing);

    setTimeout(function(){
      if(existing){
        document.getElementById('reset-identifier').value=existing;
        clearStatus(resetStatus);
        if(resetOfficeHelp) resetOfficeHelp.style.display='none';
        resetInstructions.textContent='Enter the 6-digit password reset code provided by Wooten Oil, then create and confirm your new password.';
        resetDetails.classList.add('show');
        setStatus(resetStatus,'Enter the reset code provided by Wooten Oil.',true);
        document.getElementById('reset-code').focus();
      }else{
        setStatus(resetStatus,'Enter your Customer Number or email first, then choose I already have a Reset Code.',true);
        document.getElementById('reset-identifier').focus();
      }
    },75);
  });

  if(resetBack) resetBack.addEventListener('click',function(){
    var identifier=document.getElementById('reset-identifier').value.trim();
    showLogin();
    if(identifier) document.getElementById('portal-user').value=identifier;
    clearStatus(status);
  });

  if(resetHaveCode) resetHaveCode.addEventListener('click',function(){
    var identifier=document.getElementById('reset-identifier').value.trim();
    if(!identifier){
      setStatus(resetStatus,'Enter your email address or Customer Number first.',false);
      document.getElementById('reset-identifier').focus();
      return;
    }
    clearStatus(resetStatus);
    if(resetOfficeHelp) resetOfficeHelp.style.display='none';
    resetInstructions.textContent='Enter the 6-digit password reset code provided by Wooten Oil, then create and confirm your new password.';
    resetDetails.classList.add('show');
    setStatus(resetStatus,'Enter the reset code provided by Wooten Oil.',true);
    setTimeout(function(){document.getElementById('reset-code').focus();},50);
  });

  if(resetStart) resetStart.addEventListener('click',async function(){
    var identifier=document.getElementById('reset-identifier').value.trim();
    if(!identifier){ setStatus(resetStatus,'Enter the email address or Customer Number on the account.',false); return; }
    clearStatus(resetStatus);
    resetDetails.classList.remove('show');
    if(resetOfficeHelp) resetOfficeHelp.style.display='none';
    resetStart.disabled=true; resetStart.textContent='Checking…';
    try{
      var r=await fetch(RESET_START_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',body:JSON.stringify({identifier:identifier})});
      var d=await r.json().catch(function(){return {};});
      if(!r.ok || d.success===false){
        if(d.setup_required){ showActivation(d.account_number || identifier); setStatus(activationStatus,d.error || 'This account must be activated first.',false); return; }
        throw new Error(d.error || 'Password recovery could not be started.');
      }
      if(d.account_number) document.getElementById('reset-identifier').value=d.account_number;
      if(d.method==='email'){
        resetInstructions.textContent='A 6-digit reset code was sent to '+(d.destination || 'the email address on your account')+'. Enter the code below and create a new password.';
        resetDetails.classList.add('show');
        setTimeout(function(){document.getElementById('reset-code').focus();},50);
      }else if(d.method==='sms'){
        resetInstructions.textContent='A 6-digit reset code was sent by text message to '+(d.destination || 'the phone number on your account')+'. Enter the code below and create a new password.';
        resetDetails.classList.add('show');
        setTimeout(function(){document.getElementById('reset-code').focus();},50);
      }else{
        resetInstructions.textContent=d.message || 'Please contact Wooten Oil for password assistance.';
        if(resetOfficeHelp) resetOfficeHelp.style.display='block';
      }
      setStatus(resetStatus,d.message || 'Account located.',true);
    }catch(err){ setStatus(resetStatus,err.message || 'Password recovery could not be started.',false); }
    finally{ resetStart.disabled=false; resetStart.textContent='Send Reset Code'; }
  });

  if(resetComplete) resetComplete.addEventListener('click',async function(){
    var identifier=document.getElementById('reset-identifier').value.trim();
    var code=document.getElementById('reset-code').value.trim();
    var password=document.getElementById('reset-password').value;
    var confirm=document.getElementById('reset-confirm').value;
    if(!identifier || !code || !password || !confirm){ setStatus(resetStatus,'Enter the reset code and both password fields.',false); return; }
    if(!/^\d{6}$/.test(code)){ setStatus(resetStatus,'Enter the 6-digit reset code.',false); return; }
    if(password.length<10){ setStatus(resetStatus,'Your password must be at least 10 characters.',false); return; }
    if(password!==confirm){ setStatus(resetStatus,'The passwords do not match.',false); return; }
    clearStatus(resetStatus); resetComplete.disabled=true; resetComplete.textContent='Resetting…';
    try{
      var r=await fetch(RESET_COMPLETE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',body:JSON.stringify({identifier:identifier,code:code,password:password,confirm_password:confirm})});
      var d=await r.json().catch(function(){return {};});
      if(!r.ok || d.success===false) throw new Error(d.error || 'Password reset failed.');
      showLogin();
      document.getElementById('portal-user').value=d.account_number || identifier;
      document.getElementById('portal-password').value='';
      setStatus(status,d.message || 'Your password has been reset. Sign in with your new password.',true);
      setTimeout(function(){document.getElementById('portal-password').focus();},50);
    }catch(err){ setStatus(resetStatus,err.message || 'Password reset failed.',false); }
    finally{ resetComplete.disabled=false; resetComplete.textContent='Reset Password'; }
  });

  if(activateLink) activateLink.addEventListener('click',function(){
    var existing=document.getElementById('portal-user').value.trim();
    showActivation(existing);
  });

  if(activationBack) activationBack.addEventListener('click',function(){
    showLogin();
    clearStatus(status);
  });

  if(activationStart) activationStart.addEventListener('click',async function(){
    var account=document.getElementById('activation-account').value.trim();
    if(!account){
      setStatus(activationStatus,'Enter your Customer Number.',false);
      return;
    }
    clearStatus(activationStatus);
    activationStart.disabled=true;
    activationStart.textContent='Checking…';
    try{
      var r=await fetch(ACTIVATE_START_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({account_number:account})
      });
      var d=await r.json().catch(function(){return {};});
      if(!r.ok || d.success===false){
        if(d.already_activated){
          throw new Error('This online account has already been activated. Please return to Sign In.');
        }
        throw new Error(d.error || 'We could not start account activation.');
      }
      document.getElementById('activation-account').value=d.account_number || account;
      activationDetails.classList.add('show');
      if(d.method==='email'){
        activationInstructions.textContent='A 6-digit verification code was sent to '+(d.email || 'the email address on your account')+'. Enter that code below and create your password.';
      }else{
        activationInstructions.textContent='There is no email address on this account. Please contact Wooten Oil, verify your account with our staff, and ask for a one-time 6-digit activation code. Then enter the code below and create your password.';
      }
      setStatus(activationStatus,d.message || 'Account located. Continue below.',true);
      setTimeout(function(){ document.getElementById('activation-code').focus(); },50);
    }catch(err){
      setStatus(activationStatus,err.message || 'Activation could not be started.',false);
    }finally{
      activationStart.disabled=false;
      activationStart.textContent='Continue';
    }
  });

  if(activationComplete) activationComplete.addEventListener('click',async function(){
    var account=document.getElementById('activation-account').value.trim();
    var code=document.getElementById('activation-code').value.trim();
    var password=document.getElementById('activation-password').value;
    var confirm=document.getElementById('activation-confirm').value;
    if(!account || !code || !password || !confirm){
      setStatus(activationStatus,'Enter the activation code and both password fields.',false);
      return;
    }
    if(!/^\d{6}$/.test(code)){
      setStatus(activationStatus,'Enter the 6-digit activation code.',false);
      return;
    }
    if(password.length<10){
      setStatus(activationStatus,'Your password must be at least 10 characters.',false);
      return;
    }
    if(password!==confirm){
      setStatus(activationStatus,'The passwords do not match.',false);
      return;
    }
    clearStatus(activationStatus);
    activationComplete.disabled=true;
    activationComplete.textContent='Activating…';
    try{
      var r=await fetch(ACTIVATE_SET_PASSWORD_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({
          account_number:account,
          code:code,
          password:password,
          confirm_password:confirm
        })
      });
      var d=await r.json().catch(function(){return {};});
      if(!r.ok || d.success===false){ throw new Error(d.error || 'Account activation failed.'); }
      showLogin();
      document.getElementById('portal-user').value=d.account_number || account;
      document.getElementById('portal-password').value='';
      setStatus(status,'Your online account is activated. Enter your new password to sign in.',true);
      setTimeout(function(){ document.getElementById('portal-password').focus(); },50);
    }catch(err){
      setStatus(activationStatus,err.message || 'Account activation failed.',false);
    }finally{
      activationComplete.disabled=false;
      activationComplete.textContent='Activate Account';
    }
  });

  async function performLogout(button,openLogin){
    if(button) button.disabled=true;
    try{
      await fetch(LOGOUT_ENDPOINT,{method:'POST',headers:{'Accept':'application/json'},credentials:'same-origin'});
    }catch(e){}
    updateCustomerMenu(null);
    form.reset();
    clearStatus(status);
    if(openLogin) showLogin();
    else{
      hideAll();
      if(location.hash==='#mobile-menu' || location.hash==='#customer-login') location.hash='top';
    }
    if(button) button.disabled=false;
  }
  if(logout) logout.addEventListener('click',function(){ performLogout(logout,true); });
  if(desktopCustomerLogout) desktopCustomerLogout.addEventListener('click',function(){ performLogout(desktopCustomerLogout,false); });
  if(mobileCustomerLogout) mobileCustomerLogout.addEventListener('click',function(){ performLogout(mobileCustomerLogout,false); });

  document.querySelectorAll('a[href="#customer-login"]').forEach(function(link){
    link.addEventListener('click',function(){
      clearStatus(status);
      loadCurrentAccount(true).then(function(ok){ if(!ok) showLogin(); });
    });
  });

  async function openCustomerPortalFromHash(){
    if(location.hash!=='#customer-login') return;
    clearStatus(status);
    var ok=await loadCurrentAccount(true);
    if(!ok){
      showLogin();
      return;
    }
    /* Always force the first screen to the current Customer Dashboard.
       This clears any Account Details / Fuel History state restored by bfcache. */
    if(accountCard) accountCard.classList.add('show');
    if(openPendingDocument()) return;
    showDashboardView();
  }

  refreshCustomerMenu();
  openCustomerPortalFromHash();

  window.addEventListener('hashchange',function(){
    if(location.hash==='#customer-login'){
      openCustomerPortalFromHash();
    }
  });

  window.addEventListener('pageshow',function(){
    refreshCustomerMenu();
    if(location.hash==='#customer-login'){
      openCustomerPortalFromHash();
    }
  });
})();
