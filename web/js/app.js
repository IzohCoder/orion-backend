/* ═══════════════════════════════════════════════════════════════
   app.js — ORION Main App Controller
   Handles: splash, routing, dashboard view, assets table
   ═══════════════════════════════════════════════════════════════ */

const ORION = (() => {

  // ══════════════════════════════════════════════════════════
  // SPLASH SCREEN
  // ══════════════════════════════════════════════════════════
  const splash = (() => {
    const MESSAGES = ['CONNECTING TO SERVER...', 'AUTHENTICATING...', 'LOADING TELEMETRY...', 'SYNCING ASSETS...'];
    let msgIdx = 0;
    let msgTimer = null;
    let isReady = false;

    function init() {
      cycleMessages();
      authenticate();
    }

    function cycleMessages() {
      const el = document.getElementById('splash-status-text');
      if (!el) return;
      msgTimer = setInterval(() => {
        if (!isReady) {
          msgIdx = (msgIdx + 1) % MESSAGES.length;
          el.textContent = MESSAGES[msgIdx];
        }
      }, 1500);
    }

    async function authenticate() {
      try {
        const { token } = await OrionAPI.login();
        OrionAlerts.addSysLog('AUTHENTICATED — LIVE FEED ACTIVE');
        isReady = true;

        const statusEl = document.getElementById('splash-status-text');
        if (statusEl) statusEl.textContent = 'READY';

        const enterBtn = document.getElementById('splash-enter');
        if (enterBtn) enterBtn.style.display = '';

        const spinner = document.querySelector('.splash-spinner');
        if (spinner) spinner.style.display = 'none';

        // Connect WebSocket
        OrionWS.connect(token);

      } catch (err) {
        const statusEl = document.getElementById('splash-status-text');
        if (statusEl) statusEl.textContent = 'SERVER OFFLINE — RETRYING...';
        console.error('[ORION] Auth error:', err);
        setTimeout(authenticate, 5000);
      }
    }

    function dismiss() {
      clearInterval(msgTimer);

      // This click initialises the AudioContext (browser policy requirement)
      OrionAlerts.initAudio();

      const splashEl = document.getElementById('splash');
      const appEl = document.getElementById('app');

      splashEl.classList.add('fade-out');
      setTimeout(() => {
        splashEl.style.display = 'none';
        appEl.style.display = '';
        router.navigate(window.location.hash || '#/dashboard');
      }, 600);
    }

    return { init, dismiss };
  })();

  // ══════════════════════════════════════════════════════════
  // ROUTER (hash-based SPA routing)
  // ══════════════════════════════════════════════════════════
  const router = (() => {
    const views = {
      dashboard: 'view-dashboard',
      map:       'view-map',
      assets:    'view-assets',
      alerts:    'view-alerts',
      analytics: 'view-analytics'
    };

    function navigate(hash) {
      const route = (hash || '#/dashboard').replace('#/', '').replace('#', '') || 'dashboard';
      const viewName = views[route] ? route : 'dashboard';

      // Hide all views
      Object.values(views).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      // Show target view
      const target = document.getElementById(views[viewName]);
      if (target) target.style.display = '';

      // Update nav active state
      document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === viewName);
      });

      // Map view: force Leaflet to recalculate size
      if (viewName === 'map') {
        OrionMap.init();
        OrionMap.invalidate();
        const assets = OrionWS.getAssets();
        const geofences = OrionWS.getGeofences();
        OrionMap.update(assets, geofences);
      }

      // Analytics: redraw charts
      if (viewName === 'analytics') {
        setTimeout(() => OrionCharts.update(OrionWS.getAssets()), 50);
      }

      // Update URL without reload
      window.history.replaceState(null, '', `#/${viewName}`);
    }

    function init() {
      // Hash navigation
      window.addEventListener('hashchange', () => navigate(window.location.hash));

      // Nav link clicks
      document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          navigate(`#/${link.dataset.view}`);
        });
      });

      // Map view: init map container when view-map first becomes visible
      const mapView = document.getElementById('view-map');
      if (mapView) {
        // View-map needs full height, override container padding
        mapView.style.margin = '-24px';
      }
    }

    return { init, navigate };
  })();

  // ══════════════════════════════════════════════════════════
  // DASHBOARD VIEW
  // ══════════════════════════════════════════════════════════
  const dashboard = (() => {
    function update(assets) {
      // Stat cards
      const activeCount  = assets.filter(a => a.status === 'active').length;
      const avgBattery   = assets.length > 0
        ? Math.round(assets.reduce((s, a) => s + a.battery, 0) / assets.length)
        : 0;

      const totalEl = document.getElementById('stat-total');
      const activeEl = document.getElementById('stat-active');
      const batEl = document.getElementById('stat-battery');
      if (totalEl) totalEl.textContent = assets.length;
      if (activeEl) activeEl.textContent = activeCount;
      if (batEl) batEl.textContent = `${avgBattery}%`;

      // Asset table
      const tbody = document.getElementById('dashboard-table-body');
      if (!tbody) return;

      tbody.innerHTML = assets.map(asset => {
        const statusColor = { active: '#2E8B57', idle: '#A39D8E', offline: '#A39D8E' }[asset.status] || '#E8571F';
        const batColor = asset.battery > 70 ? '#2E8B57' : asset.battery > 30 ? '#E8571F' : '#E8571F';
        const isDevice = asset.trackingSource === 'device';
        return `
          <tr>
            <td>
              <div class="asset-name">${asset.name}${isDevice ? ' <span style="color:var(--primary);font-size:0.65rem;">🛰️</span>' : ''}</div>
            </td>
            <td>
              <span class="status-badge">
                <span class="status-dot ${asset.status}"></span>
                <span style="color:${statusColor};font-weight:700;">${asset.status.toUpperCase()}</span>
              </span>
            </td>
            <td><span class="asset-coords">${asset.position.lat.toFixed(5)}, ${asset.position.lng.toFixed(5)}</span></td>
            <td><span class="asset-speed">${Math.round(asset.speed)} km/h</span></td>
            <td><span class="asset-battery" style="color:${batColor}">${Math.round(asset.battery)}%</span></td>
          </tr>
        `;
      }).join('');
    }

    return { update };
  })();

  // ══════════════════════════════════════════════════════════
  // ASSETS VIEW
  // ══════════════════════════════════════════════════════════
  const assets = (() => {
    function update(assetList) {
      const tbody = document.getElementById('assets-table-body');
      if (!tbody) return;

      tbody.innerHTML = assetList.map(asset => {
        const statusColor = { active: '#2E8B57', idle: '#A39D8E', offline: '#A39D8E' }[asset.status] || '#E8571F';
        const batColor = asset.battery > 70 ? '#2E8B57' : asset.battery > 30 ? '#E8571F' : '#E8571F';
        const isDevice = asset.trackingSource === 'device';
        const time = asset.lastUpdate
          ? new Date(asset.lastUpdate).toLocaleTimeString('en-GB')
          : '—';
        return `
          <tr>
            <td><div class="asset-name">${asset.name}</div></td>
            <td><span class="asset-id">${asset.id}</span></td>
            <td>${(asset.category || '').toUpperCase()}</td>
            <td>
              <span class="status-badge">
                <span class="status-dot ${asset.status}"></span>
                <span style="color:${statusColor};font-weight:700;">${asset.status.toUpperCase()}</span>
              </span>
            </td>
            <td><span class="asset-speed">${Math.round(asset.speed)} km/h</span></td>
            <td><span class="asset-battery" style="color:${batColor}">${Math.round(asset.battery)}%</span></td>
            <td>
              <span class="source-badge ${isDevice ? 'device' : 'simulation'}">
                ${isDevice ? '🛰️ DEVICE' : 'SIMULATED'}
              </span>
            </td>
            <td><span class="asset-id">${time}</span></td>
          </tr>
        `;
      }).join('');
    }

    return { update };
  })();

  // ══════════════════════════════════════════════════════════
  // WIRING — bind to sub-modules used by ws.js
  // ══════════════════════════════════════════════════════════
  const map = OrionMap;
  const charts = OrionCharts;
  const alerts = OrionAlerts;

  // ══════════════════════════════════════════════════════════
  // BOOT
  // ══════════════════════════════════════════════════════════
  function boot() {
    router.init();

    // Splash entry button
    const enterBtn = document.getElementById('splash-enter');
    if (enterBtn) {
      enterBtn.addEventListener('click', splash.dismiss);
    }
    // Also dismiss on any tap when ready (mobile UX)
    const splashEl = document.getElementById('splash');
    if (splashEl) {
      splashEl.addEventListener('click', () => {
        if (enterBtn && enterBtn.style.display !== 'none') splash.dismiss();
      });
    }

    splash.init();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { dashboard, assets, map, charts, alerts, router };
})();
