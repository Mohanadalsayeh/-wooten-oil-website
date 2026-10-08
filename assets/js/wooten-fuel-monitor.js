(()=>{'use strict';
 const root=document.getElementById('fuelMonitorRoot');if(!root)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const actionIcon=name=>'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+({send:'<path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/>',shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>',network:'<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/>',plus:'<path d="M12 5v14M5 12h14"/>',settings:'<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',key:'<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>'}[name]||'')+'</svg>';
 const removalPasswords=new WeakMap();
 const key=()=>document.getElementById('adminKey')?.value.trim()||'';
 const allowed=()=>window.WootenAdminAccess?.has(window.wootenAdminUser,'fuel_monitoring');
 const time=v=>v?(window.WootenTime?.dateTime(v)||new Date(v).toLocaleString()):'Not retrieved yet';
 let creatingLocation=false;
 let history=[],locations=[],alerts=[],editing=null,loading=false,epoch=0,activeLocation='all';
 const dialog=document.createElement('dialog');dialog.className='fm-dialog';document.body.append(dialog);
 window.matchMedia('(min-width:541px)').addEventListener('change',e=>{root.querySelectorAll('.fm-overview-details').forEach(details=>{details.open=e.matches;});});
 root.innerHTML='<div class="fm-heading"><div><div class="admin-page-label">Location Monitoring</div><h2>Locations & Fuel Monitoring</h2><p>Tank inventory, connection status, and fuel alerts across your stations.</p></div><div class="fm-actions"><button type="button" class="secondary" id="fmRefresh">Refresh</button><button type="button" id="fmAdd">Add location</button></div></div><p id="fmMessage" role="status"></p><div id="fmLocationTabs" role="tablist" aria-label="Gas station locations"></div><div id="fmLocations" role="tabpanel" aria-label="Location tanks"></div><h3>Fuel alert history</h3><p>Submitted means the email/SMS provider accepted the message; it does not confirm delivery. Latest 100 events.</p><div id="fmAlerts"></div><details class="fm-history-tree" id="fmHistoryTree"><summary><span class="fm-history-tree-icon" aria-hidden="true"></span><span>Change history</span><span class="fm-history-tree-count" id="fmHistoryTreeCount">0 changes</span></summary><div class="fm-history-tree-body"><p>Latest 50 changes across locations. History starts with this update.</p><div id="fmHistory"></div></div></details>';
 const message=(s,bad=false)=>{const el=document.getElementById('fmMessage');el.textContent=s;el.className=bad?'fm-error':'fm-note';};
 async function api(body){const token=key(),generation=epoch;const res=await fetch('/api/admin/fuel-monitor',{method:body?'POST':'GET',headers:{'X-Admin-Key':token,'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();if(token!==key()||generation!==epoch)throw Error('Admin session changed. Reopen Fuel Monitoring.');if(!res.ok||!data.success)throw Error(data.error||'Request failed.');return data;}
 async function load(){if(creatingLocation||inlineEdit||inlineSaving)return;if(loading||!key()||!allowed())return;loading=true;document.getElementById('fmRefresh').disabled=true;message('Loading locations…');try{const data=await api();if(creatingLocation||inlineEdit||inlineSaving)return;locations=data.locations;alerts=data.alerts;history=data.history||[];render();message(locations.length+' location(s) loaded.');}catch(e){message(e.message,true)}finally{loading=false;document.getElementById('fmRefresh').disabled=false}}
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
  return '<details class="fm-monitor-panel" '+(m?.state==='reported'?'open':'')+'><summary><span class="fm-monitor-title">Monitor alarms</span><span class="fm-monitor-status">'+esc(status)+'</span>'+(stale?'<span class="fm-monitor-stale">Last known report</span>':'')+'</summary><p>Read-only report: active or unacknowledged alarms and warnings. Up to 25 entries from the monitor. Portal acknowledgment does not clear monitor alarms.</p>'+(m?'<p>Report time: '+esc(time(m.observed_at))+'</p>':'')+(m?.error?'<p class="fm-error">'+esc(m.error)+'</p>':'')+(m?.report?'<pre>'+esc(m.report)+'</pre>':'')+'</details>';
 }
 function render(){
  if(activeLocation!=='all'&&!locations.some(l=>l.id===activeLocation))activeLocation='all';
  const tabs=document.getElementById('fmLocationTabs');tabs.replaceChildren();
  const views=[{id:'all',name:'All locations',icon:'fuel'},...locations];
  for(const l of views){const button=document.createElement('button');button.type='button';button.className='fm-location-tab';button.id='fm-location-tab-'+l.id;button.dataset.locationTab=l.id;button.setAttribute('role','tab');button.setAttribute('aria-controls','fmLocations');button.setAttribute('aria-selected',String(activeLocation===l.id));button.tabIndex=activeLocation===l.id?0:-1;const text=document.createElement('span');text.textContent=l.name;button.append(WootenLocationIcons.icon(l.icon||'fuel'),text);tabs.append(button)}
  document.getElementById('fmLocations').setAttribute('aria-labelledby','fm-location-tab-'+activeLocation);
  const shownLocations=activeLocation==='all'?locations:locations.filter(l=>l.id===activeLocation);
  const shownAlerts=activeLocation==='all'?alerts:alerts.filter(a=>a.location_id===activeLocation);

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

   }).join(''):'<p>Add tanks or review detected tanks after the first reading.</p>')+ '</div></div><div class="fm-station-actions"><button type="button" class="fm-add-tank" data-inline-id="'+esc(l.id)+'" data-inline-section="tanks">'+actionIcon('plus')+'Add/Edit tank</button><button type="button" data-inline-id="'+esc(l.id)+'" data-inline-section="location">'+actionIcon('settings')+'Edit location</button><button type="button" data-inline-id="'+esc(l.id)+'" data-inline-section="connection">'+actionIcon('network')+'Edit Veeder-Root connection</button><button type="button" class="fm-send-reading" data-send-reading="'+esc(l.id)+'" '+(!l.reading?.tanks?.length?'disabled title="No fuel reading available yet"':'')+'>'+actionIcon('send')+'Send fuel reading</button><button type="button" class="fm-collector-action" data-pair="'+esc(l.id)+'">'+actionIcon('key')+(l.paired?'Replace collector key':'Connect collector')+'</button></div></article>';
  }).join(''):'<div class="fm-empty">No locations yet. Add your first gas station to set up its tanks and monitoring.</div>';
  for(const card of root.querySelectorAll('.fm-location')){
   const footer=card.querySelector('.fm-station-actions');
   const actions=document.createElement('div');actions.className='fm-header-actions';
   for(const button of [...footer.querySelectorAll('[data-inline-section]')])actions.append(button);
   const header=card.querySelector('.fm-station-header');
   const info=header.firstElementChild;info.classList.add('fm-location-info');
   header.append(actions);
   if(activeLocation==='all'){
    const send=footer.querySelector('[data-send-reading]');
    if(send){send.classList.add('fm-send-reading-overview');header.append(send);}
    actions.classList.add('fm-actions-reserved');actions.setAttribute('aria-hidden','true');actions.inert=true;
    for(const button of actions.querySelectorAll('button')){button.disabled=true;button.removeAttribute('data-inline-section');button.removeAttribute('data-inline-id');}
    footer.remove();
    const page=card.querySelector('.fm-station-page'),details=document.createElement('details'),summary=document.createElement('summary');
    details.className='fm-overview-details';details.open=window.matchMedia('(min-width:541px)').matches;
    summary.textContent='View tanks and alarms';page.before(details);details.append(summary,page);
   }
  }
  const filteredHistory=activeLocation==='all'?history:history.filter(h=>h.location_id===activeLocation);
  const shownHistory=filteredHistory.slice(0,50);
  const historyCount=document.getElementById('fmHistoryTreeCount');
  if(historyCount)historyCount.textContent=shownHistory.length+' change'+(shownHistory.length===1?'':'s');
  document.getElementById('fmHistory').innerHTML=shownHistory.length?shownHistory.map(h=>{
   let changes=[];try{changes=JSON.parse(h.changes)}catch{}
   const value=v=>v==null?'Not set':typeof v==='object'?JSON.stringify(v,null,2):String(v);
   return '<details class="fm-history-entry"><summary>'+esc(h.location_name)+' · '+esc(({save:'Settings saved',pair:'Collector key replaced',delete:'Location deleted',send_reading:'Fuel reading sent'})[h.action]||h.action)+'</summary><p>'+esc(time(h.created_at))+' · '+esc(h.actor)+'</p>'+changes.map(c=>'<div class="fm-history-change"><strong>'+esc(c.field.replaceAll('_',' '))+'</strong><div><span>Before</span><pre>'+esc(value(c.before))+'</pre></div><div><span>After</span><pre>'+esc(value(c.after))+'</pre></div></div>').join('')+'</details>';
  }).join(''):'<p>No location changes recorded yet.</p>';
  document.getElementById('fmAlerts').innerHTML=shownAlerts.length?shownAlerts.map(a=>'<article class="fm-alert '+(a.level==='reading'?'fm-alert-reading':'')+'"><div><strong>'+esc(a.level==='reading'?'FUEL READING':a.level.toUpperCase())+'</strong><p>'+esc(a.message)+'</p><small>'+esc(time(a.created_at))+' · Email: '+esc(a.email_status)+' · SMS: '+esc(a.sms_status)+'</small>'+(['failed','partial'].includes(a.email_status)?'<p class="fm-error">Email: '+esc(a.email_detail)+'</p>':'')+(['failed','partial'].includes(a.sms_status)?'<p class="fm-error">SMS: '+esc(a.sms_detail)+'</p>':'')+'</div>'+(!a.acknowledged&&locations.some(l=>l.id===a.location_id)?'<button class="secondary" type="button" data-ack="'+a.id+'" data-location="'+esc(a.location_id)+'">Acknowledge</button>':'<span>Acknowledged</span>')+'</article>').join(''):'<p>No fuel alerts recorded.</p>';
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
   await busy(async()=>{const saved=await api({action:'save',...(editing?{id:editing.id}:{}),config:c,password:removalPasswords.get(form)});const target=saved.id||editing?.id||'all';editor.close();activeLocation=target;await load();},editor);};
 }
 function countTanks(editor=dialog){editor.querySelector('#fmTankCount').textContent='('+editor.querySelectorAll('.fm-tank-editor').length+')';}
 let inlineEdit=null,inlineSaving=false;
 function leaveInline(){if(inlineSaving)return false;if(inlineEdit?.dirty&&!confirm('Discard unsaved changes?'))return false;inlineEdit=null;return true;}
 function openInline(id,section){
  if(activeLocation==='all'||!leaveInline())return;
  render();const l=locations.find(x=>x.id===id);if(!l)return;
  const card=[...root.querySelectorAll('.fm-location')].find(x=>x.dataset.station===id),middle=card.querySelector('.fm-station-page');
  inlineEdit={id,section,dirty:false};
  const titles={tanks:'Tank settings',location:'Location details',connection:'Veeder-Root connection'};
  let content='';
  if(section==='location')content='<fieldset class="fm-icon-field"><legend>Location tab icon</legend><div id="fmInlineIcons"></div></fieldset><div class="fm-grid">'+field('name','Station name',l.name,'text','required maxlength="100"')+field('phone','Station phone',l.phone,'tel')+field('address','Street address / location',l.address,'text','maxlength="300"')+'</div>'+(l.reading?.site_header?'<div class="fm-detected"><h3>Station header from monitor</h3><pre>'+esc(l.reading.site_header)+'</pre><button type="button" data-inline-import>Use header name & address</button></div>':'');
  if(section==='connection')content='<div class="fm-grid">'+modelField(l.model,'fmInlineModelChoices')+field('host','Local monitor IP / hostname',l.host,'text','required')+field('port','TCP data port',l.port,'number','required min="1" max="65535"')+field('interval','Read every (seconds)',l.interval,'number','required min="60" max="86400"')+toggle('enabled','Enable monitoring',l.enabled)+'</div><p>A station computer collects readings and sends them securely to the portal. It must reach both the monitor and the internet.</p><p>Use the inventory data port, not the web login or configuration port. Read-only TLS-350 display-format collector. US gallons, inches, and °F.</p>';
  if(section==='tanks')content='<p>Use the same tank numbers as the monitor. These settings affect portal monitoring only.</p>'+(l.reading?.tanks?.length?'<button type="button" data-inline-detect>Add detected tanks</button>':'')+'<datalist id="fmInlineFuelTypes"><option>Regular Unleaded (87)</option><option>Premium Unleaded (93)</option><option>Road Diesel</option><option>Off-Road Diesel</option><option>Kerosene</option></datalist><div class="fm-tank-tabs" role="tablist" aria-label="Tank settings" data-tank-tabs></div><div data-inline-tanks>'+l.tanks.map(t=>tankRow(t).replace('fmFuelTypes','fmInlineFuelTypes')).join('')+'</div><p>Critical must be below Low. Recovery must be above Low.</p><details class="fm-inline-alerts"><summary>Alert delivery</summary><div class="fm-delivery-methods">'+toggle('portal','Portal notification',l.portal)+toggle('email','Email alert',l.email)+toggle('sms','SMS alert',l.sms)+'</div><div class="fm-grid">'+recipientFields('email_to','Alert email addresses',l.email_to,'email')+recipientFields('sms_to','Alert mobile numbers',l.sms_to,'tel')+'</div><p>Delivery settings apply to this location’s tank alerts.</p></details>';
  middle.innerHTML='<form class="fm-inline-form"><div class="fm-inline-heading"><h3>'+titles[section]+'</h3>'+(section==='tanks'?'<button type="button" data-inline-add>'+actionIcon('plus')+'Add tank</button>':'')+'</div>'+content+'<p class="fm-inline-message" role="status"></p><div class="fm-inline-save">'+(section==='location'?'<button class="fm-delete" type="button" data-inline-delete>Delete location</button>':'')+'<button type="button" data-inline-back>Cancel</button><button type="submit">Save changes</button></div></form>';
  card.querySelectorAll('[data-inline-section]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inlineSection===section)));
  const form=middle.querySelector('form');let activeTank=null;
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
  form.addEventListener('input',()=>{form.querySelectorAll('input,select').forEach(el=>el.setCustomValidity(''));if(inlineEdit)inlineEdit.dirty=true});form.addEventListener('change',()=>{if(inlineEdit)inlineEdit.dirty=true});
  form.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||inlineSaving)return;
   if(b.hasAttribute('data-inline-back')){if(leaveInline())render();}
   if(b.hasAttribute('data-inline-add')){if(!validTanks())return;if(form.querySelectorAll('.fm-tank-editor').length>=64)return;form.querySelector('[data-inline-tanks]').insertAdjacentHTML('beforeend',tankRow({mode:'percent'}).replace('fmFuelTypes','fmInlineFuelTypes'));inlineEdit.dirty=true;count(form.querySelector('[data-inline-tanks]').lastElementChild);form.querySelector('[data-inline-tanks]').lastElementChild.querySelector('input').focus();}
   if(b.classList.contains('fm-remove')){confirmTankRemoval(b.closest('fieldset'),()=>{if(inlineEdit)inlineEdit.dirty=true;count();});}
   if(b.hasAttribute('data-inline-detect')){if(!validTanks())return;const ids=new Set([...form.querySelectorAll('.fm-tank-editor [name=number]')].map(x=>Number(x.value)));for(const t of l.reading.tanks){if(ids.has(t.number)||form.querySelectorAll('.fm-tank-editor').length>=64)continue;form.querySelector('[data-inline-tanks]').insertAdjacentHTML('beforeend',tankRow({number:t.number,fuel:t.fuel,mode:'percent',alerts:false}).replace('fmFuelTypes','fmInlineFuelTypes'));ids.add(t.number);break;}inlineEdit.dirty=true;count(form.querySelector('[data-inline-tanks]').lastElementChild);}
   if(b.hasAttribute('data-inline-import')){const lines=l.reading.site_header.split('\n').map(s=>s.trim()).filter(Boolean);form.elements.name.value=lines[0]||l.name;form.elements.address.value=lines.slice(1).join(', ');inlineEdit.dirty=true;}
   if(b.hasAttribute('data-inline-delete')){if(!leaveInline())return;render();deleteLocation(l);}
  });
  form.onsubmit=async e=>{e.preventDefault();if(inlineSaving)return;if(section==='tanks'&&!validTanks())return;const invalid=[...form.querySelectorAll('input,select')].find(el=>!el.checkValidity());if(invalid){const row=invalid.closest('.fm-tank-editor');if(row)count(row);const details=invalid.closest('details');if(details)details.open=true;invalid.reportValidity();return;}inlineSaving=true;const session=epoch;const controls=[...root.querySelectorAll('button,input,select')];const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);const note=form.querySelector('.fm-inline-message');note.textContent='Saving changes…';
   try{
    const latest=await api();const current=latest.locations.find(x=>x.id===id);if(!current)throw Error('This location no longer exists. Refresh locations.');const config={...current};
    const names=section==='location'?['name','phone','address']:section==='connection'?['model','host','port','interval','enabled']:['portal','email','sms','email_to','sms_to'];
    for(const name of names){const el=form.elements.namedItem(name);config[name]=el.type==='checkbox'?el.checked:el.value;}
    if(section==='location')config.icon=form.querySelector('[name=icon]:checked')?.value||'fuel';
    if(section==='tanks')config.tanks=[...form.querySelectorAll('.fm-tank-editor')].map(row=>Object.fromEntries([...row.querySelectorAll('input,select')].map(el=>[el.name,el.type==='checkbox'?el.checked:el.value])));
    await api({action:'save',id,config,password:removalPasswords.get(form)});inlineEdit=null;inlineSaving=false;await load();message('Location changes saved.');
   }catch(err){if(epoch===session){note.textContent=err.message;note.classList.add('fm-error');}}
   finally{inlineSaving=false;controls.forEach((c,i)=>c.disabled=disabled[i]);}
  };
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
 async function deleteLocation(l){if(!confirm('Delete '+l.name+' and its tank settings? The collector will stop.'))return;
  dialog.innerHTML='<form id="fmDeleteForm"><header><h2>Delete location</h2></header><div class="fm-dialog-body"><p>'+esc(l.name)+'</p><p>Signed in as '+esc(window.wootenAdminUser?.display_name||window.wootenAdminUser?.username||'Admin')+'</p><label>Current admin password<input name="password" type="password" autocomplete="new-password" required></label><p id="fmDialogMessage" role="status"></p></div><footer><button class="secondary" type="button" id="fmDeleteCancel">Cancel</button><button type="submit">Delete location</button></footer></form>';
  dialog.querySelector('#fmDeleteCancel').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();dialog.querySelector('[name=password]').focus();
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const input=dialog.querySelector('[name=password]'),password=input.value;input.value='';await busy(async()=>{await api({action:'delete',id:l.id,password});dialog.close();await load();});};
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
  const channels=['Portal notification',...(emails.length?[`Email (${emails.length})`]:[]),...(phones.length?[`SMS (${phones.length})`]:[])];
  if(!confirm(`Send the current fuel reading for ${location.name}?\n\n${channels.join(' • ')}\n\nAll configured tank readings will be included.`))return;
  const buttons=[...root.querySelectorAll('[data-send-reading="'+CSS.escape(id)+'"]')];buttons.forEach(x=>x.disabled=true);
  message('Sending current fuel reading…');
  try{
   await api({action:'send_reading',id});
   message('Fuel reading queued for portal, email, and SMS delivery.');
   await load();
   window.wootenRefreshAdminNotifications?.();
  }catch(err){message(err.message,true)}
  finally{buttons.forEach(x=>x.disabled=false)}
 }

 root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.inlineSection){openInline(b.dataset.inlineId,b.dataset.inlineSection);return;}if(b.dataset.locationTab){const now=Date.now(),double=lastSimulationClick.id===b.dataset.locationTab&&now-lastSimulationClick.time<450;lastSimulationClick={id:b.dataset.locationTab,time:now};if(double&&b.dataset.locationTab==='all'&&!inlineEdit&&!creatingLocation){const station=locations.find(isMidwayOne);if(station)showTankSimulation(station.id);return;}if(creatingLocation){const draft=root.querySelector('.fm-new-location-page');if(draft?.dataset.busy)return;if(!confirm('Cancel this new location? Unsaved information will be discarded.'))return;creatingLocation=false;}if(!leaveInline())return;activeLocation=b.dataset.locationTab;render();document.getElementById('fm-location-tab-'+activeLocation)?.focus({preventScroll:true});return;}if(b.dataset.addTank)openEdit(b.dataset.addTank,true);if(b.dataset.edit)openEdit(b.dataset.edit);if(b.dataset.sendReading){await sendFuelReading(b.dataset.sendReading);return;}if(b.dataset.pair){if(!leaveInline())return;render();await pair(b.dataset.pair);}if(b.dataset.ack){b.disabled=true;try{await api({action:'acknowledge',id:b.dataset.location,alert_id:Number(b.dataset.ack)});await load();window.wootenRefreshAdminNotifications?.()}catch(err){message(err.message,true)}finally{b.disabled=false}}});
 document.getElementById('fmLocationTabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...e.currentTarget.querySelectorAll('[role=tab]')],index=buttons.indexOf(document.activeElement);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();});
 document.getElementById('fmAdd').onclick=()=>{if(creatingLocation){root.querySelector('.fm-new-location-page [name=name]')?.focus();return;}if(leaveInline()){render();openEdit();}};document.getElementById('fmRefresh').onclick=()=>{if(leaveInline())load();};
 window.addEventListener('wooten-admin-page-open',e=>{if(e.detail?.panel==='fuel-monitor')load()});
 window.addEventListener('wooten-admin-auth-changed',()=>{epoch++;creatingLocation=false;inlineEdit=null;inlineSaving=false;locations=[];alerts=[];history=[];activeLocation='all';dialog.close();render();if(!document.getElementById('admin-tab-fuel-monitor').hidden)load()});
 setInterval(()=>{if(!document.hidden&&!document.getElementById('admin-tab-fuel-monitor').hidden&&!dialog.open)load()},60000);
 if(!document.getElementById('admin-tab-fuel-monitor').hidden)load();
})();
