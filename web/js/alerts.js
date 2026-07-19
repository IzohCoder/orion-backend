/* ═══════════════════════════════════════════════════════════════
   alerts.js — ORION Alert Sound + Vibration + Flash System
   This is what makes phones ring during the presentation!
   ═══════════════════════════════════════════════════════════════ */

const OrionAlerts = (() => {
  let audioContext = null;
  let bannerTimeout = null;
  let consoleFeed = [];
  const MAX_LOG = 80;

  // ── Bootstrap audio context on first user gesture ────────────
  // (called from the splash "TAP TO ENTER" click)
  function initAudio() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('[ORION] Audio context initialized');
    } catch (e) {
      console.warn('[ORION] Web Audio not supported:', e);
    }
  }

  // ── Play a dramatic alarm tone via Web Audio API ─────────────
  // Uses oscillators to create a harsh two-tone siren sound.
  function playAlarmSound(isCritical) {
    if (!audioContext) return;

    try {
      const now = audioContext.currentTime;
      const duration = isCritical ? 4.0 : 1.5;
      const masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(0.7, now);
      masterGain.connect(audioContext.destination);

      if (isCritical) {
        // Alternating two-tone siren: 880Hz ↔ 660Hz (runs for 10 seconds total)
        for (let i = 0; i < 20; i++) {
          const osc = audioContext.createOscillator();
          const oscGain = audioContext.createGain();
          osc.connect(oscGain);
          oscGain.connect(masterGain);

          const startTime = now + i * 0.5;
          osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, startTime);
          oscGain.gain.setValueAtTime(0, startTime);
          oscGain.gain.linearRampToValueAtTime(0.8, startTime + 0.05);
          oscGain.gain.linearRampToValueAtTime(0.8, startTime + 0.4);
          oscGain.gain.linearRampToValueAtTime(0, startTime + 0.5);

          osc.start(startTime);
          osc.stop(startTime + 0.5);
        }
      } else {
        // Single short ping for warnings
        const osc = audioContext.createOscillator();
        const oscGain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(0.5, now + 0.05);
        oscGain.gain.linearRampToValueAtTime(0, now + 0.6);
        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.8);
      }
    } catch (e) {
      console.warn('[ORION] Error playing alert sound:', e);
    }
  }

  // ── Screen flash (red border pulse) ─────────────────────────
  function flashScreen() {
    const flashEl = document.getElementById('alert-flash');
    if (!flashEl) return;
    flashEl.classList.add('active');
    setTimeout(() => flashEl.classList.remove('active'), 1500);
  }

  // ── Phone vibrate (works on Android Chrome/Firefox) ─────────
  function vibrate(isCritical) {
    if (!navigator.vibrate) return;
    if (isCritical) {
      // 10 seconds of alternating vibration (1s vibrate, 0.5s pause)
      navigator.vibrate([
        1000, 500, 1000, 500, 1000, 500, 1000, 500, 
        1000, 500, 1000, 500, 1000, 500
      ]);
    } else {
      navigator.vibrate([300]);
    }
  }

  // ── Show top banner ─────────────────────────────────────────
  function showBanner(alert) {
    const banner = document.getElementById('alert-banner');
    const titleEl = document.getElementById('alert-banner-title');
    const msgEl = document.getElementById('alert-banner-message');
    if (!banner) return;

    titleEl.textContent = `${alert.severity === 'critical' ? '🚨' : '⚠️'} ${alert.type.toUpperCase().replace(/_/g, ' ')} — ${alert.assetName}`;
    msgEl.textContent = alert.message;
    banner.style.display = 'flex';

    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => dismissBanner(), alert.severity === 'critical' ? 10000 : 4000);
  }

  function dismissBanner() {
    const banner = document.getElementById('alert-banner');
    if (banner) banner.style.display = 'none';
  }

  // ── Main trigger called when an alert arrives via WebSocket ──
  function trigger(alert) {
    const isCritical = alert.severity === 'critical';
    playAlarmSound(isCritical);
    vibrate(isCritical);
    flashScreen();
    showBanner(alert);
    addLog(alert);
    updateAlertsList(alert);
    updateAlertBadge();
  }

  // ── Console feed log ─────────────────────────────────────────
  function addLog(alert) {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const prefix = alert.severity === 'critical' ? '🚨 CRIT' : '⚠️ WARN';
    const msg = `[${time}] ${prefix}: ${alert.assetName} — ${alert.message}`;
    consoleFeed.unshift({ text: msg, type: alert.severity });
    if (consoleFeed.length > MAX_LOG) consoleFeed.pop();
    renderConsoleFeed();
  }

  function addSysLog(msg) {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    consoleFeed.unshift({ text: `[${time}] SYS: ${msg}`, type: 'sys' });
    if (consoleFeed.length > MAX_LOG) consoleFeed.pop();
    renderConsoleFeed();
  }

  function renderConsoleFeed() {
    const el = document.getElementById('console-feed');
    if (!el) return;
    el.innerHTML = consoleFeed.map(entry => {
      const cls = entry.type === 'critical' ? 'crit' : entry.type === 'sys' ? 'sys' : '';
      return `<div class="console-line ${cls}">${entry.text}</div>`;
    }).join('');
  }

  // ── Alerts list in Alerts view ───────────────────────────────
  let alertsData = [];
  function setInitialAlerts(alerts) {
    alertsData = alerts.slice(0, 100);
    renderAlertsList();
  }

  function updateAlertsList(alert) {
    // Avoid duplicates
    if (alertsData.some(a => a.id === alert.id)) return;
    alertsData.unshift(alert);
    if (alertsData.length > 100) alertsData.pop();
    renderAlertsList();
  }

  function renderAlertsList() {
    const container = document.getElementById('alerts-list');
    const emptyEl = document.getElementById('alerts-empty');
    if (!container) return;

    if (alertsData.length === 0) {
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    // Remove existing alert cards (not the empty placeholder)
    container.querySelectorAll('.alert-card').forEach(el => el.remove());

    alertsData.forEach(alert => {
      const isCritical = alert.severity === 'critical';
      const div = document.createElement('div');
      div.className = `alert-card ${isCritical ? 'critical' : 'warning'}`;
      const time = new Date(alert.timestamp).toLocaleString('en-GB');
      div.innerHTML = `
        <div class="alert-icon">${isCritical ? '🚨' : '⚠️'}</div>
        <div class="alert-body">
          <div class="alert-type" style="color:${isCritical ? 'var(--primary)' : 'var(--text-primary)'}">
            ${alert.type.replace(/_/g, ' ').toUpperCase()}
          </div>
          <div class="alert-message">${alert.message}</div>
          <div class="alert-meta">
            <span class="alert-timestamp">${time}</span>
            <span class="alert-target">→ ${alert.assetName || alert.assetId}</span>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
  }

  function updateAlertBadge() {
    const badge = document.getElementById('alert-badge');
    if (!badge) return;
    const todayStart = Date.now() - 86400000;
    const todayCount = alertsData.filter(a => a.timestamp > todayStart).length;
    if (todayCount > 0) {
      badge.textContent = todayCount;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
    // Update stat card
    const statEl = document.getElementById('stat-alerts');
    if (statEl) statEl.textContent = todayCount;
  }

  return {
    initAudio,
    trigger,
    dismissBanner,
    addSysLog,
    renderConsoleFeed,
    setInitialAlerts,
    renderAlertsList,
    updateAlertBadge,
    getAlerts: () => alertsData
  };
})();
