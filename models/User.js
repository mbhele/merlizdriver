const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');

const UserSchema = new mongoose.Schema({
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  username: { type: String, required: true, unique: true },
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    },
  },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'seller', 'customer', 'driver', 'rider'], default: 'customer' },
  phone: { type: String },  // Phone number field
  profilePicture: { type: String },  // Profile picture URL field
  vehicle: {
    make: { type: String },
    model: { type: String },
    plateNumber: { type: String }
  },
  availability: { type: Boolean, default: true },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: { type: [Number], default: [0, 0] }
  },
  status: { type: String, enum: ['online', 'offline'], default: 'offline' },
  paymentMethods: [
    {
      type: { type: String, default: 'cash' },
      details: { type: Map, of: String, default: {} }
    }
  ],
  rideHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Trip' }],
  createdAt: { type: Date, default: Date.now }
});

UserSchema.plugin(passportLocalMongoose);
UserSchema.index({ currentLocation: '2dsphere' });

module.exports = mongoose.model('User', UserSchema);
