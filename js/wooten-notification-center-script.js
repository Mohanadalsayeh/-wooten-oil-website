(function(){
  var NOTIFICATIONS_ENDPOINT='/api/customer/notifications';
  var NOTIFICATIONS_READ_ENDPOINT='/api/customer/notifications/read';
  var cachedItems=[];
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
      headerBadge:document.getElementById('mobileHeaderNotificationBadge')
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

  function renderItems(items){
    items=Array.isArray(items)?items:[];
    cachedItems=items;
    window.wootenNotificationCache=items;

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

  window.wootenRenderCustomerNotifications=async function(){
    try{
      var response=await fetch(NOTIFICATIONS_ENDPOINT,{
        method:'GET',
        headers:{'Accept':'application/json'},
        credentials:'same-origin',
        cache:'no-store'
      });

      var data=await response.json().catch(function(){return {};});

      if(response.status===401){
        renderItems([]);
        return [];
      }

      if(!response.ok || data.success===false){
        throw new Error(data.error||('Notification API error '+response.status));
      }

      var items=Array.isArray(data.notifications)?data.notifications:[];
      renderItems(items);
      return items;

    }catch(error){
      console.error('Customer notifications load failed',error);
      renderError(error && error.message ? error.message : 'Unable to load notifications.');
      return cachedItems;
    }
  };

  window.wootenMarkOneCustomerNotificationRead=async function(account,id){
    if(!id) return;

    try{
      var response=await fetch(NOTIFICATIONS_READ_ENDPOINT,{
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

      await window.wootenRenderCustomerNotifications();

    }catch(error){
      console.error('Could not mark notification read',error);
      renderError(error && error.message ? error.message : 'Unable to update notification.');
    }
  };

  window.wootenMarkCustomerNotificationsRead=async function(){
    try{
      var response=await fetch(NOTIFICATIONS_READ_ENDPOINT,{
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

      await window.wootenRenderCustomerNotifications();

    }catch(error){
      console.error('Could not mark notifications read',error);
      renderError(error && error.message ? error.message : 'Unable to update notifications.');
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


  function refreshIfSignedIn(){
    if(document.body.classList.contains('customer-signed-in')){
      window.wootenRenderCustomerNotifications();
    }
  }

  // The portal login script appears earlier in the page, so run an explicit
  // refresh after all scripts have loaded. This fixes customers who were
  // already logged in when the page was refreshed.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){
      setTimeout(refreshIfSignedIn,350);
      setTimeout(refreshIfSignedIn,1400);
    });
  }else{
    setTimeout(refreshIfSignedIn,350);
    setTimeout(refreshIfSignedIn,1400);
  }

  window.addEventListener('load',function(){
    setTimeout(refreshIfSignedIn,600);
  });

  setInterval(refreshIfSignedIn,30000);

  document.addEventListener('visibilitychange',function(){
    if(!document.hidden) refreshIfSignedIn();
  });
})();
