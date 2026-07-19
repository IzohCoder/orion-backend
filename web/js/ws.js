/* ═══════════════════════════════════════════════════════════════
   ws.js — ORION WebSocket Client
   Connects to the live backend and drives all real-time UI updates.
   ═══════════════════════════════════════════════════════════════ */

const OrionWS = (() => {
  let socket = null;
  let shouldReconnect = false;
  let reconnectTimer = null;
  const BASE_WS = 'wss://orion-backend-rcgw.onrender.com';

  // Parsed live data state
  let assets = [];
  let geofences = [];

  function getAssets() { return assets; }
  function getGeofences() { return geofences; }

  // ── Connect with auth token ──────────────────────────────────
  function connect(token) {
    if (socket && socket.readyState === WebSocket.OPEN) return;
    shouldReconnect = true;

    const url = `${BASE_WS}?token=${token}`;
    socket = new WebSocket(url);

    setConnectionState('connecting');

    socket.onopen = () => {
      setConnectionState('connected');
      OrionAlerts.addSysLog('CONNECTED TO LIVE HUB TELEMETRY');
    };

    socket.onmessage = (event) => {
      try {
        handleMessage(JSON.parse(event.data));
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    socket.onclose = (event) => {
      setConnectionState('disconnected');
      OrionAlerts.addSysLog('CONNECTION CLOSED — RETRYING IN 3s');
      scheduleReconnect();
    };

    socket.onerror = () => {
      setConnectionState('disconnected');
      OrionAlerts.addSysLog('ERROR — HUB TELEMETRY OFFLINE');
    };
  }

  function disconnect() {
    shouldReconnect = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket) socket.close(1000, 'User navigated away');
    socket = null;
  }

  function scheduleReconnect() {
    if (!shouldReconnect) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      const token = OrionAPI.getToken();
      if (token) connect(token);
    }, 3000);
  }

  // ── Handle incoming WebSocket messages ──────────────────────
  function handleMessage(msg) {
    if (msg.type === 'init') {
      assets = msg.assets || [];
      geofences = msg.geofences || [];

      OrionAlerts.setInitialAlerts(msg.alerts || []);
      OrionAlerts.addSysLog(`SYNCED ${assets.length} ASSETS | ${geofences.length} GEOFENCES`);
      OrionAlerts.updateAlertBadge();

      // Drive all UI sections
      ORION.dashboard.update(assets);
      ORION.map.update(assets, geofences);
      ORION.assets.update(assets);
      ORION.charts.update(assets);

    } else if (msg.type === 'update') {
      // Merge updated assets
      for (const updated of (msg.assets || [])) {
        const idx = assets.findIndex(a => a.id === updated.id);
        if (idx !== -1) {
          assets[idx] = { ...assets[idx], ...updated };
        } else {
          assets.push(updated);
        }
      }

      // Remove assets that disappeared
      if (msg.assets && msg.assets.length > 0) {
        const activeIds = new Set(msg.assets.map(a => a.id));
        assets = assets.filter(a => activeIds.has(a.id));
      }

      // Handle new alerts
      for (const alert of (msg.newAlerts || [])) {
        OrionAlerts.trigger(alert);
      }

      // Refresh all views
      ORION.dashboard.update(assets);
      ORION.map.update(assets, geofences);
      ORION.assets.update(assets);
      ORION.charts.update(assets);
    }
  }

  // ── Connection indicator ────────────────────────────────────
  function setConnectionState(state) {
    const dot = document.querySelector('.connection-dot');
    const text = document.querySelector('.connection-text');
    if (!dot || !text) return;

    dot.classList.remove('connected');
    if (state === 'connected') {
      dot.classList.add('connected');
      text.textContent = 'LIVE';
    } else if (state === 'connecting') {
      text.textContent = 'CONNECTING...';
    } else {
      text.textContent = 'OFFLINE';
    }
  }

  return { connect, disconnect, getAssets, getGeofences };
})();
