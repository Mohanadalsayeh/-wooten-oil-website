(()=>{'use strict';
 const root=document.getElementById('fuelMonitorRoot');if(!root)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const actionIcon=name=>'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+({send:'<path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/>',shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>',network:'<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/>',plus:'<path d="M12 5v14M5 12h14"/>',settings:'<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',key:'<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>'}[name]||'')+'</svg>';
 const removalPasswords=new WeakMap();
 const key=()=>document.getElementById('adminKey')?.value.trim()||'';
 const allowed=()=>window.WootenAdminAccess?.has(window.wootenAdminUser,'fuel_monitoring');
 const time=v=>v?(window.WootenTime?.dateTime(v)||new Date(v).toLocaleString()):'Not retrieved yet';
 let creatingLocation=false;
 let focusedFuelAlert=null,scrollToFuelAlert=0;
 // The bell's blue target highlight is temporary, not a permanent selected state.
 let fuelAlertHighlightUntil=0,fuelAlertHighlightTimer=0;
 function clearFuelAlertHighlight(){
  if(fuelAlertHighlightTimer){clearTimeout(fuelAlertHighlightTimer);fuelAlertHighlightTimer=0;}
  fuelAlertHighlightUntil=0;
  root.querySelectorAll('.fm-alert-targeted').forEach(card=>{
   card.classList.remove('fm-alert-targeted');
   if(document.activeElement===card)card.blur();
  });
 }
 function startFuelAlertHighlight(){
  clearFuelAlertHighlight();
  fuelAlertHighlightUntil=Date.now()+5000;
  fuelAlertHighlightTimer=setTimeout(()=>{
   fuelAlertHighlightTimer=0;
   fuelAlertHighlightUntil=0;
   root.querySelectorAll('.fm-alert-targeted').forEach(card=>{
    card.classList.remove('fm-alert-targeted');
    if(document.activeElement===card)card.blur();
   });
  },5000);
 }
 let history=[],locations=[],alerts=[],editing=null,loading=false,epoch=0,activeLocation='all',alertPage=1;
 const ALERTS_PER_PAGE=20;
 const dialog=document.createElement('dialog');dialog.className='fm-dialog';document.body.append(dialog);
 window.matchMedia('(min-width:541px)').addEventListener('change',e=>{root.querySelectorAll('.fm-overview-details').forEach(details=>{details.open=e.matches;});});
 root.innerHTML='<div class="fm-heading"><div><div class="admin-page-label">Location Monitoring</div><h2>Locations & Fuel Monitoring</h2><p>Tank inventory, connection status, and fuel alerts across your stations.</p></div><div class="fm-actions"><button type="button" class="secondary" id="fmRefresh">Refresh</button><button type="button" id="fmAdd">Add location</button></div></div><p id="fmMessage" role="status"></p><div id="fmLocationTabs" role="tablist" aria-label="Gas station locations"></div><div id="fmLocations" role="tabpanel" aria-label="Location tanks"></div><h3>Fuel Alert History</h3><p>Submitted means the email/SMS provider accepted the message; it does not confirm delivery. Latest 100 events.</p><div id="fmAlerts"></div><div id="fmAlertPagination" class="db-pagination fm-alert-pagination" hidden><div class="db-page-info" id="fmAlertPageInfo">Page 1 of 1</div><div class="db-numbered-pages" id="fmAlertPageNumbers" aria-label="Fuel alert pages"></div><div class="db-pagination-controls"><button class="secondary" id="fmAlertPrev" type="button">Previous</button><button class="secondary" id="fmAlertNext" type="button">Next</button></div></div>';
 const message=(s,bad=false)=>{const el=document.getElementById('fmMessage');el.textContent=s;el.className=bad?'fm-error':'fm-note';};
 async function api(body){const token=key(),generation=epoch;const res=await fetch('/api/admin/fuel-monitor',{method:body?'POST':'GET',headers:{'X-Admin-Key':token,'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();if(token!==key()||generation!==epoch)throw Error('Admin session changed. Reopen Fuel Monitoring.');if(!res.ok||!data.success)throw Error(data.error||'Request failed.');return data;}
 async function load(){if(creatingLocation||inlineEdit||inlineSaving)return;if(loading||!key()||!allowed())return;loading=true;document.getElementById('fmRefresh').disabled=true;message('Loading locations…');try{const data=await api();if(creatingLocation||inlineEdit||inlineSaving)return;locations=data.locations;alerts=data.alerts;if(focusedFuelAlert&&locations.some(l=>String(l.id)===String(focusedFuelAlert.location_id))&&!alerts.some(a=>Number(a.id)===Number(focusedFuelAlert.id))){alerts.push(focusedFuelAlert);alerts.sort((a,b)=>Number(b.id)-Number(a.id));}history=data.history||[];render();message(locations.length+' location(s) loaded.');}catch(e){message(e.message,true)}finally{loading=false;document.getElementById('fmRefresh').disabled=false}}
 function fuelBand(tank,volume){
  if(!Number.isFinite(volume))return {name:'No reading',color:'#b7c8d6'};
  const percent=volume/Number(tank.capacity)*100,lowPercent=tank.mode==='percent'?Number(tank.low):Number(tank.low)/Number(tank.capacity)*100;
  return percent<lowPercent?{name:'Below threshold',color:'#de1c28'}:percent<50?{name:'Below half',color:'#ef9636'}:percent<75?{name:'Over half',color:'#a0d47c'}:{name:'Over ¾ full',color:'#299a60'};
 }
 function connectionHealth(l){
  if(!l.enabled)return 'Paused';if(!l.paired)return 'Collector setup needed';
  const contact=Date.parse(l.last_contact),reading=Date.parse(l.last_observed),now=Date.now();
  if(!Number.isFinite(contact))return 'Waiting for collector';
  if(now-contact>Math.max(600,l.interval*5)*1000)return 'Offline';
  if(l.error)return 'Monitor connection error';
  if(!Number.isFinite(reading)||now-reading>Math.max(180,l.interval*2)*1000||now-contact>Math.max(180,l.interval*2)*1000)return 'Delayed';
  return 'Online';
 }
 function monitorPanel(l,stale){
  const m=l.reading?.monitor_status;
  const status=!m?'Not retrieved — update the station collector':m.state==='unavailable'?'Unavailable':m.state==='normal'?'All functions normal':'Alarms / warnings reported';
  return '<details class="fm-monitor-panel"><summary><span class="fm-monitor-title">Monitor alarms</span><span class="fm-monitor-status">'+esc(status)+'</span>'+(stale?'<span class="fm-monitor-stale">Last known report</span>':'')+'</summary><p>Read-only report: active or unacknowledged alarms and warnings. Up to 25 entries from the monitor. Portal acknowledgment does not clear monitor alarms.</p>'+(m?'<p>Report time: '+esc(time(m.observed_at))+'</p>':'')+(m?.error?'<p class="fm-error">'+esc(m.error)+'</p>':'')+(m?.report?'<pre>'+esc(m.report)+'</pre>':'')+'</details>';
 }

 function alertTone(level){
  if(level==='critical')return {label:'CRITICAL FUEL ALERT',tone:'critical',icon:'!'};
  if(level==='low')return {label:'LOW FUEL ALERT',tone:'low',icon:'!'};
  if(level==='normal')return {label:'FUEL RECOVERED',tone:'normal',icon:'✓'};
  if(level==='reading'||level==='scheduled_reading')return {label:level==='scheduled_reading'?'AUTOMATIC FUEL READING':'FUEL READING',tone:'reading',icon:'<svg class="fm-fuel-reading-speedometer" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fuel level gauge" focusable="false"><circle cx="24" cy="24" r="18"/><path d="M24 11v4M13 17l3 3M35 17l-3 3M10.5 28h4M37.5 28h-4"/><path class="fm-speedometer-needle" d="M24 26 32 18"/><circle class="fm-speedometer-hub" cx="24" cy="26" r="3.2"/></svg>'};
  return {label:String(level||'FUEL ALERT').toUpperCase(),tone:'reading',icon:'!'};
 }
 function parseAlertSnapshot(message){
  const result={headline:'',tanks:[],reading:''};
  const lines=String(message||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  result.headline=lines.shift()||'';
  for(const line of lines){
   const tank=line.match(/^Tank\s+(\d+)\s+\((.+?)\):\s+([\d,]+(?:\.\d+)?)\s+US gallons\s+\(([\d.]+)%\)\s+—\s+(.+?)\.?$/i);
   if(tank){
    result.tanks.push({number:tank[1],product:tank[2],volume:tank[3],percent:tank[4],status:tank[5].replace(/\.$/,'')});
    continue;
   }
   if(/^Reading\s+/i.test(line))result.reading=line.replace(/^Reading\s+/i,'').replace(/\.$/,'');
  }
  return result;
 }
 function alertStatusClass(status){
  const s=String(status||'').toLowerCase();
  if(s.includes('delivery')||s.includes('critical'))return 'critical';
  if(s.includes('low'))return 'low';
  if(s.includes('normal')||s.includes('recover'))return 'normal';
  return 'neutral';
 }
 function renderPortalAlert(a){
  const meta=alertTone(a.level),snapshot=parseAlertSnapshot(a.message);
  const location=locations.find(l=>l.id===a.location_id);
  const locationName=location?.name||snapshot.headline.split(' — ')[0]||'Fuel location';
  const triggerTank=Number(a.tank_number)||0;
  const rows=snapshot.tanks.length?snapshot.tanks.map(t=>{
   const cls=alertStatusClass(t.status),trigger=Number(t.number)===triggerTank&&a.level!=='reading'&&a.level!=='scheduled_reading';
   return '<div class="fm-alert-tank-row '+cls+(trigger?' is-trigger':'')+'"><span class="fm-alert-tank-no">T'+esc(t.number)+'</span><span class="fm-alert-tank-product">'+esc(t.product)+'</span><strong>'+esc(t.volume)+' gal</strong><span>'+esc(t.percent)+'%</span><b>'+esc(t.status)+'</b></div>';
  }).join(''):'';
  const delivery= snapshot.tanks.find(t=>/delivery/i.test(t.status));
  const triggerText=a.level==='critical'
   ?(delivery?'Delivery needed — immediate attention required.':'Fuel is at or below the critical threshold.')
   :a.level==='low'?'Fuel is below the configured low threshold.'
   :a.level==='normal'?'Fuel has reached the configured recovery level.'
   :a.level==='reading'||a.level==='scheduled_reading'?'Current readings for all configured tanks.':'Fuel monitoring event.';
  const deliveryStatus='<div class="fm-alert-channel-status"><span>Email: '+esc(a.email_status)+'</span><span>SMS: '+esc(a.sms_status)+'</span></div>';
  const action=!a.acknowledged&&locations.some(l=>l.id===a.location_id)
   ?'<button class="secondary fm-alert-ack" type="button" data-ack="'+a.id+'" data-location="'+esc(a.location_id)+'" title="Mark reviewed. For Low/Critical tank alerts, silence further Low/Critical alerts until the tank reaches its Recovery level.">Acknowledge</button>'
   :'<span class="fm-alert-acknowledged">Acknowledged</span>';
  return '<article class="fm-alert-card '+meta.tone+'" data-fuel-alert-id="'+esc(a.id)+'" tabindex="-1">'
   +'<div class="fm-alert-banner"><span class="fm-alert-symbol">'+meta.icon+'</span><div><strong>'+meta.label+'</strong><p>'+esc(locationName)+'</p></div><time>'+esc(time(a.created_at))+'</time></div>'
   +'<div class="fm-alert-card-body"><div class="fm-alert-summary"><div><span>Alert</span><strong>'+esc(triggerText)+'</strong></div>'+(snapshot.reading?'<div><span>Reading time</span><strong>'+esc(time(snapshot.reading))+'</strong></div>':'')+'</div>'
   +(rows?'<div class="fm-alert-tanks">'+rows+'</div>':'<p class="fm-alert-legacy">'+esc(a.message)+'</p>')
   +'<div class="fm-alert-card-foot">'+deliveryStatus+action+'</div>'
   +(['failed','partial'].includes(a.email_status)?'<p class="fm-error">Email: '+esc(a.email_detail)+'</p>':'')
   +(['failed','partial'].includes(a.sms_status)?'<p class="fm-error">SMS: '+esc(a.sms_detail)+'</p>':'')
   +'</div></article>';
 }
 function renderAlertPagination(total,pages){
  const wrap=document.getElementById('fmAlertPagination');
  const prev=document.getElementById('fmAlertPrev');
  const next=document.getElementById('fmAlertNext');
  const info=document.getElementById('fmAlertPageInfo');
  const nums=document.getElementById('fmAlertPageNumbers');
  if(!wrap||!prev||!next||!info||!nums)return;
  if(total<=ALERTS_PER_PAGE){
   wrap.hidden=true;
   nums.innerHTML='';
   return;
  }
  wrap.hidden=false;
  info.textContent='Page '+alertPage+' of '+pages;
  prev.disabled=alertPage<=1;
  next.disabled=alertPage>=pages;

  const parts=[];
  const add=n=>parts.push(
   '<button type="button" class="db-page-number'+(n===alertPage?' active':'')+
   '" data-alert-page="'+n+'" '+(n===alertPage?'aria-current="page"':'')+'>'+n+'</button>'
  );

  if(pages<=7){
   for(let n=1;n<=pages;n++)add(n);
  }else{
   add(1);
   if(alertPage>4)parts.push('<span class="db-page-ellipsis" aria-hidden="true">…</span>');
   const start=Math.max(2,alertPage-1),end=Math.min(pages-1,alertPage+1);
   for(let n=start;n<=end;n++)add(n);
   if(alertPage<pages-3)parts.push('<span class="db-page-ellipsis" aria-hidden="true">…</span>');
   add(pages);
  }
  nums.innerHTML=parts.join('');
 }
 function render(){
  if(activeLocation!=='all'&&!locations.some(l=>l.id===activeLocation))activeLocation='all';
  const tabs=document.getElementById('fmLocationTabs');tabs.replaceChildren();
  const views=[{id:'all',name:'All locations',icon:'fuel'},...locations];
  for(const l of views){const button=document.createElement('button');button.type='button';button.className='fm-location-tab';button.id='fm-location-tab-'+l.id;button.dataset.locationTab=l.id;button.setAttribute('role','tab');button.setAttribute('aria-controls','fmLocations');button.setAttribute('aria-selected',String(activeLocation===l.id));button.tabIndex=activeLocation===l.id?0:-1;const text=document.createElement('span');text.textContent=l.name;button.append(WootenLocationIcons.icon(l.icon||'fuel'),text);tabs.append(button)}
  document.getElementById('fmLocations').setAttribute('aria-labelledby','fm-location-tab-'+activeLocation);
  const shownLocations=activeLocation==='all'?locations:locations.filter(l=>l.id===activeLocation);
  const filteredAlerts=activeLocation==='all'?alerts:alerts.filter(a=>a.location_id===activeLocation);
  const alertPages=Math.max(1,Math.ceil(filteredAlerts.length/ALERTS_PER_PAGE));
  if(alertPage>alertPages)alertPage=alertPages;
  if(alertPage<1)alertPage=1;
  const alertStart=(alertPage-1)*ALERTS_PER_PAGE;
  const shownAlerts=filteredAlerts.slice(alertStart,alertStart+ALERTS_PER_PAGE);

  document.getElementById('fmLocations').innerHTML=shownLocations.length?shownLocations.map(l=>{
   const stale=!l.last_observed||Date.now()-Date.parse(l.last_observed)>Math.max(180,l.interval*2)*1000;
   const state=connectionHealth(l);
   return '<article class="fm-location" data-station="'+esc(l.id)+'"><div class="fm-station-header"><div><h3>'+esc(l.name)+'</h3><p>'+esc(l.address||'Address not entered')+'</p><p>'+esc(l.phone)+'</p></div><div class="fm-station-status"><span class="fm-badge '+(state==='Online'?'fm-ok':state==='Offline'||l.error?'fm-health-bad':'')+'">'+state+'</span><p>'+l.tanks.length+' configured tanks</p></div></div><div class="fm-station-meta"><span>Last reading<b>'+esc(time(l.last_observed))+'</b></span><span>Last contact<b>'+esc(time(l.last_contact))+'</b></span></div>' +'<div class="fm-station-page">'+(l.error?'<p class="fm-error">'+esc(l.error)+'</p>':'')+monitorPanel(l,stale||!!l.error||!l.enabled)+'<div class="fm-tanks">'+(l.tanks.length?l.tanks.map(t=>{
    const r=l.reading?.tanks.find(x=>x.number===t.number),capacity=Number(t.capacity),volume=r?Number(r.volume):NaN;
    const valid=!!r&&Number.isFinite(volume)&&volume>=0&&Number.isFinite(capacity)&&capacity>0;
    const rawPercent=valid?volume/capacity*100:null,percent=valid?Math.min(100,rawPercent):null;
    const lowPercent=t.mode==='percent'?Number(t.low):Number(t.low)/capacity*100;
    const band=fuelBand(t,valid?volume:NaN);
    const status=!valid?'No reading':rawPercent>100?'Check capacity':stale?'Stale reading':!l.enabled?'Monitoring paused':l.error?'Last known reading':band.name;
    const displayedPercent=valid?rawPercent.toFixed(1)+'%':'—';
    const dial='<div class="fm-dial-wrap"><svg class="fm-dial" viewBox="0 0 220 148" role="img" aria-label="Tank '+t.number+': '+esc(valid?displayedPercent+' full; '+status:'no reading available')+'"><path class="fm-dial-track" d="M22 108 A88 88 0 0 1 198 108" fill="none" stroke-width="16" stroke-linecap="round"/>'+(valid&&percent>0?'<path class="fm-dial-fill" d="M22 108 A88 88 0 0 1 198 108" fill="none" stroke="'+band.color+'" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="'+percent+' 100"/>':'')+'<text class="fm-dial-value" x="110" y="96" text-anchor="middle">'+displayedPercent+'</text><text class="fm-dial-tick" x="22" y="139" text-anchor="middle">0</text><text class="fm-dial-tick" x="198" y="139" text-anchor="middle">100%</text></svg></div>';
    return '<div class="fm-tank fm-tank-dial"><div class="fm-tank-title"><span class="fm-tank-number" aria-label="Tank '+t.number+'">'+t.number+'</span><strong>'+esc(t.fuel)+'</strong></div>'+dial+'<div class="fm-dial-quantity">'+(valid?volume.toLocaleString('en-US'):'—')+' <span>/ '+capacity.toLocaleString('en-US')+' gal</span></div><div class="fm-dial-caption" style="color:'+band.color+'">'+esc(status)+'</div><div class="fm-tank-thresholds"><span>Low threshold<b>'+t.low+(t.mode==='percent'?'%':' gal')+'</b></span><span>Critical alert<b>'+t.critical+(t.mode==='percent'?'%':' gal')+'</b></span></div>'+(t.alerts?'':'<p>Tank alerts off</p>')+(valid?'<div class="fm-water-reading"><span>Water level</span><strong>'+esc(r.water==null?'Not reported':r.water+' in')+'</strong><small>'+esc(stale||l.error||!l.enabled?'Last known reading':'From monitor')+'</small></div><p>Ullage: '+esc(r.ullage??'—')+' gal · Temp: '+esc(r.temperature??'—')+' °F</p>':'')+'</div>';

   }).join(''):'<p>Add tanks or review detected tanks after the first reading.</p>')+ '</div></div><div class="fm-station-actions"><button type="button" class="fm-add-tank" data-inline-id="'+esc(l.id)+'" data-inline-section="tanks">'+actionIcon('plus')+'Add/Edit tank</button><button type="button" data-inline-id="'+esc(l.id)+'" data-inline-section="location">'+actionIcon('settings')+'Edit location</button><button type="button" data-inline-id="'+esc(l.id)+'" data-inline-section="connection">'+actionIcon('network')+'Veeder-Root connection</button><button type="button" class="fm-send-reading" data-send-reading="'+esc(l.id)+'" '+(!l.reading?.tanks?.length?'disabled title="No fuel reading available yet"':'')+'>'+actionIcon('send')+'<span data-send-reading-label>Send fuel reading</span></button><button type="button" class="fm-collector-action" data-pair="'+esc(l.id)+'">'+actionIcon('key')+(l.paired?'Replace collector key':'Connect collector')+'</button></div></article>';
  }).join(''):'<div class="fm-empty">No locations yet. Add your first gas station to set up its tanks and monitoring.</div>';
  for(const card of root.querySelectorAll('.fm-location')){
   const footer=card.querySelector('.fm-station-actions');
   const actions=document.createElement('div');actions.className='fm-header-actions';
   for(const button of [...footer.querySelectorAll('[data-inline-section]')])actions.append(button);
   const header=card.querySelector('.fm-station-header');
   const info=header.firstElementChild;info.classList.add('fm-location-info');
   header.append(actions);
   if(activeLocation!=='all'){
    const loc=locations.find(l=>String(l.id)===String(card.dataset.station));
    const page=card.querySelector('.fm-station-page'),gauges=page?.querySelector('.fm-tanks');
    if(gauges&&loc){
     const panel=document.createElement('details');
     panel.className='fm-automatic-panel';
     panel.dataset.autoReadingPanel=loc.id;
     const summary=document.createElement('summary');
     summary.dataset.autoReadingSummary='';
     summary.innerHTML='<span class="fm-automatic-chevron" aria-hidden="true"></span><span class="fm-automatic-title">Automatic Fuel Reading</span><span class="fm-automatic-state">'+(loc.auto_reading?.enabled?'Enabled':'Disabled')+'</span>';
     const body=document.createElement('div');
     body.className='fm-automatic-panel-content';
     panel.append(summary,body);
     gauges.after(panel);
    }
   }
   if(activeLocation==='all'){
    const send=footer.querySelector('[data-send-reading]');
    if(send)send.remove();
    footer.querySelector('[data-auto-reading]')?.remove();
    actions.classList.add('fm-actions-reserved');actions.setAttribute('aria-hidden','true');actions.inert=true;
    for(const button of actions.querySelectorAll('button')){button.disabled=true;button.removeAttribute('data-inline-section');button.removeAttribute('data-inline-id');}
    footer.remove();
    const page=card.querySelector('.fm-station-page'),details=document.createElement('details'),summary=document.createElement('summary');
    details.className='fm-overview-details';details.open=window.matchMedia('(min-width:541px)').matches;
    summary.textContent='View tanks and alarms';page.before(details);details.append(summary,page);
   }
  }
  document.getElementById('fmAlerts').innerHTML=shownAlerts.length?shownAlerts.map(renderPortalAlert).join(''):'<p>No fuel alerts recorded.</p>';
  if(focusedFuelAlert&&Date.now()<fuelAlertHighlightUntil){
   const highlighted=[...root.querySelectorAll('[data-fuel-alert-id]')].find(node=>Number(node.dataset.fuelAlertId)===Number(focusedFuelAlert.id));
   if(highlighted){
    highlighted.classList.add('fm-alert-targeted');
    if(scrollToFuelAlert===Number(focusedFuelAlert.id)){
     scrollToFuelAlert=0;
     highlighted.focus({preventScroll:true});
     requestAnimationFrame(()=>highlighted.scrollIntoView({behavior:'smooth',block:'center'}));
    }
   }
  }
  renderAlertPagination(filteredAlerts.length,alertPages);
 }
 function compactIconPicker(container,selected){
  WootenLocationIcons.picker(container,selected);
  const details=document.createElement('details');details.className='fm-icon-expander';
  const summary=document.createElement('summary');
  const selectedView=document.createElement('span');selectedView.className='fm-icon-selected';
  const action=document.createElement('span');action.className='fm-icon-change';action.textContent='Change icon';
  summary.append(selectedView,action);container.before(details);details.append(summary,container);
  const refresh=()=>{const tile=container.querySelector('input:checked + .fm-icon-tile');if(tile)selectedView.replaceChildren(...[...tile.childNodes].map(n=>n.cloneNode(true)));};
  refresh();container.addEventListener('change',()=>{refresh();details.open=false;summary.focus({preventScroll:true});});
 }
 const field=(name,label,value,type='text',extra='')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
 const recipientFields=(name,label,value,type)=>'<div class="fm-recipients" data-recipient-type="'+type+'"><strong>'+label+'</strong><input type="hidden" name="'+name+'" value="'+esc(value||'')+'"><div class="fm-recipient-rows"></div><button type="button" class="secondary fm-recipient-add">+ Add '+(type==='email'?'email':'phone number')+'</button><small>'+(type==='email'?'Up to 20 addresses; each receives tank alerts.':'Up to 20 numbers. Include country code, e.g. +19015551234.')+'</small></div>';
 function setupRecipients(form){
  form.querySelectorAll('.fm-recipients').forEach(group=>{
   const hidden=group.querySelector('input[type=hidden]'),rows=group.querySelector('.fm-recipient-rows'),type=group.dataset.recipientType;
   const update=()=>{hidden.value=[...rows.querySelectorAll('input')].map(x=>x.value.trim()).filter(Boolean).join(', ');hidden.dispatchEvent(new Event('input',{bubbles:true}));};
   const add=(value='')=>{const row=document.createElement('div');row.className='fm-recipient-row';row.innerHTML='<input type="'+type+'" aria-label="'+(type==='email'?'Alert email address':'Alert phone number')+'" '+(type==='tel'?'pattern="\\+[1-9][0-9]{7,14}" placeholder="+19015551234"':'placeholder="name@example.com"')+'><button type="button" class="secondary" aria-label="Remove recipient">×</button>';row.querySelector('input').value=value;row.querySelector('input').oninput=update;row.querySelector('button').onclick=()=>{row.remove();update();};rows.append(row);return row;};
   (hidden.value.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean)).forEach(add);if(!rows.children.length)add();
   group.querySelector('.fm-recipient-add').onclick=()=>{if(rows.children.length>=20)return;add().querySelector('input').focus();};
  });
 }
 const modelField=(value,listId)=>field('model','Monitor model',value,'text','required list="'+listId+'" autocomplete="off"')+'<datalist id="'+listId+'"><option value="TLS-350">Veeder-Root</option><option value="TLS-450PLUS">Veeder-Root</option><option value="TLS4">Veeder-Root</option><option value="TLS4B">Veeder-Root</option><option value="EVO 200">Franklin Fueling Systems</option><option value="EVO 400">Franklin Fueling Systems</option><option value="EVO 600">Franklin Fueling Systems</option><option value="EVO 6000">Franklin Fueling Systems</option><option value="EVO ONE">Franklin Fueling Systems</option></datalist>';
 const toggle=(name,label,on)=>'<label class="fm-toggle"><input type="checkbox" role="switch" name="'+name+'" '+(on?'checked':'')+'><span>'+label+'</span></label>';
 function unitField(name,label,value,unit,attrs){return '<label>'+label+'<span class="fm-unit-field"><span class="fm-unit-prefix">'+unit+'</span><input name="'+name+'" type="number" value="'+esc(value)+'" aria-label="'+label+' ('+unit+')" '+attrs+'></span></label>';}
 document.addEventListener('change',e=>{if(!e.target.matches('.fm-tank-editor select[name=mode]'))return;const row=e.target.closest('.fm-tank-editor'),unit=e.target.value==='percent'?'%':'gal';for(const name of ['low','critical','recovery']){const input=row.querySelector('[name='+name+']');input.previousElementSibling.textContent=unit;input.setAttribute('aria-label',({low:'Low fuel',critical:'Critical fuel',recovery:'Recovery level'})[name]+' ('+unit+')');}});
 function tankRow(t={}){return '<fieldset class="fm-tank-editor"><legend>Tank settings</legend><div class="fm-grid">'+field('number','Tank / probe number',t.number||'','number','required min="1" max="99"')+field('fuel','Fuel product',t.fuel||'','text','required list="fmFuelTypes"')+unitField('capacity','Tank capacity (US gallons)',t.capacity||'','gal','required min="1" step="any"')+'<label>Threshold units<select name="mode"><option value="gallons" '+(t.mode!=='percent'?'selected':'')+'>Gallons</option><option value="percent" '+(t.mode==='percent'?'selected':'')+'>Percent of capacity</option></select></label>'+unitField('low','Low fuel',t.low??20,t.mode==='percent'?'%':'gal','required min="0" step="any"')+unitField('critical','Critical fuel',t.critical??10,t.mode==='percent'?'%':'gal','required min="0" step="any"')+unitField('recovery','Recovery level',t.recovery??25,t.mode==='percent'?'%':'gal','required min="0" step="any"')+toggle('alerts','Enable alerts for this tank',t.alerts!==false)+'</div><button class="secondary fm-remove" type="button">Remove tank</button></fieldset>';}
 function startLocationTab(){
  creatingLocation=true;
  const tabs=document.getElementById('fmLocationTabs');tabs.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-selected','false');b.tabIndex=-1;});
  const tab=document.createElement('button');tab.type='button';tab.id='fm-location-tab-new';tab.className='fm-location-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-selected','true');tab.setAttribute('aria-controls','fmLocations');tab.append(WootenLocationIcons.icon('fuel'),document.createTextNode('New location'));tabs.append(tab);
  const panel=document.getElementById('fmLocations');panel.setAttribute('aria-labelledby',tab.id);panel.replaceChildren();
  const editor=document.createElement('div');editor.className='fm-dialog fm-new-location-page';panel.append(editor);
  editor.close=()=>{creatingLocation=false;editing=null;render();};
  return editor;
 }
 function openEdit(id,addTank=false){
  const editor=!id?startLocationTab():dialog;editing=locations.find(l=>l.id===id)||null;const l=editing||{name:'',phone:'',address:'',host:'',port:10001,model:'TLS-350',interval:300,enabled:false,portal:true,tanks:[]};
  editor.innerHTML='<form id="fmForm"><header><h2>'+(editing?'Edit location':'Add location')+'</h2><button class="fm-close secondary" type="button" aria-label="Close">×</button></header><div class="fm-dialog-body"><fieldset class="fm-icon-field"><legend>Location tab icon</legend><div id="fmIconChoices"></div></fieldset><div class="fm-grid">'+field('name','Station name',l.name,'text','required maxlength="100"')+field('phone','Station phone',l.phone,'tel')+field('address','Street address / location',l.address,'text','maxlength="300"')+modelField(l.model,'fmModelChoices')+'</div><h3>Veeder-Root connection</h3><p>A station computer collects readings and sends them securely to the portal. It must reach both the monitor and the internet.</p><div class="fm-grid">'+field('host','Local monitor IP / hostname',l.host,'text','required placeholder="e.g. 192.168.51.2"')+field('port','TCP data port',l.port,'number','required min="1" max="65535"')+field('interval','Read every (seconds)',l.interval,'number','required min="60" max="86400"')+toggle('enabled','Enable monitoring',l.enabled)+'</div><p>Use the inventory data port, not the web login or configuration port. Read-only TLS-350 display-format collector. This setup uses US gallons, inches, and °F.</p>'+(l.reading?.site_header?'<div class="fm-detected"><h3>Station header from monitor</h3><pre>'+esc(l.reading.site_header)+'</pre><button class="secondary" type="button" id="fmImportHeader">Use header name & address</button><p>Review imported details before saving.</p></div>':'')+'<div class="fm-heading"><h3>Tanks <span id="fmTankCount"></span></h3><button class="secondary" id="fmAddTank" type="button">Add tank</button></div><p>Use the same tank numbers as the monitor. These settings affect portal monitoring only.</p>'+(l.reading?.tanks?.length?'<button class="secondary" type="button" id="fmDetect">Add detected tanks</button>':'')+'<datalist id="fmFuelTypes"><option>Regular Unleaded (87)</option><option>Premium Unleaded (93)</option><option>Road Diesel</option><option>Off-Road Diesel</option><option>Kerosene</option></datalist><div id="fmTankEditors">'+l.tanks.map(tankRow).join('')+'</div><p>Critical must be below Low. Recovery must be above Low. Alerts are sent when the level changes; repeated readings at the same level do not repeat the alert.</p><h3>Alert delivery</h3><div class="fm-delivery-methods">'+toggle('portal','Portal notification',l.portal)+toggle('email','Email alert',l.email)+toggle('sms','SMS alert',l.sms)+'</div><div class="fm-grid">'+recipientFields('email_to','Alert email addresses',l.email_to,'email')+recipientFields('sms_to','Alert mobile numbers',l.sms_to,'tel')+'</div><p>Email and SMS use your existing portal providers. Recipient can differ from the station contact.</p><p id="fmDialogMessage" role="status"></p></div><footer>'+(editing?'<button class="secondary fm-delete" type="button">Delete location</button>':'')+'<button class="secondary fm-close" type="button">Cancel</button><button type="submit">Save location</button></footer></form>';
  compactIconPicker(editor.querySelector('#fmIconChoices'),l.icon||'fuel');
  setupRecipients(editor);if(editor===dialog)editor.showModal();editor.querySelector('[name=name]').focus({preventScroll:true});countTanks(editor);
  editor.querySelectorAll('.fm-close').forEach(b=>b.onclick=()=>editor.close());
  editor.querySelector('#fmAddTank').onclick=()=>{if(editor.querySelectorAll('.fm-tank-editor').length>=64)return;editor.querySelector('#fmTankEditors').insertAdjacentHTML('beforeend',tankRow({mode:'percent'}));countTanks(editor);};
  if(addTank){editor.querySelector('#fmAddTank').click();const row=editor.querySelector('#fmTankEditors').lastElementChild;row?.scrollIntoView({block:'center'});row?.querySelector('[name=number]')?.focus({preventScroll:true});}
  editor.querySelector('#fmTankEditors').onclick=e=>{if(e.target.closest('.fm-remove')){confirmTankRemoval(e.target.closest('fieldset'),()=>countTanks(editor));}};
  editor.querySelector('#fmImportHeader')?.addEventListener('click',()=>{const lines=l.reading.site_header.split('\n').map(s=>s.trim()).filter(Boolean);editor.querySelector('[name=name]').value=lines[0]||l.name;editor.querySelector('[name=address]').value=lines.slice(1).join(', ');});
  editor.querySelector('#fmDetect')?.addEventListener('click',()=>{const ids=[...editor.querySelectorAll('.fm-tank-editor [name=number]')].map(el=>Number(el.value));for(const t of l.reading.tanks)if(!ids.includes(t.number))editor.querySelector('#fmTankEditors').insertAdjacentHTML('beforeend',tankRow({number:t.number,fuel:t.fuel,mode:'percent',alerts:false}));countTanks(editor);});
  editor.querySelector('.fm-delete')?.addEventListener('click',()=>deleteLocation(l));
  editor.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.target,c={};for(const name of ['name','phone','address','model','host','port','interval','enabled','portal','email','sms','email_to','sms_to']){const el=form.elements.namedItem(name);c[name]=el.type==='checkbox'?el.checked:el.value;}
   c.icon=form.querySelector('[name=icon]:checked')?.value||'fuel';
   c.tanks=[...form.querySelectorAll('.fm-tank-editor')].map(row=>Object.fromEntries([...row.querySelectorAll('input,select')].map(el=>[el.name,el.type==='checkbox'?el.checked:el.value])));
   const wasNew=!editing;
   await busy(async()=>{const saved=await api({action:'save',...(editing?{id:editing.id}:{}),config:c,password:removalPasswords.get(form)});const target=saved.id||editing?.id||'all';editor.close();activeLocation=target;await load();if(wasNew&&target!=='all')await pair(target);},editor);};
 }
 function countTanks(editor=dialog){editor.querySelector('#fmTankCount').textContent='('+editor.querySelectorAll('.fm-tank-editor').length+')';}
 let inlineEdit=null,inlineSaving=false;
 function leaveInline(){if(inlineSaving)return false;if(inlineEdit?.dirty&&!confirm('Discard unsaved changes?'))return false;inlineEdit=null;return true;}
 function openInline(id,section,connectionPassword=''){
  if(activeLocation==='all'||!leaveInline())return;
  render();const l=locations.find(x=>x.id===id);if(!l)return;
  const card=[...root.querySelectorAll('.fm-location')].find(x=>x.dataset.station===id),middle=card.querySelector('.fm-station-page');
  const connectionUnlocked=section==='connection'&&Boolean(connectionPassword);
  inlineEdit={id,section,dirty:false};
  const titles={tanks:'Tank settings',location:'Location details',connection:'Veeder-Root connection'};
  let content='';
  if(section==='location')content='<fieldset class="fm-icon-field"><legend>Location tab icon</legend><div id="fmInlineIcons"></div></fieldset><div class="fm-grid">'+field('name','Station name',l.name,'text','required maxlength="100"')+field('phone','Station phone',l.phone,'tel')+field('address','Street address / location',l.address,'text','maxlength="300"')+'</div>'+(l.reading?.site_header?'<div class="fm-detected"><h3>Station header from monitor</h3><pre>'+esc(l.reading.site_header)+'</pre><button type="button" data-inline-import>Use header name & address</button></div>':'');
  if(section==='connection'){
   const notes='<p>A station computer collects readings and sends them securely to the portal. It must reach both the monitor and the internet.</p><p>Use the inventory data port, not the web login or configuration port. Read-only TLS-350 display-format collector. US gallons, inches, and °F.</p>';
   const display=(label,value)=>'<div class="fm-connection-value"><span>'+label+'</span><strong>'+esc(value)+'</strong></div>';
   content=connectionUnlocked
    ?'<p class="fm-connection-unlocked-note">Master Admin authorization verified. Review your changes before saving.</p><div class="fm-grid">'+modelField(l.model,'fmInlineModelChoices')+field('host','Local monitor IP / hostname',l.host,'text','required')+field('port','TCP data port',l.port,'number','required min="1" max="65535"')+field('interval','Read every (seconds)',l.interval,'number','required min="60" max="86400"')+toggle('enabled','Enable monitoring',l.enabled)+'</div>'+notes
    :'<div class="fm-connection-readonly-note">'+actionIcon('shield')+' Connection settings are read-only. Select <strong>Edit</strong> and enter the Master Admin password to make changes.</div><div class="fm-grid fm-connection-readonly">'+display('Monitor model',l.model)+display('Local monitor IP / hostname',l.host)+display('TCP data port',l.port)+display('Read every (seconds)',l.interval)+display('Monitoring status',l.enabled?'Enabled':'Paused')+'</div>'+notes;
  }
  if(section==='tanks')content='<p>Use the same tank numbers as the monitor. These settings affect portal monitoring only.</p>'+(l.reading?.tanks?.length?'<button type="button" data-inline-detect>Add detected tanks</button>':'')+'<datalist id="fmInlineFuelTypes"><option>Regular Unleaded (87)</option><option>Premium Unleaded (93)</option><option>Road Diesel</option><option>Off-Road Diesel</option><option>Kerosene</option></datalist><div class="fm-tank-tabs" role="tablist" aria-label="Tank settings" data-tank-tabs></div><div data-inline-tanks>'+l.tanks.map(t=>tankRow(t).replace('fmFuelTypes','fmInlineFuelTypes')).join('')+'</div><p>Critical must be below Low. Recovery must be above Low.</p><details class="fm-inline-alerts"><summary>Alert delivery</summary><div class="fm-delivery-methods">'+toggle('portal','Portal notification',l.portal)+toggle('email','Email alert',l.email)+toggle('sms','SMS alert',l.sms)+'</div><div class="fm-grid">'+recipientFields('email_to','Alert email addresses',l.email_to,'email')+recipientFields('sms_to','Alert mobile numbers',l.sms_to,'tel')+'</div><p>Delivery settings apply to this location’s tank alerts.</p></details>';
  const readOnlyConnection=section==='connection'&&!connectionUnlocked;
  const controls=readOnlyConnection?'<button type="button" data-inline-back>Close</button><button class="fm-connection-edit" type="button" data-inline-unlock>'+actionIcon('settings')+'Edit</button>':'<button type="button" data-inline-back>Cancel</button><button type="submit">Save changes</button>';
  middle.innerHTML='<form class="fm-inline-form"><div class="fm-inline-heading"><h3>'+titles[section]+'</h3>'+(readOnlyConnection?'<span class="fm-connection-readonly-label">Read only</span>':'')+(section==='tanks'?'<button type="button" data-inline-add>'+actionIcon('plus')+'Add tank</button>':'')+'</div>'+content+'<p class="fm-inline-message" role="status"></p><div class="fm-inline-save">'+(section==='location'?'<button class="fm-delete" type="button" data-inline-delete>Delete location</button>':'')+controls+'</div></form>';
  card.querySelectorAll('[data-inline-section]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inlineSection===section)));
  const form=middle.querySelector('form');let activeTank=null;
  // Compare editable values to the state when THIS section opened, not to input events.
  // This also handles changing a value and then restoring the original value.
  const inlineField=(container,name)=>{
   const el=container.querySelector('[name="'+name+'"]');
   if(!el)return null;
   if(el.type==='checkbox')return el.checked;
   const value=el.value.trim();
   return el.type==='number'&&value!==''&&Number.isFinite(Number(value))?Number(value):value;
  };
  const inlineSnapshot=()=>{
   if(section==='location')return JSON.stringify({
    name:inlineField(form,'name'),phone:inlineField(form,'phone'),address:inlineField(form,'address'),
    icon:form.querySelector('[name=icon]:checked')?.value||'fuel'
   });
   if(section==='connection')return JSON.stringify({
    model:inlineField(form,'model'),host:inlineField(form,'host'),port:inlineField(form,'port'),
    interval:inlineField(form,'interval'),enabled:inlineField(form,'enabled')
   });
   const tanks=[...form.querySelectorAll('.fm-tank-editor')].map(row=>({
    number:inlineField(row,'number'),fuel:inlineField(row,'fuel'),
    capacity:inlineField(row,'capacity'),mode:inlineField(row,'mode'),
    low:inlineField(row,'low'),critical:inlineField(row,'critical'),
    recovery:inlineField(row,'recovery'),alerts:inlineField(row,'alerts')
   }));
   return JSON.stringify({tanks,portal:inlineField(form,'portal'),email:inlineField(form,'email'),
    sms:inlineField(form,'sms'),email_to:inlineField(form,'email_to'),sms_to:inlineField(form,'sms_to')});
  };
  let inlineOriginal='';
  const updateInlineSave=()=>{
   const changed=inlineSnapshot()!==inlineOriginal;
   if(inlineEdit?.id===id&&inlineEdit.section===section)inlineEdit.dirty=changed;
   const save=form.querySelector('button[type=submit]');
   if(save)save.disabled=!changed||inlineSaving;
   return changed;
  };
  const count=(preferred)=>{
   const rows=[...form.querySelectorAll('.fm-tank-editor')],c=form.querySelector('[data-inline-count]');if(c)c.textContent='('+rows.length+')';
   const tabs=form.querySelector('[data-tank-tabs]');if(!tabs)return;
   activeTank=preferred&&rows.includes(preferred)?preferred:rows.includes(activeTank)?activeTank:rows[0];tabs.replaceChildren();
   rows.forEach((row,i)=>{const tab=document.createElement('button');tab.type='button';tab.id='fm-tank-setting-tab-'+i;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','fm-tank-setting-panel-'+i);tab.setAttribute('aria-selected',String(row===activeTank));tab.tabIndex=row===activeTank?0:-1;tab.append(WootenLocationIcons.icon('fuel'));const label=document.createElement('span');const tankName='Tank '+(row.querySelector('[name=number]').value||'(new)'),fuelName=row.querySelector('[name=fuel]').value.trim();label.textContent=fuelName||tankName;tab.setAttribute('aria-label',fuelName?tankName+' — '+fuelName:tankName);tab.title=fuelName?tankName+' — '+fuelName:tankName;tab.append(label);row.id='fm-tank-setting-panel-'+i;row.setAttribute('role','tabpanel');row.setAttribute('aria-labelledby',tab.id);row.hidden=row!==activeTank;tab.onclick=()=>{count(row);tabs.children[i]?.focus({preventScroll:true});};tabs.append(tab);});
  };count();
  function validTanks(){
   const seen=new Set();
   for(const row of form.querySelectorAll('.fm-tank-editor')){
    const get=n=>row.querySelector('[name='+n+']');
    row.querySelectorAll('input,select').forEach(el=>el.setCustomValidity(''));
    const number=Number(get('number').value),capacity=Number(get('capacity').value),low=Number(get('low').value),critical=Number(get('critical').value),recovery=Number(get('recovery').value),limit=get('mode').value==='percent'?100:capacity;
    if(seen.has(number))get('number').setCustomValidity('Each tank must have a unique tank / probe number.');seen.add(number);
    if(!get('fuel').value.trim())get('fuel').setCustomValidity('Enter the fuel product.');
    if(!(critical<low))get('critical').setCustomValidity('Critical fuel must be below Low fuel.');
    if(!(low<recovery&&recovery<=limit))get('recovery').setCustomValidity('Recovery must be above Low fuel and no greater than '+limit+'.');
    const invalid=[...row.querySelectorAll('input,select')].find(el=>!el.checkValidity());
    if(invalid){count(row);form.querySelector('.fm-inline-message').textContent='Complete this tank’s settings before adding another tank or saving.';invalid.reportValidity();return false;}
   }
   form.querySelector('.fm-inline-message').textContent='';return true;
  }
  if(section==='tanks'){
   form.noValidate=true;
   form.querySelector('[data-tank-tabs]').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...e.currentTarget.children],i=buttons.indexOf(document.activeElement);if(i<0)return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[n].click();});
   for(const event of ['input','change'])form.addEventListener(event,e=>{if(e.target.name==='number'||e.target.name==='fuel')count();});
  }
  setupRecipients(form);
  if(section==='location'){form.classList.add('fm-location-details');compactIconPicker(form.querySelector('#fmInlineIcons'),l.icon||'fuel');}
  inlineOriginal=inlineSnapshot();
  updateInlineSave(); // Save changes starts disabled in Tanks, Location, and unlocked Veeder-Root.
  form.addEventListener('input',()=>{form.querySelectorAll('input,select').forEach(el=>el.setCustomValidity(''));updateInlineSave()});
  form.addEventListener('change',updateInlineSave);
  form.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||inlineSaving)return;
   if(b.hasAttribute('data-inline-back')){if(leaveInline())render();}
   if(b.hasAttribute('data-inline-unlock')){
    const password=await requestConnectionEditPassword(l);
    if(password&&inlineEdit?.id===id&&inlineEdit.section===section)openInline(id,'connection',password);
    return;
   }
   if(b.hasAttribute('data-inline-add')){if(!validTanks())return;if(form.querySelectorAll('.fm-tank-editor').length>=64)return;form.querySelector('[data-inline-tanks]').insertAdjacentHTML('beforeend',tankRow({mode:'percent'}).replace('fmFuelTypes','fmInlineFuelTypes'));count(form.querySelector('[data-inline-tanks]').lastElementChild);updateInlineSave();form.querySelector('[data-inline-tanks]').lastElementChild.querySelector('input').focus();}
   if(b.classList.contains('fm-remove')){confirmTankRemoval(b.closest('fieldset'),()=>{count();updateInlineSave();});}
   if(b.hasAttribute('data-inline-detect')){if(!validTanks())return;const ids=new Set([...form.querySelectorAll('.fm-tank-editor [name=number]')].map(x=>Number(x.value)));for(const t of l.reading.tanks){if(ids.has(t.number)||form.querySelectorAll('.fm-tank-editor').length>=64)continue;form.querySelector('[data-inline-tanks]').insertAdjacentHTML('beforeend',tankRow({number:t.number,fuel:t.fuel,mode:'percent',alerts:false}).replace('fmFuelTypes','fmInlineFuelTypes'));ids.add(t.number);break;}count(form.querySelector('[data-inline-tanks]').lastElementChild);updateInlineSave();}
   if(b.hasAttribute('data-inline-import')){const lines=l.reading.site_header.split('\n').map(s=>s.trim()).filter(Boolean);form.elements.name.value=lines[0]||l.name;form.elements.address.value=lines.slice(1).join(', ');updateInlineSave();}
   if(b.hasAttribute('data-inline-delete')){if(!leaveInline())return;render();deleteLocation(l);}
  });
  form.onsubmit=async e=>{e.preventDefault();if(inlineSaving||readOnlyConnection||!updateInlineSave())return;if(section==='tanks'&&!validTanks())return;const invalid=[...form.querySelectorAll('input,select')].find(el=>!el.checkValidity());if(invalid){const row=invalid.closest('.fm-tank-editor');if(row)count(row);const details=invalid.closest('details');if(details)details.open=true;invalid.reportValidity();return;}inlineSaving=true;const session=epoch;const controls=[...root.querySelectorAll('button,input,select')];const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);const note=form.querySelector('.fm-inline-message');note.textContent='Saving changes…';
   try{
    const latest=await api();const current=latest.locations.find(x=>x.id===id);if(!current)throw Error('This location no longer exists. Refresh locations.');const config={...current};
    const names=section==='location'?['name','phone','address']:section==='connection'?['model','host','port','interval','enabled']:['portal','email','sms','email_to','sms_to'];
    for(const name of names){const el=form.elements.namedItem(name);config[name]=el.type==='checkbox'?el.checked:el.value;}
    if(section==='location')config.icon=form.querySelector('[name=icon]:checked')?.value||'fuel';
    if(section==='tanks')config.tanks=[...form.querySelectorAll('.fm-tank-editor')].map(row=>Object.fromEntries([...row.querySelectorAll('input,select')].map(el=>[el.name,el.type==='checkbox'?el.checked:el.value])));
    await api({action:'save',id,config,password:connectionUnlocked?connectionPassword:removalPasswords.get(form)});inlineEdit=null;inlineSaving=false;await load();message('Location changes saved.');
   }catch(err){if(epoch===session){note.textContent=err.message;note.classList.add('fm-error');}}
   finally{inlineSaving=false;controls.forEach((c,i)=>c.disabled=disabled[i]);}
  };
 }


 function requestConnectionEditPassword(l){
  return new Promise(resolve=>{
   const prompt=document.createElement('dialog');prompt.className='fm-dialog fm-remove-confirm';
   prompt.setAttribute('aria-labelledby','fmConnectionAuthTitle');
   prompt.innerHTML='<form><header><span class="fm-remove-icon">'+actionIcon('shield')+'</span><h2 id="fmConnectionAuthTitle">Edit Veeder-Root connection?</h2><p>'+esc(l.name)+'</p></header><div class="fm-dialog-body"><p>Only someone with the Master Admin password can change the monitor IP, port, polling interval, or monitoring status.</p><label>Master Admin password<input name="password" type="password" autocomplete="off" required placeholder="Enter Master Admin password"></label><p class="fm-error" role="status"></p></div><footer><button type="button" class="secondary">Cancel</button><button type="submit">Unlock editing</button></footer></form>';
   document.body.append(prompt);
   let working=false;
   const close=value=>{if(working)return;prompt.close();prompt.remove();resolve(value);};
   prompt.querySelector('button[type=button]').onclick=()=>close(null);
   prompt.addEventListener('cancel',e=>{e.preventDefault();close(null);});
   prompt.querySelector('form').onsubmit=async e=>{
    e.preventDefault();if(working)return;working=true;
    const input=prompt.querySelector('input[name=password]'),password=input.value;
    input.value='';prompt.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
     await api({action:'verify_connection_edit',id:l.id,password});
     working=false;close(password);
    }catch(err){prompt.querySelector('[role=status]').textContent=err.message;input.focus();}
    finally{working=false;prompt.querySelectorAll('button').forEach(b=>b.disabled=false);}
   };
   prompt.showModal();prompt.querySelector('input').focus();
  });
 }

 async function confirmTankRemoval(row,onRemoved){
  const form=row.closest('form'),number=row.querySelector('[name=number]').value||'(new)';
  const prompt=document.createElement('dialog');prompt.className='fm-dialog fm-remove-confirm';prompt.setAttribute('aria-labelledby','fmRemoveTitle');
  prompt.innerHTML='<form><header><span class="fm-remove-icon">'+actionIcon('shield')+'</span><h2 id="fmRemoveTitle">Remove tank '+esc(number)+'?</h2><p>Confirm with the password for '+esc(window.wootenAdminUser?.username||window.wootenAdminUser?.display_name||'the signed-in admin')+'.</p></header><div class="fm-dialog-body"><label>Current admin password<input name="password" type="password" autocomplete="new-password" placeholder="Enter password" required value=""></label><div class="fm-remove-note">Click <strong>Save changes</strong> afterward to save the removal.</div><p class="fm-error" role="status"></p></div><footer><button type="button" class="secondary">Cancel</button><button type="submit">Remove tank</button></footer></form>';
  document.body.append(prompt);let working=false;
  const close=()=>{if(working)return;prompt.close();prompt.remove();};
  prompt.querySelector('[type=button]').onclick=close;
  prompt.addEventListener('cancel',e=>{e.preventDefault();close();});
  prompt.querySelector('form').onsubmit=async e=>{e.preventDefault();if(working)return;working=true;const input=prompt.querySelector('input'),password=input.value;input.value='';prompt.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{await api({action:'verify_tank_removal',password});if(!row.isConnected)throw Error('Reopen tank settings.');removalPasswords.set(form,password);row.remove();onRemoved();working=false;close();}
   catch(err){prompt.querySelector('[role=status]').textContent=err.message;input.focus();}
   finally{working=false;prompt.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };prompt.showModal();prompt.querySelector('input').focus();
 }
 async function busy(fn,editor=dialog){const buttons=[...editor.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);editor.dataset.busy='1';try{await fn()}catch(e){const m=editor.querySelector('#fmDialogMessage');if(m)m.textContent=e.message;else message(e.message,true)}finally{buttons.forEach(b=>b.disabled=false);delete editor.dataset.busy;}}
 async function deleteLocation(l){
  // Use the same centered password-confirmation dialog as Remove tank.
  // The server still verifies the signed-in admin password before deleting.
  const prompt=document.createElement('dialog');
  prompt.className='fm-dialog fm-remove-confirm';
  prompt.setAttribute('aria-labelledby','fmDeleteLocationTitle');
  prompt.innerHTML='<form id="fmDeleteForm"><header><span class="fm-remove-icon">'+actionIcon('shield')+'</span><h2 id="fmDeleteLocationTitle">Delete location?</h2><p>'+esc(l.name)+'<br>Confirm with the password for '+esc(window.wootenAdminUser?.username||window.wootenAdminUser?.display_name||'the signed-in admin')+'.</p></header><div class="fm-dialog-body"><label>Current admin password<input name="password" type="password" autocomplete="new-password" placeholder="Enter password" required value=""></label><div class="fm-remove-note">This will permanently delete the location and its tank settings. The station collector will no longer be able to upload to this location.</div><p class="fm-error" role="status" aria-live="polite"></p></div><footer><button class="secondary" type="button">Cancel</button><button type="submit">Delete location</button></footer></form>';
  document.body.append(prompt);
  let working=false;
  const close=()=>{if(working)return;prompt.close();prompt.remove();};
  prompt.querySelector('[type=button]').onclick=close;
  prompt.addEventListener('cancel',e=>{e.preventDefault();close();});
  prompt.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(working)return;
   working=true;
   const input=prompt.querySelector('[name=password]'),password=input.value;
   input.value='';prompt.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{
    await api({action:'delete',id:l.id,password});
    working=false;close();
    // The legacy location editor may be open behind this confirmation.
    if(dialog.open)dialog.close();
    await load();
   }catch(err){
    if(prompt.isConnected){prompt.querySelector('[role=status]').textContent=err.message;input.focus();}
    else message(err.message,true);
   }finally{
    working=false;
    if(prompt.isConnected)prompt.querySelectorAll('button').forEach(b=>b.disabled=false);
   }
  };
  prompt.showModal();
  prompt.querySelector('[name=password]').focus();
 }

 function confirmCollectorReplacement(l){
  return new Promise(resolve=>{
   const prompt=document.createElement('dialog');prompt.className='fm-dialog fm-remove-confirm';prompt.setAttribute('aria-labelledby','fmKeyTitle');
   prompt.innerHTML='<form><header><span class="fm-remove-icon">'+actionIcon('shield')+'</span><h2 id="fmKeyTitle">Replace collector key?</h2><p>'+esc(l.name)+'</p></header><div class="fm-dialog-body"><label>Master Admin password<input type="password" name="password" autocomplete="new-password" required value="" placeholder="Enter Master Admin password"></label><div class="fm-remove-note">The old key will stop working immediately. Download the new connection file and replace it on the station computer.</div><p class="fm-error" role="status"></p></div><footer><button type="button" class="secondary">Cancel</button><button type="submit">Replace key</button></footer></form>';
   document.body.append(prompt);let working=false;
   const close=result=>{if(working)return;prompt.close();prompt.remove();resolve(result);};
   prompt.querySelector('[type=button]').onclick=()=>close(null);prompt.addEventListener('cancel',e=>{e.preventDefault();close(null);});
   prompt.querySelector('form').onsubmit=async e=>{e.preventDefault();if(working)return;working=true;const input=prompt.querySelector('input'),password=input.value;input.value='';prompt.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{const data=await api({action:'pair',id:l.id,password});working=false;close(data);}
    catch(err){prompt.querySelector('[role=status]').textContent=err.message;input.focus();}
    finally{working=false;prompt.querySelectorAll('button').forEach(b=>b.disabled=false);}
   };prompt.showModal();prompt.querySelector('input').focus();
  });
 }
 let pairing=false;
 async function pair(id){if(pairing)return;const l=locations.find(x=>x.id===id);if(!l)return;pairing=true;
  try{const data=l.paired?await confirmCollectorReplacement(l):await api({action:'pair',id});if(!data)return;const config=JSON.stringify({portal_url:location.origin,location_id:id,token:data.token,units:'US gallons'},null,2);
   dialog.innerHTML='<header><h2>Connect '+esc(l.name)+'</h2><button type="button" class="secondary fm-close" aria-label="Close">×</button></header><div class="fm-dialog-body fm-connect-body"><ol class="fm-connect-steps"><li><strong>Install the collector</strong><p>Place the Station-Collector folder from the update ZIP on the station computer.</p></li><li><strong>Download the connection file</strong><p>Save collector-config.json beside collector.py. Keep this file private; it permits uploading readings for this location.</p></li><li><strong>Test the connection</strong><p>Run the collector test on the station computer. The portal shows Connected after a valid reading arrives.</p></li></ol><div class="fm-connect-network"><span>Monitor address</span><strong>'+esc(l.host)+':'+l.port+'</strong><p>The station computer must reach this monitor and the internet. No incoming router port forwarding is needed.</p></div><label class="fm-toggle fm-connect-confirm"><input id="fmConfirmUnits" type="checkbox"><span>I confirmed this monitor reports US gallons, inches, and °F.</span></label></div><footer class="fm-connect-footer"><button type="button" id="fmDownload" disabled>Download collector-config.json</button><button type="button" class="secondary fm-close">Done</button></footer>';dialog.showModal();
   dialog.querySelector('#fmConfirmUnits').onchange=e=>{dialog.querySelector('#fmDownload').disabled=!e.target.checked;};dialog.querySelector('#fmDownload').onclick=()=>{const url=URL.createObjectURL(new Blob([config],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='collector-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};dialog.querySelectorAll('.fm-close').forEach(b=>b.onclick=()=>dialog.close());await load();
  }catch(e){message(e.message,true)}finally{pairing=false}
 }
 let lastSimulationClick={id:'',time:0};
 const isMidwayOne=l=>/^midway\s+market\s+(i|1|one)$/i.test(String(l?.name||'').trim());
 function showTankSimulation(id){
  const station=locations.find(l=>l.id===id);if(!isMidwayOne(station)||inlineEdit||creatingLocation)return;
  const source=root.querySelector('[data-station="'+CSS.escape(id)+'"]');if(!source)return;
  const preview=document.createElement('dialog');preview.className='fm-dialog fm-simulation';
  preview.innerHTML='<header><h2>'+esc(station.name)+' — Tank simulation</h2><button type="button" class="secondary fm-close" aria-label="Close simulation">×</button></header><div class="fm-dialog-body"><p class="fm-simulation-note"><strong>SIMULATED READINGS</strong> — Temporary preview only. Drag each slider to change its fuel level. Nothing is saved and no alerts are sent.</p><div class="fm-tanks"></div></div><footer><button type="button" class="secondary fm-close">Close simulation</button></footer>';
  station.tanks.slice(0,4).forEach((tank,index)=>{
   const card=source.querySelectorAll('.fm-tank')[index]?.cloneNode(true);if(!card)return;
   card.querySelector('.fm-water-reading')?.remove();card.querySelectorAll(':scope > p').forEach(el=>el.remove());
   const label=document.createElement('label');label.className='fm-simulation-slider';label.textContent='Simulated fuel level';const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='100';slider.step='0.1';slider.setAttribute('aria-label','Tank '+tank.number+' simulated fuel percent');label.append(slider);card.append(label);
   const capacity=Number(tank.capacity),low=tank.mode==='percent'?Number(tank.low):Number(tank.low)/capacity*100;
   slider.value=String(index===0?Math.max(0,low/2):[0,35,65,90][index]);
   const svg=card.querySelector('svg.fm-dial');let fill=svg.querySelector('.fm-dial-fill');if(!fill){fill=svg.querySelector('.fm-dial-track').cloneNode();fill.setAttribute('class','fm-dial-fill');fill.setAttribute('pathLength','100');svg.querySelector('.fm-dial-track').after(fill);}
   const update=()=>{const percent=Number(slider.value),volume=Math.round(capacity*percent/100),band=fuelBand(tank,volume),color=band.color;fill.setAttribute('stroke',color);fill.setAttribute('stroke-dasharray',percent+' 100');fill.style.opacity=percent?1:0;svg.querySelector('.fm-dial-value').textContent=percent.toFixed(1)+'%';svg.setAttribute('aria-label','Simulated tank '+tank.number+': '+percent.toFixed(1)+' percent');card.querySelector('.fm-dial-quantity').innerHTML=volume.toLocaleString('en-US')+' <span>/ '+capacity.toLocaleString('en-US')+' gal</span>';card.querySelector('.fm-dial-caption').textContent='Simulation · '+band.name;card.querySelector('.fm-dial-caption').style.color=band.color;};slider.oninput=update;update();preview.querySelector('.fm-tanks').append(card);
  });
  const close=()=>{preview.close();preview.remove();};preview.querySelectorAll('.fm-close').forEach(b=>b.onclick=close);preview.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(preview);preview.showModal();
 }
 dialog.addEventListener('cancel',e=>{if(dialog.dataset.busy)e.preventDefault()});dialog.addEventListener('close',()=>{dialog.innerHTML='';editing=null;});
 async function sendFuelReading(id){
  const location=locations.find(x=>x.id===id);if(!location)return;
  const emails=String(location.email_to||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
  const phones=String(location.sms_to||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
  const portalEnabled=location.portal!==false;
  const emailEnabled=!!location.email&&emails.length>0;
  const smsEnabled=!!location.sms&&phones.length>0;
  const channels=[
   ...(portalEnabled?['Portal notification']:[]),
   ...(emailEnabled?[`Email (${emails.length})`]:[]),
   ...(smsEnabled?[`SMS (${phones.length})`]:[])
  ];
  if(!channels.length){message('No fuel-reading delivery option is enabled for this location.',true);return;}
  if(!confirm(`Send the current fuel reading for ${location.name}?\n\nEnabled delivery: ${channels.join(' • ')}\n\nAll configured tank readings will be included.`))return;
  const buttons=[...root.querySelectorAll('[data-send-reading="'+CSS.escape(id)+'"]')];
  buttons.forEach(x=>{
   x.disabled=true;
   const label=x.querySelector('[data-send-reading-label]');
   if(label)label.textContent='Send fuel reading...';
  });
  message('Sending current fuel reading…');
  try{
   await api({action:'send_reading',id});
   message('Fuel reading queued for '+channels.join(', ')+'.');
   await load();
   window.wootenRefreshAdminNotifications?.();
  }catch(err){message(err.message,true)}
  finally{
   buttons.forEach(x=>{
    x.disabled=false;
    const label=x.querySelector('[data-send-reading-label]');
    if(label)label.textContent='Send fuel reading';
   });
  }
 }

function openAutomaticReadingSchedule(id){
  if(activeLocation==='all'||inlineSaving)return;
  if(inlineEdit){
   if(!leaveInline())return;
   render();
  }
  const l=locations.find(x=>x.id===id);
  const card=[...root.querySelectorAll('.fm-location')].find(x=>x.dataset.station===id);
  const panel=card?.querySelector('[data-auto-reading-panel]');
  const middle=panel?.querySelector('.fm-automatic-panel-content');
  if(!l||!middle)return;
  panel.open=true;
  inlineEdit={id,section:'auto_reading',dirty:false};
  const saved=l.auto_reading||{enabled:false,days:[0,1,2,3,4,5,6],time:'08:00'};
  const selected=new Set(saved.days||[]),all=selected.size===7;
  const labels=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  middle.innerHTML='<form class="fm-inline-form fm-automatic-reading" id="fmAutomaticReadingForm">'
   +'<p>Send the latest tank readings automatically on the selected days at the selected time. Uses this location’s existing Portal, Email and SMS delivery settings.</p>'
   +'<label class="fm-toggle fm-auto-switch"><input name="enabled" type="checkbox" '+(saved.enabled?'checked':'')+'><span>Enable automatic fuel readings</span></label>'
   +'<fieldset class="fm-auto-day-field"><legend>Sending days</legend>'
   +'<div class="fm-auto-day-mode"><label><input type="radio" name="mode" value="all" '+(all?'checked':'')+'>All days</label><label><input type="radio" name="mode" value="custom" '+(!all?'checked':'')+'>Choose days</label></div>'
   +'<div class="fm-auto-days">'+labels.map((day,i)=>'<label><input type="checkbox" name="weekday" value="'+i+'" '+(selected.has(i)?'checked':'')+'><span>'+day+'</span></label>').join('')+'</div></fieldset>'
   +'<div class="fm-auto-time"><label for="fmAutoTime">Send time (Central Time — CDT/CST)</label><input type="time" id="fmAutoTime" name="send_time" value="'+esc(saved.time||'08:00')+'" required></div>'
   +'<p class="fm-auto-note">The scheduled report includes all configured tanks. It uses the latest reading uploaded by the station collector. If that reading is stale, the report waits rather than sending outdated fuel levels.</p>'
   +'<p class="fm-inline-message" role="status"></p><div class="fm-inline-save"><button type="button" data-auto-cancel>Cancel</button><button type="submit" disabled>Save schedule</button></div></form>';
  const form=middle.querySelector('form');
  const mode=()=>form.elements.mode.value;
  const current=()=>{
   let days=mode()==='all'?[0,1,2,3,4,5,6]:[...form.querySelectorAll('[name=weekday]:checked')].map(x=>Number(x.value)).sort((a,b)=>a-b);
   // Keep a valid stored day set even if the user turns scheduling off after deselecting all weekdays.
   if(!form.elements.enabled.checked&&!days.length)days=[...(saved.days?.length?saved.days:[0,1,2,3,4,5,6])];
   return {enabled:form.elements.enabled.checked,time:form.elements.send_time.value,days};
  };
  const original=JSON.stringify({enabled:!!saved.enabled,time:saved.time||'08:00',days:[...(saved.days||[0,1,2,3,4,5,6])].sort((a,b)=>a-b)});
  function changed(){
   const dirty=JSON.stringify(current())!==original;
   if(inlineEdit?.id===id&&inlineEdit.section==='auto_reading')inlineEdit.dirty=dirty;
   form.querySelector('[type=submit]').disabled=!dirty||inlineSaving;
   return dirty;
  }
  function syncControls(){
   const enabled=form.elements.enabled.checked;
   form.querySelector('.fm-auto-day-field').disabled=!enabled;
   form.querySelector('.fm-auto-day-field').classList.toggle('is-disabled',!enabled);
   form.querySelector('.fm-auto-time').classList.toggle('is-disabled',!enabled);
   form.querySelectorAll('[name=mode]').forEach(el=>el.disabled=!enabled);
   form.querySelectorAll('[name=weekday]').forEach(el=>el.disabled=!enabled||mode()==='all');
   form.elements.send_time.disabled=!enabled;
   changed();
  }
  syncControls();
  form.addEventListener('input',changed);
  form.addEventListener('change',e=>{
   if(e.target.name==='mode'||e.target.name==='enabled')syncControls();
   if(e.target.name==='weekday'&&mode()==='custom'&&form.querySelectorAll('[name=weekday]:checked').length===7){
    form.querySelector('[name=mode][value=all]').checked=true;
    syncControls();
   }
   changed();
  });
  form.querySelector('[data-auto-cancel]').onclick=()=>{
   if(!leaveInline())return;
   panel.open=false;
   middle.replaceChildren();
   panel.querySelector('summary')?.focus({preventScroll:true});
  };
  form.onsubmit=async e=>{
   e.preventDefault();if(inlineSaving||!changed())return;
   const schedule=current();
   if(!schedule.days.length){form.querySelector('.fm-inline-message').textContent='Choose at least one sending day.';return;}
   if(schedule.enabled&&!form.elements.send_time.checkValidity()){form.elements.send_time.reportValidity();return;}
   inlineSaving=true;
   form.querySelector('[type=submit]').disabled=true;
   form.querySelector('.fm-inline-message').textContent='Saving automatic sending schedule…';
   try{
    await api({action:'schedule_save',id,schedule});
    inlineSaving=false;inlineEdit=null;
    await load();
    message('Automatic fuel reading schedule saved.');
    openAutomaticReadingSchedule(id);
   }catch(error){
    form.querySelector('.fm-inline-message').textContent=error.message;
    inlineSaving=false;changed();
   }
  };
  middle.querySelector('[name=enabled]')?.focus({preventScroll:true});
}

// The disclosure header expands beneath (not instead of) the tank gauges.
// Confirm unsaved changes before collapsing the form.
root.addEventListener('click',e=>{
 const summary=e.target.closest('summary[data-auto-reading-summary]');
 if(!summary)return;
 e.preventDefault();
 const panel=summary.parentElement;
 const id=panel?.dataset.autoReadingPanel;
 if(!id||inlineSaving)return;
 if(panel.open){
  if(inlineEdit?.section==='auto_reading'&&inlineEdit.id===id&&!leaveInline())return;
  panel.open=false;
  panel.querySelector('.fm-automatic-panel-content')?.replaceChildren();
 }else{
  openAutomaticReadingSchedule(id);
 }
});

 root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.inlineSection){openInline(b.dataset.inlineId,b.dataset.inlineSection);return;}if(b.dataset.locationTab){clearFuelAlertHighlight();focusedFuelAlert=null;scrollToFuelAlert=0;alertPage=1;const now=Date.now(),double=lastSimulationClick.id===b.dataset.locationTab&&now-lastSimulationClick.time<450;lastSimulationClick={id:b.dataset.locationTab,time:now};if(double&&b.dataset.locationTab==='all'&&!inlineEdit&&!creatingLocation){const station=locations.find(isMidwayOne);if(station)showTankSimulation(station.id);return;}if(creatingLocation){const draft=root.querySelector('.fm-new-location-page');if(draft?.dataset.busy)return;if(!confirm('Cancel this new location? Unsaved information will be discarded.'))return;creatingLocation=false;}if(!leaveInline())return;activeLocation=b.dataset.locationTab;render();document.getElementById('fm-location-tab-'+activeLocation)?.focus({preventScroll:true});return;}if(b.dataset.addTank)openEdit(b.dataset.addTank,true);if(b.dataset.edit)openEdit(b.dataset.edit);if(b.dataset.alertPage){alertPage=Number(b.dataset.alertPage)||1;render();return;}if(b.id==='fmAlertPrev'){alertPage=Math.max(1,alertPage-1);render();return;}if(b.id==='fmAlertNext'){alertPage+=1;render();return;}if(b.dataset.sendReading){await sendFuelReading(b.dataset.sendReading);return;}if(b.dataset.pair){if(!leaveInline())return;render();await pair(b.dataset.pair);}if(b.dataset.ack){b.disabled=true;try{await api({action:'acknowledge',id:b.dataset.location,alert_id:Number(b.dataset.ack)});await load();window.wootenRefreshAdminNotifications?.()}catch(err){message(err.message,true)}finally{b.disabled=false}}});
 document.getElementById('fmLocationTabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...e.currentTarget.querySelectorAll('[role=tab]')],index=buttons.indexOf(document.activeElement);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();});
 document.getElementById('fmAdd').onclick=()=>{if(creatingLocation){root.querySelector('.fm-new-location-page [name=name]')?.focus();return;}if(leaveInline()){render();openEdit();}};document.getElementById('fmRefresh').onclick=()=>{if(leaveInline())load();};
 // Jump from a notification to the precise historical alert, not just the tab.
 // The target fetch also supports alerts older than the usual most-recent-100 list.
 let fuelAlertJumpSeq=0;
 async function openSpecificFuelAlert({alertId,locationId}={}){
  const id=Number(alertId),location=String(locationId||'');
  if(!Number.isSafeInteger(id)||id<1||!location||!allowed()||!key())return;
  const sequence=++fuelAlertJumpSeq,token=key();
  try{
   const response=await fetch('/api/admin/fuel-monitor?alert_id='+encodeURIComponent(id),{headers:{'X-Admin-Key':token},cache:'no-store'});
   const data=await response.json();
   if(token!==key()||sequence!==fuelAlertJumpSeq)return;
   if(!response.ok||!data.success)throw Error(data.error||'Fuel alert could not be loaded.');
   const target=data.target_alert;
   if(!target||Number(target.id)!==id||String(target.location_id)!==location)throw Error('That fuel alert is no longer available.');
   if(!data.locations.some(l=>String(l.id)===location))throw Error('The location for this alert no longer exists.');
   if(creatingLocation||inlineEdit){if(!leaveInline())return;creatingLocation=false;inlineEdit=null;}
   locations=data.locations;
   focusedFuelAlert=target;
   scrollToFuelAlert=id;
   startFuelAlertHighlight();
   alerts=[...(data.alerts||[])];
   if(!alerts.some(a=>Number(a.id)===id))alerts.push(target);
   alerts.sort((a,b)=>Number(b.id)-Number(a.id));
   activeLocation=location;
   const position=alerts.filter(a=>String(a.location_id)===location).findIndex(a=>Number(a.id)===id);
   alertPage=Math.floor(Math.max(0,position)/ALERTS_PER_PAGE)+1;
   render();
   if(!root.querySelector('[data-fuel-alert-id="'+id+'"]'))throw Error('The selected alert could not be displayed.');
   message('Showing the selected fuel alert in '+(locations.find(l=>String(l.id)===location)?.name||'this location')+'.');
  }catch(error){if(sequence===fuelAlertJumpSeq){clearFuelAlertHighlight();message(error.message,true);}}
 }
 window.addEventListener('wooten-open-fuel-alert-notification',event=>{openSpecificFuelAlert(event.detail);});
 window.addEventListener('wooten-admin-page-open',e=>{if(e.detail?.panel==='fuel-monitor')load()});
 window.addEventListener('wooten-admin-auth-changed',()=>{clearFuelAlertHighlight();focusedFuelAlert=null;scrollToFuelAlert=0;epoch++;creatingLocation=false;inlineEdit=null;inlineSaving=false;locations=[];alerts=[];history=[];activeLocation='all';dialog.close();render();if(!document.getElementById('admin-tab-fuel-monitor').hidden)load()});
 setInterval(()=>{if(!document.hidden&&!document.getElementById('admin-tab-fuel-monitor').hidden&&!dialog.open)load()},60000);
 if(!document.getElementById('admin-tab-fuel-monitor').hidden)load();
})();
