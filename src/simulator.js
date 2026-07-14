// ORION — GPS Simulator Engine
const data = require('./data');
const { Asset } = require('./models');

// ── Movement profiles by category ──────────────────────────
const PROFILES = {
  vehicle:   { maxSpeed: 80, accel: 5, turnRate: 30, moveChance: 0.95 },
  freight:   { maxSpeed: 15, accel: 2, turnRate: 10, moveChance: 0.15 },
  person:    { maxSpeed: 7,  accel: 1, turnRate: 60, moveChance: 0.80 },
  equipment: { maxSpeed: 0,  accel: 0, turnRate: 0,  moveChance: 0.02 }
};

// Earth radius in km
const R = 6371;

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

// Haversine distance in meters
function haversine(p1, p2) {
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 1000;
}

// Move a point by distance (m) at heading (deg)
function movePoint(lat, lng, distanceM, headingDeg) {
  const d = distanceM / (R * 1000);
  const brng = toRad(headingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

// ── Alert generation ────────────────────────────────────────
let newAlerts = []; // flushed each tick

function checkAlerts(asset) {
  // Battery low
  if (asset.battery <= 15 && Math.random() < 0.05) {
    data.addAlert(asset.id, asset.name, 'battery_low', 'warning',
      `Battery low on ${asset.name} (${asset.battery.toFixed(0)}%)`, asset.userId)
      .then(alert => newAlerts.push(alert))
      .catch(err => console.error("Error adding battery alert:", err));
  }

  // Speeding (vehicles > 70 km/h)
  if (asset.category === 'vehicle' && asset.speed > 70) {
    if (Math.random() < 0.3) {
      data.addAlert(asset.id, asset.name, 'speeding', 'critical',
        `${asset.name} speeding at ${asset.speed.toFixed(0)} km/h`, asset.userId)
        .then(alert => newAlerts.push(alert))
        .catch(err => console.error("Error adding speeding alert:", err));
    }
  }

  // Geofence breach
  const userGeofences = data.geofences.filter(gf => gf.userId.toString() === asset.userId.toString());
  for (const gf of userGeofences) {
    const dist = haversine(asset.position, gf.center);
    if (dist > gf.radiusMeters && asset.status === 'active') {
      if (Math.random() < 0.08) {
        data.addAlert(asset.id, asset.name, 'geofence_breach', 'critical',
          `${asset.name} left "${gf.name}" zone (${Math.round(dist)}m from center)`, asset.userId)
          .then(alert => newAlerts.push(alert))
          .catch(err => console.error("Error adding geofence alert:", err));
      }
    }
  }

  // Signal lost (offline assets)
  if (asset.status === 'offline' && Math.random() < 0.02) {
    data.addAlert(asset.id, asset.name, 'signal_lost', 'critical',
      `Signal lost on ${asset.name}`, asset.userId)
      .then(alert => newAlerts.push(alert))
      .catch(err => console.error("Error adding signal lost alert:", err));
  }
}

// ── Tick: update all assets ─────────────────────────────────
function tick() {
  newAlerts = [];
  const updatePromises = [];

  for (const asset of data.assets) {
    const profile = PROFILES[asset.category] || PROFILES.equipment;

    // Skip offline assets most of the time
    if (asset.status === 'offline') {
      // Occasionally come back online
      if (Math.random() < 0.005) {
        asset.status = 'active';
        asset.battery = 20 + Math.floor(Math.random() * 30);
      }
      checkAlerts(asset);
      continue;
    }

    // Randomly toggle idle/active
    if (Math.random() < 0.02) {
      asset.status = asset.status === 'active' ? 'idle' : 'active';
    }

    // Go offline rarely
    if (Math.random() < 0.003) {
      asset.status = 'offline';
      checkAlerts(asset);
      continue;
    }

    // Battery drain
    asset.battery = Math.max(0, asset.battery - (Math.random() * 0.15));
    if (asset.battery <= 0) {
      asset.status = 'offline';
      checkAlerts(asset);
      continue;
    }

    // Movement
    if (asset.status === 'active' && Math.random() < profile.moveChance) {
      // Adjust speed
      asset.speed += (Math.random() - 0.4) * profile.accel;
      asset.speed = Math.max(0, Math.min(profile.maxSpeed, asset.speed));

      // Adjust heading
      asset.heading += (Math.random() - 0.5) * profile.turnRate;
      asset.heading = ((asset.heading % 360) + 360) % 360;

      // Move: distance = speed(km/h) * time(s) / 3600 * 1000 = meters per tick
      const tickSeconds = 1.5; // average tick interval
      const distMeters = (asset.speed / 3.6) * tickSeconds;

      if (distMeters > 0.1) {
        // Save to trail (keep last 50 points)
        asset.trail.push({ lat: asset.position.lat, lng: asset.position.lng, t: Date.now() });
        if (asset.trail.length > 50) asset.trail.shift();

        const newPos = movePoint(asset.position.lat, asset.position.lng, distMeters, asset.heading);
        asset.position = newPos;
      }
    } else if (asset.status === 'idle') {
      asset.speed = Math.max(0, asset.speed - 1);
    }

    asset.lastUpdate = Date.now();
    checkAlerts(asset);

    // Save positions asynchronously
    updatePromises.push(
      Asset.updateOne(
        { id: asset.id },
        {
          $set: {
            status: asset.status,
            battery: asset.battery,
            position: asset.position,
            speed: asset.speed,
            heading: asset.heading,
            trail: asset.trail,
            lastUpdate: asset.lastUpdate
          }
        }
      )
    );
  }

  Promise.all(updatePromises).catch(err => {
    console.error("[DB] Error persisting tick updates:", err);
  });

  return newAlerts;
}

module.exports = { tick, haversine };
