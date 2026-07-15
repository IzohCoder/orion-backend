// ORION — Database-backed Data Store
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Asset, Alert, Geofence } = require('./models');
const { sendEmail } = require('./mailer');

const users = [];
const sessions = new Map(); // token -> userId (string)
const geofences = [];
const assets = [];
const alerts = [];

async function initDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ERROR: MONGODB_URI is not set in environment or .env file!");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("[DB] Connected to MongoDB.");

  // Clear local arrays
  users.length = 0;
  geofences.length = 0;
  assets.length = 0;
  alerts.length = 0;

  // Load existing data from DB
  const dbUsers = await User.find({});
  users.push(...dbUsers);

  const dbGeofences = await Geofence.find({});
  geofences.push(...dbGeofences);

  const dbAssets = await Asset.find({});
  assets.push(...dbAssets);

  // Load alerts sorted by timestamp descending, limit to 200
  const dbAlerts = await Alert.find({}).sort({ timestamp: -1 }).limit(200);
  alerts.push(...dbAlerts);

  console.log(`[DB] Loaded ${users.length} users, ${assets.length} assets, ${geofences.length} geofences, ${alerts.length} alerts from DB.`);

  // Seed demo operator if no users exist
  if (users.length === 0) {
    console.log("[DB] No users found. Seeding default demo operator...");
    const hashedPassword = await bcrypt.hash('orion123', 10);
    const demoUser = new User({
      name: 'Demo Operator',
      email: 'demo@orion.io',
      password: hashedPassword,
      emailVerified: true
    });
    await demoUser.save();
    users.push(demoUser);

    // Seed default geofences for this demo user
    console.log("[DB] Seeding default geofences for demo user...");
    const gf1 = new Geofence({
      id: 'gf-1',
      name: 'HQ Perimeter',
      center: { lat: -1.2921, lng: 36.8219 },
      radiusMeters: 2000,
      userId: demoUser._id
    });
    const gf2 = new Geofence({
      id: 'gf-2',
      name: 'Warehouse Zone',
      center: { lat: -1.3028, lng: 36.8300 },
      radiusMeters: 1000,
      userId: demoUser._id
    });
    await gf1.save();
    await gf2.save();
    geofences.push(gf1, gf2);

    // Seed default assets for this demo user
    console.log("[DB] Seeding default assets for demo user...");
    const defaultAssets = [
      {
        id: 'asset-1',
        name: 'Truck Alpha',
        category: 'vehicle',
        owner: 'Nairobi Logistics Ltd',
        registration: 'KBZ 420A',
        status: 'active',
        battery: 87,
        position: { lat: -1.2921, lng: 36.8219 },
        speed: 45,
        heading: 90,
        trail: [],
        lastUpdate: Date.now(),
        userId: demoUser._id
      },
      {
        id: 'asset-2',
        name: 'Van Bravo',
        category: 'vehicle',
        owner: 'Nairobi Logistics Ltd',
        registration: 'KCA 115B',
        status: 'active',
        battery: 62,
        position: { lat: -1.2850, lng: 36.8150 },
        speed: 30,
        heading: 180,
        trail: [],
        lastUpdate: Date.now(),
        userId: demoUser._id
      },
      {
        id: 'asset-3',
        name: 'Container C-7734',
        category: 'freight',
        owner: 'Port Authority',
        registration: 'CONT-7734',
        status: 'idle',
        battery: 95,
        position: { lat: -1.3028, lng: 36.8300 },
        speed: 0,
        heading: 0,
        trail: [],
        lastUpdate: Date.now(),
        userId: demoUser._id
      },
      {
        id: 'asset-4',
        name: 'Field Agent — Kamau',
        category: 'person',
        owner: 'Security Division',
        registration: 'FA-0042',
        status: 'active',
        battery: 44,
        position: { lat: -1.2900, lng: 36.8250 },
        speed: 5,
        heading: 45,
        trail: [],
        lastUpdate: Date.now(),
        userId: demoUser._id
      },
      {
        id: 'asset-5',
        name: 'Generator G-12',
        category: 'equipment',
        owner: 'Facilities Dept',
        registration: 'EQ-G012',
        status: 'offline',
        battery: 12,
        position: { lat: -1.2980, lng: 36.8180 },
        speed: 0,
        heading: 0,
        trail: [],
        lastUpdate: Date.now(),
        userId: demoUser._id
      },
      {
        id: 'asset-6',
        name: 'Bike Courier Delta',
        category: 'vehicle',
        owner: 'Express Delivery',
        registration: 'KMCX 009',
        status: 'active',
        battery: 73,
        position: { lat: -1.2870, lng: 36.8280 },
        speed: 20,
        heading: 270,
        trail: [],
        lastUpdate: Date.now(),
        userId: demoUser._id
      }
    ];

    for (const aData of defaultAssets) {
      const a = new Asset(aData);
      await a.save();
      assets.push(a);
    }
  }
}

async function registerUser(name, email, password) {
  const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    throw new Error('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({
    name,
    email: email.toLowerCase(),
    password: hashedPassword
  });
  await user.save();
  users.push(user);

  await seedUserDefaultData(user);

  return user;
}

async function seedUserDefaultData(user) {
  // Seed default geofences for this user
  const gf1 = new Geofence({
    id: `gf-${uuidv4()}`,
    name: 'HQ Perimeter',
    center: { lat: -1.2921, lng: 36.8219 },
    radiusMeters: 2000,
    userId: user._id
  });
  const gf2 = new Geofence({
    id: `gf-${uuidv4()}`,
    name: 'Warehouse Zone',
    center: { lat: -1.3028, lng: 36.8300 },
    radiusMeters: 1000,
    userId: user._id
  });
  await gf1.save();
  await gf2.save();
  geofences.push(gf1, gf2);

  // Seed default assets for this user
  const defaultAssets = [
    {
      id: uuidv4(),
      name: 'Truck Alpha',
      category: 'vehicle',
      owner: 'Nairobi Logistics Ltd',
      registration: 'KBZ 420A',
      status: 'active',
      battery: 87,
      position: { lat: -1.2921, lng: 36.8219 },
      speed: 45,
      heading: 90,
      trail: [],
      lastUpdate: Date.now(),
      userId: user._id
    },
    {
      id: uuidv4(),
      name: 'Van Bravo',
      category: 'vehicle',
      owner: 'Nairobi Logistics Ltd',
      registration: 'KCA 115B',
      status: 'active',
      battery: 62,
      position: { lat: -1.2850, lng: 36.8150 },
      speed: 30,
      heading: 180,
      trail: [],
      lastUpdate: Date.now(),
      userId: user._id
    },
    {
      id: uuidv4(),
      name: 'Container C-7734',
      category: 'freight',
      owner: 'Port Authority',
      registration: 'CONT-7734',
      status: 'idle',
      battery: 95,
      position: { lat: -1.3028, lng: 36.8300 },
      speed: 0,
      heading: 0,
      trail: [],
      lastUpdate: Date.now(),
      userId: user._id
    },
    {
      id: uuidv4(),
      name: 'Field Agent — Kamau',
      category: 'person',
      owner: 'Security Division',
      registration: 'FA-0042',
      status: 'active',
      battery: 44,
      position: { lat: -1.2900, lng: 36.8250 },
      speed: 5,
      heading: 45,
      trail: [],
      lastUpdate: Date.now(),
      userId: user._id
    },
    {
      id: uuidv4(),
      name: 'Generator G-12',
      category: 'equipment',
      owner: 'Facilities Dept',
      registration: 'EQ-G012',
      status: 'offline',
      battery: 12,
      position: { lat: -1.2980, lng: 36.8180 },
      speed: 0,
      heading: 0,
      trail: [],
      lastUpdate: Date.now(),
      userId: user._id
    },
    {
      id: uuidv4(),
      name: 'Bike Courier Delta',
      category: 'vehicle',
      owner: 'Express Delivery',
      registration: 'KMCX 009',
      status: 'active',
      battery: 73,
      position: { lat: -1.2870, lng: 36.8280 },
      speed: 20,
      heading: 270,
      trail: [],
      lastUpdate: Date.now(),
      userId: user._id
    }
  ];

  for (const aData of defaultAssets) {
    const a = new Asset(aData);
    await a.save();
    assets.push(a);
  }
}

async function addAlert(assetId, assetName, type, severity, message, userId) {
  const alert = new Alert({
    id: uuidv4(),
    assetId,
    assetName,
    type,
    severity,
    message,
    timestamp: Date.now(),
    userId
  });
  await alert.save();
  alerts.unshift(alert);
  if (alerts.length > 200) {
    alerts.pop();
  }

  // Find user to check notification preferences
  const user = users.find(u => u._id.toString() === userId.toString());
  if (user) {
    const email = user.email;
    const prefs = user.preferences || {};

    if (prefs.emailEnabled && email) {
      const subject = `[ORION Alert] ${severity.toUpperCase()}: ${assetName}`;
      const htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ECE9E1; background-color: #FAF8F4; color: #1A1814;">
          <h2 style="color: ${severity === 'critical' ? '#E8571F' : '#A39D8E'}; margin-top: 0;">ORION ALERT: ${severity.toUpperCase()}</h2>
          <p><strong>Asset:</strong> ${assetName} (ID: ${assetId})</p>
          <p><strong>Type:</strong> ${type.replace('_', ' ').toUpperCase()}</p>
          <p><strong>Message:</strong> ${message}</p>
          <p style="font-size: 11px; color: #A39D8E; margin-top: 20px; border-top: 1px solid #ECE9E1; padding-top: 10px;">
            Sent automatically by ORION Tracker Platform. You can customize alert settings in your operator panel.
          </p>
        </div>
      `;
      sendEmail(email, subject, htmlContent).catch(err => console.error("Failed to send email alert:", err));
    }
  }

  return alert;
}

async function addAsset(name, category, userId) {
  const asset = new Asset({
    id: uuidv4(),
    name,
    category,
    owner: 'Unassigned',
    registration: 'N/A',
    status: 'idle',
    battery: 100,
    position: {
      lat: -1.2921 + (Math.random() - 0.5) * 0.02,
      lng: 36.8219 + (Math.random() - 0.5) * 0.02
    },
    speed: 0,
    heading: 0,
    trail: [],
    lastUpdate: Date.now(),
    userId
  });
  await asset.save();
  assets.push(asset);
  return asset;
}

async function removeAsset(id, userId) {
  const idx = assets.findIndex(a => a.id === id && a.userId.toString() === userId.toString());
  if (idx === -1) return null;
  const removed = assets.splice(idx, 1)[0];
  await Asset.deleteOne({ id, userId });
  return removed;
}

async function updateUserProfile(userId, profileData) {
  const dbUser = await User.findById(userId);
  if (!dbUser) throw new Error('User not found');
  
  if (!dbUser.profile) dbUser.profile = {};
  
  const fields = ['fullName', 'phoneNumber', 'avatar', 'role'];
  fields.forEach(f => {
    if (profileData[f] !== undefined) {
      dbUser.profile[f] = profileData[f];
    }
  });
  
  if (profileData.emergencyContact) {
    if (!dbUser.profile.emergencyContact) dbUser.profile.emergencyContact = {};
    if (profileData.emergencyContact.name !== undefined) {
      dbUser.profile.emergencyContact.name = profileData.emergencyContact.name;
    }
    if (profileData.emergencyContact.phone !== undefined) {
      dbUser.profile.emergencyContact.phone = profileData.emergencyContact.phone;
    }
  }
  
  await dbUser.save();
  
  // Sync to local memory cache array
  const cachedIdx = users.findIndex(u => u._id.toString() === userId.toString());
  if (cachedIdx !== -1) {
    users[cachedIdx] = dbUser;
  }
  
  return dbUser;
}

async function updateUserPreferences(userId, prefsData) {
  const dbUser = await User.findById(userId);
  if (!dbUser) throw new Error('User not found');
  
  if (!dbUser.preferences) dbUser.preferences = {};
  
  const fields = ['pushEnabled', 'emailEnabled', 'smsEnabled', 'hardwareModeEnabled'];
  fields.forEach(f => {
    if (prefsData[f] !== undefined) {
      dbUser.preferences[f] = prefsData[f];
    }
  });
  
  await dbUser.save();
  
  // Sync to local memory cache array
  const cachedIdx = users.findIndex(u => u._id.toString() === userId.toString());
  if (cachedIdx !== -1) {
    users[cachedIdx] = dbUser;
  }
  
  return dbUser;
}

async function updateAssetTrackingSource(id, trackingSource, userId) {
  const asset = assets.find(a => a.id === id && a.userId.toString() === userId.toString());
  if (!asset) return null;
  asset.trackingSource = trackingSource;
  await Asset.updateOne({ id, userId }, { $set: { trackingSource } });
  return asset;
}

async function updateAssetLocation(id, locationData, userId) {
  const asset = assets.find(a => a.id === id && a.userId.toString() === userId.toString());
  if (!asset) return null;

  const { lat, lng, speed, heading, battery } = locationData;
  if (lat !== undefined && lng !== undefined) {
    if (asset.position.lat !== lat || asset.position.lng !== lng) {
      asset.trail.push({ lat: asset.position.lat, lng: asset.position.lng, t: Date.now() });
      if (asset.trail.length > 50) asset.trail.shift();
    }
    asset.position = { lat, lng };
  }
  if (speed !== undefined) asset.speed = speed;
  if (heading !== undefined) asset.heading = heading;
  if (battery !== undefined) asset.battery = battery;
  asset.lastUpdate = Date.now();
  asset.status = 'active'; // force active when updating location

  await Asset.updateOne(
    { id, userId },
    {
      $set: {
        position: asset.position,
        speed: asset.speed,
        heading: asset.heading,
        battery: asset.battery,
        trail: asset.trail,
        status: asset.status,
        lastUpdate: asset.lastUpdate
      }
    }
  );
  return asset;
}

module.exports = {
  users,
  sessions,
  geofences,
  assets,
  alerts,
  initDB,
  registerUser,
  addAlert,
  addAsset,
  removeAsset,
  updateUserProfile,
  updateUserPreferences,
  updateAssetTrackingSource,
  updateAssetLocation
};
