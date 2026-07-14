const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true }
});

const AssetSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  owner: { type: String, default: 'Unassigned' },
  registration: { type: String, default: 'N/A' },
  status: { type: String, default: 'idle' },
  battery: { type: Number, default: 100 },
  position: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  speed: { type: Number, default: 0 },
  heading: { type: Number, default: 0 },
  trail: [{
    lat: Number,
    lng: Number,
    t: Number
  }],
  lastUpdate: { type: Number, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
});

const AlertSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  assetId: { type: String, required: true },
  assetName: { type: String, required: true },
  type: { type: String, required: true },
  severity: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Number, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
});

const GeofenceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  center: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  radiusMeters: { type: Number, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
});

const User = mongoose.model('User', UserSchema);
const Asset = mongoose.model('Asset', AssetSchema);
const Alert = mongoose.model('Alert', AlertSchema);
const Geofence = mongoose.model('Geofence', GeofenceSchema);

module.exports = {
  User,
  Asset,
  Alert,
  Geofence
};
