/* Wooten Oil — notification bell side-tilt (style #9). Visual only. */
(()=>{
 'use strict';
 const css=`
 @keyframes wootenBellSideTilt {0%,12%,43%,100%{transform:rotate(0deg)}22%{transform:rotate(15deg)}32%{transform:rotate(-7deg)}}
 .wooten-bell-side-tilt > svg:first-of-type, #adminNotificationBell.wooten-bell-side-tilt > svg {transform-origin:50% 18%;animation:wootenBellSideTilt 1.45s ease-in-out 1 both;}
 @media (prefers-reduced-motion:reduce){.wooten-bell-side-tilt > svg:first-of-type{animation:none!important}}
 `;
 if(!document.getElementById('wooten-bell-side-tilt-style')){const s=document.createElement('style');s.id='wooten-bell-side-tilt-style';s.textContent=css;document.head.appendChild(s);}
 const pairs=[
  ['adminNotificationBadge','adminNotificationBell','adminNotificationMenu'],
  ['dashboardNotificationBadge','dashboardNotifications','dashboardNotificationPanel'],
  ['mobileHeaderNotificationBadge','mobileHeaderNotifications','headerNotificationMenu'],
  ['headerNotificationBadge','headerNotifications','headerNotificationMenu']
 ];
 const read=el=>{const v=el.dataset.unreadCount??el.textContent??'0';const n=parseInt(String(v).replace(/[^0-9]/g,''),10);return Number.isFinite(n)?n:0;};
 const setup=()=>pairs.forEach(([badgeId,buttonId,panelId])=>{
  const badge=document.getElementById(badgeId),button=document.getElementById(buttonId);
  if(!badge||!button||badge.dataset.wootenTiltHooked==='1')return;
  badge.dataset.wootenTiltHooked='1';
  let baseline=null,waiting=false,stopTimer=0;
  const stop=()=>{clearTimeout(stopTimer);button.classList.remove('wooten-bell-side-tilt');};
  const check=()=>{
   waiting=false;
   const current=read(badge);
   if(baseline===null){baseline=current;return;}
   const increased=current>baseline;
   baseline=current;
   const panel=document.getElementById(panelId);
   const isOpen=button.getAttribute('aria-expanded')==='true'||(panel&&((panel.hidden===false&&panel.getAttribute('aria-hidden')!=='true'&&getComputedStyle(panel).display!=='none'&&getComputedStyle(panel).visibility!=='hidden')));
   if(increased&&!isOpen&&!document.hidden&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    stop();void button.offsetWidth;button.classList.add('wooten-bell-side-tilt');
    stopTimer=setTimeout(stop,1600);
   }
  };
  const queue=()=>{if(waiting)return;waiting=true;setTimeout(check,80);};
  const observer=new MutationObserver(queue);
  observer.observe(badge,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-unread-count']});
  button.addEventListener('click',stop);
  check();
 });
 // Admin notification counts can stay unchanged when an older record is cleared.
 // Watch stable notification IDs too, but do not animate on the initial fetch.
 const setupAdminRecords=()=>{
  const button=document.getElementById('adminNotificationBell');
  const list=document.getElementById('adminNotificationList');
  const badge=document.getElementById('adminNotificationBadge');
  if(!button||!list||!badge||list.dataset.wootenTiltRecordsHooked==='1')return;
  list.dataset.wootenTiltRecordsHooked='1';
  let known=null, timer=0, settle=0;
  const collect=()=>new Set(Array.from(list.querySelectorAll('[data-notice-id]'))
    .map(el=>`${el.getAttribute('data-bell-type')||''}:${el.getAttribute('data-notice-id')||''}`)
    .filter(v=>!v.endsWith(':')));
  const evaluate=()=>{
   timer=0;
   const ids=collect();
   // Clearing/loading/empty lists must not erase the initial comparison baseline.
   if(!ids.size)return;
   if(known===null){known=ids;return;}
   const novel=Array.from(ids).some(id=>!known.has(id));
   ids.forEach(id=>known.add(id));
   if(!novel||document.hidden||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   if(button.getAttribute('aria-expanded')==='true')return;
   const menu=document.getElementById('adminNotificationMenu');
   if(menu&&!menu.hidden&&getComputedStyle(menu).display!=='none')return;
   button.classList.remove('wooten-bell-side-tilt');
   void button.offsetWidth;
   button.classList.add('wooten-bell-side-tilt');
   clearTimeout(settle);
   settle=setTimeout(()=>button.classList.remove('wooten-bell-side-tilt'),1600);
  };
  new MutationObserver(()=>{if(!timer)timer=setTimeout(evaluate,180);})
    .observe(list,{childList:true,subtree:true});
  button.addEventListener('click',()=>{clearTimeout(settle);button.classList.remove('wooten-bell-side-tilt');});
  // Capture first populated result; do not animate historical notifications.
  evaluate();
 };

 const init=()=>{setup();setupAdminRecords();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
