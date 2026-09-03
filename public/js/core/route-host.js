'use strict';

// P2PFlow v1.8.1 persistent route-host runtime.
// Only one page host is attached to the live DOM at a time. Inactive pages are
// detached intact, preserving their form state, component DOM and scroll state
// without duplicate IDs leaking into document queries.
(function installP2PFlowRouteHosts(global) {
  function createRouteHostManager(viewport, options = {}) {
    if (!viewport) throw new Error('Route viewport is required.');
    const activeId = String(options.activeId || 'content');
    const maxHosts = Math.max(3, Number(options.maxHosts || 12));
    const records = new Map();
    let activeKey = '';
    let initialHost = viewport.querySelector(`#${CSS.escape(activeId)}`) || null;

    function prepareHost(host, key) {
      host.classList.add('route-page-host');
      host.dataset.routeHostKey = key;
      host.setAttribute('tabindex', '-1');
      host.setAttribute('role', 'region');
      host.setAttribute('aria-live', 'off');
      return host;
    }

    function createHost(key) {
      const host = initialHost || document.createElement('section');
      initialHost = null;
      prepareHost(host, key);
      return host;
    }

    function currentRecord() {
      return activeKey ? records.get(activeKey) || null : null;
    }

    function currentHost() {
      return currentRecord()?.host || document.getElementById(activeId) || null;
    }

    function touch(record) {
      record.lastUsedAt = Date.now();
    }

    function capture(record) {
      if (!record?.host) return;
      record.scrollTop = Number(record.host.scrollTop || 0);
      record.scrollLeft = Number(record.host.scrollLeft || 0);
      touch(record);
    }

    function deactivate() {
      const record = currentRecord();
      if (!record?.host) return null;
      capture(record);
      record.host.removeAttribute('id');
      record.host.setAttribute('aria-hidden', 'true');
      try { record.host.inert = true; } catch (_) {}
      if (record.host.parentNode === viewport) record.host.remove();
      return record;
    }

    function trim() {
      if (records.size <= maxHosts) return;
      const removable = [...records.entries()]
        .filter(([key]) => key !== activeKey)
        .sort((a, b) => Number(a[1].lastUsedAt || 0) - Number(b[1].lastUsedAt || 0));
      while (records.size > maxHosts && removable.length) {
        const [key, record] = removable.shift();
        try { record.host.remove(); } catch (_) {}
        records.delete(key);
        if (typeof options.onEvict === 'function') options.onEvict(key, record.host);
      }
    }

    function activate(key, activateOptions = {}) {
      const routeKey = String(key || '');
      if (!routeKey) throw new Error('Route key is required.');
      const previousKey = activeKey;
      const same = previousKey === routeKey && Boolean(currentHost());
      if (same) {
        const record = currentRecord();
        touch(record);
        return { host:record.host, restored:true, created:false, same:true, previousKey };
      }

      if (previousKey) deactivate();
      let record = records.get(routeKey);
      const restored = Boolean(record?.host);
      if (!record) {
        const host = createHost(routeKey);
        record = { host, scrollTop:0, scrollLeft:0, createdAt:Date.now(), lastUsedAt:Date.now() };
        records.set(routeKey, record);
      }
      const host = record.host;
      prepareHost(host, routeKey);
      host.id = activeId;
      host.removeAttribute('aria-hidden');
      try { host.inert = false; } catch (_) {}
      viewport.replaceChildren(host);
      activeKey = routeKey;
      touch(record);

      if (!restored && activateOptions.shellHtml !== undefined) host.innerHTML = String(activateOptions.shellHtml || '');
      const scrollTop = restored ? Number(record.scrollTop || 0) : 0;
      const scrollLeft = restored ? Number(record.scrollLeft || 0) : 0;
      // Restore the detached host synchronously. Deferring this to the next
      // animation frame creates a race where a user can start scrolling the
      // newly activated page and then get snapped back to the old position.
      if (activeKey === routeKey && host.id === activeId) {
        host.scrollTo({ top:scrollTop, left:scrollLeft, behavior:'auto' });
      }
      trim();
      return { host, restored, created:!restored, same:false, previousKey };
    }

    function has(key) { return records.has(String(key || '')); }
    function get(key) { return records.get(String(key || ''))?.host || null; }
    function drop(key) {
      const routeKey = String(key || '');
      if (!routeKey || routeKey === activeKey) return false;
      const record = records.get(routeKey);
      if (!record) return false;
      try { record.host.remove(); } catch (_) {}
      records.delete(routeKey);
      return true;
    }
    function captureActive() { capture(currentRecord()); }
    function clearInactive() {
      [...records.keys()].forEach(key => { if (key !== activeKey) drop(key); });
    }

    return Object.freeze({
      activate,
      has,
      get,
      drop,
      captureActive,
      clearInactive,
      currentHost,
      currentKey:() => activeKey,
      keys:() => [...records.keys()]
    });
  }

  function activeScrollElement() {
    return document.getElementById('content') || document.getElementById('routeViewport') || document.scrollingElement;
  }

  const viewportApi = Object.freeze({
    active:activeScrollElement,
    top() { return Number(activeScrollElement()?.scrollTop || 0); },
    left() { return Number(activeScrollElement()?.scrollLeft || 0); },
    height() { return Number(activeScrollElement()?.clientHeight || global.innerHeight || 0); },
    scrollHeight() { return Number(activeScrollElement()?.scrollHeight || 0); },
    to(options = {}) {
      const el = activeScrollElement();
      if (!el) return;
      const top = Number(options.top ?? el.scrollTop ?? 0);
      const left = Number(options.left ?? el.scrollLeft ?? 0);
      if (typeof el.scrollTo === 'function') el.scrollTo({ top, left, behavior:options.behavior || 'auto' });
      else { el.scrollTop = top; el.scrollLeft = left; }
    },
    by(options = {}) {
      const el = activeScrollElement();
      if (!el) return;
      const top = Number(options.top || 0);
      const left = Number(options.left || 0);
      if (typeof el.scrollBy === 'function') el.scrollBy({ top, left, behavior:options.behavior || 'auto' });
      else { el.scrollTop += top; el.scrollLeft += left; }
    },
    nearBottom(distance = 420) {
      const el = activeScrollElement();
      if (!el) return false;
      return Number(el.clientHeight || 0) + Number(el.scrollTop || 0) >= Number(el.scrollHeight || 0) - Number(distance || 0);
    }
  });

  global.P2PFlowRouteHosts = Object.freeze({ create:createRouteHostManager });
  global.P2PFlowViewport = viewportApi;
})(window);
