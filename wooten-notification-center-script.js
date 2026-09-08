(function(){
  var NOTIFICATIONS_ENDPOINT='/api/customer/notifications';
  var NOTIFICATIONS_READ_ENDPOINT='/api/customer/notifications/read';
  var NOTIFICATIONS_CLEAR_ENDPOINT='/api/customer/notifications/clear';
  var customerFetch=window.wootenCustomerFetch||function(input,init){return fetch(input,init);};
  var cachedItems=[];
  var notificationLoadPromise=null;
  var notificationLoadController=null;
  var notificationLoadAccount='';
  var notificationLoadGeneration=0;
  var notificationPollTimer=0;
  var notificationPollFailures=0;
  var lastNotificationLoadFailed=false;
  var lastRenderSignature='';
  var wasCustomerSignedIn=document.body.classList.contains('customer-signed-in');
  window.wootenNotificationCache=window.wootenNotificationCache||[];

  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function formatDate(value){
    try{
      var d=new Date(value);
      if(Number.isNaN(d.getTime())) return String(value||'');
      return d.toLocaleString('en-US',{
        month:'short',day:'numeric',year:'numeric',
        hour:'numeric',minute:'2-digit'
      });
    }catch(e){ return ''; }
  }

  function notificationElements(){
    return {
      list:document.getElementById('dashboardNotificationList'),
      headerList:document.getElementById('headerNotificationList'),
      badge:document.getElementById('dashboardNotificationBadge'),
      headerBadge:document.getElementById('mobileHeaderNotificationBadge'),
      clearButton:document.getElementById('clearCustomerNotifications')
    };
  }

  function renderError(message){
    var els=notificationElements();
    var html='<div class="notification-empty" style="color:#a12622">'+
      escapeHtml(message||'Unable to load notifications.')+
      '</div>';

    if(els.list) els.list.innerHTML=html;
    if(els.headerList) els.headerList.innerHTML=html;

    if(els.badge) els.badge.style.display='none';
    if(els.headerBadge) els.headerBadge.style.display='none';
  }

  function renderItems(items,force){
    items=Array.isArray(items)?items:[];
    cachedItems=items;
    window.wootenNotificationCache=items;

    var signature='';
    try{signature=JSON.stringify(items);}catch(_error){signature=String(Date.now());}
    if(!force && signature===lastRenderSignature) return;
    lastRenderSignature=signature;

    var els=notificationElements();
    var unread=items.filter(function(n){return !n.read;}).length;
    var badgeText=unread>9?'9+':String(unread);

    if(els.badge){
      els.badge.textContent=badgeText;
      els.badge.style.display=unread?'block':'none';
    }

    if(els.headerBadge){
      els.headerBadge.textContent=badgeText;
      els.headerBadge.style.display=unread?'block':'none';
    }

    if(els.clearButton) els.clearButton.disabled=!items.length;

    var empty='<div class="notification-empty">No notifications yet.</div>';

    if(els.list){
      els.list.innerHTML=!items.length?empty:items.map(function(n){
        return '<button type="button" class="notification-item customer-notification-open '+(!n.read?'unread':'')+
          '" data-notification-id="'+escapeHtml(n.id)+
          '" data-notification-title="'+escapeHtml(n.title||'Wooten Oil')+
          '" data-notification-message="'+escapeHtml(n.message||'')+
          '" data-notification-date="'+escapeHtml(formatDate(n.created_at))+
          '" data-notification-created-at="'+escapeHtml(n.created_at||'')+
          '" data-notification-from="'+escapeHtml((n.sender_name||'Wooten Oil Co Inc.')+' <'+(n.sender_email||'support@wootenoil.com')+'>')+
          '" data-notification-to="'+escapeHtml(n.recipient_email||'')+
          '" data-notification-action-type="'+escapeHtml(n.action_type||'')+
          '" data-notification-action-id="'+escapeHtml(n.action_id==null?'':String(n.action_id))+
          '" data-notification-document-title="'+escapeHtml(n.document_title||'')+
          '" data-notification-document-filename="'+escapeHtml(n.document_filename||'')+
          '" data-notification-attachments="'+escapeHtml(encodeURIComponent(JSON.stringify(n.attachments||[])))+'">'+
          '<span class="notification-dot"></span>'+
          '<span class="notification-copy">'+
          '<strong>'+escapeHtml(n.title||'Wooten Oil')+'</strong>'+
          '<p>'+escapeHtml(n.message||'')+'</p>'+
          '<time>'+escapeHtml(formatDate(n.created_at))+'</time>'+
          '</span></button>';
      }).join('');
    }

    if(els.headerList){
      els.headerList.innerHTML=!items.length?empty:items.map(function(n){
        return '<button type="button" class="header-notification-item '+(!n.read?'unread':'')+
          '" data-notification-id="'+escapeHtml(n.id)+
          '" data-notification-title="'+escapeHtml(n.title||'Wooten Oil')+
          '" data-notification-message="'+escapeHtml(n.message||'')+
          '" data-notification-date="'+escapeHtml(formatDate(n.created_at))+
          '" data-notification-created-at="'+escapeHtml(n.created_at||'')+
          '" data-notification-from="'+escapeHtml((n.sender_name||'Wooten Oil Co Inc.')+' <'+(n.sender_email||'support@wootenoil.com')+'>')+
          '" data-notification-to="'+escapeHtml(n.recipient_email||'')+
          '" data-notification-action-type="'+escapeHtml(n.action_type||'')+
          '" data-notification-action-id="'+escapeHtml(n.action_id==null?'':String(n.action_id))+
          '" data-notification-document-title="'+escapeHtml(n.document_title||'')+
          '" data-notification-document-filename="'+escapeHtml(n.document_filename||'')+
          '" data-notification-attachments="'+escapeHtml(encodeURIComponent(JSON.stringify(n.attachments||[])))+'">'+
          '<span class="header-notification-dot"></span>'+
          '<span class="header-notification-copy">'+
          '<strong>'+escapeHtml(n.title||'Wooten Oil')+'</strong>'+
          '<p>'+escapeHtml(n.message||'')+'</p>'+
          '<time>'+escapeHtml(formatDate(n.created_at))+'</time>'+
          '</span></button>';
      }).join('');
    }
  }

  function currentAccountKey(account){
    var value=String(account||'').trim();
    if(value) return value;
    var label=document.getElementById('acctNumber');
    return String(label && label.textContent || '').replace(/^Customer\s*#\s*/i,'').trim();
  }

  window.wootenRenderCustomerNotifications=function(account,options){
    options=options||{};
    var accountKey=currentAccountKey(account);

    if(notificationLoadPromise){
      if(!options.supersede && accountKey===notificationLoadAccount) return notificationLoadPromise;
      if(notificationLoadController) notificationLoadController.abort();
    }

    notificationLoadGeneration+=1;
    var generation=notificationLoadGeneration;
    notificationLoadAccount=accountKey;
    notificationLoadController=typeof AbortController==='function' ? new AbortController() : null;
    var signal=notificationLoadController ? notificationLoadController.signal : undefined;

    notificationLoadPromise=(async function(){
      try{
        var response=await customerFetch(NOTIFICATIONS_ENDPOINT,{
          method:'GET',
          headers:{'Accept':'application/json'},
          credentials:'same-origin',
          cache:'no-store',
          signal:signal
        });

        var data=await response.json().catch(function(){return {};});
        if(generation!==notificationLoadGeneration) return cachedItems;

        if(response.status===401){
          lastNotificationLoadFailed=false;
          renderItems([],true);
          return [];
        }

        if(!response.ok || data.success===false){
          throw new Error(data.error||('Notification API error '+response.status));
        }

        var items=Array.isArray(data.notifications)?data.notifications:[];
        lastNotificationLoadFailed=false;
        renderItems(items);
        return items;
      }catch(error){
        if(generation!==notificationLoadGeneration || (error && error.name==='AbortError')) return cachedItems;
        lastNotificationLoadFailed=true;
        console.error('Customer notifications load failed',error);
        if(!cachedItems.length){
          renderError(error && error.message ? error.message : 'Unable to load notifications.');
        }
        return cachedItems;
      }finally{
        if(generation===notificationLoadGeneration){
          notificationLoadPromise=null;
          notificationLoadController=null;
        }
      }
    })();

    return notificationLoadPromise;
  };

  window.wootenMarkOneCustomerNotificationRead=async function(account,id){
    if(!id) return;

    try{
      var response=await customerFetch(NOTIFICATIONS_READ_ENDPOINT,{
        method:'POST',
        credentials:'same-origin',
        headers:{
          'Content-Type':'application/json',
          'Accept':'application/json'
        },
        body:JSON.stringify({id:Number(id)})
      });

      var data=await response.json().catch(function(){return {};});

      if(!response.ok || data.success===false){
        throw new Error(data.error||'Unable to mark notification read.');
      }

      await window.wootenRenderCustomerNotifications('',{supersede:true});

    }catch(error){
      console.error('Could not mark notification read',error);
      renderError(error && error.message ? error.message : 'Unable to update notification.');
    }
  };

  window.wootenMarkCustomerNotificationsRead=async function(){
    try{
      var response=await customerFetch(NOTIFICATIONS_READ_ENDPOINT,{
        method:'POST',
        credentials:'same-origin',
        headers:{
          'Content-Type':'application/json',
          'Accept':'application/json'
        },
        body:JSON.stringify({all:true})
      });

      var data=await response.json().catch(function(){return {};});

      if(!response.ok || data.success===false){
        throw new Error(data.error||'Unable to mark notifications read.');
      }

      await window.wootenRenderCustomerNotifications('',{supersede:true});

    }catch(error){
      console.error('Could not mark notifications read',error);
      renderError(error && error.message ? error.message : 'Unable to update notifications.');
    }
  };

  window.wootenClearCustomerNotifications=async function(){
    if(!cachedItems.length) return false;

    var confirmed=window.confirm(
      'Clear all notifications from this menu? Your statements and invoices will remain available in your account.'
    );
    if(!confirmed) return false;

    var button=document.getElementById('clearCustomerNotifications');
    var originalText=button?button.textContent:'Clear notifications';
    if(button){
      button.disabled=true;
      button.textContent='Clearing...';
    }

    try{
      var response=await customerFetch(NOTIFICATIONS_CLEAR_ENDPOINT,{
        method:'POST',
        credentials:'same-origin',
        headers:{'Accept':'application/json'}
      });
      var data=await response.json().catch(function(){return {};});

      if(!response.ok || data.success===false){
        throw new Error(data.error||'Unable to clear notifications.');
      }

      notificationLoadGeneration+=1;
      if(notificationLoadController) notificationLoadController.abort();
      notificationLoadPromise=null;
      notificationLoadController=null;
      notificationLoadAccount='';
      lastNotificationLoadFailed=false;
      renderItems([],true);
      return true;
    }catch(error){
      console.error('Could not clear notifications',error);
      window.alert(error && error.message ? error.message : 'Unable to clear notifications.');
      await window.wootenRenderCustomerNotifications();
      return false;
    }finally{
      if(button){
        button.textContent=originalText;
        button.disabled=!cachedItems.length;
      }
    }
  };

  window.wootenAddCustomerNotification=function(){
    return window.wootenRenderCustomerNotifications();
  };

  function openNotificationItem(item){
    if(!item) return;
    var id=item.getAttribute('data-notification-id');

    if(window.wootenOpenCustomerNotificationPopup){
      window.wootenOpenCustomerNotificationPopup(item);
    }

    if(id && window.wootenMarkOneCustomerNotificationRead){
      window.wootenMarkOneCustomerNotificationRead('',id);
    }
  }

  var dashboardList=document.getElementById('dashboardNotificationList');
  if(dashboardList){
    dashboardList.addEventListener('click',function(e){
      var item=e.target.closest('.customer-notification-open');
      if(!item) return;
      e.preventDefault();
      e.stopPropagation();
      openNotificationItem(item);
    });
  }

  var clearButton=document.getElementById('clearCustomerNotifications');
  if(clearButton && !clearButton.dataset.notificationClearBound){
    clearButton.dataset.notificationClearBound='1';
    clearButton.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      window.wootenClearCustomerNotifications();
    });
  }

  /* Defensive bell behavior: make both customer bells work even if an earlier
     portal handler was interrupted by another page script. */
  function toggleNotificationSurface(source){
    var headerMenu=document.getElementById('headerNotificationMenu');
    var dashboardPanel=document.getElementById('dashboardNotificationPanel');

    window.wootenRenderCustomerNotifications();

    if(source==='dashboard' && dashboardPanel){
      var willOpen=!dashboardPanel.classList.contains('show');
      dashboardPanel.classList.toggle('show',willOpen);
      var dashboardBell=document.getElementById('dashboardNotifications');
      if(dashboardBell) dashboardBell.setAttribute('aria-expanded',willOpen?'true':'false');
      return;
    }

    if(headerMenu){
      headerMenu.classList.toggle('show');
    }
  }

  var headerBell=document.getElementById('mobileHeaderNotifications');
  if(headerBell && !headerBell.dataset.notificationFallbackBound){
    headerBell.dataset.notificationFallbackBound='1';
    headerBell.addEventListener('click',function(e){
      /* Earlier customer-portal handler normally handles this. If it did not
         produce a visible menu, make sure the menu is visible now. */
      setTimeout(function(){
        var menu=document.getElementById('headerNotificationMenu');
        if(menu && !menu.classList.contains('show')){
          window.wootenRenderCustomerNotifications();
          menu.classList.add('show');
        }
      },0);
    });
  }

  var dashboardBell=document.getElementById('dashboardNotifications');
  if(dashboardBell && !dashboardBell.dataset.notificationFallbackBound){
    dashboardBell.dataset.notificationFallbackBound='1';
    dashboardBell.addEventListener('click',function(){
      setTimeout(function(){
        var panel=document.getElementById('dashboardNotificationPanel');
        if(panel && !panel.classList.contains('show')){
          window.wootenRenderCustomerNotifications();
          panel.classList.add('show');
          dashboardBell.setAttribute('aria-expanded','true');
        }
      },0);
    });
  }


  function canRefreshNotifications(){
    return document.body.classList.contains('customer-signed-in') &&
      !document.hidden && navigator.onLine!==false;
  }

  function clearNotificationPoll(){
    clearTimeout(notificationPollTimer);
    notificationPollTimer=0;
  }

  function scheduleNotificationPoll(delay){
    clearNotificationPoll();
    if(!document.body.classList.contains('customer-signed-in')) return;
    notificationPollTimer=setTimeout(runNotificationPoll,delay);
  }

  async function runNotificationPoll(){
    clearNotificationPoll();
    if(!canRefreshNotifications()) return;
    await window.wootenRenderCustomerNotifications();
    notificationPollFailures=lastNotificationLoadFailed
      ? Math.min(notificationPollFailures+1,4)
      : 0;
    scheduleNotificationPoll(Math.min(300000,30000*Math.pow(2,notificationPollFailures)));
  }

  function refreshIfSignedIn(){
    if(!canRefreshNotifications()) return Promise.resolve(cachedItems);
    return window.wootenRenderCustomerNotifications();
  }

  function bootstrapNotifications(){
    setTimeout(function(){
      refreshIfSignedIn().finally(function(){scheduleNotificationPoll(30000);});
    },350);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',bootstrapNotifications,{once:true});
  }else{
    bootstrapNotifications();
  }

  new MutationObserver(function(){
    var signedIn=document.body.classList.contains('customer-signed-in');
    if(signedIn===wasCustomerSignedIn) return;
    wasCustomerSignedIn=signedIn;
    if(signedIn){
      refreshIfSignedIn().finally(function(){scheduleNotificationPoll(30000);});
    }else{
      clearNotificationPoll();
      notificationPollFailures=0;
      notificationLoadGeneration+=1;
      if(notificationLoadController) notificationLoadController.abort();
      notificationLoadPromise=null;
      notificationLoadController=null;
      notificationLoadAccount='';
      renderItems([],true);
    }
  }).observe(document.body,{attributes:true,attributeFilter:['class']});

  window.addEventListener('online',function(){
    if(document.body.classList.contains('customer-signed-in')){
      refreshIfSignedIn().finally(function(){scheduleNotificationPoll(30000);});
    }
  });

  window.addEventListener('offline',clearNotificationPoll);

  document.addEventListener('visibilitychange',function(){
    if(document.hidden){
      clearNotificationPoll();
      return;
    }
    if(document.body.classList.contains('customer-signed-in')){
      refreshIfSignedIn().finally(function(){scheduleNotificationPoll(30000);});
    }
  });
})();
