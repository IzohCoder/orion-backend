// ORION — Database-backed Data Store
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Asset, Alert, Geofence } = require('./models');

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
      password: hashedPassword
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

  // Seed default assets for this user (same 6 assets scoped to their userId)
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

  return user;
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
  removeAsset
};
