/* Ver690: transaction footer retrieval time and invoice-style PDF printing. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('apiTestForm');
  if (!form) return;
  const rowsBody = $('apiTestRows'), dialog = $('apiTestDetail');
  let filtered = [], rows = [], page = 1, controller = null, generation = 0, cooldownTimer = null, cooldownUntil = 0;
  let serverRunning = false, syncNotice = '';
  let dynamicHistory=true;
  let historyMode=true,historyData=null,historyRange=null,historySerial=0,historySort='received_at',historyDirection='desc',searchTimer;
  let resultRetrievedAt = null, detailPrintData = null;
  const detailPdfUrls = [];
  const key = () => $('adminKey')?.value.trim() || '';
  const allowed = () => !!key() && window.WootenAdminAccess?.has(window.wootenAdminUser, 'fleet_cards');
  const number = (value, digits = 3) => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', {maximumFractionDigits: digits}) : '—';
  const money = value => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', {style: 'currency', currency: 'USD'}) : '—';
  const sourceDate = value => window.WootenIntevaconDates?.source(value) ?? (value ? String(value).replace('T', ' ') : '—');
  function element(tag, value, className) {
    const el = document.createElement(tag);
    if (value != null) el.textContent = String(value);
    if (className) el.className = className;
    return el;
  }
  function message(value, tone = '', kind = '') {
    syncNotice = kind;
    $('apiTestMessage').textContent = value;
    $('apiTestMessage').dataset.tone = tone;
    $('apiTestMessage').hidden = !value;
  }
  function centralMinute(date) {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
  }
  function defaults() {
    const now = new Date();
    $('apiTestTo').value = centralMinute(now);
    $('apiTestFrom').value = centralMinute(new Date(now.getTime() - 86400000));
    $('apiTestCard').value = '';
  }
  function fuelQuantity(row) {
    // Intevacon may mark actual fuel as IsTaxProduct as well. The observed
    // Fuel Products category identifies these as fuel, not separate tax rows.
    const fuel = (row.Details || []).filter(d => d.IsFuel === true &&
      (d.IsTaxProduct !== true || String(d.ProductCategory || '').trim().toLowerCase() === 'fuel products'));
    if (!fuel.length) return null;
    return fuel.every(d => typeof d.Quantity === 'number' && Number.isFinite(d.Quantity))
      ? fuel.reduce((sum, d) => sum + d.Quantity, 0) : null;
  }
  const table = rowsBody.closest('table');
  const collator = new Intl.Collator('en-US', {numeric: true, sensitivity: 'base'});
  const sortFields = ['ID', 'ReceivedDateTime', 'CustomerID', 'CardHolderName',
    'CardNumber', 'MerchantName', null, 'TotalAmountOfSale', 'Status'];
  // Shared header controls delegate here instead of sorting only visible DOM rows.
  table.wootenSortAll = (column, direction) => {
    if(historyMode){historySort=['transaction_id','received_at','customer_id','cardholder','card_number','merchant','fuel_quantity','total_sale','status'][column]||'received_at';historyDirection=direction==='descending'?'desc':'asc';table.dataset.fullSortColumn=String(column);table.dataset.fullSortDirection=direction;page=1;loadHistory();return;}
    const value = row => column === 6 ? fuelQuantity(row) : row[sortFields[column]];
    const missing = v => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
    rows.sort((a, b) => {
      const av = value(a), bv = value(b);
      if (missing(av) || missing(bv)) return missing(av) === missing(bv) ? 0 : missing(av) ? 1 : -1;
      const result = column === 6 || column === 7 ? av - bv : collator.compare(String(av), String(bv));
      return direction === 'descending' ? -result : result;
    });
    table.dataset.fullSortColumn = String(column);
    table.dataset.fullSortDirection = direction;
    page = 1;
    renderPage();
  };
  function refreshControls() {
    const wait = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    const busy = !!controller || serverRunning;
    $('apiTestFields').disabled = !!controller;
    $('apiTestRun').disabled = busy || wait > 0 || !allowed();
    $('apiTestRunLabel').textContent = busy ? 'Syncing API transactions…'
      : wait > 0 ? `Sync API Transactions Now (${wait}s)` : 'Sync API Transactions Now';
    $('apiTestSpinner').hidden = !busy;
    $('apiTestRun').setAttribute('aria-busy', String(busy));
    window.WootenFleetTabs?.setBusy('api', busy, 'Syncing API transactions…');
    $('apiTestDefaults').disabled = !!controller;
    if (syncNotice === 'waiting') {
      if (serverRunning) message('An API sync is already running. Waiting for it to finish.', '', 'waiting');
      else if (wait) message(`Next API sync is available in ${wait}s.`, '', 'waiting');
      else message('');
    }
    if (wait && !cooldownTimer) cooldownTimer = setInterval(refreshControls, 1000);
    if (!wait && cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
  }
  function clearResults() {
    rows = []; page = 1;
    resultRetrievedAt = null; detailPrintData = null;
    releaseDetailPdfs();
    delete table.dataset.fullSortColumn; delete table.dataset.fullSortDirection;
    rowsBody.replaceChildren();
    $('apiTestSummary').replaceChildren();
    $('apiTestResultMeta').textContent = '';
    $('apiTestResults').hidden = true;
    if (dialog.open) dialog.close();
    $('apiTestDetailBody').replaceChildren();
    $('apiTestDetailTitle').textContent = 'Transaction';
    $('apiTestDetailSubtitle').textContent = '';
    $('apiTestDetailRetrieved').textContent = 'Retrieved from Intevacon. Last retrieval: —. Results are retained for admin review.';
    $('apiTestDetailPrintStatus').textContent = '';
    $('apiTestDetailPrintStatus').hidden = true;
  }
  function cell(tr, value) { tr.append(element('td', value == null || value === '' ? '—' : value)); }
  function renderPage() {
    rowsBody.replaceChildren();
    const query = $('apiTestSearch').value.trim().toLowerCase();
    filtered = rows.map((row, index) => ({row, index})).filter(({row}) => historyMode || !query || [...Object.values(row).filter(v => typeof v === 'string' || typeof v === 'number'), ...(row.Details || []).flatMap(d => Object.values(d).filter(v => typeof v === 'string' || typeof v === 'number'))].join(' ').toLowerCase().includes(query));
    if(!historyMode)page = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
    const offsetStart = (page - 1) * 20;
    filtered.slice(historyMode?0:offsetStart, historyMode?20:offsetStart + 20).forEach(({row, index}) => {
      const tr = element('tr'), td = element('td');
      const link = element('button', row.ID, 'api-test-trans-link');
      link.type = 'button'; link.dataset.apiTestRow = String(index);
      link.setAttribute('aria-label', `View transaction ${row.ID}`);
      td.append(link); tr.append(td);
      cell(tr, sourceDate(row.ReceivedDateTime)); cell(tr, row.CustomerID);
      cell(tr, row.CardHolderName); cell(tr, row.CardNumber); cell(tr, row.MerchantName);
      cell(tr, number(fuelQuantity(row))); cell(tr, money(row.TotalAmountOfSale)); cell(tr, row.Status);
      rowsBody.append(tr);
    });
    if (!filtered.length) {
      const tr = element('tr'), td = element('td', 'No transactions match the current search or date range.');
      td.colSpan = 9; tr.append(td); rowsBody.append(tr);
    }
    const total=historyMode?(historyData?.total||0):filtered.length;
    $('apiTestRange').textContent = total
      ? `Showing ${number(offsetStart + 1)}–${number(Math.min(offsetStart + 20, total))} of ${number(total)} matching transactions` : '0 matching transactions';
    $('apiTestPage').textContent = `Page ${number(page)} of ${number(Math.max(1, Math.ceil(total / 20)))}`;
    $('apiTestPrev').disabled = page <= 1;
    $('apiTestNext').disabled = page * 20 >= total;
  }
  function showResults(data) {
    historyMode=false;historySerial++;historyData=null;
    rows = data.rows; page = 1;
    resultRetrievedAt = data.completedAt || null;
    const quantities = rows.map(fuelQuantity).filter(v => v != null);
    const saleAmounts = rows.map(r => r.TotalAmountOfSale).filter(v => typeof v === 'number' && Number.isFinite(v));
    const stats = [
      [number(rows.length), 'Transactions returned'],
      [number(new Set(rows.map(r => r.CardNumber).filter(Boolean)).size), 'Distinct cards in results'],
      [number(quantities.length ? quantities.reduce((s, n) => s + n, 0) : null), 'Reported fuel quantity'],
      [money(saleAmounts.length ? saleAmounts.reduce((s, n) => s + n, 0) : null), 'Reported sale amounts']
    ];
    const summary = $('apiTestSummary'); summary.replaceChildren();
    stats.forEach(([value, label]) => {
      const box = element('div', null, 'api-test-stat');
      box.append(element('strong', value), element('span', label)); summary.append(box);
    });
    const missing = rows.filter(r => !String(r.CustomerID || '').trim()).length;
    $('apiTestResultMeta').textContent = `Requested: ${sourceDate(data.from)} to ${sourceDate(data.to)}`
      + (data.cardNumber ? ` · Card ${data.cardNumber}` : ' · All cards')
      + ` · Completed in ${number(data.durationMs / 1000, 1)} seconds.`
      + (missing ? ` ${number(missing)} transaction(s) have no API Customer ID.` : '')
      + (data.cardNumber ? ' Single-card lookup; customer account results were kept.' : ' All-card results are available to matched customer accounts.');
    $('apiTestResults').hidden = false;
    if (table.dataset.fullSortColumn !== undefined) table.wootenSortAll(Number(table.dataset.fullSortColumn), table.dataset.fullSortDirection);
    else renderPage();
  }
  function showDetail(index) {
    const row = rows[index]; if (!row || !allowed()) return;
    $('apiTestDetailTitle').textContent = `Transaction ${row.ID}`;
    $('apiTestDetailSubtitle').textContent = row.CardHolderName || 'Intevacon API result';
    const body = $('apiTestDetailBody'); body.replaceChildren();
    const fields = element('dl', null, 'api-test-detail-fields');
    const detailFields = [
      ['API Customer ID', row.CustomerID], ['Cardholder organization ID', row.CardHolderOrgID],
      ['Card number', row.CardNumber], ['Status', row.Status],
      ['Merchant', row.MerchantName], ['Sale amount', money(row.TotalAmountOfSale)],
      ['Resolved total amount', money(row.ResolvedTotalAmount)], ['Transaction type', row.TranType],
      ['Received date/time (API)', sourceDate(row.ReceivedDateTime)], ['Local date/time (API)', sourceDate(row.LocalDateTime)],
      ['Processed date/time (API)', sourceDate(row.ProcessedDateTime)], ['Posted date/time (API)', sourceDate(row.PostedDateTime)],
      ['Auth ref', row.AuthRef], ['Intevacon invoice ID', row.InvoiceID],
      ['Driver', [row.DriverNumber, row.DriverName].filter(Boolean).join(' · ')],
      ['Vehicle', [row.VehicleNumber, row.VehicleDescription].filter(Boolean).join(' · ')],
      ['Odometer', row.Odometer], ['Decline reason', row.DeclineReason]
    ].map(([label, value]) => [label, value == null || value === '' ? '—' : String(value)]);
    detailFields.forEach(([label, value]) => {
      const group = element('div');
      group.append(element('dt', label), element('dd', value == null || value === '' ? '—' : value)); fields.append(group);
    });
    body.append(fields, element('h3', 'Products and quantities'));
    const wrap = element('div', null, 'api-test-table-wrap'), table = element('table');
    table.dataset.autoPdf = 'false'; table.setAttribute('aria-label', 'Transaction products from Intevacon');
    const head = element('thead'), headers = element('tr');
    ['Product', 'Code', 'Fuel', 'Quantity', 'Unit price', 'Amount'].forEach(s => headers.append(element('th', s)));
    head.append(headers); table.append(head);
    const tbody = element('tbody');
    (row.Details || []).forEach(d => {
      const tr = element('tr'); cell(tr, d.ProductName); cell(tr, d.ProductCode);
      cell(tr, d.IsFuel === true ? 'Yes' : d.IsFuel === false ? 'No' : '—'); cell(tr, number(d.Quantity));
      cell(tr, number(d.ResolvedUnitPrice ?? d.RawUnitPrice, 4)); cell(tr, money(d.ResolvedAmount ?? d.RawAmount));
      tbody.append(tr);
    });
    if (!tbody.children.length) { const tr = element('tr'), td = element('td', 'No product details returned.'); td.colSpan = 6; tr.append(td); tbody.append(tr); }
    table.append(tbody); wrap.append(table); body.append(wrap);
    // Capture the opened result's timestamp, even if an automatic sync later replaces the table.
    const retrieved = stamp(resultRetrievedAt);
    $('apiTestDetailRetrieved').textContent = `Retrieved from Intevacon. Last retrieval: ${retrieved}. Results are retained for admin review.`;
    $('apiTestDetailPrintStatus').textContent = '';
    $('apiTestDetailPrintStatus').hidden = true;
    detailPrintData = {
      title: 'Fleet Transaction', number: String(row.ID ?? ''), meta: 'Intevacon API',
      customerLabel: 'Cardholder', customer: row.CardHolderName || '—',
      account: 'API Customer ID: ' + (row.CustomerID ?? '—'),
      balanceLabel: 'Sale amount', balance: money(row.TotalAmountOfSale),
      updated: 'Last retrieval: ' + retrieved, stackedGroups: true,
      groups: [{title: 'Transaction details', rows: detailFields},
        ...(row.Details || []).map((d, i) => ({title: 'Product ' + (i + 1), rows: [
          ['Product', d.ProductName ?? '—'], ['Code', d.ProductCode ?? '—'],
          ['Fuel', d.IsFuel === true ? 'Yes' : d.IsFuel === false ? 'No' : '—'],
          ['Quantity', number(d.Quantity)], ['Unit price', number(d.ResolvedUnitPrice ?? d.RawUnitPrice, 4)],
          ['Amount', money(d.ResolvedAmount ?? d.RawAmount)]
        ]}))],
      notes: (row.Details || []).length ? [] : ['No product details returned.']
    };
    dialog.showModal(); $('apiTestDetailClose').focus();
  }
  function releaseDetailPdfs() {
    detailPdfUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
  }
  function printDetail() {
    if (!allowed() || !dialog.open || !detailPrintData) return;
    const output = $('apiTestDetailPrintStatus');
    output.textContent = ''; output.hidden = true;
    try {
      if (!window.WootenInvoicePdf?.buildDetail)
        throw new Error('The PDF exporter is unavailable. Refresh the page and try again.');
      const blob = window.WootenInvoicePdf.buildDetail(detailPrintData), url = URL.createObjectURL(blob);
      let tab;
      try { tab = window.open(url, '_blank'); }
      catch (error) { URL.revokeObjectURL(url); throw error; }
      if (!tab) { URL.revokeObjectURL(url); throw new Error('Please allow pop-ups to open the transaction PDF.'); }
      tab.opener = null; detailPdfUrls.push(url);
    } catch (error) {
      output.textContent = error.message || 'The transaction PDF could not be created.';
      output.hidden = false;
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (controller || serverRunning || cooldownUntil > Date.now()) return;
    if (!allowed()) { message('Sign in with access to Fleet Cards & Transactions to run this test.', 'error'); return; }
    if (!form.reportValidity()) return;
    const from = $('apiTestFrom').value, to = $('apiTestTo').value;
    const fromMs = Date.parse(from + ':00Z'), toMs = Date.parse(to + ':00Z');
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || toMs - fromMs > 92 * 86400000) {
      message('Choose complete dates with To after From, no more than 92 days apart.', 'error'); return;
    }
    if(!confirm('Retrieve transactions directly from Intevacon for the selected date range now? Successful results will update the saved transaction history.'))return;
    const body = {from, to, cardNumber: $('apiTestCard').value.trim()};
    const requestGeneration = ++generation;
    const credential = key();
    controller = new AbortController(); const thisController = controller;
    let receivedTiming = false;
    message('Retrieving transactions from Intevacon. Please wait…', 'busy'); refreshControls();
    const timeout = setTimeout(() => thisController.abort(), 70000);
    try {
      const response = await fetch('/api/admin/fleet/sync', {
        method: 'POST', headers: {'Content-Type': 'application/json', 'X-Admin-Key': credential},
        credentials: 'same-origin', cache: 'no-store', signal: thisController.signal, body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => null);
      if (requestGeneration !== generation || credential !== key()) return;
      let retry = data?.retryAfterSeconds;
      if (response.status === 429 && !(typeof retry === 'number' && Number.isFinite(retry) && retry >= 0)) {
        const header = Number(response.headers.get('Retry-After'));
        retry = Number.isFinite(header) && header > 0 ? header : 60;
      }
      if (typeof retry === 'number' && Number.isFinite(retry) && retry >= 0) {
        cooldownUntil = Date.now() + retry * 1000;
        receivedTiming = true;
      }
      if (response.status === 429 && (data?.code === 'sync_cooldown' || data?.error === 'Please wait before the next API sync.')) {
        message('Waiting for the next API sync.', '', 'waiting');
        return;
      }
      if (response.status === 409 && (data?.code === 'sync_in_progress' || data?.error === 'An API sync is already running.')) {
        serverRunning = true;
        message('An API sync is already running. Waiting for it to finish.', '', 'waiting');
        return;
      }
      if (!response.ok || !data?.success) {
        // Do not echo unknown gateway/HTML responses into the admin page.
        throw new Error(typeof data?.error === 'string' ? data.error : 'The API test could not be completed. Check that the Version 650 Worker and scheduler binding have been deployed.');
      }
      if (data.readOnly !== true || !Array.isArray(data.rows) || data.rows.length !== data.count)
        throw new Error('The test returned an unexpected result. Check the Version 650 portal Worker update.');
      lastCompleted = data.completedAt;
      showResults(data);
      message(`API sync succeeded — ${number(data.count)} transaction(s) returned. ${data.cardNumber ? 'Single-card results saved for admin review.' : 'Results updated for matched customer accounts.'}`, 'success');
    } catch (error) {
      if (requestGeneration !== generation || credential !== key()) return;
      message(thisController.signal.aborted ? 'The API test timed out. Try a shorter date range.' : error.message || 'The API test could not be completed.', 'error');
    } finally {
      clearTimeout(timeout);
      if (requestGeneration === generation) {
        controller = null;
        if (!receivedTiming && !serverRunning) cooldownUntil = Math.max(cooldownUntil, Date.now() + 30000);
        refreshControls(); pollSchedule();
      }
    }
  });
  $('apiTestSearch').addEventListener('input', () => { page=1;clearTimeout(searchTimer);if(historyMode)searchTimer=setTimeout(loadHistory,300);else renderPage(); });
  $('apiTestDefaults').addEventListener('click', defaults);
  async function goToTransactionPage(target){
    const total=historyMode?(historyData?.total||0):filtered.length;
    target=Math.max(1,Math.min(Math.max(1,Math.ceil(total/20)),Number(target)||1));
    if(target===page)return;
    page=target;
    if(historyMode)await loadHistory();else renderPage();
  }
  $('apiTestPrev').wootenGoToPage=goToTransactionPage;
  $('apiTestNext').wootenGoToPage=goToTransactionPage;
  $('apiTestPrev').addEventListener('click', () => { if (page > 1) { page--; historyMode?loadHistory():renderPage(); } });
  $('apiTestNext').addEventListener('click', () => { if(page*20<(historyMode?historyData?.total:filtered.length)){page++;historyMode?loadHistory():renderPage();} });
  rowsBody.addEventListener('click', event => {
    const button = event.target.closest('[data-api-test-row]');
    if (button) showDetail(Number(button.dataset.apiTestRow));
  });
  $('apiTestDetailClose').addEventListener('click', () => dialog.close());
  $('apiTestDetailOk').addEventListener('click', () => dialog.close());
  $('apiTestDetailPrint').addEventListener('click', printDetail);
  dialog.addEventListener('close', () => { detailPrintData = null; });
  window.addEventListener('pagehide', releaseDetailPdfs);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  window.addEventListener('wooten-admin-auth-changed', () => {
    generation++; controller?.abort(); controller = null;
    serverRunning = false; cooldownUntil = 0;
    clearInterval(cooldownTimer); cooldownTimer = null;
    clearResults(); historyMode=true;historyData=null;historyRange=null;dynamicHistory=true;historySerial++;lastCompleted = null; scheduleLoaded = false; savedSchedule=null;scheduleSaving=false;scheduleSaveControls(); $('apiTestSearch').value = '';
    message(''); defaults(); refreshControls(); pollSchedule();
  });
  let lastCompleted = null, scheduleLoaded = false, pollBusy = false;
  let savedSchedule=null,scheduleSaving=false,historyJobActive=false;
  const scheduleValues=()=>({enabled:$('apiScheduleEnabled').checked,intervalSeconds:Number($('apiScheduleInterval').value),days:Number($('apiScheduleDays').value),cardNumber:'',nightlyEnabled:$('apiNightlyEnabled').checked,nightlyTime:$('apiNightlyTime').value});
  const scheduleKey=v=>JSON.stringify({enabled:!!v.enabled,intervalSeconds:Number(v.intervalSeconds),days:Number(v.days),nightlyEnabled:!!v.nightlyEnabled,nightlyTime:v.nightlyTime});
  const scheduleDirty=()=>savedSchedule!==null&&scheduleKey(scheduleValues())!==savedSchedule;
  function scheduleSaveControls(){
    const off=!$('apiScheduleEnabled').checked||!allowed()||scheduleSaving||savedSchedule===null;
    for(const id of ['apiScheduleInterval','apiScheduleDays','apiNightlyEnabled'])$(id).disabled=off;
    $('apiNightlyTime').disabled=off||!$('apiNightlyEnabled').checked;
    $('apiHistoryInitialize').disabled=off||historyJobActive;
    $('apiScheduleSave').disabled=!allowed()||scheduleSaving||savedSchedule===null||!scheduleDirty();}
  for(const event of ['input','change'])$('apiScheduleForm').addEventListener(event,scheduleSaveControls);

  $('apiScheduleExpand').addEventListener('click',()=>{
    const controls=$('apiScheduleControls'),button=$('apiScheduleExpand');controls.hidden=!controls.hidden;
    button.textContent=controls.hidden?'+':'−';button.setAttribute('aria-expanded',String(!controls.hidden));
    button.setAttribute('aria-label',(controls.hidden?'Expand':'Collapse')+' automatic transaction sync');
  });
  const stamp = (value, includeSeconds = false) => window.WootenIntevaconDates?.central(value, '—', includeSeconds) ?? sourceDate(value);
  async function portalRequest(path, options = {}) {
    const credential = key(), epoch = generation;
    const response = await fetch('/api/admin/fleet/' + path, {...options, credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','X-Admin-Key':credential}});
    const data = await response.json();
    if (credential !== key() || epoch !== generation || !allowed()) throw new Error('Admin session changed.');
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not load API sync status.');
    return data;
  }
  async function pollSchedule() {
    if (!allowed() || pollBusy || document.hidden) return;
    pollBusy = true;
    const epoch = generation;
    try {
      const data = await portalRequest('schedule');
      if (scheduleSaving) return;
      const preserveScheduleEdits=scheduleDirty();
      if (!scheduleLoaded || !preserveScheduleEdits) {
        $('apiScheduleEnabled').checked = data.config.enabled;
        $('apiScheduleInterval').value = data.config.intervalSeconds;
        $('apiScheduleDays').value = data.config.days;
        $('apiNightlyTime').value=data.config.nightlyTime; $('apiNightlyEnabled').checked=data.config.nightlyEnabled;
        scheduleLoaded = true;
      }
      savedSchedule=scheduleKey(data.config);scheduleSaveControls();
      const status = data.status,h=data.history;
      $('apiHistoryProgress').value=h.percent;
      $('apiHistoryProgress').hidden = !(data.running || (data.config.enabled && h.job && !h.retryAt));
      historyJobActive=!!h.job&&data.config.enabled;scheduleSaveControls();
      $('apiHistoryStatus').textContent=(h.job?`${h.job.type==='initial'?'Initializing 92-day history':h.job.type==='nightly'?'Nightly 92-day refresh':'Recent transaction update'}: ${h.percent}% · Saved through ${sourceDate(h.job.through)}.`:h.initialized?'92-day history initialized. Older saved transactions are retained.':'Click Initialize 92-Day History to begin.')+(h.error?' '+h.error:'')+(data.config.enabled?'':' Automatic updates paused.')+` Next recent update: ${stamp(h.nextRecent,true)}. Next nightly refresh: ${data.config.nightlyEnabled?stamp(h.nextNight,true):'Off'}. Last nightly completion: ${stamp(h.lastNight)}.`;
      if (!controller) {
        serverRunning = data.running === true;
        // Use a duration from the server so a phone's clock cannot extend the wait.
        if (!serverRunning && typeof data.retryAfterSeconds === 'number' && Number.isFinite(data.retryAfterSeconds) && data.retryAfterSeconds >= 0)
          cooldownUntil = Date.now() + data.retryAfterSeconds * 1000;
        refreshControls();
      }
      $('apiScheduleStatus').textContent = (data.config.enabled ? `Automatic sync on · Every ${data.config.intervalSeconds} seconds after completion.` : 'Automatic sync off.')
        + (data.running ? ' Pulling transactions…' : '')
        + ` Last successful pull: ${stamp(status.completedAt)}.`
        + (status.count != null ? ` ${number(status.count)} transactions.` : '')
        + (data.nextRun ? ` Next pull: ${stamp(data.nextRun, true)}.` : '')
        + (status.error ? ` ${status.error}` : '');
      if(!controller&&historyMode&&(!historyData||status.completedAt!==lastCompleted)){await loadHistory();lastCompleted=status.completedAt;}
      if (!controller && !historyMode && status.completedAt && status.completedAt !== lastCompleted) {
        const cached = await portalRequest('results');
        if(controller)return;
        if(!cached.result||cached.result.completedAt!==status.completedAt){lastCompleted=status.completedAt;return;}
        const oldPage = page, col = table.dataset.fullSortColumn, direction = table.dataset.fullSortDirection;
        showResults(cached.result);
        if (col !== undefined) table.wootenSortAll(Number(col), direction);
        page = oldPage; renderPage();
        lastCompleted = cached.result.completedAt;
      }
    } catch (error) { if (allowed() && epoch === generation) $('apiScheduleStatus').textContent = error.message; }
    finally { pollBusy = false; }
  }
  $('apiScheduleForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!allowed() || scheduleSaving || !scheduleDirty() || !$('apiScheduleForm').reportValidity()) return;
    const submitted=scheduleValues(),epoch=generation;
    scheduleSaving=true;scheduleSaveControls();
    try {
      await portalRequest('schedule', {method:'POST',body:JSON.stringify(submitted)});
      savedSchedule=scheduleKey(submitted);
      $('apiScheduleMessage').textContent = 'Schedule saved.';
    } catch (error) { if(epoch===generation)$('apiScheduleMessage').textContent = error.message; }
    finally { if(epoch===generation){scheduleSaving=false;scheduleSaveControls();await pollSchedule();} }
  });

  async function loadHistory(){
    if(!allowed())return;
    historyMode=true;
    if(!historyRange||dynamicHistory){const to=centralMinute(new Date());historyRange={from:new Date(Date.parse(to+':00Z')-92*86400000).toISOString().slice(0,16),to,card:''};}
    const ticket=++historySerial;
    const q=new URLSearchParams({...historyRange,search:$('apiTestSearch').value,page:String(page),sort:historySort,direction:historyDirection});
    $('apiTestPrev').disabled=$('apiTestNext').disabled=true;
    try{
      const data=await portalRequest('history?'+q);
      if(ticket!==historySerial||!historyMode)return;
      historyData=data;rows=data.items;page=data.page;resultRetrievedAt=data.last_sync;
      const summary=$('apiTestSummary');summary.replaceChildren();
      for(const [value,label] of [[number(data.total),'Matching saved transactions'],[number(data.summary.cards),'Distinct cards'],[number(data.summary.fuel_quantity),'Reported fuel quantity'],[money(data.summary.total_sale),'Reported sale amounts']]){const box=element('div',null,'api-test-stat');box.append(element('strong',value),element('span',label));summary.append(box);}
      $('apiTestResultMeta').textContent=`Saved transaction history · ${sourceDate(data.window_from)} – ${sourceDate(data.window_to)} · Last updated: ${stamp(data.last_sync,true)}. ${data.notice||''}`;
      $('apiTestResults').hidden=false;renderPage();
    }catch(e){if(ticket===historySerial&&allowed()){page=historyData?.page||1;renderPage();message(e.message,'error');}}
  }
  $('apiHistoryLoad').addEventListener('click',()=>{if(!form.reportValidity())return;dynamicHistory=false;historyRange={from:$('apiTestFrom').value,to:$('apiTestTo').value,card:$('apiTestCard').value.trim()};page=1;loadHistory();});
  $('apiHistoryInitialize').addEventListener('click',async()=>{
    if(!allowed()||scheduleSaving||!$('apiScheduleEnabled').checked||historyJobActive||!$('apiScheduleForm').reportValidity())return;
    if(!confirm('Initialize or resume the last 92 days of transaction history? This will save these schedule settings, enable automatic transaction sync, and retrieve history in the background.'))return;
    const submitted={...scheduleValues(),enabled:true},before=scheduleKey(scheduleValues()),epoch=generation;
    scheduleSaving=true;scheduleSaveControls();$('apiHistoryInitialize').disabled=true;
    try{
      await portalRequest('schedule',{method:'POST',body:JSON.stringify(submitted)});
      if(scheduleKey(scheduleValues())===before)$('apiScheduleEnabled').checked=true;
      savedSchedule=scheduleKey(submitted);
      await portalRequest('initialize',{method:'POST',body:'{}'});
      historyMode=true;$('apiScheduleMessage').textContent='History retrieval queued. You can close this page.';
    }catch(e){if(epoch===generation){$('apiScheduleMessage').textContent=e.message;$('apiHistoryInitialize').disabled=false;}}
    finally{if(epoch===generation){scheduleSaving=false;scheduleSaveControls();await pollSchedule();}}
  });

  // These requests read portal status/cache; only the cloud scheduler and Sync API Transactions Now contact Intevacon.
  setInterval(pollSchedule, 5000);
  document.addEventListener('visibilitychange', pollSchedule);
  defaults(); refreshControls(); pollSchedule();
})();
