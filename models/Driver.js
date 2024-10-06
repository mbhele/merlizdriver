const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DriverSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  vehicle: {
    make: { type: String, required: true },
    model: { type: String, required: true },
    plateNumber: { type: String, required: true }
  },
  availability: { type: Boolean, default: true },
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], default: [0, 0], required: true }
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'on_trip', 'busy', 'idle'],
    default: 'offline'
  },
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rideHistory: [{ type: Schema.Types.ObjectId, ref: 'Trip' }],
  profilePicture: { type: String, default: '' },
  licenseFront: { type: String },  // Optional
  licenseBack: { type: String },   // Optional
  idNumber: { type: String, required: true },
  homeAddress: { type: String, required: true },
  lastActive: { type: Date, default: Date.now },
  pushToken: { type: String }  // Added pushToken field
}, { timestamps: true });

DriverSchema.index({ currentLocation: '2dsphere' });

const Driver = mongoose.models.Driver || mongoose.model('Driver', DriverSchema);
module.exports = Driver;
