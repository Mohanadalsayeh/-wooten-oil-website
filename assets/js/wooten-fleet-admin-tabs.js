/* Ver672: independent fleet sync tabs; switching views never starts a sync. */
(function () {
  'use strict';
  const root = document.getElementById('admin-tab-intevacon-api-test');
  if (!root) return;
  const tabs = Array.from(root.querySelectorAll('[data-fleet-sync-tab]'));
  if (!tabs.length) return;
  const labels = new Map(tabs.map(tab => [tab, tab.textContent.trim()]));
  function select(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus({preventScroll: true});
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      select(tabs[next], true);
    });
  });
  window.WootenFleetTabs = {
    setBusy(kind, busy, status = 'Sync in progress') {
      const tab = tabs.find(item => item.dataset.fleetSyncTab === kind);
      if (!tab) return;
      tab.querySelector('[data-fleet-tab-spinner]').hidden = !busy;
      tab.setAttribute('aria-label', labels.get(tab) + (busy ? ' — ' + status : ''));
      tab.dataset.syncing = String(!!busy);
    }
  };
  select(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0]);
})();
