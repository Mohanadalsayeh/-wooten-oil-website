(function () {
  'use strict';

  var tableState = new WeakMap();
  var pendingEnhancement = false;
  var nonSortableLabels = new Set(['', 'contact', 'action', 'actions', 'select']);

  function normalizedText(value) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cellText(cell) {
    if (!cell) return '';
    var explicit = cell.getAttribute('data-sort-value');
    return normalizedText(explicit != null ? explicit : cell.textContent);
  }

  function numericValue(text) {
    var cleaned = text
      .replace(/\b(?:USD|US\$)\b/gi, '')
      .replace(/[$,%(),#\s]/g, function (character) {
        if (character === '(') return '-';
        return '';
      })
      .replace(/[^0-9.+-]/g, '');
    if (!cleaned || !/[0-9]/.test(cleaned)) return NaN;
    var parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function dateValue(text) {
    if (!text || !/(?:\d{1,4}[\/-]\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b)/i.test(text)) return NaN;
    var parsed = Date.parse(text.replace(/\b(?:CDT|CST|CT|Central Time)\b/gi, '').trim());
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function valueType(values) {
    var populated = values.filter(Boolean);
    if (!populated.length) return 'text';
    var dates = populated.filter(function (value) { return Number.isFinite(dateValue(value)); }).length;
    if (dates / populated.length >= .7) return 'date';
    var numbers = populated.filter(function (value) { return Number.isFinite(numericValue(value)); }).length;
    if (numbers / populated.length >= .7) return 'number';
    return 'text';
  }

  function compareText(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  function sortRows(table, columnIndex, direction) {
    Array.from(table.tBodies).forEach(function (tbody) {
      var rows = Array.from(tbody.rows);
      if (rows.length < 2) return;

      var sortableRows = rows.filter(function (row) {
        return row.cells.length > columnIndex && !row.matches('[data-no-sort], .skeleton-row, .portal-backup-skeleton-row');
      });
      if (sortableRows.length < 2) return;

      var values = sortableRows.map(function (row) { return cellText(row.cells[columnIndex]); });
      var type = valueType(values);
      var originalOrder = new Map(rows.map(function (row, index) { return [row, index]; }));

      sortableRows.sort(function (rowA, rowB) {
        var a = cellText(rowA.cells[columnIndex]);
        var b = cellText(rowB.cells[columnIndex]);
        if (!a && !b) return originalOrder.get(rowA) - originalOrder.get(rowB);
        if (!a) return 1;
        if (!b) return -1;

        var result;
        if (type === 'date') result = dateValue(a) - dateValue(b);
        else if (type === 'number') result = numericValue(a) - numericValue(b);
        else result = compareText(a, b);

        if (!result) result = originalOrder.get(rowA) - originalOrder.get(rowB);
        return direction === 'ascending' ? result : -result;
      });

      var sortedIterator = sortableRows[Symbol.iterator]();
      var nextOrder = rows.map(function (row) {
        return sortableRows.indexOf(row) === -1 ? row : sortedIterator.next().value;
      });
      var changed = nextOrder.some(function (row, index) { return row !== rows[index]; });
      if (changed) nextOrder.forEach(function (row) { tbody.appendChild(row); });
    });
  }

  function updateHeaderState(table, activeIndex, direction) {
    Array.from(table.tHead ? table.tHead.querySelectorAll('th') : []).forEach(function (header, index) {
      if (!header.classList.contains('wo-sortable-heading')) return;
      if (index === activeIndex) {
        header.setAttribute('aria-sort', direction);
        var label = header.querySelector('.wo-table-sort-label');
        var button = header.querySelector('.wo-table-sort-button');
        if (label && button) button.title = 'Sorted ' + direction + '. Click to sort ' + (direction === 'ascending' ? 'descending' : 'ascending') + '.';
      } else {
        header.setAttribute('aria-sort', 'none');
        var otherButton = header.querySelector('.wo-table-sort-button');
        if (otherButton) otherButton.title = 'Sort this column';
      }
    });
  }

  function applyState(table) {
    var state = tableState.get(table);
    if (!state || !table.isConnected) return;
    updateHeaderState(table, state.columnIndex, state.direction);
    sortRows(table, state.columnIndex, state.direction);
  }

  function headerIsSortable(header) {
    if (header.matches('[data-no-sort], [aria-disabled="true"]')) return false;
    var label = normalizedText(header.textContent).toLowerCase();
    if (nonSortableLabels.has(label)) return false;
    if (header.querySelector('input, select')) return false;
    return true;
  }

  function enhanceTable(table) {
    if (!table.tHead || table.matches('[data-no-column-sort]')) return;
    var headers = Array.from(table.tHead.querySelectorAll('th'));
    if (!headers.length) return;

    headers.forEach(function (header, index) {
      if (header.querySelector('.wo-table-sort-button') || !headerIsSortable(header)) return;
      var label = normalizedText(header.textContent);
      header.textContent = '';
      header.classList.add('wo-sortable-heading');
      header.setAttribute('aria-sort', 'none');

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'wo-table-sort-button';
      button.title = 'Sort this column';
      button.setAttribute('aria-label', 'Sort by ' + label);

      var labelSpan = document.createElement('span');
      labelSpan.className = 'wo-table-sort-label';
      labelSpan.textContent = label;
      var icon = document.createElement('span');
      icon.className = 'wo-table-sort-icon';
      icon.setAttribute('aria-hidden', 'true');
      button.append(labelSpan, icon);

      button.addEventListener('click', function () {
        var previous = tableState.get(table);
        var direction = previous && previous.columnIndex === index && previous.direction === 'ascending' ? 'descending' : 'ascending';
        tableState.set(table, { columnIndex: index, direction: direction });
        updateHeaderState(table, index, direction);
        sortRows(table, index, direction);
      });
      header.appendChild(button);
    });

    applyState(table);
  }

  function enhanceAll(root) {
    if (root && root.matches && root.matches('table')) enhanceTable(root);
    (root || document).querySelectorAll('table').forEach(enhanceTable);
  }

  function scheduleEnhancement() {
    if (pendingEnhancement) return;
    pendingEnhancement = true;
    requestAnimationFrame(function () {
      pendingEnhancement = false;
      enhanceAll(document);
      document.querySelectorAll('table').forEach(applyState);
    });
  }

  function start() {
    enhanceAll(document);
    new MutationObserver(scheduleEnhancement).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
