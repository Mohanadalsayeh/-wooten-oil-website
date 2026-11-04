/* Wooten Oil Admin — phone-only floating header.
   Reuses the existing notification bell and authenticated sign-out button. */
(function(){
 'use strict';
 const phone=window.matchMedia('(max-width:720px)');
 function init(){
  if(!document.body || document.body.id!=='wooten-admin-page')return;
  const bar=document.querySelector('.admin-mobile-bar');
  const menuButton=document.getElementById('adminMobileMenuBtn');
  const bell=document.querySelector('.admin-header-actions .admin-bell-shell');
  const bellButton=document.getElementById('adminNotificationBell');
  const bellMenu=document.getElementById('adminNotificationMenu');
  const access=document.getElementById('adminAccessOpenBtn');
  const footer=document.getElementById('adminSidebarFooter');
  const drawerClose=document.getElementById('adminDrawerClose');
  if(!bar||!menuButton||!bell||!bellButton||!bellMenu||!access||!footer)return;
  if(document.body.dataset.adminFloatingHeaderInit==='1')return;
  document.body.dataset.adminFloatingHeaderInit='1';
  // Keep original positions so tablet/desktop are unaffected by resize.
  const bellHome=document.createComment('Admin notification bell original position');
  const accessHome=document.createComment('Admin logout button original position');
  bell.parentNode.insertBefore(bellHome,bell);
  access.parentNode.insertBefore(accessHome,access);
  function closeBell(){
   if(!bellMenu.hidden){
    bellMenu.hidden=true;
    bellButton.setAttribute('aria-expanded','false');
   }
  }
  function arrange(){
   if(phone.matches){
    if(bell.parentNode!==bar)bar.insertBefore(bell,menuButton);
    if(access.parentNode!==footer)footer.appendChild(access);
    document.body.classList.add('wooten-admin-phone-floating');
   }else{
    closeBell();
    bellHome.after(bell);
    accessHome.after(access);
    document.body.classList.remove('wooten-admin-phone-floating');
   }
  }
  menuButton.addEventListener('click',function(){if(phone.matches)closeBell();});
  // Keep the normal auth/logout handler; close the phone drawer after sign-out.
  access.addEventListener('click',function(){
   if(phone.matches&&document.body.classList.contains('admin-drawer-open'))
    drawerClose?.click();
  });
  if(phone.addEventListener)phone.addEventListener('change',arrange);
  else if(phone.addListener)phone.addListener(arrange);
  arrange();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
