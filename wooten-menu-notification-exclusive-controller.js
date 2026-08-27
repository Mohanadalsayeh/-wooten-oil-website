(function(){
  function closeMainMenu(){
    var menu=document.getElementById('mobile-menu');
    var button=document.querySelector('.mobile-menu-button');
    if(!menu) return;

    menu.classList.remove('menu-open');
    menu.setAttribute('aria-hidden','true');
    if(button) button.setAttribute('aria-expanded','false');

    if(window.location.hash==='#mobile-menu'){
      history.replaceState(null,'',window.location.pathname+window.location.search);
    }
  }

  function closeNotificationMenus(){
    var headerMenu=document.getElementById('headerNotificationMenu');
    var headerBell=document.getElementById('mobileHeaderNotifications');
    var dashboardPanel=document.getElementById('dashboardNotificationPanel');
    var dashboardBell=document.getElementById('dashboardNotifications');

    if(headerMenu) headerMenu.classList.remove('show');
    if(headerBell) headerBell.setAttribute('aria-expanded','false');
    if(dashboardPanel) dashboardPanel.classList.remove('show');
    if(dashboardBell) dashboardBell.setAttribute('aria-expanded','false');
  }

  function bindExclusiveMenus(){
    var mainButton=document.querySelector('.mobile-menu-button');
    var headerBell=document.getElementById('mobileHeaderNotifications');
    var dashboardBell=document.getElementById('dashboardNotifications');

    if(mainButton && !mainButton.dataset.exclusiveMenuBound){
      mainButton.dataset.exclusiveMenuBound='1';
      mainButton.addEventListener('click',function(){
        /* Existing main-menu handler decides whether it opens/closes.
           If it opens, the notification surfaces must be closed. */
        setTimeout(function(){
          var menu=document.getElementById('mobile-menu');
          if(menu && menu.classList.contains('menu-open')){
            closeNotificationMenus();
          }
        },0);
      });
    }

    if(headerBell && !headerBell.dataset.exclusiveMenuBound){
      headerBell.dataset.exclusiveMenuBound='1';
      headerBell.addEventListener('click',function(){
        /* The notification handler stops propagation, so explicitly close
           the main menu whenever the notification dropdown ends up open. */
        setTimeout(function(){
          var notificationMenu=document.getElementById('headerNotificationMenu');
          if(notificationMenu && notificationMenu.classList.contains('show')){
            closeMainMenu();
          }
        },0);
      });
    }

    if(dashboardBell && !dashboardBell.dataset.exclusiveMenuBound){
      dashboardBell.dataset.exclusiveMenuBound='1';
      dashboardBell.addEventListener('click',function(){
        setTimeout(function(){
          var panel=document.getElementById('dashboardNotificationPanel');
          if(panel && panel.classList.contains('show')){
            closeMainMenu();
          }
        },0);
      });
    }
  }

  window.wootenCloseMainMenu=closeMainMenu;
  window.wootenCloseNotificationMenus=closeNotificationMenus;

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',bindExclusiveMenus);
  }else{
    bindExclusiveMenus();
  }
})();
