/* ═══════════════════════════════════════════════════════════════
   map.js — ORION Leaflet Map Module
   Live asset markers, geofence circles, trail polylines
   ═══════════════════════════════════════════════════════════════ */

const OrionMap = (() => {
  let leafletMap = null;
  let markers = {};    // assetId -> L.CircleMarker
  let circles = [];    // geofence L.Circle[]
  let trails = {};     // assetId -> L.Polyline
  let trailData = {};  // assetId -> LatLng[]
  let selectedId = null;
  let hasSwooped = false;
  const MAX_TRAIL = 50;

  // ── Color helpers ─────────────────────────────────────────
  function statusColor(status) {
    switch (status) {
      case 'active':  return '#2E8B57';
      case 'idle':    return '#A39D8E';
      case 'offline': return '#A39D8E';
      default:        return '#E8571F';
    }
  }

  // ── Initialize the Leaflet map ────────────────────────────
  function init() {
    if (leafletMap) return;

    leafletMap = L.map('leaflet-map', {
      center: [-1.2921, 36.8219],
      zoom: 13,
      zoomControl: true,
      attributionControl: false
    });

    // Use CartoDB Positron tiles — clean, minimal, matches the aesthetic
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(leafletMap);

    // Fix zoom control position
    leafletMap.zoomControl.setPosition('bottomright');
  }

  // ── Update map with latest assets + geofences ─────────────
  function update(assets, geofences) {
    if (!leafletMap) return;

    // Update geofence circles
    circles.forEach(c => c.remove());
    circles = [];
    if (geofences) {
      geofences.forEach(gf => {
        const circle = L.circle([gf.center.lat, gf.center.lng], {
          radius: gf.radiusMeters,
          color: '#E8571F',
          weight: 1.5,
          opacity: 0.5,
          fillColor: '#E8571F',
          fillOpacity: 0.05
        }).addTo(leafletMap);

        circle.bindTooltip(gf.name, {
          permanent: true,
          direction: 'center',
          className: 'geofence-label'
        });

        circles.push(circle);
      });
    }

    // Update markers
    const seenIds = new Set();
    assets.forEach(asset => {
      seenIds.add(asset.id);
      const latlng = [asset.position.lat, asset.position.lng];
      const color = statusColor(asset.status);
      const isDevice = asset.trackingSource === 'device';

      // Update trail data
      if (!trailData[asset.id]) trailData[asset.id] = [];
      const trail = trailData[asset.id];
      const last = trail[trail.length - 1];
      if (!last || last[0] !== latlng[0] || last[1] !== latlng[1]) {
        trail.push(latlng);
        if (trail.length > MAX_TRAIL) trail.shift();
      }

      // Draw/update trail polyline (only for selected asset)
      if (asset.id === selectedId && trail.length > 1) {
        if (trails[asset.id]) trails[asset.id].remove();
        trails[asset.id] = L.polyline(trail, {
          color: '#E8571F',
          weight: 3,
          opacity: 0.6
        }).addTo(leafletMap);
      }

      if (markers[asset.id]) {
        // Update position and style
        markers[asset.id].setLatLng(latlng);
        markers[asset.id].setStyle({
          fillColor: color,
          color: isDevice ? '#E8571F' : color,
          radius: isDevice ? 12 : 8,
          weight: isDevice ? 3 : 1.5
        });
      } else {
        // Create new marker
        const marker = L.circleMarker(latlng, {
          radius: isDevice ? 12 : 8,
          fillColor: color,
          color: isDevice ? '#E8571F' : color,
          weight: isDevice ? 3 : 1.5,
          opacity: 1,
          fillOpacity: 0.85
        }).addTo(leafletMap);

        marker.bindTooltip(isDevice ? `🛰️ ${asset.name}` : asset.name, {
          direction: 'top',
          offset: [0, -10]
        });

        marker.on('click', () => {
          showPopup(asset);
          selectedId = asset.id;
        });

        markers[asset.id] = marker;
      }
    });

    // Remove markers for assets no longer in the list
    Object.keys(markers).forEach(id => {
      if (!seenIds.has(id)) {
        markers[id].remove();
        delete markers[id];
      }
    });

    // Update asset count badge
    const countEl = document.getElementById('map-asset-count');
    if (countEl) countEl.textContent = `${assets.length} ASSETS`;

    // Camera swoop: first time we get assets, fly to device or first asset
    if (!hasSwooped && assets.length > 0) {
      const target = assets.find(a => a.trackingSource === 'device') || assets[0];
      leafletMap.flyTo([target.position.lat, target.position.lng], 15, { duration: 2.5 });
      hasSwooped = true;
    }

    // Refresh popup if one is open
    if (selectedId) {
      const asset = assets.find(a => a.id === selectedId);
      if (asset) showPopup(asset);
    }
  }

  function showPopup(asset) {
    const popup = document.getElementById('map-popup');
    if (!popup) return;

    document.getElementById('map-popup-name').textContent = asset.name.toUpperCase();
    document.getElementById('map-popup-category').textContent = asset.category.toUpperCase();
    document.getElementById('map-popup-coords').textContent =
      `${asset.position.lat.toFixed(5)}, ${asset.position.lng.toFixed(5)}`;

    const statusColors = { active: '#2E8B57', idle: '#A39D8E', offline: '#A39D8E' };
    const statusEl = document.getElementById('map-popup-status');
    statusEl.textContent = asset.status.toUpperCase();
    statusEl.style.color = statusColors[asset.status] || '#E8571F';

    document.getElementById('map-popup-speed').textContent = `${Math.round(asset.speed)} km/h`;
    const batEl = document.getElementById('map-popup-battery');
    batEl.textContent = `${Math.round(asset.battery)}% BAT`;
    batEl.style.color = asset.battery > 70 ? '#2E8B57' : asset.battery > 30 ? '#E8571F' : '#E8571F';

    const isDevice = asset.trackingSource === 'device';
    document.getElementById('map-popup-title').textContent =
      isDevice ? '🛰️ HARDWARE DEVICE' : 'ASSET DETAILS';

    popup.style.display = '';
  }

  function closePopup() {
    const popup = document.getElementById('map-popup');
    if (popup) popup.style.display = 'none';
    selectedId = null;
    // Remove trail for deselected asset
    Object.values(trails).forEach(t => t.remove());
    trails = {};
  }

  // Must call when switching to map view to invalidate size
  function invalidate() {
    if (leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 100);
    }
  }

  return { init, update, showPopup, closePopup, invalidate };
})();
