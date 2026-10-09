(()=>{'use strict';
const path={info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',success:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',warning:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>',error:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'};
const selectors='.status,.fm-note,.fm-error,.pt-message,.admin-user-status,[role="alert"]';
// Match an alert icon to the color of its notification panel before reading its text.
function panelKind(node){
 for(let el=node,depth=0;el&&depth<3;el=el.parentElement,depth++){
  const cls=typeof el.className==='string'?el.className.toLowerCase():'';
  if(/(?:^|\s)(?:bad|error|danger|failed)(?:\s|$)/.test(cls))return 'error';
  if(/(?:^|\s)(?:warn|warning|caution)(?:\s|$)/.test(cls))return 'warning';
  if(/(?:^|\s)(?:ok|success)(?:\s|$)/.test(cls))return 'success';
  // Only use distinctively tinted alert panels; ignore white/neutral containers.
  const bg=getComputedStyle(el).backgroundColor.match(/^rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
  if(!bg)continue;
  const r=+bg[1],g=+bg[2],b=+bg[3],max=Math.max(r,g,b),min=Math.min(r,g,b);
  if(max-min<12||min<115)continue;
  if(r>g+12&&r>b+8)return 'error';
  if(g>r+5&&g>b+5)return 'success';
  if(r>b+15&&g>b+8&&r>=g)return 'warning';
  if(b>r+5&&b>g+2)return 'info';
 }
 return null;
}
function getType(node){
 const panel=panelKind(node);if(panel)return panel;
 const cls=String(node.className||'').toLowerCase();
 const v=(node.textContent||'').trim().slice(0,260);
 if(!v)return null;
 if(/\b(error|failed|failure|denied|invalid)\b/.test(cls)||/\b(error|failed|failure|unable|denied|invalid)\b/i.test(v))return 'error';
 if(/\b(warn|caution)\b/.test(cls)||/\b(warning|stale|delayed|offline|low fuel)\b/i.test(v))return 'warning';
 if(/\b(success|ok)\b/.test(cls)||/\b(saved|success|complete|completed|uploaded|sent|created|detected successfully)\b/i.test(v))return 'success';
 return 'info';
}
function update(node){
 if(!node.isConnected||node.closest('button,[role="button"],table,nav')||node.hidden||node.getAttribute('aria-hidden')==='true')return;
 // Only decorate simple status text, not rich alerts, dialogs or actionable content.
 if(node.querySelector('input,button,a,table,svg:not(.wo-status-icon),.fm-alert-card'))return;
 const kind=getType(node),existing=node.querySelector(':scope > .wo-status-icon');
 if(!kind){existing?.remove();node.classList.remove('wo-status-iconized');return;}
 if(node.dataset.woStatusKind===kind&&existing)return;
 if(existing)existing.remove();
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('wo-status-icon');svg.innerHTML=path[kind];
 node.insertBefore(svg,node.firstChild);node.classList.add('wo-status-iconized');node.dataset.woStatusKind=kind;
}
let scheduled=false;
function scan(){scheduled=false;document.querySelectorAll(selectors).forEach(update)}
function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(scan)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{scan();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']})},{once:true});
else{scan();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']})}
})();