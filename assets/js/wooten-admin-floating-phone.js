/* Wooten Oil Admin — viewport floating headers for mobile and desktop.
   Move the existing bell and login/logout button; never clone live controls. */
(function(){
 'use strict';
 const phone=window.matchMedia('(max-width:720px)');
 const desktop=window.matchMedia('(min-width:1025px)');
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
  const desktopHeader=document.getElementById('wootenAdminDesktopFloat');
  const desktopBellTarget=document.getElementById('wootenAdminDesktopBell');
  const desktopDate=document.getElementById('wootenAdminDesktopDate');
  if(!bar||!menuButton||!bell||!bellButton||!bellMenu||!access||!footer||!desktopHeader||!desktopBellTarget||!desktopDate)return;
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
  function updateDate(){
   desktopDate.textContent=new Intl.DateTimeFormat('en-US',{
    weekday:'long',month:'long',day:'numeric',year:'numeric',
    timeZone:'America/Chicago'
   }).format(new Date())+' • Central Time';
  }
  function arrange(){
   closeBell();
   if(phone.matches){
    if(bell.parentNode!==bar)bar.insertBefore(bell,menuButton);
    if(access.parentNode!==footer)footer.appendChild(access);
    document.body.classList.add('wooten-admin-phone-floating');
    document.body.classList.remove('wooten-admin-desktop-floating');
   }else if(desktop.matches){
    // Desktop: bell at the RIGHT end of the navy header; authenticated access
    // stays in the pinned sidebar footer, never in the header.
    if(bell.parentNode!==desktopBellTarget)desktopBellTarget.appendChild(bell);
    if(access.parentNode!==footer)footer.appendChild(access);
    document.body.classList.add('wooten-admin-desktop-floating');
    document.body.classList.remove('wooten-admin-phone-floating');
   }else{
    // Tablet keeps its previous header and navigation layout unchanged.
    bellHome.after(bell);
    accessHome.after(access);
    document.body.classList.remove('wooten-admin-phone-floating');
    document.body.classList.remove('wooten-admin-desktop-floating');
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
  if(desktop.addEventListener)desktop.addEventListener('change',arrange);
  else if(desktop.addListener)desktop.addListener(arrange);
  updateDate();
  // Keep Central Time accurate when an administrator leaves the tab open.
  setInterval(updateDate,60*1000);
  arrange();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
