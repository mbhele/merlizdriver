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
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], default: [0, 0], required: true } // Set a default location or make it optional initially
  },
  status: {  // Keeping this unchanged as you requested
    type: String,
    enum: ['online', 'offline', 'on_trip', 'busy', 'idle'], // Expanded enum values for better status management
    default: 'offline'
  },
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], // Updated enum for approval status
    default: 'pending'  // Default to 'pending' until admin approves or rejects
  },
  rideHistory: [{ type: Schema.Types.ObjectId, ref: 'Trip' }],
  profilePicture: { type: String, default: '' }, // Already added for profile picture
  licenseFront: { type: String, required: true }, // New field for license front image
  licenseBack: { type: String, required: true }, // New field for license back image
}, { timestamps: true });

DriverSchema.index({ currentLocation: '2dsphere' }); // Geospatial index for location-based queries

const Driver = mongoose.models.Driver || mongoose.model('Driver', DriverSchema);
module.exports = Driver;
