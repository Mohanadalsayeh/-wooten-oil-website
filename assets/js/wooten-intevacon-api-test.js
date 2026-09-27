/* Ver650: durable cloud API scheduling; client polls only cached portal status. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('apiTestForm');
  if (!form) return;
  const rowsBody = $('apiTestRows'), dialog = $('apiTestDetail');
  let filtered = [], rows = [], page = 1, controller = null, generation = 0, cooldownTimer = null, cooldownUntil = 0;
  const key = () => $('adminKey')?.value.trim() || '';
  const allowed = () => !!key() && window.WootenAdminAccess?.has(window.wootenAdminUser, 'fleet_cards');
  const number = (value, digits = 3) => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', {maximumFractionDigits: digits}) : '—';
  const money = value => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', {style: 'currency', currency: 'USD'}) : '—';
  const sourceDate = value => value ? String(value).replace('T', ' ') : '—';
  function element(tag, value, className) {
    const el = document.createElement(tag);
    if (value != null) el.textContent = String(value);
    if (className) el.className = className;
    return el;
  }
  function message(value, tone = '') {
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
    $('apiTestFields').disabled = !!controller;
    $('apiTestRun').disabled = !!controller || wait > 0 || !allowed();
    $('apiTestRunLabel').textContent = controller ? 'Retrieving from Intevacon…'
      : wait > 0 ? `Test again in ${wait}s` : 'Sync Now';
    $('apiTestSpinner').hidden = !controller;
    $('apiTestRun').setAttribute('aria-busy', String(!!controller));
    $('apiTestDefaults').disabled = !!controller;
    if (!wait && cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
  }
  function clearResults() {
    rows = []; page = 1;
    delete table.dataset.fullSortColumn; delete table.dataset.fullSortDirection;
    rowsBody.replaceChildren();
    $('apiTestSummary').replaceChildren();
    $('apiTestResultMeta').textContent = '';
    $('apiTestResults').hidden = true;
    if (dialog.open) dialog.close();
    $('apiTestDetailBody').replaceChildren();
    $('apiTestDetailTitle').textContent = 'Transaction';
    $('apiTestDetailSubtitle').textContent = '';
  }
  function cell(tr, value) { tr.append(element('td', value == null || value === '' ? '—' : value)); }
  function renderPage() {
    rowsBody.replaceChildren();
    const query = $('apiTestSearch').value.trim().toLowerCase();
    filtered = rows.map((row, index) => ({row, index})).filter(({row}) => !query || [...Object.values(row).filter(v => typeof v === 'string' || typeof v === 'number'), ...(row.Details || []).flatMap(d => Object.values(d).filter(v => typeof v === 'string' || typeof v === 'number'))].join(' ').toLowerCase().includes(query));
    page = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
    const offsetStart = (page - 1) * 20;
    filtered.slice(offsetStart, offsetStart + 20).forEach(({row, index}) => {
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
    $('apiTestRange').textContent = filtered.length
      ? `Showing ${number(offsetStart + 1)}–${number(Math.min(offsetStart + 20, filtered.length))} of ${number(filtered.length)} matching transactions (${number(rows.length)} retrieved)` : '0 matching transactions';
    $('apiTestPage').textContent = `Page ${number(page)} of ${number(Math.max(1, Math.ceil(filtered.length / 20)))}`;
    $('apiTestPrev').disabled = page <= 1;
    $('apiTestNext').disabled = page * 20 >= filtered.length;
  }
  function showResults(data) {
    rows = data.rows; page = 1;
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
      + ' Customer IDs are shown exactly as received; portal account matching has not been applied.';
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
    [
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
    ].forEach(([label, value]) => {
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
    dialog.showModal(); $('apiTestDetailClose').focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (controller || cooldownUntil > Date.now()) return;
    if (!allowed()) { message('Sign in with access to Fleet Cards & Transactions to run this test.', 'error'); return; }
    if (!form.reportValidity()) return;
    const from = $('apiTestFrom').value, to = $('apiTestTo').value;
    const fromMs = Date.parse(from + ':00Z'), toMs = Date.parse(to + ':00Z');
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || toMs - fromMs > 92 * 86400000) {
      message('Choose complete dates with To after From, no more than 92 days apart.', 'error'); return;
    }
    const body = {from, to, cardNumber: $('apiTestCard').value.trim()};
    const requestGeneration = ++generation;
    const credential = key();
    controller = new AbortController(); const thisController = controller;
    message('Retrieving transactions from Intevacon. Please wait…', 'busy'); refreshControls();
    const timeout = setTimeout(() => thisController.abort(), 70000);
    try {
      const response = await fetch('/api/admin/fleet/sync', {
        method: 'POST', headers: {'Content-Type': 'application/json', 'X-Admin-Key': credential},
        credentials: 'same-origin', cache: 'no-store', signal: thisController.signal, body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => null);
      if (requestGeneration !== generation || credential !== key()) return;
      if (response.status === 429) {
        const retry = Number(response.headers.get('Retry-After'));
        cooldownUntil = Date.now() + Math.min(3600, Math.max(30, Number.isFinite(retry) ? retry : 60)) * 1000;
      }
      if (!response.ok || !data?.success) {
        // Do not echo unknown gateway/HTML responses into the admin page.
        throw new Error(typeof data?.error === 'string' ? data.error : 'The API test could not be completed. Check that the Version 650 Worker and scheduler binding have been deployed.');
      }
      if (data.readOnly !== true || !Array.isArray(data.rows) || data.rows.length !== data.count)
        throw new Error('The test returned an unexpected result. Check the Version 650 portal Worker update.');
      lastCompleted = data.completedAt;
      showResults(data);
      message(`API sync succeeded — ${number(data.count)} transaction(s) returned. Results saved for admin review.`, 'success');
    } catch (error) {
      if (requestGeneration !== generation || credential !== key()) return;
      message(thisController.signal.aborted ? 'The API test timed out. Try a shorter date range.' : error.message || 'The API test could not be completed.', 'error');
    } finally {
      clearTimeout(timeout);
      if (requestGeneration === generation) {
        controller = null; cooldownUntil = Math.max(cooldownUntil, Date.now() + 30000);
        clearInterval(cooldownTimer); cooldownTimer = setInterval(refreshControls, 1000); refreshControls();
      }
    }
  });
  $('apiTestSearch').addEventListener('input', () => { page = 1; renderPage(); });
  $('apiTestDefaults').addEventListener('click', defaults);
  $('apiTestPrev').addEventListener('click', () => { if (page > 1) { page--; renderPage(); } });
  $('apiTestNext').addEventListener('click', () => { if (page * 20 < filtered.length) { page++; renderPage(); } });
  rowsBody.addEventListener('click', event => {
    const button = event.target.closest('[data-api-test-row]');
    if (button) showDetail(Number(button.dataset.apiTestRow));
  });
  $('apiTestDetailClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  window.addEventListener('wooten-admin-auth-changed', () => {
    generation++; controller?.abort(); controller = null;
    clearResults(); lastCompleted = null; scheduleLoaded = false; $('apiTestSearch').value = '';
    message(''); defaults(); refreshControls(); pollSchedule();
  });
  let lastCompleted = null, scheduleLoaded = false, pollBusy = false;
  const stamp = value => value ? new Date(value).toLocaleString('en-US', {timeZone:'America/Chicago',timeZoneName:'short'}) : '—';
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
    try {
      const data = await portalRequest('schedule');
      if (!scheduleLoaded) {
        $('apiScheduleEnabled').checked = data.config.enabled;
        $('apiScheduleInterval').value = data.config.intervalSeconds;
        $('apiScheduleDays').value = data.config.days;
        $('apiScheduleCard').value = data.config.cardNumber;
        scheduleLoaded = true;
      }
      const status = data.status;
      $('apiScheduleStatus').textContent = (data.config.enabled ? `Automatic sync on · Every ${data.config.intervalSeconds} seconds after completion.` : 'Automatic sync off.')
        + (data.running ? ' Pulling transactions…' : '')
        + ` Last successful pull: ${stamp(status.completedAt)}.`
        + (status.count != null ? ` ${number(status.count)} transactions.` : '')
        + (data.nextRun ? ` Next pull: ${stamp(data.nextRun)}.` : '')
        + (status.error ? ` ${status.error}` : '');
      if (!controller && status.completedAt && status.completedAt !== lastCompleted) {
        const cached = await portalRequest('results');
        if (controller || !cached.result) return;
        const oldPage = page, col = table.dataset.fullSortColumn, direction = table.dataset.fullSortDirection;
        showResults(cached.result);
        if (col !== undefined) table.wootenSortAll(Number(col), direction);
        page = oldPage; renderPage();
        lastCompleted = cached.result.completedAt;
      }
    } catch (error) { if (allowed()) $('apiScheduleStatus').textContent = error.message; }
    finally { pollBusy = false; }
  }
  $('apiScheduleForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!allowed() || !$('apiScheduleForm').reportValidity()) return;
    $('apiScheduleSave').disabled = true;
    try {
      await portalRequest('schedule', {method:'POST',body:JSON.stringify({
        enabled:$('apiScheduleEnabled').checked,intervalSeconds:Number($('apiScheduleInterval').value),
        days:Number($('apiScheduleDays').value),cardNumber:$('apiScheduleCard').value.trim()
      })});
      $('apiScheduleMessage').textContent = 'Schedule saved.';
      await pollSchedule();
    } catch (error) { $('apiScheduleMessage').textContent = error.message; }
    finally { $('apiScheduleSave').disabled = false; }
  });
  // These requests read portal status/cache; only the cloud scheduler and Sync Now contact Intevacon.
  setInterval(pollSchedule, 5000);
  document.addEventListener('visibilitychange', pollSchedule);
  defaults(); refreshControls(); pollSchedule();
})();
