/* Wooten Oil — paired gauge / FUEL TC estimates in admin notifications.
   Read-only display enhancement. Legacy alerts and non-delivery alerts are unchanged. */
(() => {
 'use strict';
 if (document.body?.id !== 'wooten-admin-page') return;
 const bellNotices = new Map(), fuelAlerts = new Map();
 const fmt = n => Number(n).toLocaleString('en-US', {maximumFractionDigits:0});
 const toNumber = s => s === '—' ? null : Number(s.replace(/,/g,''));
 const pattern = /^(TC delivery|Delivery) tank (\d+): before (—|[\d,.]+) gal; after (—|[\d,.]+) gal; received (—|[\d,.]+) gal\.$/i;
 function measurements(message) {
  const ordinary = new Map(), corrected = new Map(), tankOrder = [];
  for (const line of String(message || '').split(/\r?\n/)) {
   const m = line.trim().match(pattern);
   if (m) {
    const before=toNumber(m[3]), after=toNumber(m[4]), received=toNumber(m[5]);
    if ([before,after,received].some(n=>n!==null&&(!Number.isFinite(n)||n<0))) continue;
    (m[1].toLowerCase().startsWith('tc') ? corrected : ordinary).set(Number(m[2]),{before,after,received});
   } else {
    const t = line.match(/^Tank\s+(\d+)\s+\(/i);
    if (t) tankOrder.push(Number(t[1]));
   }
  }
  return {ordinary, corrected, tankOrder};
 }
 function addValue(label, amount, className) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = label + (amount === null ? 'Unavailable' : '~'+fmt(amount)+' gal');
  return element;
 }
 function updateBell() {
  const list = document.getElementById('adminNotificationList');
  if (!list) return;
  for (const card of list.querySelectorAll('.admin-bell-recovery-item[data-notice-id]')) {
   if (card.dataset.tcEnhanced) continue;
   const notice = bellNotices.get(String(card.dataset.noticeId));
   if (!notice) continue;
   const {ordinary,corrected,tankOrder} = measurements(notice.name);
   if (!corrected.size) continue;
   card.querySelectorAll('.admin-bell-recovery-row').forEach((row,i)=>{
    const n = tankOrder[i], raw = ordinary.get(n), tc = corrected.get(n);
    const badge = row.querySelector('.admin-bell-recovery-amount');
    if (!raw || raw.received === null || !tc || !badge) return;
    badge.textContent = 'Gauge delivery: ~'+fmt(raw.received)+' gal';
    badge.classList.add('wooten-gauge-value');
    row.appendChild(addValue('FUEL TC delivery: ',tc.received,'wooten-bell-tc-value'));
   });
   card.dataset.tcEnhanced = 'true';
  }
 }
 function updateHistory() {
  const root = document.getElementById('fmAlerts');
  if (!root) return;
  for (const card of root.querySelectorAll('.fm-alert-card[data-fuel-alert-id]')) {
   if (card.dataset.tcEnhanced) continue;
   const alert = fuelAlerts.get(String(card.dataset.fuelAlertId));
   if (!alert) continue;
   const {ordinary,corrected} = measurements(alert.message);
   if (!corrected.size) continue;
   card.querySelectorAll('.fm-alert-delivery-row').forEach(row=>{
    const n = Number(row.querySelector('.fm-alert-tank-no')?.textContent.replace(/\D/g,''));
    const raw = ordinary.get(n), tc = corrected.get(n);
    const badge = row.querySelector('.fm-alert-delivery-amount');
    if (!raw || raw.received === null || !tc || !badge) return;
    badge.textContent = 'Gauge: +'+fmt(raw.received)+' gal';
    badge.classList.add('wooten-gauge-value');
    row.querySelector('.fm-alert-tank-right')?.appendChild(addValue('FUEL TC: ',tc.received,'wooten-history-tc-value'));
   });
   card.dataset.tcEnhanced = 'true';
  }
 }
 let scheduled = false;
 function updateSoon() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(()=>{scheduled=false;updateBell();updateHistory();});
 }
 const style = document.createElement('style');
 style.id = 'wooten-fuel-dual-volume-css';
 style.textContent = `
 #adminNotificationMenu .wooten-bell-tc-value{display:block;grid-column:1/-1;justify-self:end;
   margin:3px 0 0!important;padding:4px 7px;border-radius:7px;background:#eef3f7;
   color:#345e76!important;font:750 11px/1.4 Inter,Arial,sans-serif;text-align:right;white-space:normal}
 #adminNotificationMenu .wooten-gauge-value{white-space:normal;text-align:right}
 #fuelMonitorRoot .wooten-history-tc-value{display:block;margin-top:5px;padding:4px 7px;
   border-radius:7px;background:#eef3f7;color:#345e76;font:750 12px/1.4 Inter,Arial,sans-serif;
   text-align:right;white-space:normal;max-width:100%}
 #fuelMonitorRoot .wooten-gauge-value{white-space:normal;text-align:right}
 `;
 document.head.appendChild(style);
 // Capture the same authorized data that the existing admin page requests.
 // No independent requests, changes to saved notifications, or new credentials.
 const nativeFetch = window.fetch;
 window.fetch = function(input, options) {
  let pathname='';
  try {pathname = new URL(typeof input==='string' ? input : input.url,location.href).pathname;} catch (_) {}
  const method = String(options?.method || (typeof input==='object' && input?.method) || 'GET').toUpperCase();
  const intercept = method==='GET' && ['/api/admin/notification-bell','/api/admin/fuel-monitor'].includes(pathname);
  const result = nativeFetch.apply(this, arguments);
  if (!intercept) return result;
  return result.then(async response=>{
   if (response.ok) {
    try {
     const data = await response.clone().json();
     if (data.success && pathname==='/api/admin/notification-bell') {
      for (const x of data.items||[]) if(x.item_type==='tank' && x.id!=null) bellNotices.set(String(x.id),x);
     }
     if (data.success && pathname==='/api/admin/fuel-monitor') {
      fuelAlerts.clear();
      for (const x of data.alerts||[]) if(x.id!=null) fuelAlerts.set(String(x.id),x);
      if(data.target_alert?.id!=null) fuelAlerts.set(String(data.target_alert.id),data.target_alert);
     }
     updateSoon();
    }catch(_){/* No effect on normal errors or non-JSON responses. */}
   }
   return response;
  });
 };
 function observe() {
  for(const id of ['adminNotificationList','fmAlerts']) {
   const list=document.getElementById(id);
   if(list) new MutationObserver(updateSoon).observe(list,{childList:true,subtree:true});
  }
  updateSoon();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});
 else observe();
})();
