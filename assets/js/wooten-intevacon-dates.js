/* Ver674: display-only dates. Source wall times and original stored values are preserved. */
(function () {
  'use strict';
  const pad = value => String(value).padStart(2, '0');
  const clockPattern = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?\s*(AM|PM)?\s*(Z|UTC|GMT|CST|CDT|CT|[+-]\d{2}:?\d{2})?$/i;
  function clock(value) {
    const match = value.match(clockPattern);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]), second = Number(match[3] || 0);
    const meridiem = match[4]?.toUpperCase();
    if (minute > 59 || second > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
    if (meridiem) hour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
    let zone = match[5]?.toUpperCase() || '';
    if (zone === 'Z' || zone === 'GMT') zone = 'UTC';
    if (/^[+-]/.test(zone)) {
      if (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(-2)) > 59) return null;
      if (!zone.includes(':')) zone = zone.slice(0, 3) + ':' + zone.slice(3);
    }
    return `${pad(hour % 12 || 12)}:${pad(minute)} ${hour >= 12 ? 'PM' : 'AM'}` + (zone ? ' ' + zone : '');
  }
  function validDate(year, month, day) {
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  }
  function source(value, empty = '—') {
    if (value == null || String(value).trim() === '') return empty;
    const text = String(value).trim();
    // Parse components directly: an offset-free API date must never move with the viewer's timezone.
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(.+))?$/);
    const us = iso ? null : text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[T\s]+(.+))?$/);
    const match = iso || us;
    if (!match) return clock(text) || text;
    const year = Number(iso ? match[1] : match[3]);
    const month = Number(iso ? match[2] : match[1]);
    const day = Number(iso ? match[3] : match[2]);
    if (!validDate(year, month, day)) return text;
    const date = `${pad(month)}/${pad(day)}/${String(year).padStart(4, '0')}`;
    if (!match[4]) return date; // Do not invent a time for a date-only value.
    const time = clock(match[4].trim());
    return time ? date + ' ' + time : text;
  }
  const centralFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
  function central(value, empty = '—') {
    if (value == null || String(value).trim() === '') return empty;
    // Portal sync timestamps carry an explicit UTC/offset. Unknown source zones stay as supplied.
    const text = String(value).trim();
    if (!/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) return source(value, empty);
    const instant = new Date(text);
    if (!Number.isFinite(instant.getTime())) return text;
    const parts = Object.fromEntries(centralFormatter.formatToParts(instant).map(part => [part.type, part.value]));
    return `${parts.month}/${parts.day}/${parts.year} ${pad(parts.hour)}:${parts.minute} ${parts.dayPeriod} CT`;
  }
  window.WootenIntevaconDates = Object.freeze({source, central});
})();
