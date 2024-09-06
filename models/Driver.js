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
    coordinates: { type: [Number], required: true }
  },
  status: { type: String, enum: ['online', 'offline'], default: 'offline' },
  rideHistory: [{ type: Schema.Types.ObjectId, ref: 'Trip' }],
  profilePicture: { type: String, default: '' } // Add this line for profile picture
}, { timestamps: true });

DriverSchema.index({ currentLocation: '2dsphere' });

const Driver = mongoose.models.Driver || mongoose.model('Driver', DriverSchema);
module.exports = Driver;
