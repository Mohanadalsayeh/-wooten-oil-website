// Ver644: an admin-only, read-only Intevacon API probe. No sync/import code is used.
const API_URL = 'https://api.intevacon.com/Transaction';
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_RECORDS = 10000;
const DAY = 86400000;
// Best-effort per-isolate pacing; Intevacon also enforces issuer-wide API limits.
const lastCalls = new Map();

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff', ...extra
  }});
}
class TestError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message); this.status = status; this.code = code;
  }
}
function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new TestError('Enter complete From and To dates and times.');
  const time = Date.parse(value + ':00Z'); // Validate the wall-clock fields; do not change the API value.
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 16) !== value)
    throw new TestError('Enter valid From and To dates and times.');
  return time;
}
export function parametersFor(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['from', 'to', 'cardNumber'].includes(k)))
    throw new TestError('Only a date range and optional card number can be submitted.');
  const from = dateValue(input.from), to = dateValue(input.to);
  if (from < Date.UTC(2010, 0, 1) || from > now + 2 * DAY)
    throw new TestError('From must be on or after January 1, 2010 and no later than tomorrow.');
  if (to <= from || to - from > 92 * DAY)
    throw new TestError('To must be after From, with a range of no more than 92 days.');
  const card = input.cardNumber == null ? '' : input.cardNumber;
  if (typeof card !== 'string' || (card.trim() && !/^\d{1,32}$/.test(card.trim())))
    throw new TestError('Enter a card number using digits only.');
  const parameters = {
    Version: '2.0', FromDate: input.from, ToDate: input.to,
    FlagAsExported: false, NewRecordsOnly: false, InvoicedOnly: false
  };
  if (card.trim()) parameters.CardNumber = card.trim();
  return parameters;
}
async function boundedText(response, limit) {
  if (Number(response.headers.get('Content-Length') || 0) > limit) {
    await response.body?.cancel();
    throw new TestError('The API returned too much data for a test. Choose a shorter date range.', 413, 'result_too_large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, value = '';
  try {
    while (true) {
      const {done, value: bytes} = await reader.read();
      if (done) break;
      size += bytes.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new TestError('The API returned too much data for a test. Choose a shorter date range.', 413, 'result_too_large');
      }
      value += decoder.decode(bytes, {stream: true});
    }
    return value + decoder.decode();
  } finally { reader.releaseLock(); }
}
function scalar(value, secret) {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      throw new TestError('The API returned a number that cannot be represented safely. No results were displayed.', 502, 'invalid_response');
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string')
    throw new TestError('The API returned an unexpected field format.', 502, 'invalid_response');
  // Defensive redaction even on a successful upstream response.
  const safe = secret ? value.split(secret).join('[redacted]') : value;
  return safe.slice(0, 2048);
}
const TRANSACTION_FIELDS = [
  'ID', 'CardHolderOrgID', 'CardHolderName', 'CustomerID', 'CardNumber',
  'MerchantOrgID', 'MerchantName', 'MerchantCity', 'MerchantStateProvince',
  'CardType', 'TranType', 'EntryMethod', 'StatusID', 'Status', 'Network',
  'DeclineReason', 'AuthRef', 'InvoiceID', 'ReceivedDateTime', 'LocalDateTime',
  'ProcessedDateTime', 'PostedDateTime', 'Odometer', 'DriverNumber', 'DriverName',
  'VehicleNumber', 'VehicleDescription', 'TotalAmountOfSale', 'ResolvedTotalAmount'
];
const DETAIL_FIELDS = [
  'RowNumber', 'ProductName', 'ProductCode', 'ProductCategory', 'IsFuel',
  'IsTaxProduct', 'Quantity', 'RawUnitPrice', 'RawAmount', 'ResolvedUnitPrice', 'ResolvedAmount'
];
function pick(source, fields, secret) {
  const result = {};
  for (const field of fields) result[field] = scalar(source[field], secret);
  return result;
}
export function previewRows(data, secret) {
  if (!Array.isArray(data))
    throw new TestError('The API response was not a transaction list. Check the API key and access with Intevacon.', 502, 'invalid_response');
  if (data.length > MAX_RECORDS)
    throw new TestError('More than 10,000 transactions were returned. Choose a shorter date range for this test.', 413, 'result_too_large');
  return data.map(source => {
    if (!source || typeof source !== 'object' || Array.isArray(source) || source.ID == null)
      throw new TestError('The API returned a transaction without a valid ID.', 502, 'invalid_response');
    const row = pick(source, TRANSACTION_FIELDS, secret);
    const details = source.Details == null ? [] : source.Details;
    if (!Array.isArray(details) || details.length > 1000)
      throw new TestError('The API returned an unexpected product list.', 502, 'invalid_response');
    row.Details = details.map(detail => {
      if (!detail || typeof detail !== 'object' || Array.isArray(detail))
        throw new TestError('The API returned an unexpected product row.', 502, 'invalid_response');
      return pick(detail, DETAIL_FIELDS, secret);
    });
    // Card numbers and customer IDs remain strings, including any leading zeros.
    for (const field of ['ID', 'CardNumber', 'CustomerID', 'AuthRef', 'InvoiceID'])
      if (row[field] != null) row[field] = String(row[field]);
    return row;
  });
}
function upstreamError(status) {
  const messages = {
    400: 'Intevacon rejected the test parameters. Try a shorter date range; if this continues, confirm API access with Intevacon.',
    401: 'Intevacon rejected the API key. Check the INTEVACON_API_KEY secret on the main portal Worker.',
    403: 'Intevacon denied access. Confirm that the configured API key has issuer-level Transaction access.',
    429: 'Intevacon’s API rate limit was reached. Wait at least one minute before testing again.'
  };
  return new TestError(messages[status] || `Intevacon could not complete the test (HTTP ${status}). Try again later.`,
    status === 429 ? 429 : 502, status === 429 ? 'upstream_rate_limit' : 'upstream_error');
}
export async function handle({request, env, actor}) {
  if (!actor || !(actor.owner === true || actor.permissions?.includes('fleet_cards')))
    return json({success: false, error: 'Administrator access to Fleet Cards & Transactions is required.'}, 403);
  if (request.method !== 'POST')
    return json({success: false, error: 'Use the Test API Retrieval button to run a test.'}, 405, {Allow: 'POST'});
  if (request.headers.get('Origin') !== new URL(request.url).origin ||
      !/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || ''))
    return json({success: false, error: 'Run this test from the Wooten Oil admin page.'}, 403);
  const secret = String(env.INTEVACON_API_KEY || '').trim();
  if (!secret)
    return json({success: false, code: 'api_key_missing', error: 'API test is not configured. Add the INTEVACON_API_KEY secret to the main Wooten Oil portal Worker, then try again.'}, 503);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret))
    return json({success: false, error: 'The INTEVACON_API_KEY secret is not a valid API key format. Check it against the key supplied by Intevacon.'}, 503);
  let controller, timer;
  const cancel = () => controller?.abort();
  try {
    const text = await boundedText(request, 2048);
    let input;
    try { input = JSON.parse(text); } catch { throw new TestError('Enter a valid date range for this test.'); }
    const parameters = parametersFor(input);
    const now = Date.now(), last = lastCalls.get(secret);
    if (last != null && now - last < 30000)
      return json({success: false, error: 'Please wait 30 seconds between API tests.'}, 429, {'Retry-After': String(Math.ceil((30000 - (now - last)) / 1000))});
    if (request.signal.aborted) throw new TestError('The API test was cancelled.', 408, 'cancelled');
    for (const [key, at] of lastCalls) if (now - at >= 30000) lastCalls.delete(key);
    lastCalls.set(secret, now);
    controller = new AbortController();
    request.signal.addEventListener('abort', cancel, {once: true});
    timer = setTimeout(() => controller.abort(), 60000);
    // No redirects: never forward the API key to another host or endpoint.
    const upstream = await fetch(API_URL, {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: {'Content-Type': 'application/json', Accept: 'application/json',
        APIKey: secret, Parameters: JSON.stringify(parameters)}
    });
    if (!upstream.ok || upstream.status === 204) {
      await upstream.body?.cancel(); // Never return upstream bodies; they may echo credentials.
      throw upstreamError(upstream.status);
    }
    const body = await boundedText(upstream, MAX_BYTES);
    let data;
    try { data = JSON.parse(body); } catch {
      throw new TestError('Intevacon returned an unreadable response instead of transaction JSON.', 502, 'invalid_response');
    }
    const rows = previewRows(data, secret);
    return json({
      success: true, readOnly: true, version: 644, completedAt: new Date().toISOString(),
      durationMs: Date.now() - now, from: input.from, to: input.to,
      cardNumber: parameters.CardNumber || '', count: rows.length,
      endpoint: 'GET /Transaction', flags: {FlagAsExported: false, NewRecordsOnly: false, InvoicedOnly: false}, rows
    });
  } catch (error) {
    const known = error instanceof TestError;
    return json({success: false, code: known ? error.code : 'connection_error',
      error: known ? error.message : controller?.signal.aborted
        ? 'The API did not finish within 60 seconds or the test was cancelled. Try a shorter date range.'
        : 'The portal could not reach the Intevacon API. Try again later. Current synchronization is still in place.'},
      known ? error.status : 502, error?.code === 'upstream_rate_limit' ? {'Retry-After': '60'} : {});
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', cancel);
  }
}
